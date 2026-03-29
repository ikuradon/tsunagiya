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
  Clock,
  COUNTHandler,
  EVENTHandler,
  EventVerifier,
  MockRelayOptions,
  NostrEvent,
  NostrFilter,
  RelayInformation,
  RelaySnapshot,
  REQHandler,
} from "./types.ts";
import { cloneRelayInformation } from "./internal/clone.ts";
import { systemClock } from "./internal/runtime.ts";
import { AuthService } from "./relay/auth_service.ts";
import { RelayConnectionRuntime } from "./relay/connection_runtime.ts";
import {
  BLOCKED_EVENT_WAS_DELETED,
  DUPLICATE_ALREADY_HAVE_NEWER_EVENT,
  internalProcessingError,
  INVALID_BAD_SIGNATURE,
} from "./relay/error_messages.ts";
import { EventStore } from "./relay/event_store.ts";
import { RelayInspector } from "./relay/relay_inspector.ts";
import {
  DEFAULT_MESSAGE_VALIDATION_LIMITS,
  type MessageValidationLimits,
} from "./relay/message_codec.ts";
import {
  countMessage,
  eoseMessage,
  eventMessage,
  okMessage,
} from "./relay/response_builders.ts";
import { SubscriptionRegistry } from "./relay/subscription_registry.ts";
import { createLogger, type Logger } from "./logger.ts";
import type { MockWebSocket } from "./websocket.ts";

/**
 * URL単位で動作する仮想Nostrリレー
 *
 * イベントのストア、フィルタリング、カスタムハンドラー登録、
 * 検証ヘルパー、不安定性シミュレート、NIP-42 AUTH を提供する。
 */
export class MockRelay {
  readonly url: string;
  readonly options: MockRelayOptions;

  readonly #clock: Clock;
  #eventStore: EventStore = new EventStore();
  #info: RelayInformation = {};
  #subscriptions: SubscriptionRegistry = new SubscriptionRegistry();
  #reqHandler: REQHandler | null = null;
  #eventHandler: EVENTHandler | null = null;
  #countHandler: COUNTHandler | null = null;
  #authService: AuthService;
  #inspector: RelayInspector = new RelayInspector();
  #logger: Logger | null = null;
  #runtime: RelayConnectionRuntime;
  #verifier: EventVerifier | null = null;

  constructor(url: string, options: MockRelayOptions = {}) {
    this.url = url;
    this.options = options;
    this.#clock = options.clock ?? systemClock;
    this.#authService = new AuthService({ random: options.random });
    this.#logger = createLogger(options.logging);
    if (options.verifier) {
      this.#verifier = options.verifier;
    }
    if (options.authVerifier) {
      this.#authService.setVerifier(options.authVerifier);
    }
    this.#runtime = new RelayConnectionRuntime({
      url,
      relayOptions: options,
      authService: this.#authService,
      logger: this.#logger,
      clock: this.#clock,
      random: options.random,
      handlers: {
        getMessageValidationLimits: () => this.#getMessageValidationLimits(),
        recordReceived: (message, socket) => {
          this.#inspector.recordReceived(this.#clock.now(), message, socket);
        },
        onConnectionClosed: (socket) => {
          this.#subscriptions.deleteConnection(socket);
        },
        onEvent: (socket, event) => this.#handleEvent(socket, event),
        onReq: (socket, subId, filters) =>
          this.#handleReq(socket, subId, filters),
        onClose: (socket, subId) => this.#handleClose(socket, subId),
        onAuth: (socket, event) => this.#handleAuth(socket, event),
        onCount: (socket, subId, filters) =>
          this.#handleCount(socket, subId, filters),
        rememberError: (message) => {
          this.#inspector.rememberError(message);
        },
      },
    });
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
    return cloneRelayInformation(this.#info);
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
    return this.#eventStore.store(event);
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
    this.#runtime.refuse();
  }

  /**
   * 全接続を即座に切断する
   *
   * @param code WebSocketクローズコード (デフォルト: 1000)
   * @param reason クローズ理由
   */
  disconnect(code = 1000, reason = ""): void {
    this.#runtime.disconnect(code, reason);
  }

  /**
   * 指定時間後に全接続を切断する
   *
   * @param ms 遅延ミリ秒
   * @param code WebSocketクローズコード (デフォルト: 1006)
   */
  disconnectAfter(ms: number, code = 1006): void {
    this.#runtime.disconnectAfter(ms, code);
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
    this.#runtime.sendRaw(data);
  }

  /**
   * NOTICEメッセージを全接続に送信する
   */
  sendNotice(message: string): void {
    this.#runtime.sendNotice(message);
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
    this.#authService.setValidator(validator);
    this.#runtime.issueAuthChallenges();
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

  /**
   * AUTHイベント署名検証器を設定する
   *
   * 設定すると、クライアントから受信した AUTH メッセージの署名を検証する。
   * 検証に失敗した場合は OK false を返し、認証状態は更新しない。
   */
  setAuthVerifier(verifier: EventVerifier): void {
    this.#authService.setVerifier(verifier);
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
    return this.#subscriptions.getView();
  }

  /** 全受信メッセージ（パース済み） */
  get received(): ClientMessage[] {
    return this.#inspector.received;
  }

  /**
   * 特定サブスクリプションIDのREQを検索する
   * @returns [subId, ...filters] または undefined
   */
  findREQ(subId: string): ["REQ", string, ...NostrFilter[]] | undefined {
    return this.#inspector.findREQ(subId);
  }

  /** REQメッセージの受信数 */
  countREQs(): number {
    return this.#inspector.countREQs();
  }

  /** 特定サブスクリプションIDのREQが存在するか */
  hasREQ(subId: string): boolean {
    return this.#inspector.hasREQ(subId);
  }

  /**
   * 特定イベントIDのEVENTを検索する
   * @returns イベント または undefined
   */
  findEvent(eventId: string): NostrEvent | undefined {
    return this.#inspector.findEvent(eventId);
  }

  /** EVENTメッセージの受信数 */
  countEvents(): number {
    return this.#inspector.countEvents();
  }

  /** 特定イベントIDのEVENTが存在するか */
  hasEvent(eventId: string): boolean {
    return this.#inspector.hasEvent(eventId);
  }

  /**
   * 特定サブスクリプションIDのCLOSEを検索する
   * @returns ["CLOSE", subId] または undefined
   */
  findCLOSE(subId: string): ["CLOSE", string] | undefined {
    return this.#inspector.findCLOSE(subId);
  }

  /**
   * 特定サブスクリプションIDのCOUNTを検索する
   * @returns ["COUNT", subId, ...filters] または undefined
   */
  findCOUNT(
    subId: string,
  ): ["COUNT", string, ...NostrFilter[]] | undefined {
    return this.#inspector.findCOUNT(subId);
  }

  /** COUNTメッセージの受信数 */
  countCOUNTs(): number {
    return this.#inspector.countCOUNTs();
  }

  /** 特定サブスクリプションIDのCOUNTが存在するか */
  hasCOUNT(subId: string): boolean {
    return this.#inspector.hasCOUNT(subId);
  }

  /** 削除済みイベントIDの一覧 */
  get deletedIds(): ReadonlySet<string> {
    return this.#eventStore.deletedIds;
  }

  /** 現在のアクティブ接続数 */
  get connectionCount(): number {
    return this.#runtime.connectionCount;
  }

  /** 発生したエラーレスポンスのログ */
  get errors(): ReadonlyArray<string> {
    return this.#inspector.errors;
  }

  /** AUTH認証結果のログ */
  get authResults(): ReadonlyArray<
    { eventId: string; accepted: boolean; message: string }
  > {
    return this.#inspector.authResults;
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
    const eventStoreSnapshot = this.#eventStore.snapshot();
    return {
      timestamp: this.#clock.now(),
      store: eventStoreSnapshot.store,
      received: this.#inspector.snapshotReceivedMessages(),
      deletedIds: eventStoreSnapshot.deletedIds,
      info: cloneRelayInformation(this.#info),
      metadata: {
        subscriptionCount: this.getSubscriptions().size,
        connectionCount: this.#runtime.connectionCount,
        eventCount: this.#eventStore.size,
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
    this.#eventStore.restore({
      store: snap.store,
      deletedIds: snap.deletedIds ?? [],
    });
    this.#inspector.restoreReceivedMessages(snap.received, snap.timestamp);
    this.#info = snap.info ? cloneRelayInformation(snap.info) : {};
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
    return this.#eventStore.clearOlderThan(timestamp);
  }

  /**
   * リレーの状態をリセットする
   *
   * ストア、受信ログ、サブスクリプション、ハンドラー、AUTH状態をクリアする。
   */
  reset(): void {
    this.#eventStore.reset();
    this.#inspector.reset();
    this.#subscriptions.clear();
    this.#reqHandler = null;
    this.#eventHandler = null;
    this.#countHandler = null;
    this.#authService.reset();
    this.#info = {};
    this.#verifier = null;
    this.#runtime.reset();
  }

  // ===== internal API =====

  /**
   * 接続拒否モードかどうか
   * @internal MockWebSocketから呼び出される
   */
  get _isRefused(): boolean {
    return this.#runtime.isRefused;
  }

  /**
   * 接続を登録する
   * @internal MockWebSocketから呼び出される
   */
  _registerConnection(ws: MockWebSocket): void {
    this.#runtime.registerConnection(ws);
  }

  /**
   * 接続を解除する
   * @internal MockWebSocketから呼び出される
   */
  _unregisterConnection(ws: MockWebSocket): void {
    this.#runtime.unregisterConnection(ws);
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
    for (
      const { socket, subId } of this.#subscriptions.matchingSubscriptions(
        event,
      )
    ) {
      this.#runtime.sendMessage(socket, eventMessage(subId, event));
    }
  }

  /**
   * WebSocket接続確立後の処理
   * @internal MockWebSocketから呼び出される
   */
  _handleOpen(ws: MockWebSocket): void {
    this.#runtime.handleOpen(ws);
  }

  /**
   * クライアントからのメッセージを処理する
   * @internal MockWebSocketから呼び出される
   */
  _handleMessage(ws: MockWebSocket, data: string): void {
    this.#runtime.handleMessage(ws, data);
  }

  async #handleEvent(ws: MockWebSocket, event: NostrEvent): Promise<void> {
    let response: ["OK", string, boolean, string];

    // verifier が設定されている場合、署名検証を行う
    if (this.#verifier) {
      const valid = await this.#verifier.verifyEvent(event);
      if (!valid) {
        this.#runtime.sendErrorOk(ws, event.id, INVALID_BAD_SIGNATURE);
        return;
      }
    }

    try {
      if (this.#eventHandler) {
        response = await this.#eventHandler(event);
      } else {
        const result = this.#eventStore.publish(event);
        if (result.status === "blocked") {
          response = okMessage(event.id, false, BLOCKED_EVENT_WAS_DELETED);
        } else if (
          result.status === "stored" || result.status === "ephemeral"
        ) {
          this.broadcast(event);
          response = okMessage(event.id, true, "");
        } else {
          response = okMessage(
            event.id,
            true,
            DUPLICATE_ALREADY_HAVE_NEWER_EVENT,
          );
        }
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      response = okMessage(
        event.id,
        false,
        internalProcessingError("EVENT", detail),
      );
    }

    if (!response[2] && response[3]) {
      this.#inspector.rememberError(response[3]);
    }

    this.#runtime.sendMessage(ws, response);
  }

  async #handleReq(
    ws: MockWebSocket,
    subId: string,
    filters: NostrFilter[],
  ): Promise<void> {
    this.#subscriptions.set(ws, subId, filters);

    try {
      let events: NostrEvent[];

      if (this.#reqHandler) {
        events = await this.#reqHandler(subId, filters);
      } else {
        events = this.#eventStore.queryMany(filters);
      }

      // EVENT送信
      for (const event of events) {
        this.#runtime.sendMessage(ws, eventMessage(subId, event));
      }

      // EOSE送信
      this.#runtime.sendMessage(ws, eoseMessage(subId));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.#runtime.sendErrorClosed(
        ws,
        subId,
        internalProcessingError("REQ", detail),
      );
    }
  }

  #handleClose(ws: MockWebSocket, subId: string): void {
    this.#subscriptions.delete(ws, subId);
  }

  async #handleAuth(ws: MockWebSocket, authEvent: NostrEvent): Promise<void> {
    try {
      const [accepted, message] = await this.#authService.handleAuthResponse(
        ws,
        authEvent,
        this.url,
      );
      this.#inspector.rememberAuthResult({
        eventId: authEvent.id,
        accepted,
        message,
      });
      this.#runtime.sendMessage(ws, okMessage(authEvent.id, accepted, message));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.#runtime.sendErrorOk(
        ws,
        authEvent.id,
        internalProcessingError("AUTH", detail),
      );
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
        result = { count: this.#eventStore.count(filters) };
      }

      this.#runtime.sendMessage(ws, countMessage(subId, result));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.#runtime.sendErrorNotice(
        ws,
        internalProcessingError("COUNT", detail),
      );
    }
  }

  #getMessageValidationLimits(): MessageValidationLimits {
    const limitation = this.#info.limitation;
    return {
      maxMessageLength: limitation?.max_message_length,
      maxFilterCount: DEFAULT_MESSAGE_VALIDATION_LIMITS.maxFilterCount,
      maxSubIdLength: limitation?.max_subid_length,
      maxLimitValue: limitation?.max_limit,
      maxEventTags: limitation?.max_event_tags,
      maxContentLength: limitation?.max_content_length,
    };
  }
}
