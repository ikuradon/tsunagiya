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
  #connectionTimer: ReturnType<typeof setTimeout> | undefined;
  #openTimer: ReturnType<typeof setTimeout> | undefined;

  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  static #resolveRelay: RelayResolver | null = null;

  /** @internal RelayResolverはplatform hookが設定する */
  static setRelayResolver(resolver: RelayResolver | null): void {
    MockWebSocket.#resolveRelay = resolver;
  }

  constructor(
    url: string | URL,
    protocolsOrOptions?: string | string[] | WebSocketOptions,
  ) {
    super();
    this.url = typeof url === "string" ? url : url.toString();
    if (typeof protocolsOrOptions === "string") {
      this.protocol = protocolsOrOptions;
    } else if (Array.isArray(protocolsOrOptions)) {
      this.protocol = protocolsOrOptions[0] ?? "";
    }

    this.#relay = MockWebSocket.#resolveRelay?.(this.url);

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
      this.#connectionTimer = setTimeout(() => {
        if (this.#readyState === WebSocketReadyState.CONNECTING) {
          this.#clearTimers();
          this.#relay?._unregisterConnection(this);
          this.#fireError();
          this.#fireClose(1006, "Connection timeout");
        }
      }, timeout);
    }

    // 非同期で接続完了をシミュレート
    this.#scheduleOpen();
  }

  #clearTimers(): void {
    if (this.#connectionTimer !== undefined) {
      clearTimeout(this.#connectionTimer);
      this.#connectionTimer = undefined;
    }
    if (this.#openTimer !== undefined) {
      clearTimeout(this.#openTimer);
      this.#openTimer = undefined;
    }
  }

  #scheduleOpen(): void {
    const legacyDelay = this.#relay?.options.connectionDelay ?? 0;
    const networkDelay = this.#relay?.options.network?.connectDelay ?? 0;
    const delay = Math.max(legacyDelay, networkDelay);
    const doOpen = () => {
      this.#openTimer = undefined;
      if (this.#readyState !== WebSocketReadyState.CONNECTING) return;
      this.#readyState = WebSocketReadyState.OPEN;

      // 接続タイムアウトタイマーをクリア
      this.#clearTimers();

      const openEvent = new Event("open");
      this.onopen?.(openEvent);
      this.dispatchEvent(openEvent);

      // リレーの接続後処理
      this.#relay?._handleOpen(this);
    };
    if (delay > 0) {
      this.#openTimer = setTimeout(doOpen, delay);
    } else {
      queueMicrotask(doOpen);
    }
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
    this.#clearTimers();

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

    this.#clearTimers();
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
