/**
 * Minimal stand-in for the `cloudflare:workers` module.
 *
 * Only the surface the Durable Object classes touch at import time: the base
 * class the messages object extends, and the binding the auth helpers read.
 * Everything else the workers runtime offers is either a type or is injected
 * per test, so nothing here has to behave like the real thing.
 */
export const env = {} as Record<string, unknown>;

export type DurableObjectState = {
  storage: {
    get: <T = unknown>(key: string) => Promise<T | undefined>;
    put: (key: string, value: unknown) => Promise<void>;
    delete: (key: string) => Promise<boolean>;
    list?: (options?: unknown) => Promise<Map<string, unknown>>;
  };
  blockConcurrencyWhile: <T>(fn: () => Promise<T>) => Promise<T>;
  waitUntil: (promise: Promise<unknown>) => void;
  acceptWebSocket?: (socket: unknown, tags?: string[]) => void;
  getWebSockets?: () => unknown[];
};

export type DurableObjectNamespace = {
  idFromName: (name: string) => unknown;
  get: (id: unknown) => { fetch: (request: Request) => Promise<Response> };
};

/** The websocket server surface the object uses through the hibernation API. */
export interface WebSocket {
  accept(): void;
  close(code?: number, reason?: string): void;
  send(message: string): void;
  deserializeAttachment?: (attachment: string) => unknown;
}

export class DurableObject<Env = unknown> {
  protected ctx: DurableObjectState;
  protected env: Env;

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }
}
