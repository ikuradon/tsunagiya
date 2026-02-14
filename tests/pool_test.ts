import { assertEquals, assertThrows } from "@std/assert";
import { MockPool } from "../src/pool.ts";

Deno.test("MockPool - install and uninstall", () => {
  const pool = new MockPool();
  pool.relay("wss://relay.example.com");

  const originalWS = globalThis.WebSocket;

  pool.install();
  assertEquals(pool.installed, true);

  // WebSocketが差し替わっている
  assertEquals(globalThis.WebSocket !== originalWS, true);

  pool.uninstall();
  assertEquals(pool.installed, false);

  // 元に戻っている
  assertEquals(globalThis.WebSocket, originalWS);
});

Deno.test("MockPool - double install throws", () => {
  const pool = new MockPool();

  pool.install();
  try {
    assertThrows(
      () => pool.install(),
      Error,
      "already installed",
    );
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockPool - uninstall without install throws", () => {
  const pool = new MockPool();
  assertThrows(
    () => pool.uninstall(),
    Error,
    "not installed",
  );
});

Deno.test("MockPool - relay returns same instance for same URL", () => {
  const pool = new MockPool();
  const r1 = pool.relay("wss://relay.example.com");
  const r2 = pool.relay("wss://relay.example.com");

  assertEquals(r1, r2);
});

Deno.test("MockPool - relay returns different instances for different URLs", () => {
  const pool = new MockPool();
  const r1 = pool.relay("wss://relay1.example.com");
  const r2 = pool.relay("wss://relay2.example.com");

  assertEquals(r1 !== r2, true);
});

Deno.test("MockPool - connections tracking", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.example.com");

  pool.install();
  try {
    assertEquals(pool.connections.size, 0);

    const ws = new WebSocket("wss://relay.example.com");
    await new Promise<void>((resolve) => {
      ws.onopen = () => resolve();
    });

    assertEquals(pool.connections.get("wss://relay.example.com"), 1);

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });

    assertEquals(pool.connections.size, 0);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockPool - reset clears all relays", () => {
  const pool = new MockPool();
  const r1 = pool.relay("wss://relay1.example.com");
  const r2 = pool.relay("wss://relay2.example.com");

  r1.store({
    id: "e1",
    pubkey: "p1",
    kind: 1,
    content: "",
    created_at: 0,
    tags: [],
    sig: "s1",
  });
  r2.store({
    id: "e2",
    pubkey: "p2",
    kind: 1,
    content: "",
    created_at: 0,
    tags: [],
    sig: "s2",
  });

  pool.reset();

  assertEquals(r1.received.length, 0);
  assertEquals(r2.received.length, 0);
});
