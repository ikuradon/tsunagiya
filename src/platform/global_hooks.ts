/**
 * Global WebSocket/fetch hook installation helpers.
 *
 * @module
 */

export interface GlobalHookSnapshot {
  readonly webSocketDescriptor: PropertyDescriptor | undefined;
  readonly fetchDescriptor: PropertyDescriptor | undefined;
  readonly webSocket: typeof globalThis.WebSocket;
  readonly fetch: typeof globalThis.fetch;
}

function setGlobalValue<K extends "WebSocket" | "fetch">(
  key: K,
  value: typeof globalThis[K],
): void {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
}

export function captureGlobalHookSnapshot(): GlobalHookSnapshot {
  return {
    webSocketDescriptor: Object.getOwnPropertyDescriptor(
      globalThis,
      "WebSocket",
    ),
    fetchDescriptor: Object.getOwnPropertyDescriptor(globalThis, "fetch"),
    webSocket: globalThis.WebSocket,
    fetch: globalThis.fetch,
  };
}

export function installGlobalWebSocket(
  webSocket: typeof globalThis.WebSocket,
): void {
  setGlobalValue("WebSocket", webSocket);
}

export function installGlobalFetch(fetchImpl: typeof globalThis.fetch): void {
  setGlobalValue("fetch", fetchImpl);
}

export function restoreGlobalHookSnapshot(snapshot: GlobalHookSnapshot): void {
  if (snapshot.webSocketDescriptor) {
    Object.defineProperty(globalThis, "WebSocket", {
      ...snapshot.webSocketDescriptor,
      value: snapshot.webSocket,
    });
  } else {
    setGlobalValue("WebSocket", snapshot.webSocket);
  }

  if (snapshot.fetchDescriptor) {
    Object.defineProperty(globalThis, "fetch", {
      ...snapshot.fetchDescriptor,
      value: snapshot.fetch,
    });
  } else {
    setGlobalValue("fetch", snapshot.fetch);
  }
}
