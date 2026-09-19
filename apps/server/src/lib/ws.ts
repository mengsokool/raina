import { createNodeWebSocket } from "@hono/node-ws";
import type { Hono } from "hono";

const initHolder: { app?: Hono<any, any, any> } = {};

export const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket(initHolder as any);

export function bindWebSocketApp(app: Hono<any, any, any>) {
  initHolder.app = app;
}
