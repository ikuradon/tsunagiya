/**
 * MockPool
 *
 * 複数のMockRelayを管理し、globalThis.WebSocketの差し替えを行う。
 * テストのエントリポイントとして使用する。
 *
 * @module
 */

import type { MockRelayOptions } from "./types.ts";
import { normalizeUrl } from "./internal/url.ts";
import {
  installPoolHooks,
  type PoolHookInstallation,
} from "./platform/pool_hooks.ts";
import { MockRelay } from "./relay.ts";

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
  #installation: PoolHookInstallation | null = null;

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
    if (this.#installation) {
      throw new Error("MockPool is already installed");
    }
    this.#installation = installPoolHooks((url) => this.#relays.get(url));
  }

  /**
   * 元のWebSocketを復元する
   *
   * @throws {Error} install されていない場合
   */
  uninstall(): void {
    if (!this.#installation) {
      throw new Error("MockPool is not installed");
    }

    this.#installation.uninstall();
    this.#installation = null;
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
    return this.#installation?.installed ?? false;
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
    if (this.#installation) {
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
    if (this.#installation) {
      this.uninstall();
    }
    return Promise.resolve();
  }
}
