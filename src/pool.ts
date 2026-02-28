/**
 * MockPool
 *
 * 複数のMockRelayを管理し、globalThis.WebSocketの差し替えを行う。
 * テストのエントリポイントとして使用する。
 *
 * @module
 */

import type { MockRelayOptions } from "./types.ts";
import { MockRelay } from "./relay.ts";
import { MockWebSocket } from "./websocket.ts";

/** URLを正規化する（末尾スラッシュを除去） */
function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

/** HTTP/HTTPS URLをWS/WSSに変換する */
function httpToWsUrl(httpUrl: string): string {
  return httpUrl.replace(/^https:\/\//, "wss://").replace(
    /^http:\/\//,
    "ws://",
  );
}

/** ヘッダー値を case-insensitive で取得する */
function getHeaderValue(
  headers: HeadersInit | undefined,
  name: string,
): string | null {
  if (!headers) return null;
  if (headers instanceof Headers) {
    return headers.get(name);
  }
  if (Array.isArray(headers)) {
    for (const entry of headers) {
      if (
        Array.isArray(entry) && entry.length >= 2 &&
        typeof entry[0] === "string" && typeof entry[1] === "string" &&
        entry[0].toLowerCase() === name.toLowerCase()
      ) {
        return entry[1];
      }
    }
    return null;
  }
  // Record<string, string>
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name.toLowerCase()) {
      return value;
    }
  }
  return null;
}

/** NIP-11リクエストかどうか判定する（Accept: application/nostr+json） */
function isNip11Request(
  request: RequestInfo | URL,
  init?: RequestInit,
): boolean {
  // init.headers があればそちらを優先（fetch の仕様: init が request をオーバーライド）
  if (init?.headers) {
    const accept = getHeaderValue(init.headers, "accept") ?? "";
    return accept.toLowerCase().includes("application/nostr+json");
  }
  if (request instanceof Request) {
    const accept = request.headers.get("Accept") ?? "";
    return accept.toLowerCase().includes("application/nostr+json");
  }
  return false;
}

/**
 * 複数のMockRelayを管理するコンテナ
 *
 * WebSocketの差し替え・復元を行い、テスト環境を構築する。
 *
 * @example
 * ```ts
 * const pool = new MockPool();
 * const relay = pool.relay("wss://relay.example.com");
 * relay.store(event);
 *
 * pool.install();
 * try {
 *   const ws = new WebSocket("wss://relay.example.com");
 *   // ...
 * } finally {
 *   pool.uninstall();
 * }
 * ```
 */
export class MockPool {
  static #currentInstance: MockPool | null = null;

  #relays: Map<string, MockRelay> = new Map();
  #originalWebSocket: typeof globalThis.WebSocket | null = null;
  #originalFetch: typeof globalThis.fetch | null = null;
  #installed = false;

  /**
   * MockRelayを登録・取得する
   *
   * 同一URLに対して複数回呼び出すと、既存のインスタンスを返す。
   *
   * @param url リレーURL (wss://...)
   * @param options リレーオプション
   * @returns MockRelayインスタンス
   */
  relay(url: string, options?: MockRelayOptions): MockRelay {
    const key = normalizeUrl(url);
    const existing = this.#relays.get(key);
    if (existing) {
      return existing;
    }

    const mockRelay = new MockRelay(url, options);
    this.#relays.set(key, mockRelay);
    return mockRelay;
  }

  /**
   * globalThis.WebSocket をMockWebSocketに差し替える
   *
   * @throws {Error} 既にinstall済みの場合
   */
  install(): void {
    if (this.#installed) {
      throw new Error("MockPool is already installed");
    }
    if (MockPool.#currentInstance && MockPool.#currentInstance !== this) {
      throw new Error("Another MockPool instance is already installed");
    }

    this.#originalWebSocket = globalThis.WebSocket;

    MockWebSocket._resolveRelay = (url: string) => {
      return this.#relays.get(normalizeUrl(url));
    };

    // deno-lint-ignore no-explicit-any
    (globalThis as any).WebSocket = MockWebSocket;

    // NIP-11: fetch インターセプト
    this.#originalFetch = globalThis.fetch;
    const relays = this.#relays;
    const originalFetch = this.#originalFetch;

    // deno-lint-ignore no-explicit-any
    (globalThis as any).fetch = (
      request: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      if (isNip11Request(request, init)) {
        const rawUrl = request instanceof Request
          ? request.url
          : request instanceof URL
          ? request.toString()
          : request;
        const wsUrl = normalizeUrl(httpToWsUrl(rawUrl));
        const relay = relays.get(wsUrl);
        if (relay) {
          const info = relay.getInfo();
          return Promise.resolve(
            new Response(JSON.stringify(info), {
              status: 200,
              headers: { "Content-Type": "application/nostr+json" },
            }),
          );
        }
      }
      return originalFetch(request as RequestInfo, init);
    };

    MockPool.#currentInstance = this;
    this.#installed = true;
  }

  /**
   * 元のWebSocketを復元する
   *
   * @throws {Error} install されていない場合
   */
  uninstall(): void {
    if (!this.#installed) {
      throw new Error("MockPool is not installed");
    }

    if (this.#originalWebSocket) {
      // deno-lint-ignore no-explicit-any
      (globalThis as any).WebSocket = this.#originalWebSocket;
    }

    if (this.#originalFetch) {
      // deno-lint-ignore no-explicit-any
      (globalThis as any).fetch = this.#originalFetch;
    }

    MockWebSocket._resolveRelay = null;
    this.#originalWebSocket = null;
    this.#originalFetch = null;
    MockPool.#currentInstance = null;
    this.#installed = false;
  }

  /**
   * 全リレーの状態をリセットする
   *
   * ストア、受信ログ、サブスクリプション、ハンドラーをクリアする。
   */
  reset(): void {
    for (const relay of this.#relays.values()) {
      relay.reset();
    }
  }

  /**
   * 現在のアクティブ接続一覧
   *
   * URL → 接続数のマップを返す。
   */
  get connections(): Map<string, number> {
    const result = new Map<string, number>();
    for (const [url, relay] of this.#relays) {
      const count = relay.connectionCount;
      if (count > 0) {
        result.set(url, count);
      }
    }
    return result;
  }

  /** install済みかどうか */
  get installed(): boolean {
    return this.#installed;
  }

  /**
   * `using` 構文（Explicit Resource Management）でのリソース解放
   *
   * install済みの場合、`uninstall()` を呼び出す。
   * 未インストール状態では何もしない。
   *
   * @example
   * ```ts
   * const pool = new MockPool();
   * pool.install();
   * using _ = pool;
   * // ブロック終了時に自動的に uninstall() が呼ばれる
   * ```
   */
  [Symbol.dispose](): void {
    if (this.#installed) {
      this.uninstall();
    }
  }

  /**
   * `await using` 構文（Explicit Resource Management）でのリソース解放
   *
   * install済みの場合、`uninstall()` を呼び出す。
   * 未インストール状態では何もしない。
   *
   * @example
   * ```ts
   * const pool = new MockPool();
   * pool.install();
   * await using _ = pool;
   * // ブロック終了時に自動的に uninstall() が呼ばれる
   * ```
   */
  [Symbol.asyncDispose](): Promise<void> {
    if (this.#installed) {
      this.uninstall();
    }
    return Promise.resolve();
  }
}
