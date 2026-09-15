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

/**
 * Do NOT run env FATAL checks here. `start.ts` is evaluated in the client graph;
 * Vite replaces `process.env` with `{}` in the browser, which falsely trips
 * "password must be set" and breaks login. Server boot checks live in
 * `src/server/production-env.ts` (called from `src/server.ts`).
 */
export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, errorMiddleware],
}));
