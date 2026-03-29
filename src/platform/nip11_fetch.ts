/**
 * NIP-11 fetch interception helpers.
 *
 * @module
 */

import type { RelayInformation } from "../types.ts";
import {
  getRequestUrl,
  httpToWsUrl,
  isNip11Request,
  normalizeUrl,
} from "../internal/url.ts";

export interface RelayInformationProvider {
  getInfo(): RelayInformation;
}

export type RelayLookup = (
  normalizedWsUrl: string,
) => RelayInformationProvider | undefined;

export function createNip11Response(info: RelayInformation): Response {
  return new Response(JSON.stringify(info), {
    status: 200,
    headers: { "Content-Type": "application/nostr+json" },
  });
}

export function createNip11FetchHandler(
  lookupRelay: RelayLookup,
  fallbackFetch: typeof globalThis.fetch,
): typeof globalThis.fetch {
  return (request, init) => {
    if (isNip11Request(request, init)) {
      const rawUrl = getRequestUrl(request);
      const wsUrl = normalizeUrl(httpToWsUrl(rawUrl));
      const relay = lookupRelay(wsUrl);
      if (relay) {
        return Promise.resolve(createNip11Response(relay.getInfo()));
      }
    }

    return fallbackFetch(request, init);
  };
}
