import { createStart, createMiddleware, createCsrfMiddleware } from "@tanstack/react-start";
import { renderErrorPage } from "./lib/error-page";
import { resolveEncryptionSecret } from "../shared/encryption-secret.mjs";

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error("Server Error:", error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Startup Security Checks — secret policy lives in shared/encryption-secret.mjs.
function checkSecurityEnvironmentVariables() {
  const password = process.env.ADMARK_APP_PASSWORD?.trim();
  try {
    resolveEncryptionSecret();
  } catch (err) {
    throw new Error(
      `FATAL: ${err instanceof Error ? err.message : String(err)} ` +
        "Set APP_SESSION_SECRET in Vercel → Project → Settings → Environment Variables.",
    );
  }
  if (!process.env.APP_SESSION_SECRET?.trim() && process.env.NODE_ENV !== "production") {
    console.warn(
      "SECURITY: APP_SESSION_SECRET unset — using the development fallback. Set a unique secret before any shared deploy.",
    );
  }
  if (process.env.NODE_ENV === "production") {
    if (!password) {
      throw new Error(
        "FATAL: ADMARK_APP_PASSWORD must be set in production (Vercel → Environment Variables).",
      );
    }
    if (
      password === "HTRP@2026" ||
      password === "Admin@123" ||
      password === "password" ||
      password === "admin"
    ) {
      throw new Error(
        "FATAL: ADMARK_APP_PASSWORD is a known insecure default. Set a unique strong password.",
      );
    }
  } else if (!password) {
    console.warn(
      "SECURITY: ADMARK_APP_PASSWORD unset — login will fail until it is set in .env.",
    );
  }
}
checkSecurityEnvironmentVariables();

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, errorMiddleware],
}));
