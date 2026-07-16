import { createStart, createMiddleware, createCsrfMiddleware } from "@tanstack/react-start";
import { renderErrorPage } from "./lib/error-page";

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

// Startup Security Checks
function checkSecurityEnvironmentVariables() {
  const secret = process.env.APP_SESSION_SECRET?.trim();
  const password = process.env.ADMARK_APP_PASSWORD?.trim();

  if (process.env.NODE_ENV === "production") {
    if (!secret || secret.length < 16) {
      console.error("FATAL ERROR: APP_SESSION_SECRET must be configured and be at least 16 characters in production.");
    }
    if (!password || password === "HTRP@2026") {
      console.warn("SECURITY WARNING: Running production with default or unconfigured admin password.");
    }
  } else {
    // Development alerts
    if (!secret) {
      console.log("Dev notice: Using fallback development session secret.");
    }
  }
}
checkSecurityEnvironmentVariables();

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, errorMiddleware],
}));
