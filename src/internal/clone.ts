/**
 * Clone helpers for relay state snapshots and defensive copies.
 *
 * @module
 */

import type {
  ClientMessage,
  NostrEvent,
  NostrFilter,
  RelayInformation,
} from "../types.ts";

export function cloneEvent(event: NostrEvent): NostrEvent {
  return {
    ...event,
    tags: event.tags.map((tag) => [...tag]),
  };
}

export function cloneFilter(filter: NostrFilter): NostrFilter {
  return structuredClone(filter);
}

export function cloneClientMessage(message: ClientMessage): ClientMessage {
  if (message[0] === "EVENT") {
    return ["EVENT", cloneEvent(message[1])];
  }

  if (message[0] === "REQ" || message[0] === "COUNT") {
    const [type, subId, ...filters] = message;
    return [type, subId, ...filters.map(cloneFilter)];
  }

  return [...message] as ClientMessage;
}

export function cloneRelayInformation(
  info: RelayInformation,
): RelayInformation {
  return structuredClone(info);
}
