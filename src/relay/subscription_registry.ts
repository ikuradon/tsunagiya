/**
 * Per-connection subscription registry.
 *
 * @module
 */

import { cloneFilter } from "../internal/clone.ts";
import { matchFilters } from "../filter.ts";
import type { NostrEvent, NostrFilter } from "../types.ts";
import type { MockWebSocket } from "../websocket.ts";

export class SubscriptionRegistry {
  #subscriptions: Map<MockWebSocket, Map<string, NostrFilter[]>> = new Map();

  set(ws: MockWebSocket, subId: string, filters: NostrFilter[]): void {
    let wsSubscriptions = this.#subscriptions.get(ws);
    if (!wsSubscriptions) {
      wsSubscriptions = new Map();
      this.#subscriptions.set(ws, wsSubscriptions);
    }

    wsSubscriptions.set(subId, filters);
  }

  delete(ws: MockWebSocket, subId: string): void {
    this.#subscriptions.get(ws)?.delete(subId);
  }

  deleteConnection(ws: MockWebSocket): void {
    this.#subscriptions.delete(ws);
  }

  clear(): void {
    this.#subscriptions.clear();
  }

  getView(): ReadonlyMap<string, ReadonlyArray<NostrFilter>> {
    const result = new Map<string, NostrFilter[]>();

    for (const subscriptions of this.#subscriptions.values()) {
      for (const [subId, filters] of subscriptions) {
        if (!result.has(subId)) {
          result.set(subId, filters.map(cloneFilter));
        }
      }
    }

    return result;
  }

  matchingSubscriptions(
    event: NostrEvent,
  ): Array<{ socket: MockWebSocket; subId: string }> {
    const result: Array<{ socket: MockWebSocket; subId: string }> = [];

    for (const [socket, subscriptions] of this.#subscriptions) {
      for (const [subId, filters] of subscriptions) {
        if (matchFilters(event, filters)) {
          result.push({ socket, subId });
        }
      }
    }

    return result;
  }
}
