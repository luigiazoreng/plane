import http from "node:http";
import path from "node:path";
import * as dotenv from "dotenv";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, type Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

dotenv.config({ path: path.resolve(__dirname, ".env") });

// Expose only vars starting with VITE_
const viteEnv = Object.keys(process.env)
  .filter((k) => k.startsWith("VITE_"))
  .reduce<Record<string, string>>((a, k) => {
    a[k] = process.env[k] ?? "";
    return a;
  }, {});

const backendBase = process.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

// Vite plugin that manually tunnels SSE connections before http-proxy can buffer them.
// http-proxy accumulates the entire response body before forwarding, which breaks
// streaming — so we short-circuit /helpdesk/events/ with a raw Node http.request pipe.
function sseTunnelPlugin(): Plugin {
  return {
    name: "helpdesk-sse-tunnel",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.includes("/helpdesk/events/")) {
          next();
          return;
        }
        const parsed = new URL(backendBase);
        const upstreamReq = http.request(
          {
            hostname: parsed.hostname,
            port: parsed.port || 80,
            path: req.url,
            method: req.method ?? "GET",
            headers: {
              ...req.headers,
              host: parsed.host,
            },
          },
          (upstream) => {
            const headers = { ...upstream.headers };
            // Strip hop-by-hop headers — Node manages chunked encoding itself.
            delete headers["transfer-encoding"];
            delete headers["connection"];
            delete headers["keep-alive"];
            // content-length is meaningless for an unbounded stream.
            delete headers["content-length"];
            res.writeHead(upstream.statusCode ?? 200, headers);
            // Flush each chunk immediately as it arrives from the backend.
            upstream.on("data", (chunk: Buffer) => {
              res.write(chunk);
              if ("flush" in res && typeof (res as { flush?: () => void }).flush === "function") {
                (res as { flush: () => void }).flush();
              }
            });
            upstream.on("end", () => res.end());
            upstream.on("error", () => res.end());
          }
        );
        upstreamReq.on("error", (err) => {
          console.error("[SSE tunnel] upstream error:", err.message);
          if (!res.headersSent) res.writeHead(502);
          res.end();
        });
        // Tear down the upstream when the browser disconnects.
        res.on("close", () => upstreamReq.destroy());
        req.pipe(upstreamReq, { end: true });
      });
    },
  };
}

export default defineConfig(() => ({
  define: {
    "process.env": JSON.stringify(viteEnv),
  },
  build: {
    assetsInlineLimit: 0,
  },
  plugins: [sseTunnelPlugin(), reactRouter(), tsconfigPaths({ projects: [path.resolve(__dirname, "tsconfig.json")] })],
  resolve: {
    alias: {
      // Next.js compatibility shims used within web
      "next/link": path.resolve(__dirname, "app/compat/next/link.tsx"),
      "next/navigation": path.resolve(__dirname, "app/compat/next/navigation.ts"),
      "next/script": path.resolve(__dirname, "app/compat/next/script.tsx"),
    },
    dedupe: ["react", "react-dom", "@headlessui/react"],
  },
  server: {
    host: "127.0.0.1",
    proxy: {
      // Proxy /api/workspaces so cookies are sent same-origin (avoids SameSite=Lax restriction).
      // /helpdesk/events/ is handled by sseTunnelPlugin above before reaching this proxy.
      "/api/workspaces": {
        target: backendBase,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  // No SSR-specific overrides needed; alias resolves to ESM build
}));
