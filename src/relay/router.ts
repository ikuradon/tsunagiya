/**
 * Routes parsed client messages to relay handlers.
 *
 * @module
 */

import type { NostrEvent, NostrFilter } from "../types.ts";
import type { ParsedClientMessage } from "./message_codec.ts";

export interface RelayRouterHandlers {
  onEvent(event: NostrEvent): Promise<void> | void;
  onReq(subId: string, filters: NostrFilter[]): Promise<void> | void;
  onClose(subId: string): void;
  onAuth(event: NostrEvent): Promise<void> | void;
  onCount(subId: string, filters: NostrFilter[]): Promise<void> | void;
  onUnsupported(type: unknown): void;
  onAsyncError(error: unknown): void;
}

export function routeClientMessage(
  message: ParsedClientMessage,
  handlers: RelayRouterHandlers,
): void {
  switch (message[0]) {
    case "EVENT": {
      const event = (message as ["EVENT", NostrEvent])[1];
      Promise.resolve(handlers.onEvent(event)).catch(handlers.onAsyncError);
      break;
    }
    case "REQ": {
      const [, subId, ...filters] = message as [
        "REQ",
        string,
        ...NostrFilter[],
      ];
      Promise.resolve(handlers.onReq(subId, filters)).catch(
        handlers.onAsyncError,
      );
      break;
    }
    case "CLOSE": {
      const subId = (message as ["CLOSE", string])[1];
      handlers.onClose(subId);
      break;
    }
    case "AUTH": {
      const event = (message as ["AUTH", NostrEvent])[1];
      Promise.resolve(handlers.onAuth(event)).catch(handlers.onAsyncError);
      break;
    }
    case "COUNT": {
      const [, subId, ...filters] = message as [
        "COUNT",
        string,
        ...NostrFilter[],
      ];
      Promise.resolve(handlers.onCount(subId, filters)).catch(
        handlers.onAsyncError,
      );
      break;
    }
    default:
      handlers.onUnsupported(message[0]);
      break;
  }
}
