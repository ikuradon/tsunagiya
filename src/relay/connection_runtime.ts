/**
 * WebSocket connection runtime for a relay instance.
 *
 * @module
 */

import type { Logger } from "../logger.ts";
import type {
  ClientMessage,
  Clock,
  LogLevel,
  MockRelayOptions,
  NostrEvent,
  NostrFilter,
  RandomSource,
  RelayMessage,
} from "../types.ts";
import type { MockWebSocket } from "../websocket.ts";
import { systemClock, systemRandomSource } from "../internal/runtime.ts";
import type { AuthService } from "./auth_service.ts";
import {
  AUTH_REQUIRED_AUTHENTICATION_REQUIRED,
  relayRuntimeError,
  SIMULATED_ERROR,
  unsupportedMessageType,
} from "./error_messages.ts";
import type { MessageValidationLimits } from "./message_codec.ts";
import { parseClientMessage } from "./message_codec.ts";
import {
  closedMessage,
  noticeMessage,
  okMessage,
} from "./response_builders.ts";
import { routeClientMessage } from "./router.ts";
import { DeliveryScheduler } from "./delivery_scheduler.ts";

interface RelayConnectionRuntimeHandlers {
  getMessageValidationLimits(): MessageValidationLimits;
  recordReceived(message: ClientMessage, socket: MockWebSocket): void;
  onConnectionClosed(socket: MockWebSocket): void;
  onEvent(socket: MockWebSocket, event: NostrEvent): Promise<void> | void;
  onReq(
    socket: MockWebSocket,
    subId: string,
    filters: NostrFilter[],
  ): Promise<void> | void;
  onClose(socket: MockWebSocket, subId: string): void;
  onAuth(socket: MockWebSocket, event: NostrEvent): Promise<void> | void;
  onCount(
    socket: MockWebSocket,
    subId: string,
    filters: NostrFilter[],
  ): Promise<void> | void;
  rememberError(message: string): void;
}

export interface RelayConnectionRuntimeOptions {
  url: string;
  relayOptions: MockRelayOptions;
  authService: AuthService;
  logger: Logger | null;
  clock?: Clock;
  random?: RandomSource;
  handlers: RelayConnectionRuntimeHandlers;
}

export class RelayConnectionRuntime {
  readonly #url: string;
  readonly #relayOptions: MockRelayOptions;
  readonly #authService: AuthService;
  readonly #logger: Logger | null;
  readonly #clock: Clock;
  readonly #random: RandomSource;
  readonly #handlers: RelayConnectionRuntimeHandlers;
  readonly #deliveryScheduler: DeliveryScheduler = new DeliveryScheduler();
  readonly #connections: Set<MockWebSocket> = new Set();
  #refused = false;

  constructor(options: RelayConnectionRuntimeOptions) {
    this.#url = options.url;
    this.#relayOptions = options.relayOptions;
    this.#authService = options.authService;
    this.#logger = options.logger;
    this.#clock = options.clock ?? systemClock;
    this.#random = options.random ?? systemRandomSource;
    this.#handlers = options.handlers;
  }

  get isRefused(): boolean {
    return this.#refused;
  }

  get connectionCount(): number {
    return this.#connections.size;
  }

  refuse(): void {
    this.#refused = true;
  }

  reset(): void {
    this.#refused = false;
    this.#deliveryScheduler.clear();
  }

  connections(): ReadonlyArray<MockWebSocket> {
    return [...this.#connections];
  }

  registerConnection(socket: MockWebSocket): void {
    this.#connections.add(socket);
  }

  unregisterConnection(socket: MockWebSocket): void {
    this.#connections.delete(socket);
    this.#deliveryScheduler.cancelSocket(socket);
    this.#authService.removeConnection(socket);
    this.#handlers.onConnectionClosed(socket);
  }

  disconnect(code = 1000, reason = ""): void {
    for (const socket of this.connections()) {
      socket._forceClose(code, reason);
    }
  }

  disconnectAfter(ms: number, code = 1006): void {
    this.#deliveryScheduler.schedule(ms, () => {
      this.disconnect(code, "");
    });
  }

  sendRaw(data: string): void {
    for (const socket of this.#connections) {
      this.#deliveryScheduler.deliver(socket, data, 0);
    }
  }

  sendNotice(message: string): void {
    const payload = JSON.stringify(noticeMessage(message));
    for (const socket of this.#connections) {
      this.#deliveryScheduler.deliver(socket, payload, 0);
    }
  }

  sendMessage(socket: MockWebSocket, message: RelayMessage): void {
    const latency = this.#getLatency();
    this.#log("send", message);
    this.#deliveryScheduler.deliver(socket, JSON.stringify(message), latency);
  }

  sendErrorNotice(socket: MockWebSocket, message: string): void {
    this.sendMessage(socket, noticeMessage(this.#rememberError(message)));
  }

  sendErrorOk(
    socket: MockWebSocket,
    eventId: string,
    message: string,
  ): void {
    this.sendMessage(
      socket,
      okMessage(eventId, false, this.#rememberError(message)),
    );
  }

  sendErrorClosed(
    socket: MockWebSocket,
    subId: string,
    message: string,
  ): void {
    this.sendMessage(
      socket,
      closedMessage(subId, this.#rememberError(message)),
    );
  }

  issueAuthChallenges(): void {
    for (const socket of this.#connections) {
      this.#issueAuthChallenge(socket);
    }
  }

  handleOpen(socket: MockWebSocket): void {
    if (!this.#requiresAuthentication()) {
      return;
    }

    // open handler 完了後の継続と listener 登録をまたいで challenge を送る.
    queueMicrotask(() => {
      queueMicrotask(() => this.#ensureAuthChallenge(socket));
    });
  }

  handleMessage(socket: MockWebSocket, data: string): void {
    const parseResult = parseClientMessage(
      data,
      this.#handlers.getMessageValidationLimits(),
    );
    if (!parseResult.ok) {
      if (parseResult.logRawInput) {
        this.#log("receive", data, "error");
      }
      this.sendErrorNotice(socket, parseResult.error);
      return;
    }

    const parsed = parseResult.message as ClientMessage;
    this.#handlers.recordReceived(parsed, socket);
    this.#log("receive", parsed);

    if (this.#shouldRandomDisconnect()) {
      socket._forceClose(1006, "Random disconnect");
      return;
    }

    if (this.#shouldError()) {
      this.sendErrorNotice(socket, SIMULATED_ERROR);
      return;
    }

    if (
      this.#requiresAuthentication() &&
      !this.#authService.isAuthenticated(socket)
    ) {
      if (
        parsed[0] === "EVENT" ||
        parsed[0] === "REQ" ||
        parsed[0] === "COUNT"
      ) {
        this.#ensureAuthChallenge(socket);
      }

      if (parsed[0] === "EVENT") {
        const event = (parsed as ["EVENT", NostrEvent])[1];
        this.sendErrorOk(
          socket,
          event.id,
          AUTH_REQUIRED_AUTHENTICATION_REQUIRED,
        );
        return;
      }
      if (parsed[0] === "REQ") {
        const subId = (parsed as ["REQ", string, ...NostrFilter[]])[1];
        this.sendErrorClosed(
          socket,
          subId,
          AUTH_REQUIRED_AUTHENTICATION_REQUIRED,
        );
        return;
      }
      if (parsed[0] === "COUNT") {
        this.sendErrorNotice(socket, AUTH_REQUIRED_AUTHENTICATION_REQUIRED);
        return;
      }
    }

    routeClientMessage(parsed, {
      onEvent: (event) => this.#handlers.onEvent(socket, event),
      onReq: (subId, filters) => this.#handlers.onReq(socket, subId, filters),
      onClose: (subId) => this.#handlers.onClose(socket, subId),
      onAuth: (event) => this.#handlers.onAuth(socket, event),
      onCount: (subId, filters) =>
        this.#handlers.onCount(socket, subId, filters),
      onUnsupported: (type) => {
        this.sendErrorNotice(socket, unsupportedMessageType(type));
      },
      onAsyncError: (error) => {
        this.#rememberError(
          relayRuntimeError(
            error instanceof Error ? error.message : String(error),
          ),
        );
      },
    });
  }

  #issueAuthChallenge(socket: MockWebSocket): void {
    const message = this.#authService.sendChallenge(socket);
    socket._receiveMessage(JSON.stringify(message));
  }

  #ensureAuthChallenge(socket: MockWebSocket): void {
    const message = this.#authService.issueChallengeIfMissing(socket);
    if (!message) {
      return;
    }
    socket._receiveMessage(JSON.stringify(message));
  }

  #requiresAuthentication(): boolean {
    return this.#relayOptions.requiresAuth === true ||
      this.#authService.hasValidator;
  }

  #rememberError(message: string): string {
    this.#handlers.rememberError(message);
    return message;
  }

  #getLatency(): number {
    const latency = this.#relayOptions.latency;
    if (latency === undefined) return 0;
    if (typeof latency === "number") return latency;
    return latency.min + this.#random.next() * (latency.max - latency.min);
  }

  #shouldError(): boolean {
    const rate = this.#relayOptions.errorRate;
    if (rate === undefined || rate <= 0) return false;
    return this.#random.next() < rate;
  }

  #shouldRandomDisconnect(): boolean {
    const rate = this.#relayOptions.disconnectRate;
    if (rate === undefined || rate <= 0) return false;
    return this.#random.next() < rate;
  }

  #log(
    direction: "send" | "receive",
    data: unknown,
    level: LogLevel = "info",
  ): void {
    if (!this.#logger) return;
    this.#logger.log(
      {
        timestamp: this.#clock.now(),
        relay: this.#url,
        direction,
        data,
      },
      level,
    );
  }
}
