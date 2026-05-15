import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiTarget = process.env.VITE_PI_REMOTE_PROXY_TARGET ?? "http://127.0.0.1:8787";

// HMR is disabled by default in this deploy. The WUI is consumed from a
// remote browser (often iPhone Safari over Tailscale); when iOS suspends
// the tab in background the Vite HMR WebSocket dies, and on resume the
// HMR client calls `location.reload()` to recover — destroying the user's
// scroll position. Telemetry (logs/client-events.jsonl) showed every
// observed "random refresh" was actually a Vite HMR reload. Opt back in
// with VITE_PI_REMOTE_HMR=1 if you want HMR while editing on the same
// machine that runs `vite`.
const hmrEnabled = process.env.VITE_PI_REMOTE_HMR === "1";

// Vite (≥6.0) rejects requests whose Host header isn't in `allowedHosts`
// when bound to a non-localhost interface. The default list is just
// localhost/127.0.0.1, which blocks legitimate access via Tailscale magic
// DNS (`<machine>.<tailnet>.ts.net`) and mDNS (`*.local`) — both common
// for accessing the WUI from another device on the same network.
//
// We allow those two suffixes by default (a leading dot in Vite's syntax
// matches the host AND any subdomain), and let users extend or replace the
// list via VITE_PI_REMOTE_ALLOWED_HOSTS (comma-separated). Setting it to
// the literal string `all` disables the check entirely — use only on
// trusted networks.
const DEFAULT_ALLOWED_HOSTS = [".ts.net", ".local"] as const;
const rawAllowed = process.env.VITE_PI_REMOTE_ALLOWED_HOSTS;
const allowedHosts: true | string[] = rawAllowed === "all"
  ? true
  : rawAllowed
    ? rawAllowed.split(",").map((s) => s.trim()).filter(Boolean)
    : [...DEFAULT_ALLOWED_HOSTS];

export default defineConfig({
  plugins: [react()],
  server: {
    hmr: hmrEnabled,
    allowedHosts,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
