/**
 * シンプルなNostrクライアント
 *
 * tsunagiyaモックリレーのE2Eテスト用。標準Web APIのみ使用し、
 * Deno/Node.js/Bunで動作する。
 *
 * @module
 */

import type { NostrEvent, NostrFilter } from "../../src/types.ts";

/** サブスクリプション */
export interface Subscription {
  readonly id: string;
  close(): void;
}

/** ランダムな16進数文字列を生成する */
function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * シンプルなNostrクライアント
 *
 * 複数リレーへの接続、イベントの購読・発行を行う。
 * `new WebSocket(url)` を使うため、tsunagiyaのモックが透過的に動作する。
 */
export class NostrClient {
  #relayUrls: string[];
  #sockets: Map<string, WebSocket> = new Map();
  #statuses: Map<string, "connecting" | "open" | "closed" | "error"> =
    new Map();
  #timeout: number;
  #subCounter = 0;
  #disconnecting = false;

  #eventHandler:
    | ((event: NostrEvent, relay: string) => void)
    | null = null;
  #eoseHandler: ((subId: string, relay: string) => void) | null = null;
  #okHandler:
    | ((
      eventId: string,
      accepted: boolean,
      msg: string,
      relay: string,
    ) => void)
    | null = null;
  #noticeHandler: ((msg: string, relay: string) => void) | null = null;
  #errorHandler: ((error: string, relay: string) => void) | null = null;

  constructor(relays: string[], options?: { timeout?: number }) {
    this.#relayUrls = relays;
    this.#timeout = options?.timeout ?? 5000;
  }

  /** 1つ以上のリレーがopenするまで待つ (Promise.any パターン) */
  connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let failCount = 0;
      const total = this.#relayUrls.length;

      if (total === 0) {
        reject(new Error("No relay URLs provided"));
        return;
      }

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error("Connection timeout"));
        }
      }, this.#timeout);

      for (const url of this.#relayUrls) {
        this.#statuses.set(url, "connecting");
        const ws = new WebSocket(url);
        this.#sockets.set(url, ws);

        ws.onopen = () => {
          this.#statuses.set(url, "open");
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve();
          }
        };

        ws.onmessage = (ev: MessageEvent) => {
          this.#handleMessage(url, ev.data as string);
        };

        ws.onerror = () => {
          if (this.#statuses.get(url) === "connecting") {
            this.#statuses.set(url, "error");
            this.#errorHandler?.("Connection error", url);
            failCount++;
            if (!settled && failCount >= total) {
              settled = true;
              clearTimeout(timer);
              reject(new Error("All relay connections failed"));
            }
          }
        };

        ws.onclose = () => {
          const status = this.#statuses.get(url);
          if (status === "connecting") {
            this.#statuses.set(url, "error");
            failCount++;
            if (!settled && failCount >= total) {
              settled = true;
              clearTimeout(timer);
              reject(new Error("All relay connections failed"));
            }
          } else if (status === "open" && !this.#disconnecting) {
            this.#statuses.set(url, "error");
            this.#errorHandler?.("Connection closed unexpectedly", url);
          } else if (this.#disconnecting) {
            this.#statuses.set(url, "closed");
          }
        };
      }
    });
  }

  /** 全接続を閉じる */
  disconnect(): void {
    this.#disconnecting = true;
    for (const ws of this.#sockets.values()) {
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
    }
    for (const url of this.#sockets.keys()) {
      this.#statuses.set(url, "closed");
    }
  }

  /** リレーごとの接続状態 */
  get relayStatuses(): Map<
    string,
    "connecting" | "open" | "closed" | "error"
  > {
    return new Map(this.#statuses);
  }

  /** イベントを発行する */
  publish(event: NostrEvent): void {
    const msg = JSON.stringify(["EVENT", event]);
    for (const ws of this.#sockets.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    }
  }

  /** テキストノート (kind:1) を作成して発行する */
  publishNote(
    content: string,
    pubkey: string,
    tags?: string[][],
  ): NostrEvent {
    const event: NostrEvent = {
      id: randomHex(32),
      pubkey,
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags: tags ?? [],
      content,
      sig: randomHex(64),
    };
    this.publish(event);
    return event;
  }

  /** フィルターで購読する */
  subscribe(filters: NostrFilter[], subId?: string): Subscription {
    const id = subId ?? `sub-${this.#subCounter++}`;
    const msg = JSON.stringify(["REQ", id, ...filters]);

    for (const ws of this.#sockets.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    }

    return {
      id,
      close: () => {
        const closeMsg = JSON.stringify(["CLOSE", id]);
        for (const ws of this.#sockets.values()) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(closeMsg);
          }
        }
      },
    };
  }

  /** EVENT受信ハンドラーを設定する */
  onEvent(handler: (event: NostrEvent, relay: string) => void): void {
    this.#eventHandler = handler;
  }

  /** EOSE受信ハンドラーを設定する */
  onEose(handler: (subId: string, relay: string) => void): void {
    this.#eoseHandler = handler;
  }

  /** OK受信ハンドラーを設定する */
  onOk(
    handler: (
      eventId: string,
      accepted: boolean,
      msg: string,
      relay: string,
    ) => void,
  ): void {
    this.#okHandler = handler;
  }

  /** NOTICE受信ハンドラーを設定する */
  onNotice(handler: (msg: string, relay: string) => void): void {
    this.#noticeHandler = handler;
  }

  /** エラーハンドラーを設定する */
  onError(handler: (error: string, relay: string) => void): void {
    this.#errorHandler = handler;
  }

  #handleMessage(relay: string, data: string): void {
    let parsed: unknown[];
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }

    if (!Array.isArray(parsed) || parsed.length < 2) return;

    switch (parsed[0]) {
      case "EVENT":
        if (parsed.length >= 3) {
          this.#eventHandler?.(parsed[2] as NostrEvent, relay);
        }
        break;
      case "EOSE":
        this.#eoseHandler?.(parsed[1] as string, relay);
        break;
      case "OK":
        if (parsed.length >= 4) {
          this.#okHandler?.(
            parsed[1] as string,
            parsed[2] as boolean,
            parsed[3] as string,
            relay,
          );
        }
        break;
      case "NOTICE":
        this.#noticeHandler?.(parsed[1] as string, relay);
        break;
    }
  }
}
