/**
 * MockPool-specific platform hook installation helpers.
 *
 * @module
 */

import { normalizeUrl } from "../internal/url.ts";
import type { MockRelay } from "../relay.ts";
import { MockWebSocket } from "../websocket.ts";
import {
  captureGlobalHookSnapshot,
  type GlobalHookSnapshot,
  installGlobalFetch,
  installGlobalWebSocket,
  restoreGlobalHookSnapshot,
} from "./global_hooks.ts";
import { createNip11FetchHandler } from "./nip11_fetch.ts";

export type RelayLookup = (
  normalizedWsUrl: string,
) => MockRelay | undefined;

export interface PoolHookInstallation {
  readonly installed: boolean;
  uninstall(): void;
}

class ActivePoolHooks implements PoolHookInstallation {
  #snapshot: GlobalHookSnapshot | null;
  #installed = true;

  constructor(snapshot: GlobalHookSnapshot) {
    this.#snapshot = snapshot;
  }

  get installed(): boolean {
    return this.#installed;
  }

  uninstall(): void {
    if (!this.#installed || !this.#snapshot) {
      throw new Error("MockPool is not installed");
    }

    restoreGlobalHookSnapshot(this.#snapshot);
    MockWebSocket.setRelayResolver(null);

    this.#snapshot = null;
    this.#installed = false;

    if (currentInstallation === this) {
      currentInstallation = null;
    }
  }
}

let currentInstallation: ActivePoolHooks | null = null;

export function installPoolHooks(
  lookupRelay: RelayLookup,
): PoolHookInstallation {
  if (currentInstallation) {
    throw new Error("Another MockPool instance is already installed");
  }

  const snapshot = captureGlobalHookSnapshot();
  MockWebSocket.setRelayResolver((url) => lookupRelay(normalizeUrl(url)));

  try {
    installGlobalWebSocket(MockWebSocket);
    installGlobalFetch(createNip11FetchHandler(lookupRelay, snapshot.fetch));
  } catch (error) {
    MockWebSocket.setRelayResolver(null);
    restoreGlobalHookSnapshot(snapshot);
    throw error;
  }

  const installation = new ActivePoolHooks(snapshot);
  currentInstallation = installation;
  return installation;
}
