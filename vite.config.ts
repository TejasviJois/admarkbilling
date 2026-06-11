import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { nitro } from "nitro/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const root = path.dirname(fileURLToPath(import.meta.url));

/** Browsers request `/favicon.ico` by default; redirect to PNG favicon to avoid 404 noise. */
function faviconIcoRedirect(): Plugin {
  return {
    name: "favicon-ico-redirect",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0];
        if (url === "/favicon.ico") {
          res.statusCode = 302;
          res.setHeader("Location", "/favicon.png");
          res.end();
          return;
        }
        next();
      });
    },
  };
}

// TanStack Start + Nitro (Vercel preset) — see https://vercel.com/docs/frameworks/full-stack/tanstack-start
// Custom `src/server.ts` wraps TanStack's server entry for SSR error handling.
export default defineConfig({
  root,
  server: { port: 3000 },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-")) return "recharts";
          if (id.includes("node_modules/jspdf")) return "jspdf";
          if (id.includes("node_modules/@supabase")) return "supabase";
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(root, "./src"),
    },
  },
  plugins: [
    faviconIcoRedirect(),
    tailwindcss(),
    tanstackStart({
      server: { entry: "server" },
    }),
    nitro({
      preset: "vercel",
      routeRules: {
        "/**": {
          headers: {
            "X-Frame-Options": "DENY",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "strict-origin-when-cross-origin",
          },
        },
        "/assets/**": {
          headers: {
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        },
        "/favicon.png": {
          headers: {
            "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
          },
        },
        "/favicon-32.png": {
          headers: {
            "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
          },
        },
        "/apple-touch-icon.png": {
          headers: {
            "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
          },
        },
        "/*.{png,jpg,jpeg,webp,svg,ico,pdf}": {
          headers: {
            "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
          },
        },
        "/favicon.ico": { redirect: "/favicon.png" },
      },
    }),
    viteReact(),
  ],
});
