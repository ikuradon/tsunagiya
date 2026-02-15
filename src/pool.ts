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
  #relays: Map<string, MockRelay> = new Map();
  #originalWebSocket: typeof globalThis.WebSocket | null = null;
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

    this.#originalWebSocket = globalThis.WebSocket;

    MockWebSocket._resolveRelay = (url: string) => {
      return this.#relays.get(normalizeUrl(url));
    };

    // deno-lint-ignore no-explicit-any
    (globalThis as any).WebSocket = MockWebSocket;

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

    MockWebSocket._resolveRelay = null;
    this.#originalWebSocket = null;
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
}
