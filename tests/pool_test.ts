import { assertEquals, assertThrows } from "@std/assert";
import { MockPool } from "../src/pool.ts";

Deno.test("MockPool - installs and uninstalls WebSocket override", () => {
  const pool = new MockPool();
  pool.relay("wss://relay.example.com");

  const originalWS = globalThis.WebSocket;

  pool.install();
  try {
    assertEquals(pool.installed, true);
    assertEquals(globalThis.WebSocket !== originalWS, true);
  } finally {
    pool.uninstall();
  }
  assertEquals(pool.installed, false);
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

Deno.test("MockPool - tracks active connection count", async () => {
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

Deno.test("MockPool - throws when another instance is already installed", () => {
  const pool1 = new MockPool();
  const pool2 = new MockPool();

  pool1.install();
  try {
    assertThrows(
      () => pool2.install(),
      Error,
      "Another MockPool instance is already installed",
    );
  } finally {
    pool1.uninstall();
  }
});

Deno.test("MockPool - allows install after first instance uninstalls", () => {
  const pool1 = new MockPool();
  const pool2 = new MockPool();
  pool2.relay("wss://relay.example.com");

  pool1.install();
  pool1.uninstall();

  // pool1 が uninstall 済みなら pool2 は install できる
  pool2.install();
  try {
    assertEquals(pool2.installed, true);
  } finally {
    pool2.uninstall();
  }
});

Deno.test("MockPool - Symbol.dispose uninstalls when installed", () => {
  const pool = new MockPool();
  const originalWS = globalThis.WebSocket;

  pool.install();
  assertEquals(pool.installed, true);

  pool[Symbol.dispose]();

  assertEquals(pool.installed, false);
  assertEquals(globalThis.WebSocket, originalWS);
});

Deno.test("MockPool - Symbol.dispose is no-op when not installed", () => {
  const pool = new MockPool();
  // 未インストール状態でも throw しない
  pool[Symbol.dispose]();
  assertEquals(pool.installed, false);
});

Deno.test("MockPool - Symbol.asyncDispose uninstalls when installed", async () => {
  const pool = new MockPool();
  const originalWS = globalThis.WebSocket;

  pool.install();
  assertEquals(pool.installed, true);

  await pool[Symbol.asyncDispose]();

  assertEquals(pool.installed, false);
  assertEquals(globalThis.WebSocket, originalWS);
});

Deno.test("MockPool - Symbol.asyncDispose is no-op when not installed", async () => {
  const pool = new MockPool();
  // 未インストール状態でも throw しない
  await pool[Symbol.asyncDispose]();
  assertEquals(pool.installed, false);
});

Deno.test("MockPool - using keyword auto-uninstalls on block exit", () => {
  const pool = new MockPool();
  const originalWS = globalThis.WebSocket;

  pool.install();

  {
    using _disposable = pool;
    assertEquals(_disposable.installed, true);
  }

  assertEquals(pool.installed, false);
  assertEquals(globalThis.WebSocket, originalWS);
});

Deno.test("MockPool - await using keyword auto-uninstalls on block exit", async () => {
  const pool = new MockPool();
  const originalWS = globalThis.WebSocket;

  pool.install();

  {
    await using _disposable = pool;
    assertEquals(_disposable.installed, true);
  }

  assertEquals(pool.installed, false);
  assertEquals(globalThis.WebSocket, originalWS);
});

Deno.test("MockPool - clears all relay state on reset", () => {
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
