/**
 * MockRelay
 *
 * URL単位で動作する仮想リレー。イベントのストア・フィルタリング、
 * カスタムハンドラー、検証ヘルパー、不安定性シミュレート、AUTH を提供する。
 *
 * @module
 */

import type {
  AuthValidator,
  ClientMessage,
  EVENTHandler,
  MockRelayOptions,
  NostrEvent,
  NostrFilter,
  RelayMessage,
  RelaySnapshot,
  REQHandler,
} from "./types.ts";
import { filterEvents, matchFilters } from "./filter.ts";
import { AuthState } from "./auth.ts";
import { createLogger, type Logger } from "./logger.ts";
import type { MockWebSocket } from "./websocket.ts";

/** 受信メッセージの記録 */
interface ReceivedMessage {
  /** 受信時刻 (ms) */
  timestamp: number;
  /** パース済みメッセージ */
  message: ClientMessage;
  /** 送信元WebSocket */
  socket: MockWebSocket;
}

/**
 * URL単位で動作する仮想Nostrリレー
 *
 * イベントのストア、フィルタリング、カスタムハンドラー登録、
 * 検証ヘルパー、不安定性シミュレート、NIP-42 AUTH を提供する。
 */
export class MockRelay {
  readonly url: string;
  readonly options: MockRelayOptions;

  #store: NostrEvent[] = [];
  #received: ReceivedMessage[] = [];
  #connections: Set<MockWebSocket> = new Set();
  #subscriptions: Map<
    string,
    { filters: NostrFilter[]; socket: MockWebSocket }
  > = new Map();
  #reqHandler: REQHandler | null = null;
  #eventHandler: EVENTHandler | null = null;
  #refused = false;
  #authState: AuthState = new AuthState();
  #pendingTimers: Set<ReturnType<typeof setTimeout>> = new Set();
  #logger: Logger | null = null;

  constructor(url: string, options: MockRelayOptions = {}) {
    this.url = url;
    this.options = options;
    this.#logger = createLogger(options.logging);
  }

  // ===== ストア・ハンドラー =====

  /**
   * イベントをストアに登録する
   *
   * REQ受信時の自動マッチングに使用される。
   */
  store(event: NostrEvent): void {
    this.#store.push(event);
  }

  /**
   * REQハンドラーを設定する
   *
   * 設定すると自動マッチングがスキップされ、このハンドラーが呼ばれる。
   */
  onREQ(handler: REQHandler): void {
    this.#reqHandler = handler;
  }

  /**
   * EVENTハンドラーを設定する
   *
   * クライアントからEVENTメッセージを受信したときの処理をカスタマイズする。
   */
  onEVENT(handler: EVENTHandler): void {
    this.#eventHandler = handler;
  }

  // ===== エラーケース =====

  /**
   * 接続拒否モードにする
   *
   * 以降の新規接続はすべてエラーで閉じられる。
   */
  refuse(): void {
    this.#refused = true;
  }

  /**
   * 全接続を即座に切断する
   *
   * @param code WebSocketクローズコード (デフォルト: 1000)
   * @param reason クローズ理由
   */
  disconnect(code = 1000, reason = ""): void {
    for (const ws of [...this.#connections]) {
      ws._forceClose(code, reason);
    }
  }

  /**
   * 指定時間後に全接続を切断する
   *
   * @param ms 遅延ミリ秒
   * @param code WebSocketクローズコード (デフォルト: 1006)
   */
  disconnectAfter(ms: number, code = 1006): void {
    const timer = setTimeout(() => {
      this.#pendingTimers.delete(timer);
      this.disconnect(code, "");
    }, ms);
    this.#pendingTimers.add(timer);
  }

  /**
   * 特定のクローズコードで全接続を閉じる
   *
   * @param code WebSocketクローズコード
   */
  close(code: number): void {
    this.disconnect(code, "");
  }

  /**
   * 生データを全接続に送信する
   *
   * 不正JSONのテスト等に使用する。
   */
  sendRaw(data: string): void {
    for (const ws of this.#connections) {
      ws._receiveMessage(data);
    }
  }

  /**
   * NOTICEメッセージを全接続に送信する
   */
  sendNotice(message: string): void {
    const notice: RelayMessage = ["NOTICE", message];
    for (const ws of this.#connections) {
      ws._receiveMessage(JSON.stringify(notice));
    }
  }

  // ===== NIP-42 AUTH =====

  /**
   * AUTH要求を設定する
   *
   * バリデーターを設定すると、接続時にAUTHチャレンジが送信される。
   * 既存の接続にも即座にチャレンジが送信される。
   */
  requireAuth(validator: AuthValidator): void {
    this.#authState.setValidator(validator);
    // 既存接続にもチャレンジ送信
    for (const ws of this.#connections) {
      const msg = this.#authState.sendChallenge(ws);
      ws._receiveMessage(JSON.stringify(msg));
    }
  }

  // ===== 検証ヘルパー =====

  /** 全受信メッセージ（パース済み） */
  get received(): ClientMessage[] {
    return this.#received.map((r) => r.message);
  }

  /**
   * 特定サブスクリプションIDのREQを検索する
   * @returns [subId, ...filters] または undefined
   */
  findREQ(subId: string): ["REQ", string, ...NostrFilter[]] | undefined {
    const found = this.#received.find(
      (r) => r.message[0] === "REQ" && r.message[1] === subId,
    );
    if (found && found.message[0] === "REQ") {
      return found.message as ["REQ", string, ...NostrFilter[]];
    }
    return undefined;
  }

  /** REQメッセージの受信数 */
  countREQs(): number {
    return this.#received.filter((r) => r.message[0] === "REQ").length;
  }

  /** 特定サブスクリプションIDのREQが存在するか */
  hasREQ(subId: string): boolean {
    return this.findREQ(subId) !== undefined;
  }

  /**
   * 特定イベントIDのEVENTを検索する
   * @returns イベント または undefined
   */
  findEvent(eventId: string): NostrEvent | undefined {
    const found = this.#received.find(
      (r) => r.message[0] === "EVENT" && r.message[1].id === eventId,
    );
    if (found && found.message[0] === "EVENT") {
      return found.message[1];
    }
    return undefined;
  }

  /** EVENTメッセージの受信数 */
  countEvents(): number {
    return this.#received.filter((r) => r.message[0] === "EVENT").length;
  }

  /** 特定イベントIDのEVENTが存在するか */
  hasEvent(eventId: string): boolean {
    return this.findEvent(eventId) !== undefined;
  }

  /**
   * 特定サブスクリプションIDのCLOSEを検索する
   * @returns ["CLOSE", subId] または undefined
   */
  findCLOSE(subId: string): ["CLOSE", string] | undefined {
    const found = this.#received.find(
      (r) => r.message[0] === "CLOSE" && r.message[1] === subId,
    );
    if (found && found.message[0] === "CLOSE") {
      return found.message as ["CLOSE", string];
    }
    return undefined;
  }

  /** 現在のアクティブ接続数 */
  get connectionCount(): number {
    return this.#connections.size;
  }

  /** ロガーインスタンス（設定済みの場合） */
  get logger(): Logger | null {
    return this.#logger;
  }

  // ===== スナップショット =====

  /**
   * リレーの現在の状態を保存する
   *
   * ストアと受信メッセージのスナップショットを作成する。
   * 接続状態やハンドラーは保存されない。
   */
  snapshot(): RelaySnapshot {
    return {
      timestamp: Date.now(),
      store: this.#store.map((e) => ({
        ...e,
        tags: e.tags.map((t) => [...t]),
      })),
      received: this.#received.map((r) => {
        const msg = r.message;
        if (msg[0] === "EVENT") {
          const event = { ...msg[1], tags: msg[1].tags.map((t) => [...t]) };
          return ["EVENT", event] as ClientMessage;
        }
        if (msg[0] === "REQ") {
          return [...msg] as ClientMessage;
        }
        return [...msg] as ClientMessage;
      }),
    };
  }

  /**
   * スナップショットからリレーの状態を復元する
   *
   * ストアと受信メッセージログを復元する。
   * 接続やハンドラーは変更されない。
   */
  restore(snap: RelaySnapshot): void {
    this.#store = snap.store.map((e) => ({
      ...e,
      tags: e.tags.map((t) => [...t]),
    }));
    this.#received = snap.received.map((msg) => ({
      timestamp: snap.timestamp,
      message: msg[0] === "EVENT"
        ? ["EVENT", {
          ...(msg as ["EVENT", NostrEvent])[1],
          tags: (msg as ["EVENT", NostrEvent])[1].tags.map((t) => [...t]),
        }] as ClientMessage
        : [...msg] as ClientMessage,
      socket: null as unknown as MockWebSocket,
    }));
  }

  /**
   * リレーの状態をリセットする
   *
   * ストア、受信ログ、サブスクリプション、ハンドラー、AUTH状態をクリアする。
   */
  reset(): void {
    this.#store = [];
    this.#received = [];
    this.#subscriptions.clear();
    this.#reqHandler = null;
    this.#eventHandler = null;
    this.#refused = false;
    this.#authState.reset();
    for (const timer of this.#pendingTimers) {
      clearTimeout(timer);
    }
    this.#pendingTimers.clear();
  }

  // ===== internal API =====

  /**
   * 接続拒否モードかどうか
   * @internal MockWebSocketから呼び出される
   */
  get _isRefused(): boolean {
    return this.#refused;
  }

  /**
   * 接続を登録する
   * @internal MockWebSocketから呼び出される
   */
  _registerConnection(ws: MockWebSocket): void {
    this.#connections.add(ws);
  }

  /**
   * 接続を解除する
   * @internal MockWebSocketから呼び出される
   */
  _unregisterConnection(ws: MockWebSocket): void {
    this.#connections.delete(ws);
    this.#authState.removeConnection(ws);
    // この接続のサブスクリプションをクリーンアップ
    for (const [subId, sub] of this.#subscriptions) {
      if (sub.socket === ws) {
        this.#subscriptions.delete(subId);
      }
    }
  }

  /**
   * イベントをアクティブなサブスクリプションにブロードキャストする
   *
   * イベントを各サブスクリプションのフィルターと照合し、
   * マッチした場合にそのサブスクリプションへ送信する。
   * @internal ストリーム機能から呼び出される
   */
  _broadcastEvent(event: NostrEvent): void {
    for (const [subId, sub] of this.#subscriptions) {
      if (matchFilters(event, sub.filters)) {
        const msg: RelayMessage = ["EVENT", subId, event];
        sub.socket._receiveMessage(JSON.stringify(msg));
      }
    }
  }

  /**
   * WebSocket接続確立後の処理
   * @internal MockWebSocketから呼び出される
   */
  _handleOpen(ws: MockWebSocket): void {
    // AUTH: requiresAuthオプションまたはバリデーター設定済みの場合、チャレンジ送信
    // openイベント後にリスナー登録できるよう、macrotaskで遅延実行
    if (this.options.requiresAuth || this.#authState.hasValidator) {
      const timer = setTimeout(() => {
        this.#pendingTimers.delete(timer);
        const msg = this.#authState.sendChallenge(ws);
        ws._receiveMessage(JSON.stringify(msg));
      }, 0);
      this.#pendingTimers.add(timer);
    }
  }

  /**
   * クライアントからのメッセージを処理する
   * @internal MockWebSocketから呼び出される
   */
  _handleMessage(ws: MockWebSocket, data: string): void {
    let parsed: ClientMessage;
    try {
      parsed = JSON.parse(data) as ClientMessage;
    } catch {
      // 不正なJSONは無視
      return;
    }

    this.#received.push({
      timestamp: Date.now(),
      message: parsed,
      socket: ws,
    });

    this.#log("receive", parsed);

    // ランダム切断チェック
    if (this.#shouldRandomDisconnect()) {
      ws._forceClose(1006, "Random disconnect");
      return;
    }

    // エラー率チェック
    if (this.#shouldError()) {
      const notice: RelayMessage = ["NOTICE", "error: simulated error"];
      this.#sendWithLatency(ws, notice);
      return;
    }

    switch (parsed[0]) {
      case "EVENT":
        this.#handleEvent(ws, parsed[1]);
        break;
      case "REQ":
        this.#handleReq(ws, parsed[1], parsed.slice(2) as NostrFilter[]);
        break;
      case "CLOSE":
        this.#handleClose(parsed[1]);
        break;
      case "AUTH":
        this.#handleAuth(ws, parsed[1]);
        break;
    }
  }

  async #handleEvent(ws: MockWebSocket, event: NostrEvent): Promise<void> {
    let response: ["OK", string, boolean, string];

    if (this.#eventHandler) {
      response = await this.#eventHandler(event);
    } else {
      // デフォルト: 受理してストアに追加
      this.#store.push(event);
      response = ["OK", event.id, true, ""];
    }

    this.#sendWithLatency(ws, response);
  }

  async #handleReq(
    ws: MockWebSocket,
    subId: string,
    filters: NostrFilter[],
  ): Promise<void> {
    this.#subscriptions.set(subId, { filters, socket: ws });

    let events: NostrEvent[];

    if (this.#reqHandler) {
      events = await this.#reqHandler(subId, filters);
    } else {
      // デフォルト: ストアからフィルタリング
      events = [];
      for (const filter of filters) {
        const matched = filterEvents(this.#store, filter);
        for (const event of matched) {
          if (!events.some((e) => e.id === event.id)) {
            events.push(event);
          }
        }
      }
    }

    // EVENT送信
    for (const event of events) {
      const msg: RelayMessage = ["EVENT", subId, event];
      this.#sendWithLatency(ws, msg);
    }

    // EOSE送信
    const eose: RelayMessage = ["EOSE", subId];
    this.#sendWithLatency(ws, eose);
  }

  #handleClose(subId: string): void {
    this.#subscriptions.delete(subId);
  }

  async #handleAuth(ws: MockWebSocket, authEvent: NostrEvent): Promise<void> {
    const [accepted, message] = await this.#authState.handleAuthResponse(
      ws,
      authEvent,
    );
    const ok: RelayMessage = ["OK", authEvent.id, accepted, message];
    ws._receiveMessage(JSON.stringify(ok));
  }

  // ===== レイテンシ・不安定性 =====

  #getLatency(): number {
    const latency = this.options.latency;
    if (latency === undefined) return 0;
    if (typeof latency === "number") return latency;
    return latency.min + Math.random() * (latency.max - latency.min);
  }

  #shouldError(): boolean {
    const rate = this.options.errorRate;
    if (rate === undefined || rate <= 0) return false;
    return Math.random() < rate;
  }

  #shouldRandomDisconnect(): boolean {
    const rate = this.options.disconnectRate;
    if (rate === undefined || rate <= 0) return false;
    return Math.random() < rate;
  }

  #sendWithLatency(ws: MockWebSocket, message: RelayMessage): void {
    const latency = this.#getLatency();
    const json = JSON.stringify(message);
    this.#log("send", message);
    if (latency > 0) {
      const timer = setTimeout(() => {
        this.#pendingTimers.delete(timer);
        ws._receiveMessage(json);
      }, latency);
      this.#pendingTimers.add(timer);
    } else {
      ws._receiveMessage(json);
    }
  }

  #log(direction: "send" | "receive", data: unknown): void {
    if (!this.#logger) return;
    this.#logger.log(
      {
        timestamp: Date.now(),
        relay: this.url,
        direction,
        data,
      },
      "info",
    );
  }
}
