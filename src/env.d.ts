declare class WebSocketPair {
  0: import("cloudflare:workers").WebSocket;
  1: import("cloudflare:workers").WebSocket;
  constructor();
}

declare module "cloudflare:workers" {
  export const env: {
    GOOGLE_CLIENT_ID?: string;
    AUTH_USERS_KV?: {
      get: (key: string) => Promise<string | null>;
      put: (key: string, value: string) => Promise<void>;
    };
    CHESS_GAME_DO?: DurableObjectNamespace;
  };

  export type AlarmInfo = {
    scheduledTime: number;
    noTimeout: boolean;
  };

  export type WebSocket = {
    accept(): void;
    send(message: string | ArrayBuffer | ArrayBufferView): void;
    close(code?: number, reason?: string): void;
    addEventListener(type: string, listener: (event: unknown) => void): void;
  };

  export type DurableObjectId = {
    name: string | null;
    toString(): string;
  };

  export type DurableObjectStub = {
    id: DurableObjectId;
    name: string;
    fetch(request: Request): Promise<Response>;
  };

  export type DurableObjectNamespace = {
    idFromName(name: string): DurableObjectId;
    idFromString(id: string): DurableObjectId;
    newUniqueId(): DurableObjectId;
    get(id: DurableObjectId): DurableObjectStub;
  };

  export type DurableObjectStorage = {
    get<T = unknown>(key: string): Promise<T | null>;
    put<T = unknown>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
    list<T = unknown>(options?: { prefix?: string }): Promise<Map<string, T>>;
    setAlarm(delayMs: number | Date): Promise<void>;
    getAlarm(): Promise<number | null>;
    deleteAlarm(): Promise<void>;
  };

  export type DurableObjectState = {
    id: DurableObjectId;
    storage: DurableObjectStorage;
    waitUntil(promise: Promise<unknown>): void;
    acceptWebSocket(ws: WebSocket, tags?: string[]): void;
    getWebSockets(tag?: string): WebSocket[];
    getWebSocketTags(): IterableIterator<string>;
    blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
  };

  export abstract class DurableObject<E = unknown> {
    constructor(ctx: DurableObjectState, env: E);
    protected readonly ctx: DurableObjectState;
    protected readonly env: E;
    fetch?(request: Request): Response | Promise<Response>;
    alarm?(alarmInfo: AlarmInfo): void | Promise<void>;
    webSocketMessage?(ws: WebSocket, message: string | ArrayBuffer | ArrayBufferView): void | Promise<void>;
    webSocketClose?(ws: WebSocket, code: number, reason: string, wasClean: boolean): void | Promise<void>;
    webSocketError?(ws: WebSocket, error: unknown): void | Promise<void>;
  }
}