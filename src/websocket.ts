/**
 * MockWebSocket
 *
 * WebSocket API互換のモッククラス。MockPoolと連携して、
 * URL単位でMockRelayへメッセージをルーティングする。
 *
 * @module
 */

import { WebSocketReadyState } from "./types.ts";
import type { MockRelay } from "./relay.ts";

/** MockPoolからリレーを解決するための関数型 */
export type RelayResolver = (url: string) => MockRelay | undefined;

/**
 * WebSocket API互換のモッククラス
 *
 * `globalThis.WebSocket` の差し替え先として使用される。
 * 接続先URLに対応するMockRelayが存在すれば、そのリレーへルーティングする。
 */
export class MockWebSocket extends EventTarget {
  static readonly CONNECTING = WebSocketReadyState.CONNECTING;
  static readonly OPEN = WebSocketReadyState.OPEN;
  static readonly CLOSING = WebSocketReadyState.CLOSING;
  static readonly CLOSED = WebSocketReadyState.CLOSED;

  readonly CONNECTING = WebSocketReadyState.CONNECTING;
  readonly OPEN = WebSocketReadyState.OPEN;
  readonly CLOSING = WebSocketReadyState.CLOSING;
  readonly CLOSED = WebSocketReadyState.CLOSED;

  readonly url: string;
  readonly protocol: string = "";
  readonly extensions: string = "";
  binaryType: BinaryType = "blob";
  bufferedAmount: number = 0;

  #readyState: number = WebSocketReadyState.CONNECTING;
  #relay: MockRelay | undefined;

  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  /** @internal RelayResolverはMockPoolが設定する */
  static _resolveRelay: RelayResolver | null = null;

  constructor(url: string | URL, protocols?: string | string[]) {
    super();
    this.url = typeof url === "string" ? url : url.toString();
    if (protocols) {
      this.protocol = Array.isArray(protocols) ? protocols[0] ?? "" : protocols;
    }

    this.#relay = MockWebSocket._resolveRelay?.(this.url);

    if (!this.#relay) {
      // リレーが見つからない場合はエラーして閉じる
      queueMicrotask(() => {
        this.#fireError();
        this.#fireClose(1006, "No mock relay registered for this URL");
      });
      return;
    }

    // 接続拒否モード
    if (this.#relay._isRefused) {
      queueMicrotask(() => {
        this.#fireError();
        this.#fireClose(1006, "Connection refused");
      });
      return;
    }

    // リレーに接続を登録
    this.#relay._registerConnection(this);

    // 接続タイムアウト
    const timeout = this.#relay.options.connectionTimeout;
    if (timeout !== undefined && timeout > 0) {
      setTimeout(() => {
        if (this.#readyState === WebSocketReadyState.CONNECTING) {
          this.#relay?._unregisterConnection(this);
          this.#fireError();
          this.#fireClose(1006, "Connection timeout");
        }
      }, timeout);
    }

    // 非同期で接続完了をシミュレート
    this.#scheduleOpen();
  }

  #scheduleOpen(): void {
    queueMicrotask(() => {
      if (this.#readyState !== WebSocketReadyState.CONNECTING) return;
      this.#readyState = WebSocketReadyState.OPEN;

      const openEvent = new Event("open");
      this.onopen?.(openEvent);
      this.dispatchEvent(openEvent);

      // リレーの接続後処理
      this.#relay?._handleOpen(this);
    });
  }

  get readyState(): number {
    return this.#readyState;
  }

  /**
   * メッセージを送信する
   *
   * 接続先のMockRelayにメッセージを転送する。
   */
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (this.#readyState !== WebSocketReadyState.OPEN) {
      throw new DOMException(
        "WebSocket is not open",
        "InvalidStateError",
      );
    }

    if (typeof data !== "string") {
      throw new Error("MockWebSocket only supports string messages");
    }

    this.#relay?._handleMessage(this, data);
  }

  /**
   * WebSocket接続を閉じる
   */
  close(code?: number, reason?: string): void {
    if (
      this.#readyState === WebSocketReadyState.CLOSING ||
      this.#readyState === WebSocketReadyState.CLOSED
    ) {
      return;
    }

    this.#readyState = WebSocketReadyState.CLOSING;

    queueMicrotask(() => {
      this.#relay?._unregisterConnection(this);
      this.#fireClose(code ?? 1000, reason ?? "");
    });
  }

  /**
   * リレー側からメッセージを受信する
   * @internal MockRelayから呼び出される
   */
  _receiveMessage(data: string): void {
    if (this.#readyState !== WebSocketReadyState.OPEN) return;

    const event = new MessageEvent("message", { data });
    this.onmessage?.(event);
    this.dispatchEvent(event);
  }

  /**
   * リレー側から接続を閉じる
   * @internal MockRelayから呼び出される
   */
  _forceClose(code: number, reason: string): void {
    if (
      this.#readyState === WebSocketReadyState.CLOSING ||
      this.#readyState === WebSocketReadyState.CLOSED
    ) {
      return;
    }

    this.#relay?._unregisterConnection(this);
    this.#fireClose(code, reason);
  }

  #fireError(): void {
    const event = new Event("error");
    this.onerror?.(event);
    this.dispatchEvent(event);
  }

  #fireClose(code: number, reason: string): void {
    this.#readyState = WebSocketReadyState.CLOSED;
    const event = new CloseEvent("close", {
      code,
      reason,
      wasClean: code === 1000,
    });
    this.onclose?.(event);
    this.dispatchEvent(event);
  }
}
