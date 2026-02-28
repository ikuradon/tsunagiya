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
  COUNTHandler,
  EVENTHandler,
  EventVerifier,
  LogLevel,
  MockRelayOptions,
  NostrEvent,
  NostrFilter,
  RelayInformation,
  RelayMessage,
  RelaySnapshot,
  REQHandler,
} from "./types.ts";
import { filterEvents, matchFilters } from "./filter.ts";
import {
  classifyEvent,
  getParameterizedId,
  isParameterizedReplaceable,
  isReplaceable,
} from "./event_kind.ts";
import { AuthState } from "./auth.ts";
import { createLogger, type Logger } from "./logger.ts";
import type { MockWebSocket } from "./websocket.ts";

/** 受信メッセージの記録 */
interface ReceivedMessage {
  /** 受信時刻 (ms) */
  timestamp: number;
  /** パース済みメッセージ */
  message: ClientMessage;
  /** 送信元WebSocket（スナップショットから復元した場合は null） */
  socket: MockWebSocket | null;
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
  #info: RelayInformation = {};
  #subscriptions: Map<MockWebSocket, Map<string, NostrFilter[]>> = new Map();
  #reqHandler: REQHandler | null = null;
  #eventHandler: EVENTHandler | null = null;
  #countHandler: COUNTHandler | null = null;
  #refused = false;
  #authState: AuthState = new AuthState();
  #pendingTimers: Set<ReturnType<typeof setTimeout>> = new Set();
  #logger: Logger | null = null;
  #errors: string[] = [];
  #authResults: Array<{ eventId: string; accepted: boolean; message: string }> =
    [];
  #deletedIds: Set<string> = new Set();
  #verifier: EventVerifier | null = null;

  constructor(url: string, options: MockRelayOptions = {}) {
    this.url = url;
    this.options = options;
    this.#logger = createLogger(options.logging);
    if (options.verifier) {
      this.#verifier = options.verifier;
    }
  }

  // ===== NIP-11 リレー情報 =====

  /**
   * NIP-11 リレー情報をマージ設定する
   *
   * 既存の情報とマージする（シャロウマージ）。
   * fetch インターセプト経由で `Accept: application/nostr+json` リクエストに返される。
   */
  setInfo(info: Partial<RelayInformation>): void {
    this.#info = { ...this.#info, ...info };
  }

  /**
   * NIP-11 リレー情報のシャロウコピーを返す
   */
  getInfo(): RelayInformation {
    return { ...this.#info };
  }

  // ===== ストア・ハンドラー =====

  /**
   * イベントをストアに登録する
   *
   * REQ受信時の自動マッチングに使用される。
   * NIP-01/NIP-16 に基づき、イベント種別に応じた処理を行う:
   * - Regular: 通常通り追加
   * - Replaceable: 同一 kind+pubkey の古いイベントを削除し追加（古い場合は無視）
   * - Ephemeral: ストアに追加しない
   * - Parameterized Replaceable: 同一 kind+pubkey+d-tag の古いイベントを削除し追加
   *
   * ブロードキャストは行わない。サブスクリプションへの配信が必要な場合は
   * {@link broadcast} を別途呼び出すこと。
   *
   * @param event ストアに登録するイベント
   * @returns ストアに追加された場合 true、無視された場合 false
   * @example
   * ```ts
   * const relay = pool.relay("wss://relay.example.com");
   * const event = EventBuilder.kind1().content("hello").build();
   * relay.store(event);
   * ```
   */
  store(event: NostrEvent): boolean {
    // NIP-09: kind:5 削除リクエストの処理
    if (event.kind === 5) {
      this.#handleDeletion(event);
      this.#store.push(event);
      return true;
    }
    const { stored } = this.#classifyAndStore(event);
    return stored;
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
   * 署名検証（NIP-01）を行う場合はこのハンドラー内で独自に実装する。
   * 未設定の場合、署名検証は行わずストアへの保存とブロードキャストのみ行う。
   */
  onEVENT(handler: EVENTHandler): void {
    this.#eventHandler = handler;
  }

  /**
   * COUNTハンドラーを設定する
   *
   * クライアントからCOUNTメッセージを受信したときの処理をカスタマイズする。
   * 未設定の場合、ストアに対してフィルタリングし、マッチ数を返す。
   */
  onCOUNT(handler: COUNTHandler): void {
    this.#countHandler = handler;
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
   *
   * 標準検証（バリデーター未設定時）は kind:22242・challenge タグ・
   * relay タグの URL 一致のみを確認する。
   * カスタムバリデーターを設定すると relay URL チェックを置き換え、
   * context から relayUrl や challenge を参照して独自の検証を実装できる。
   */
  requireAuth(validator: AuthValidator): void {
    this.#authState.setValidator(validator);
    // 既存接続にもチャレンジ送信
    for (const ws of this.#connections) {
      const msg = this.#authState.sendChallenge(ws);
      ws._receiveMessage(JSON.stringify(msg));
    }
  }

  /**
   * イベント署名検証器を設定する
   *
   * 設定すると、クライアントから受信した EVENT メッセージの署名を検証する。
   * 検証に失敗した場合は OK false を返し、ストアへの保存とブロードキャストはスキップされる。
   */
  setVerifier(verifier: EventVerifier): void {
    this.#verifier = verifier;
  }

  // ===== 検証ヘルパー =====

  /**
   * 現在のアクティブサブスクリプション一覧を返す
   *
   * 全接続のサブスクリプションを集約し、subId → filters の
   * 読み取り専用ビューを提供する。同じ subId が複数接続にある場合は
   * 最初に見つかったものを使う。
   *
   * @example
   * ```ts
   * const subs = relay.getSubscriptions();
   * for (const [subId, filters] of subs) {
   *   console.log(`${subId}: ${JSON.stringify(filters)}`);
   * }
   * ```
   */
  getSubscriptions(): ReadonlyMap<string, ReadonlyArray<NostrFilter>> {
    const result = new Map<string, NostrFilter[]>();
    for (const subscriptions of this.#subscriptions.values()) {
      for (const [subId, filters] of subscriptions) {
        if (!result.has(subId)) {
          result.set(subId, filters);
        }
      }
    }
    return result;
  }

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

  /**
   * 特定サブスクリプションIDのCOUNTを検索する
   * @returns ["COUNT", subId, ...filters] または undefined
   */
  findCOUNT(
    subId: string,
  ): ["COUNT", string, ...NostrFilter[]] | undefined {
    const found = this.#received.find(
      (r) => r.message[0] === "COUNT" && r.message[1] === subId,
    );
    if (found && found.message[0] === "COUNT") {
      return found.message as ["COUNT", string, ...NostrFilter[]];
    }
    return undefined;
  }

  /** COUNTメッセージの受信数 */
  countCOUNTs(): number {
    return this.#received.filter((r) => r.message[0] === "COUNT").length;
  }

  /** 特定サブスクリプションIDのCOUNTが存在するか */
  hasCOUNT(subId: string): boolean {
    return this.findCOUNT(subId) !== undefined;
  }

  /** 削除済みイベントIDの一覧 */
  get deletedIds(): ReadonlySet<string> {
    return this.#deletedIds;
  }

  /** 現在のアクティブ接続数 */
  get connectionCount(): number {
    return this.#connections.size;
  }

  /** 発生したエラーレスポンスのログ */
  get errors(): ReadonlyArray<string> {
    return this.#errors;
  }

  /** AUTH認証結果のログ */
  get authResults(): ReadonlyArray<
    { eventId: string; accepted: boolean; message: string }
  > {
    return this.#authResults;
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
        if (msg[0] === "REQ" || msg[0] === "COUNT") {
          const [type, subId, ...filters] = msg as [
            "REQ" | "COUNT",
            string,
            ...NostrFilter[],
          ];
          return [
            type,
            subId,
            ...filters.map((f) => structuredClone(f)),
          ] as ClientMessage;
        }
        return [...msg] as ClientMessage;
      }),
      deletedIds: [...this.#deletedIds],
      info: { ...this.#info },
      metadata: {
        subscriptionCount: this.getSubscriptions().size,
        connectionCount: this.#connections.size,
        eventCount: this.#store.length,
      },
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
        : (msg[0] === "REQ" || msg[0] === "COUNT")
        ? (() => {
          const [type, subId, ...filters] = msg as [
            "REQ" | "COUNT",
            string,
            ...NostrFilter[],
          ];
          return [
            type,
            subId,
            ...filters.map((f) => structuredClone(f)),
          ] as ClientMessage;
        })()
        : [...msg] as ClientMessage,
      socket: null,
    }));
    this.#deletedIds = new Set(snap.deletedIds ?? []);
    this.#info = snap.info ? { ...snap.info } : {};
  }

  /**
   * 指定タイムスタンプより古いイベントをストアから削除する
   *
   * 大量イベント時のメモリ最適化用。
   *
   * @param timestamp UNIXタイムスタンプ (秒)。これより古い created_at のイベントが削除される
   * @returns 削除されたイベント数
   * @example
   * ```ts
   * // 1時間以上前のイベントを削除
   * const cutoff = Math.floor(Date.now() / 1000) - 3600;
   * const deleted = relay.clearOlderThan(cutoff);
   * console.log(`${deleted} events removed`);
   * ```
   */
  clearOlderThan(timestamp: number): number {
    const before = this.#store.length;
    this.#store = this.#store.filter((e) => e.created_at >= timestamp);
    return before - this.#store.length;
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
    this.#countHandler = null;
    this.#refused = false;
    this.#authState.reset();
    this.#errors = [];
    this.#authResults = [];
    this.#deletedIds.clear();
    this.#info = {};
    this.#verifier = null;
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
    this.#subscriptions.delete(ws);
  }

  /**
   * イベントをアクティブなサブスクリプションにブロードキャストする
   *
   * イベントを各サブスクリプションのフィルターと照合し、
   * マッチした場合にそのサブスクリプションへ送信する。
   *
   * ストアへの保存は行わない。保存が必要な場合は {@link store} を別途呼び出すこと。
   *
   * @param event ブロードキャストするイベント
   * @example
   * ```ts
   * const event = EventBuilder.kind1().content("hello").build();
   * relay.store(event);
   * relay.broadcast(event);
   * ```
   */
  broadcast(event: NostrEvent): void {
    for (const [ws, subscriptions] of this.#subscriptions) {
      for (const [subId, filters] of subscriptions) {
        if (matchFilters(event, filters)) {
          const msg: RelayMessage = ["EVENT", subId, event];
          ws._receiveMessage(JSON.stringify(msg));
        }
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
      const raw: unknown = JSON.parse(data);
      // メッセージ構造の基本検証
      if (!Array.isArray(raw) || raw.length < 1) {
        this.#errors.push("error: invalid message format");
        const notice: RelayMessage = [
          "NOTICE",
          "error: invalid message format",
        ];
        this.#sendWithLatency(ws, notice);
        return;
      }
      const type = raw[0];
      if (type === "EVENT") {
        if (
          raw.length < 2 || typeof raw[1] !== "object" || raw[1] === null ||
          typeof (raw[1] as Record<string, unknown>).id !== "string"
        ) {
          this.#errors.push("error: malformed EVENT message");
          const notice: RelayMessage = [
            "NOTICE",
            "error: malformed EVENT message",
          ];
          this.#sendWithLatency(ws, notice);
          return;
        }
      } else if (type === "REQ" || type === "COUNT") {
        if (raw.length < 2 || typeof raw[1] !== "string") {
          this.#errors.push(`error: malformed ${type} message`);
          const notice: RelayMessage = [
            "NOTICE",
            `error: malformed ${type} message`,
          ];
          this.#sendWithLatency(ws, notice);
          return;
        }
      } else if (type === "CLOSE") {
        if (raw.length < 2 || typeof raw[1] !== "string") {
          this.#errors.push("error: malformed CLOSE message");
          const notice: RelayMessage = [
            "NOTICE",
            "error: malformed CLOSE message",
          ];
          this.#sendWithLatency(ws, notice);
          return;
        }
      } else if (type === "AUTH") {
        if (raw.length < 2 || typeof raw[1] !== "object" || raw[1] === null) {
          this.#errors.push("error: malformed AUTH message");
          const notice: RelayMessage = [
            "NOTICE",
            "error: malformed AUTH message",
          ];
          this.#sendWithLatency(ws, notice);
          return;
        }
      }
      parsed = raw as ClientMessage;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const msg = `error: invalid JSON (${detail})`;
      this.#errors.push(msg);
      this.#log("receive", data, "error");
      const notice: RelayMessage = ["NOTICE", msg];
      this.#sendWithLatency(ws, notice);
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
      const msg = "error: simulated error";
      const notice: RelayMessage = ["NOTICE", msg];
      this.#errors.push(msg);
      this.#sendWithLatency(ws, notice);
      return;
    }

    // AUTH enforcement: 認証必須リレーで未認証の場合、REQ/EVENT を拒否
    if (
      this.#requiresAuthentication() && !this.#authState.isAuthenticated(ws)
    ) {
      if (parsed[0] === "EVENT") {
        const msg = "auth-required: authentication required";
        const ok: RelayMessage = ["OK", parsed[1].id, false, msg];
        this.#errors.push(msg);
        this.#sendWithLatency(ws, ok);
        return;
      }
      if (parsed[0] === "REQ") {
        const msg = "auth-required: authentication required";
        const closed: RelayMessage = ["CLOSED", parsed[1], msg];
        this.#errors.push(msg);
        this.#sendWithLatency(ws, closed);
        return;
      }
    }

    switch (parsed[0]) {
      case "EVENT":
        this.#handleEvent(ws, parsed[1]).catch((err) => {
          const msg = `error: ${
            err instanceof Error ? err.message : String(err)
          }`;
          this.#errors.push(msg);
        });
        break;
      case "REQ":
        this.#handleReq(ws, parsed[1], parsed.slice(2) as NostrFilter[])
          .catch((err) => {
            const msg = `error: ${
              err instanceof Error ? err.message : String(err)
            }`;
            this.#errors.push(msg);
          });
        break;
      case "CLOSE":
        this.#handleClose(ws, parsed[1]);
        break;
      case "AUTH":
        this.#handleAuth(ws, parsed[1]).catch((err) => {
          const msg = `error: ${
            err instanceof Error ? err.message : String(err)
          }`;
          this.#errors.push(msg);
        });
        break;
      case "COUNT":
        this.#handleCount(ws, parsed[1], parsed.slice(2) as NostrFilter[])
          .catch((err) => {
            const msg = `error: ${
              err instanceof Error ? err.message : String(err)
            }`;
            this.#errors.push(msg);
          });
        break;
      default: {
        const msg = `error: unsupported message type: ${String(parsed[0])}`;
        this.#errors.push(msg);
        const notice: RelayMessage = ["NOTICE", msg];
        this.#sendWithLatency(ws, notice);
        break;
      }
    }
  }

  async #handleEvent(ws: MockWebSocket, event: NostrEvent): Promise<void> {
    let response: ["OK", string, boolean, string];

    // verifier が設定されている場合、署名検証を行う
    if (this.#verifier) {
      const valid = await this.#verifier.verifyEvent(event);
      if (!valid) {
        const msg = "invalid: bad signature";
        this.#errors.push(msg);
        const ok: RelayMessage = ["OK", event.id, false, msg];
        this.#sendWithLatency(ws, ok);
        return;
      }
    }

    try {
      if (this.#eventHandler) {
        response = await this.#eventHandler(event);
      } else {
        // 削除済みイベントの再投稿を拒否
        if (this.#deletedIds.has(event.id)) {
          response = ["OK", event.id, false, "blocked: event was deleted"];
        } else if (event.kind === 5) {
          // NIP-09: 削除リクエスト処理
          this.#handleDeletion(event);
          this.#store.push(event);
          this.broadcast(event);
          response = ["OK", event.id, true, ""];
        } else {
          const { stored, ephemeral } = this.#classifyAndStore(event);
          if (stored || ephemeral) {
            this.broadcast(event);
            response = ["OK", event.id, true, ""];
          } else {
            response = [
              "OK",
              event.id,
              true,
              "duplicate: already have a newer event",
            ];
          }
        }
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      response = [
        "OK",
        event.id,
        false,
        `error: internal error processing EVENT (${detail})`,
      ];
    }

    if (!response[2] && response[3]) {
      this.#errors.push(response[3]);
    }

    this.#sendWithLatency(ws, response);
  }

  async #handleReq(
    ws: MockWebSocket,
    subId: string,
    filters: NostrFilter[],
  ): Promise<void> {
    let wsSubscriptions = this.#subscriptions.get(ws);
    if (!wsSubscriptions) {
      wsSubscriptions = new Map();
      this.#subscriptions.set(ws, wsSubscriptions);
    }
    wsSubscriptions.set(subId, filters);

    try {
      let events: NostrEvent[];

      if (this.#reqHandler) {
        events = await this.#reqHandler(subId, filters);
      } else {
        // デフォルト: ストアからフィルタリング
        events = [];
        const seen = new Set<string>();
        for (const filter of filters) {
          const matched = filterEvents(this.#store, filter);
          for (const event of matched) {
            if (!seen.has(event.id)) {
              seen.add(event.id);
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
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const msg = `error: internal error processing REQ (${detail})`;
      this.#errors.push(msg);
      const closed: RelayMessage = ["CLOSED", subId, msg];
      this.#sendWithLatency(ws, closed);
    }
  }

  #handleClose(ws: MockWebSocket, subId: string): void {
    this.#subscriptions.get(ws)?.delete(subId);
  }

  async #handleAuth(ws: MockWebSocket, authEvent: NostrEvent): Promise<void> {
    try {
      const [accepted, message] = await this.#authState.handleAuthResponse(
        ws,
        authEvent,
        this.url,
      );
      this.#authResults.push({ eventId: authEvent.id, accepted, message });
      const ok: RelayMessage = ["OK", authEvent.id, accepted, message];
      this.#sendWithLatency(ws, ok);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const msg = `error: internal error processing AUTH (${detail})`;
      this.#errors.push(msg);
      const ok: RelayMessage = ["OK", authEvent.id, false, msg];
      this.#sendWithLatency(ws, ok);
    }
  }

  #handleDeletion(deletionEvent: NostrEvent): void {
    const idsToDelete = new Set<string>();

    for (const tag of deletionEvent.tags) {
      if (tag[0] === "e" && tag[1]) {
        const targetId = tag[1];
        const target = this.#store.find((e) => e.id === targetId);
        if (
          target && target.pubkey === deletionEvent.pubkey &&
          target.created_at <= deletionEvent.created_at
        ) {
          idsToDelete.add(targetId);
        }
      }
      if (tag[0] === "a" && tag[1]) {
        // a-tag format: kind:pubkey:d-tag
        const parts = tag[1].split(":");
        if (parts.length >= 3) {
          const aKind = parseInt(parts[0], 10);
          if (isNaN(aKind)) continue;
          const aPubkey = parts[1];
          const aDtag = parts.slice(2).join(":");
          // pubkey 一致チェック
          if (aPubkey === deletionEvent.pubkey) {
            const target = this.#store.find((e) => {
              if (
                e.kind === aKind && e.pubkey === aPubkey &&
                e.created_at <= deletionEvent.created_at &&
                isParameterizedReplaceable(e.kind)
              ) {
                const dValue = e.tags.find((t) => t[0] === "d")?.[1] ?? "";
                return dValue === aDtag;
              }
              if (
                e.kind === aKind && e.pubkey === aPubkey &&
                e.created_at <= deletionEvent.created_at &&
                isReplaceable(e.kind)
              ) {
                return true;
              }
              return false;
            });
            if (target) {
              idsToDelete.add(target.id);
            }
          }
        }
      }
    }

    if (idsToDelete.size > 0) {
      for (const id of idsToDelete) {
        this.#deletedIds.add(id);
      }
      this.#store = this.#store.filter((e) => !idsToDelete.has(e.id));
    }
  }

  async #handleCount(
    ws: MockWebSocket,
    subId: string,
    filters: NostrFilter[],
  ): Promise<void> {
    try {
      let result: { count: number };

      if (this.#countHandler) {
        result = await this.#countHandler(subId, filters);
      } else {
        // デフォルト: ストアに対してフィルタリングし、マッチ数を返す
        const matchedIds = new Set<string>();
        for (const filter of filters) {
          const matched = filterEvents(this.#store, filter);
          for (const event of matched) {
            matchedIds.add(event.id);
          }
        }
        result = { count: matchedIds.size };
      }

      const msg: RelayMessage = ["COUNT", subId, result];
      this.#sendWithLatency(ws, msg);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const msg = `error: internal error processing COUNT (${detail})`;
      this.#errors.push(msg);
      const notice: RelayMessage = ["NOTICE", msg];
      this.#sendWithLatency(ws, notice);
    }
  }

  // ===== イベント種別判定・ストア =====

  /**
   * イベント種別に応じてストアに追加・置換する
   *
   * Ephemeral イベントはストアに追加しない（呼び出し側でブロードキャストする）。
   * Replaceable/Parameterized Replaceable は同一キーの古いイベントを置換する。
   *
   * @returns stored: ストアに追加されたか、ephemeral: ephemeral イベントか
   */
  #classifyAndStore(
    event: NostrEvent,
  ): { stored: boolean; ephemeral: boolean } {
    if (this.#deletedIds.has(event.id)) {
      return { stored: false, ephemeral: false };
    }

    const kind = classifyEvent(event.kind);

    if (kind === "ephemeral") {
      return { stored: false, ephemeral: true };
    }

    if (kind === "replaceable") {
      const existing = this.#store.find(
        (e) => e.kind === event.kind && e.pubkey === event.pubkey,
      );
      if (existing) {
        if (event.created_at < existing.created_at) {
          return { stored: false, ephemeral: false };
        }
        if (
          event.created_at === existing.created_at &&
          event.id >= existing.id
        ) {
          return { stored: false, ephemeral: false };
        }
        const idx = this.#store.findIndex(
          (e) => e.kind === event.kind && e.pubkey === event.pubkey,
        );
        if (idx !== -1) this.#store.splice(idx, 1);
      }
      this.#store.push(event);
      return { stored: true, ephemeral: false };
    }

    if (kind === "parameterized_replaceable") {
      const newParamId = getParameterizedId(event);
      const existing = this.#store.find(
        (e) => getParameterizedId(e) === newParamId,
      );
      if (existing) {
        if (event.created_at < existing.created_at) {
          return { stored: false, ephemeral: false };
        }
        if (
          event.created_at === existing.created_at &&
          event.id >= existing.id
        ) {
          return { stored: false, ephemeral: false };
        }
        const idx = this.#store.findIndex(
          (e) => getParameterizedId(e) === newParamId,
        );
        if (idx !== -1) this.#store.splice(idx, 1);
      }
      this.#store.push(event);
      return { stored: true, ephemeral: false };
    }

    // Regular
    this.#store.push(event);
    return { stored: true, ephemeral: false };
  }

  // ===== 認証チェック =====

  #requiresAuthentication(): boolean {
    return this.options.requiresAuth === true || this.#authState.hasValidator;
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
      // 実際のWebSocketと同様に非同期でメッセージを配信する。
      // send() 内で同期的にレスポンスを返すと、一部のクライアント
      // ライブラリ（NDK等）が正しく処理できない。
      queueMicrotask(() => ws._receiveMessage(json));
    }
  }

  #log(
    direction: "send" | "receive",
    data: unknown,
    level: LogLevel = "info",
  ): void {
    if (!this.#logger) return;
    this.#logger.log(
      {
        timestamp: Date.now(),
        relay: this.url,
        direction,
        data,
      },
      level,
    );
  }
}
