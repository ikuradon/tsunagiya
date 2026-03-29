import { assertEquals, assertNotEquals } from "@std/assert";
import {
  captureGlobalHookSnapshot,
  installGlobalFetch,
  installGlobalWebSocket,
  restoreGlobalHookSnapshot,
} from "../../src/platform/global_hooks.ts";

Deno.test("captureGlobalHookSnapshot - captures current WebSocket and fetch", () => {
  const snapshot = captureGlobalHookSnapshot();

  assertEquals(snapshot.webSocket, globalThis.WebSocket);
  assertEquals(snapshot.fetch, globalThis.fetch);
});

Deno.test("captureGlobalHookSnapshot - captures property descriptors", () => {
  const snapshot = captureGlobalHookSnapshot();

  // Deno 環境では WebSocket / fetch は configurable なプロパティとして存在する
  const wsDesc = Object.getOwnPropertyDescriptor(globalThis, "WebSocket");
  const fetchDesc = Object.getOwnPropertyDescriptor(globalThis, "fetch");

  assertEquals(snapshot.webSocketDescriptor, wsDesc);
  assertEquals(snapshot.fetchDescriptor, fetchDesc);
});

Deno.test("installGlobalWebSocket - replaces globalThis.WebSocket", () => {
  const original = globalThis.WebSocket;

  // ダミークラスで差し替え
  class DummyWebSocket extends EventTarget {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
  }

  try {
    installGlobalWebSocket(DummyWebSocket as unknown as typeof WebSocket);
    assertEquals(
      globalThis.WebSocket,
      DummyWebSocket as unknown as typeof WebSocket,
    );
    assertNotEquals(globalThis.WebSocket, original);
  } finally {
    // 元に戻す
    installGlobalWebSocket(original);
  }
});

Deno.test("installGlobalFetch - replaces globalThis.fetch", () => {
  const original = globalThis.fetch;

  const dummyFetch = () => Promise.resolve(new Response("dummy"));

  try {
    installGlobalFetch(dummyFetch as typeof globalThis.fetch);
    assertEquals(globalThis.fetch, dummyFetch as typeof globalThis.fetch);
    assertNotEquals(globalThis.fetch, original);
  } finally {
    // 元に戻す
    installGlobalFetch(original);
  }
});

Deno.test(
  "restoreGlobalHookSnapshot - restores original WebSocket and fetch",
  () => {
    const originalWS = globalThis.WebSocket;
    const originalFetch = globalThis.fetch;

    // スナップショットを取得してから差し替え
    const snapshot = captureGlobalHookSnapshot();

    class DummyWebSocket extends EventTarget {
      static readonly CONNECTING = 0;
    }
    const dummyFetch = () => Promise.resolve(new Response("dummy"));

    installGlobalWebSocket(DummyWebSocket as unknown as typeof WebSocket);
    installGlobalFetch(dummyFetch as typeof globalThis.fetch);

    // 差し替えが行われていることを確認
    assertNotEquals(globalThis.WebSocket, originalWS);
    assertNotEquals(globalThis.fetch, originalFetch);

    // 復元
    restoreGlobalHookSnapshot(snapshot);

    assertEquals(globalThis.WebSocket, originalWS);
    assertEquals(globalThis.fetch, originalFetch);
  },
);

Deno.test(
  "full cycle: capture -> install -> verify replacement -> restore -> verify original",
  () => {
    const originalWS = globalThis.WebSocket;
    const originalFetch = globalThis.fetch;

    // 1. capture
    const snapshot = captureGlobalHookSnapshot();
    assertEquals(snapshot.webSocket, originalWS);
    assertEquals(snapshot.fetch, originalFetch);

    // 2. install
    class DummyWebSocket extends EventTarget {
      static readonly CONNECTING = 0;
    }
    const dummyFetch = () => Promise.resolve(new Response("cycle-test"));

    installGlobalWebSocket(DummyWebSocket as unknown as typeof WebSocket);
    installGlobalFetch(dummyFetch as typeof globalThis.fetch);

    // 3. verify replacement
    assertEquals(
      globalThis.WebSocket,
      DummyWebSocket as unknown as typeof WebSocket,
    );
    assertEquals(globalThis.fetch, dummyFetch as typeof globalThis.fetch);

    // 4. restore
    restoreGlobalHookSnapshot(snapshot);

    // 5. verify original
    assertEquals(globalThis.WebSocket, originalWS);
    assertEquals(globalThis.fetch, originalFetch);
  },
);
