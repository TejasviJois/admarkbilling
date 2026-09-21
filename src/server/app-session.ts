import { deleteCookie, getCookie, setCookie, getRequest } from "@tanstack/react-start/server";
import { resolveEncryptionSecret } from "../../shared/encryption-secret.mjs";

export const APP_SESSION_COOKIE = "admark_gate";
/** Solo internal app — stay signed in until explicit Sign out (no practical auto-logout). */
const SESSION_TTL_MS = 60 * 60 * 24 * 365 * 10; // 10 years
const SESSION_VERSION = 1;

/** General API abuse limit (per IP). */
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 120;

/** Stricter failed-login / login attempt limit. */
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 10;

const ipTracker = new Map<string, { count: number; start: number }>();
const loginTracker = new Map<string, { count: number; start: number }>();

function clientIp(): string {
  let req: Request | undefined;
  try {
    req = getRequest();
  } catch {
    return "127.0.0.1";
  }
  if (!req) return "127.0.0.1";
  // Prefer right-most / last proxy hop when present; fall back to first entry.
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

/** Call at the start of login attempts (success or fail). */
export function rateLimitLogin(): void {
  bumpCounter(
    loginTracker,
    `login:${clientIp()}`,
    LOGIN_WINDOW_MS,
    MAX_LOGIN_ATTEMPTS,
    "Too many login attempts. Wait 15 minutes and try again.",
  );
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

type SessionBody = { v: number; jti: string; exp: number };

export async function mintSessionCookieValue(): Promise<string> {
  const body: SessionBody = {
    v: SESSION_VERSION,
    jti: crypto.randomUUID(),
    exp: Date.now() + SESSION_TTL_MS,
  };
  const payload = toBase64Url(JSON.stringify(body));
  const sig = await hmacHex(payload);
  return `${payload}.${sig}`;
}

export async function sessionCookieValid(): Promise<boolean> {
  const cookie = getCookie(APP_SESSION_COOKIE);
  if (!cookie || !cookie.includes(".")) return false;
  const [payload, sig] = cookie.split(".");
  if (!payload || !sig) return false;
  const expected = await hmacHex(payload);
  if (!timingSafeEqual(sig, expected)) return false;
  try {
    const body = JSON.parse(fromBase64Url(payload)) as SessionBody;
    if (body.v !== SESSION_VERSION) return false;
    if (typeof body.jti !== "string" || !body.jti) return false;
    // No time-based expiry check — session lasts until the user clicks Sign out.
    return true;
  } catch {
    return false;
  }
}

export async function assertAppSession(): Promise<void> {
  if (!(await sessionCookieValid())) {
    throw new Error("Unauthorized access detected. Session expired.");
  }
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
