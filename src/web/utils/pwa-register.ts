// Registers the pi-crust service worker for PWA / installable behavior.
//
// Deliberately conservative:
//   - Service workers require a secure context (HTTPS or localhost). On a
//     plain-HTTP tailnet `isSecureContext` is false and we no-op, so the app
//     behaves exactly as before until HTTPS is in front of it.
//   - We never register during Vite dev (import.meta.env.DEV): a SW caching
//     the shell would fight HMR and the self-edit workflow. Production build
//     only.
//   - Registration is deferred to the `load` event so it never competes with
//     first paint or the SSE/Socket.IO connection setup.
export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (import.meta.env.DEV) return; // never in the HMR dev server
  if (!("serviceWorker" in navigator)) return;
  if (!window.isSecureContext) return; // HTTP tailnet → no-op until HTTPS

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch((err) => {
      // Non-fatal: the app works without the SW; just log for diagnostics.
      console.warn("[pi-crust] service worker registration failed:", err);
    });
  });
}
