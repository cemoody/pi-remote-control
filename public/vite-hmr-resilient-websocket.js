/*
 * Make Vite's HMR websocket resilient to transient mobile network resets.
 *
 * Vite's dev client treats a `vite-hmr` websocket close as "the dev server
 * restarted" and reloads the whole document after the server responds again.
 * On mobile, Wi-Fi changes, VPN handoffs, and tab suspension can close that
 * websocket while the page itself is perfectly usable. We keep hot updates by
 * reconnecting the underlying HMR socket and deliberately hiding transient
 * close events from Vite's client.
 *
 * This file is loaded as a classic script from index.html before Vite's
 * /@vite/client module creates its websocket. It only wraps sockets whose
 * protocol/URL identify them as Vite HMR; every other WebSocket is delegated
 * to the browser unchanged.
 */
(function installPiRemoteResilientViteHmrWebSocket() {
  if (typeof window === "undefined" || typeof window.WebSocket !== "function") return;
  if (window.__piRemoteResilientViteHmrWebSocketInstalled) return;
  window.__piRemoteResilientViteHmrWebSocketInstalled = true;

  var NativeWebSocket = window.WebSocket;
  var CONNECTING = NativeWebSocket.CONNECTING ?? 0;
  var OPEN = NativeWebSocket.OPEN ?? 1;
  var CLOSING = NativeWebSocket.CLOSING ?? 2;
  var CLOSED = NativeWebSocket.CLOSED ?? 3;
  var MAX_RECONNECT_DELAY_MS = 2_000;

  function protocolList(protocols) {
    if (Array.isArray(protocols)) return protocols;
    return protocols ? [protocols] : [];
  }

  function isViteHmrSocket(url, protocols) {
    var text = String(url);
    return protocolList(protocols).indexOf("vite-hmr") !== -1 || text.indexOf("vite-hmr") !== -1;
  }

  function makeCloseEvent(type, init) {
    if (typeof CloseEvent === "function") return new CloseEvent(type, init);
    var event = new Event(type);
    event.code = init?.code ?? 1000;
    event.reason = init?.reason ?? "";
    event.wasClean = init?.wasClean ?? true;
    return event;
  }

  function parseVitePayload(data) {
    if (typeof data !== "string") return null;
    try { return JSON.parse(data); } catch { return null; }
  }

  function shouldDeferFullReload() {
    // Keep desktop dev semantics unchanged. On phones/tablets, full reloads are
    // particularly disruptive because they wipe transient composer/scroll/UI
    // state while someone may be actively self-modifying the app remotely.
    return (navigator.maxTouchPoints ?? 0) > 0
      || (typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches)
      || Math.min(window.innerWidth || 0, window.innerHeight || 0) <= 600;
  }

  function showDeferredReloadNotice(payload) {
    window.dispatchEvent(new CustomEvent("pi-remote:vite-full-reload-deferred", { detail: payload }));
    var render = function () {
      if (!document.body || document.getElementById("pi-remote-deferred-reload")) return;
      var button = document.createElement("button");
      button.id = "pi-remote-deferred-reload";
      button.type = "button";
      button.textContent = "Update needs reload — tap to reload";
      button.setAttribute("aria-label", "Reload app to apply deferred frontend update");
      button.style.cssText = [
        "position:fixed",
        "left:50%",
        "bottom:max(12px, env(safe-area-inset-bottom))",
        "transform:translateX(-50%)",
        "z-index:2147483647",
        "padding:10px 14px",
        "border:1px solid rgba(17,22,6,.2)",
        "border-radius:999px",
        "background:#111606",
        "color:#fbf6e2",
        "font:600 14px system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
        "box-shadow:0 8px 24px rgba(0,0,0,.22)",
      ].join(";");
      button.addEventListener("click", function () { window.location.reload(); });
      document.body.appendChild(button);
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", render, { once: true });
    } else {
      render();
    }
  }

  function makeMessageEvent(sourceEvent) {
    if (typeof MessageEvent === "function") {
      return new MessageEvent("message", {
        data: sourceEvent.data,
        origin: sourceEvent.origin,
        lastEventId: sourceEvent.lastEventId,
        ports: sourceEvent.ports,
        source: sourceEvent.source,
      });
    }
    var event = new Event("message");
    event.data = sourceEvent.data;
    return event;
  }

  class ResilientViteHmrWebSocket extends EventTarget {
    constructor(url, protocols) {
      super();
      this.url = String(url);
      this.protocol = protocolList(protocols)[0] ?? "vite-hmr";
      this.extensions = "";
      this.binaryType = "blob";
      this.bufferedAmount = 0;
      this.onopen = null;
      this.onmessage = null;
      this.onerror = null;
      this.onclose = null;
      this.__url = url;
      this.__protocols = protocols;
      this.__current = null;
      this.__readyState = CONNECTING;
      this.__closedByUser = false;
      this.__reconnectTimer = 0;
      this.__reconnectAttempt = 0;
      this.__connect();
    }

    get CONNECTING() { return CONNECTING; }
    get OPEN() { return OPEN; }
    get CLOSING() { return CLOSING; }
    get CLOSED() { return CLOSED; }
    get readyState() { return this.__readyState; }

    send(data) {
      if (!this.__current || this.__current.readyState !== OPEN) {
        throw new DOMException("WebSocket is not open", "InvalidStateError");
      }
      this.__current.send(data);
    }

    close(code, reason) {
      this.__closedByUser = true;
      if (this.__reconnectTimer) window.clearTimeout(this.__reconnectTimer);
      this.__readyState = CLOSING;
      if (this.__current) {
        this.__current.close(code, reason);
      } else {
        this.__readyState = CLOSED;
        this.__emit(makeCloseEvent("close", { code: code ?? 1000, reason: reason ?? "", wasClean: true }));
      }
    }

    __connect() {
      if (this.__closedByUser) return;
      this.__readyState = CONNECTING;
      var socket = this.__protocols === undefined
        ? new NativeWebSocket(this.__url)
        : new NativeWebSocket(this.__url, this.__protocols);
      this.__current = socket;
      socket.binaryType = this.binaryType;

      socket.addEventListener("open", () => {
        if (this.__current !== socket || this.__closedByUser) return;
        this.__readyState = OPEN;
        this.__reconnectAttempt = 0;
        this.__emit(new Event("open"));
      });

      socket.addEventListener("message", (event) => {
        if (this.__current !== socket || this.__closedByUser) return;
        var payload = parseVitePayload(event.data);
        if (payload?.type === "full-reload" && shouldDeferFullReload()) {
          showDeferredReloadNotice(payload);
          return;
        }
        this.__emit(makeMessageEvent(event));
      });

      socket.addEventListener("error", () => {
        if (this.__current !== socket || this.__closedByUser) return;
        // Keep Vite informed for logging/diagnostics, but do not let an error
        // imply a terminal close. The close event below drives reconnection.
        this.__emit(new Event("error"));
      });

      socket.addEventListener("close", (event) => {
        if (this.__current !== socket) return;
        if (this.__closedByUser) {
          this.__readyState = CLOSED;
          this.__emit(makeCloseEvent("close", {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
          }));
          return;
        }

        // This is the important mobile behavior: hide transient HMR socket
        // closes from Vite so it does not run its full-document reload path.
        this.__readyState = CONNECTING;
        this.__scheduleReconnect();
      });
    }

    __scheduleReconnect() {
      if (this.__closedByUser || this.__reconnectTimer) return;
      var delay = Math.min(MAX_RECONNECT_DELAY_MS, 150 * Math.pow(2, this.__reconnectAttempt++));
      this.__reconnectTimer = window.setTimeout(() => {
        this.__reconnectTimer = 0;
        this.__connect();
      }, delay);
    }

    __emit(event) {
      this.dispatchEvent(event);
      var handler = this["on" + event.type];
      if (typeof handler === "function") handler.call(this, event);
    }
  }

  function WrappedWebSocket(url, protocols) {
    if (isViteHmrSocket(url, protocols)) return new ResilientViteHmrWebSocket(url, protocols);
    return protocols === undefined ? new NativeWebSocket(url) : new NativeWebSocket(url, protocols);
  }

  Object.setPrototypeOf(WrappedWebSocket, NativeWebSocket);
  WrappedWebSocket.prototype = NativeWebSocket.prototype;
  WrappedWebSocket.CONNECTING = CONNECTING;
  WrappedWebSocket.OPEN = OPEN;
  WrappedWebSocket.CLOSING = CLOSING;
  WrappedWebSocket.CLOSED = CLOSED;
  window.WebSocket = WrappedWebSocket;
})();
