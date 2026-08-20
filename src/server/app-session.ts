import { deleteCookie, getCookie, setCookie, getRequest } from "@tanstack/react-start/server";
import { resolveEncryptionSecret } from "../../shared/encryption-secret.mjs";

export const APP_SESSION_COOKIE = "admark_gate";
const COOKIE_PAYLOAD = "admark-billing-gate-v1";

// In-memory rate limiting by IP
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 120; // Max requests per window
const ipTracker = new Map<string, { count: number; start: number }>();

export function rateLimitIp(): void {
  let req: Request | undefined;
  try {
    req = getRequest();
  } catch {
    // Return early if not in a web request context
    return;
  }
  if (!req) return;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "127.0.0.1";
  const now = Date.now();
  const userRecord = ipTracker.get(ip);

  if (!userRecord) {
    ipTracker.set(ip, { count: 1, start: now });
    return;
  }

  if (now - userRecord.start > RATE_LIMIT_WINDOW_MS) {
    userRecord.count = 1;
    userRecord.start = now;
    return;
  }

  userRecord.count++;
  if (userRecord.count > MAX_REQUESTS_PER_WINDOW) {
    throw new Error("Rate limit exceeded. Too many requests from this IP address.");
  }
}

function sessionSecret(): string {
  // Same policy as client-data encryption — one fallback, one production gate.
  return resolveEncryptionSecret();
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

async function signedGateToken(): Promise<string> {
  const enc = new TextEncoder();
  const secret = sessionSecret();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(COOKIE_PAYLOAD));
  return Array.from(new Uint8Array(sig), (x) => x.toString(16).padStart(2, "0")).join("");
}

export async function sessionCookieValid(): Promise<boolean> {
  const cookie = getCookie(APP_SESSION_COOKIE);
  if (!cookie) return false;
  const expected = await signedGateToken();
  return timingSafeEqual(cookie, expected);
}

export async function assertAppSession(): Promise<void> {
  if (!(await sessionCookieValid())) {
    throw new Error("Unauthorized access detected. Session expired.");
  }
}

export async function mintSessionCookieValue(): Promise<string> {
  return signedGateToken();
}

export function writeSessionCookie(token: string): void {
  const isProd = process.env.NODE_ENV === "production";
  setCookie(APP_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function eraseSessionCookie(): void {
  const isProd = process.env.NODE_ENV === "production";
  deleteCookie(APP_SESSION_COOKIE, { path: "/", secure: isProd, sameSite: "lax" });
}
