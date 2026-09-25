import { deleteCookie, getCookie, setCookie, getRequest } from "@tanstack/react-start/server";
import { resolveEncryptionSecret } from "../../shared/encryption-secret.mjs";
import type { PortalRole } from "./portal-users";

export const APP_SESSION_COOKIE = "admark_gate";
/** Sliding session — reminted on each auth status check while the app is in use. */
const SESSION_TTL_MS = 60 * 60 * 24 * 30; // 30 days
/** v2 adds uid/role/mid claims for multi-user portal logins. */
const SESSION_VERSION = 2;

/** General API abuse limit (per IP). */
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 120;

/** Stricter failed-login / login attempt limit (per IP and per username). */
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 10;

const ipTracker = new Map<string, { count: number; start: number }>();
const loginTracker = new Map<string, { count: number; start: number }>();

export type AppSession = {
  userId: string;
  role: PortalRole;
  teamMemberId: string | null;
  displayName: string;
  username: string;
};

function clientIp(): string {
  let req: Request | undefined;
  try {
    req = getRequest();
  } catch {
    return "127.0.0.1";
  }
  if (!req) return "127.0.0.1";
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
    return parts[parts.length - 1] || "127.0.0.1";
  }
  return req.headers.get("x-real-ip")?.trim() || "127.0.0.1";
}

function bumpCounter(
  map: Map<string, { count: number; start: number }>,
  key: string,
  windowMs: number,
  max: number,
  message: string,
): void {
  const now = Date.now();
  const record = map.get(key);
  if (!record || now - record.start > windowMs) {
    map.set(key, { count: 1, start: now });
    return;
  }
  record.count += 1;
  if (record.count > max) {
    throw new Error(message);
  }
}

export function rateLimitIp(): void {
  bumpCounter(
    ipTracker,
    clientIp(),
    RATE_LIMIT_WINDOW_MS,
    MAX_REQUESTS_PER_WINDOW,
    "Rate limit exceeded. Too many requests from this IP address.",
  );
}

/** Call only after a failed login — successful sign-in must not burn the budget. */
export function rateLimitFailedLogin(username?: string): void {
  bumpCounter(
    loginTracker,
    `login:${clientIp()}`,
    LOGIN_WINDOW_MS,
    MAX_LOGIN_ATTEMPTS,
    "Too many login attempts. Wait 15 minutes and try again.",
  );
  if (username?.trim()) {
    bumpCounter(
      loginTracker,
      `login-user:${normalizeLoginUserKey(username)}`,
      LOGIN_WINDOW_MS,
      MAX_LOGIN_ATTEMPTS,
      "Too many login attempts for this username. Wait 15 minutes and try again.",
    );
  }
}

function normalizeLoginUserKey(username: string): string {
  return username.trim().toLowerCase().replace(/\s+/g, "");
}

/** @deprecated Use rateLimitFailedLogin — kept name for any residual imports. */
export function rateLimitLogin(): void {
  rateLimitFailedLogin();
}

/** Clear login lockout (e.g. after a successful sign-in). */
export function clearLoginRateLimit(username?: string): void {
  loginTracker.delete(`login:${clientIp()}`);
  if (username?.trim()) {
    loginTracker.delete(`login-user:${normalizeLoginUserKey(username)}`);
  }
}

function sessionSecret(): string {
  return resolveEncryptionSecret();
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

function bytesToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, "0")).join("");
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const bin = atob(padded + pad);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function hmacHex(message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return bytesToHex(sig);
}

type SessionBody = {
  v: number;
  jti: string;
  exp: number;
  uid: string;
  role: PortalRole;
  mid: string | null;
  name: string;
  un: string;
};

export async function mintSessionCookieValue(session: {
  userId: string;
  role: PortalRole;
  teamMemberId: string | null;
  displayName: string;
  username: string;
}): Promise<string> {
  const body: SessionBody = {
    v: SESSION_VERSION,
    jti: crypto.randomUUID(),
    exp: Date.now() + SESSION_TTL_MS,
    uid: session.userId,
    role: session.role,
    mid: session.teamMemberId,
    name: session.displayName,
    un: session.username,
  };
  const payload = toBase64Url(JSON.stringify(body));
  const sig = await hmacHex(payload);
  return `${payload}.${sig}`;
}

export async function readSessionFromCookie(): Promise<AppSession | null> {
  const cookie = getCookie(APP_SESSION_COOKIE);
  if (!cookie || !cookie.includes(".")) return null;
  const [payload, sig] = cookie.split(".");
  if (!payload || !sig) return null;
  const expected = await hmacHex(payload);
  if (!timingSafeEqual(sig, expected)) return null;
  try {
    const body = JSON.parse(fromBase64Url(payload)) as SessionBody;
    if (body.v !== SESSION_VERSION) return null;
    if (typeof body.jti !== "string" || !body.jti) return null;
    if (typeof body.exp !== "number" || !Number.isFinite(body.exp) || body.exp < Date.now()) {
      return null;
    }
    if (typeof body.uid !== "string" || !body.uid) return null;
    if (body.role !== "admin" && body.role !== "sales") return null;
    if (typeof body.name !== "string" || typeof body.un !== "string") return null;
    return {
      userId: body.uid,
      role: body.role,
      teamMemberId: typeof body.mid === "string" && body.mid ? body.mid : null,
      displayName: body.name,
      username: body.un,
    };
  } catch {
    return null;
  }
}

export async function sessionCookieValid(): Promise<boolean> {
  return (await readSessionFromCookie()) != null;
}

export async function requireSession(): Promise<AppSession> {
  const session = await readSessionFromCookie();
  if (!session) {
    throw new Error("Unauthorized access detected. Session expired.");
  }
  return session;
}

/** Require a logged-in user whose portal account is still active. */
export async function requireActiveSession(): Promise<AppSession> {
  const session = await requireSession();
  try {
    const { ensurePortalUsersBootstrapped, findPortalUserById } = await import("./portal-users");
    await ensurePortalUsersBootstrapped();
    const user = await findPortalUserById(session.userId);
    if (!user || !user.active) {
      eraseSessionCookie();
      throw new Error("Unauthorized access detected. Session expired.");
    }
    // Prefer live portal role/claims over sticky cookie values.
    return {
      userId: user.id,
      role: user.role,
      teamMemberId: user.teamMemberId,
      displayName: user.displayName || user.username,
      username: user.username,
    };
  } catch (error) {
    if (error instanceof Error && /Unauthorized|Forbidden/.test(error.message)) throw error;
    // Fail closed in production; allow signed cookie only for local recovery.
    if (process.env.NODE_ENV === "production") {
      eraseSessionCookie();
      throw new Error("Unauthorized access detected. Session expired.");
    }
  }
  return session;
}

/** @deprecated Prefer requireSession / requireAdmin / requireRole. */
export async function assertAppSession(): Promise<void> {
  await requireActiveSession();
}

export async function requireAdmin(): Promise<AppSession> {
  const session = await requireActiveSession();
  if (session.role !== "admin") {
    throw new Error("Forbidden. Admin access required.");
  }
  return session;
}

export async function requireRole(
  allowed: PortalRole | PortalRole[],
): Promise<AppSession> {
  const session = await requireActiveSession();
  const list = Array.isArray(allowed) ? allowed : [allowed];
  if (!list.includes(session.role)) {
    throw new Error("Forbidden. You do not have access to this action.");
  }
  return session;
}

export function writeSessionCookie(token: string): void {
  const isProd = process.env.NODE_ENV === "production";
  setCookie(APP_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function eraseSessionCookie(): void {
  const isProd = process.env.NODE_ENV === "production";
  deleteCookie(APP_SESSION_COOKIE, { path: "/", secure: isProd, sameSite: "lax" });
}
