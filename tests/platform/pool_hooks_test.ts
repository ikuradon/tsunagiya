import { assertEquals, assertThrows } from "@std/assert";
import { installPoolHooks } from "../../src/platform/pool_hooks.ts";
import { MockWebSocket } from "../../src/websocket.ts";

// テスト間の干渉を防ぐため、各テストで確実に uninstall する

Deno.test("installPoolHooks - installs MockWebSocket as globalThis.WebSocket", () => {
  const originalWS = globalThis.WebSocket;

  const lookup = (_url: string) => undefined;
  const installation = installPoolHooks(lookup);

  try {
    assertEquals(installation.installed, true);
    assertEquals(
      globalThis.WebSocket,
      MockWebSocket as unknown as typeof WebSocket,
    );
    // 元の WebSocket から差し替えられていること
    assertEquals(globalThis.WebSocket !== originalWS, true);
  } finally {
    installation.uninstall();
  }
});

Deno.test("installPoolHooks - uninstall() restores original WebSocket", () => {
  const originalWS = globalThis.WebSocket;
  const originalFetch = globalThis.fetch;

  const lookup = (_url: string) => undefined;
  const installation = installPoolHooks(lookup);

  installation.uninstall();

  assertEquals(installation.installed, false);
  assertEquals(globalThis.WebSocket, originalWS);
  assertEquals(globalThis.fetch, originalFetch);
});

Deno.test(
  'double install throws "Another MockPool instance is already installed"',
  () => {
    const lookup = (_url: string) => undefined;
    const installation = installPoolHooks(lookup);

    try {
      assertThrows(
        () => installPoolHooks(lookup),
        Error,
        "Another MockPool instance is already installed",
      );
    } finally {
      installation.uninstall();
    }
  },
);

Deno.test('double uninstall throws "MockPool is not installed"', () => {
  const lookup = (_url: string) => undefined;
  const installation = installPoolHooks(lookup);

  // 1回目の uninstall は正常
  installation.uninstall();

  // 2回目は例外
  assertThrows(
    () => installation.uninstall(),
    Error,
    "MockPool is not installed",
  );
});
