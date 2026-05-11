import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Where the API server (`npm run dev:api`) is listening. Override with
// PI_REMOTE_API_TARGET when you run the API on a different host/port.
const apiTarget = process.env.PI_REMOTE_API_TARGET ?? "http://127.0.0.1:8787";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        // SSE: keep connection open, no buffering
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes) => {
            if ((proxyRes.headers["content-type"] || "").includes("text/event-stream")) {
              proxyRes.headers["cache-control"] = "no-cache";
              proxyRes.headers["x-accel-buffering"] = "no";
            }
          });
        },
      },
    },
  },
});
