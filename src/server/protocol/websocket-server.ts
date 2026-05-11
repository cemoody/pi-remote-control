import http from "node:http";
import { WebSocketServer } from "ws";
import { ProtocolRouter } from "./protocol-router.js";
import type { SessionRegistry } from "../session/session-registry.js";

export interface PiRemoteWebSocketServer {
  readonly httpServer: http.Server;
  readonly webSocketServer: WebSocketServer;
  close(): Promise<void>;
}

export interface CreateWebSocketServerOptions {
  readonly registry: SessionRegistry;
  readonly server?: http.Server;
}

export function createWebSocketServer(options: CreateWebSocketServerOptions): PiRemoteWebSocketServer {
  const httpServer = options.server ?? http.createServer();
  const webSocketServer = new WebSocketServer({ server: httpServer });

  webSocketServer.on("connection", (socket) => {
    const router = new ProtocolRouter({
      registry: options.registry,
      send: (envelope) => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(envelope));
      },
    });

    router.sendHello();

    socket.on("message", (data) => {
      void router.handleRawMessage(data.toString());
    });
  });

  return {
    httpServer,
    webSocketServer,
    async close() {
      await new Promise<void>((resolve, reject) => {
        webSocketServer.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}
