/**
 * MockRelay diagnostic state and query helpers.
 *
 * @module
 */

import { cloneClientMessage } from "../internal/clone.ts";
import type { ClientMessage, NostrEvent, NostrFilter } from "../types.ts";
import type { MockWebSocket } from "../websocket.ts";

interface ReceivedMessageRecord {
  readonly timestamp: number;
  readonly message: ClientMessage;
  readonly socket: MockWebSocket | null;
}

export interface AuthResultRecord {
  readonly eventId: string;
  readonly accepted: boolean;
  readonly message: string;
}

export class RelayInspector {
  #received: ReceivedMessageRecord[] = [];
  #errors: string[] = [];
  #authResults: AuthResultRecord[] = [];

  recordReceived(
    timestamp: number,
    message: ClientMessage,
    socket: MockWebSocket | null,
  ): void {
    this.#received.push({ timestamp, message, socket });
  }

  get received(): ClientMessage[] {
    return this.#received.map((record) => record.message);
  }

  findREQ(subId: string): ["REQ", string, ...NostrFilter[]] | undefined {
    const found = this.#received.find(
      (record) => record.message[0] === "REQ" && record.message[1] === subId,
    );
    if (found && found.message[0] === "REQ") {
      return found.message as ["REQ", string, ...NostrFilter[]];
    }
    return undefined;
  }

  countREQs(): number {
    return this.#received.filter((record) => record.message[0] === "REQ")
      .length;
  }

  hasREQ(subId: string): boolean {
    return this.findREQ(subId) !== undefined;
  }

  findEvent(eventId: string): NostrEvent | undefined {
    const found = this.#received.find(
      (record) =>
        record.message[0] === "EVENT" && record.message[1].id === eventId,
    );
    if (found && found.message[0] === "EVENT") {
      return found.message[1];
    }
    return undefined;
  }

  countEvents(): number {
    return this.#received.filter((record) => record.message[0] === "EVENT")
      .length;
  }

  hasEvent(eventId: string): boolean {
    return this.findEvent(eventId) !== undefined;
  }

  findCLOSE(subId: string): ["CLOSE", string] | undefined {
    const found = this.#received.find(
      (record) => record.message[0] === "CLOSE" && record.message[1] === subId,
    );
    if (found && found.message[0] === "CLOSE") {
      return found.message as ["CLOSE", string];
    }
    return undefined;
  }

  findCOUNT(subId: string): ["COUNT", string, ...NostrFilter[]] | undefined {
    const found = this.#received.find(
      (record) => record.message[0] === "COUNT" && record.message[1] === subId,
    );
    if (found && found.message[0] === "COUNT") {
      return found.message as ["COUNT", string, ...NostrFilter[]];
    }
    return undefined;
  }

  countCOUNTs(): number {
    return this.#received.filter((record) => record.message[0] === "COUNT")
      .length;
  }

  hasCOUNT(subId: string): boolean {
    return this.findCOUNT(subId) !== undefined;
  }

  rememberError(message: string): void {
    this.#errors.push(message);
  }

  get errors(): ReadonlyArray<string> {
    return this.#errors;
  }

  rememberAuthResult(result: AuthResultRecord): void {
    this.#authResults.push(result);
  }

  get authResults(): ReadonlyArray<AuthResultRecord> {
    return this.#authResults;
  }

  snapshotReceivedMessages(): ClientMessage[] {
    return this.#received.map((record) => cloneClientMessage(record.message));
  }

  restoreReceivedMessages(
    messages: readonly ClientMessage[],
    timestamp: number,
  ): void {
    this.#received = messages.map((message) => ({
      timestamp,
      message: cloneClientMessage(message),
      socket: null,
    }));
  }

  reset(): void {
    this.#received = [];
    this.#errors = [];
    this.#authResults = [];
  }
}
