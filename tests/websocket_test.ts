import { assertEquals, assertThrows } from "@std/assert";
import { MockPool } from "../src/pool.ts";
import { WebSocketReadyState } from "../src/types.ts";

Deno.test("MockWebSocket - opens and closes properly", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.example.com");
  pool.install();

  try {
    const ws = new WebSocket("wss://relay.example.com");

    const opened = await new Promise<boolean>((resolve) => {
      ws.onopen = () => resolve(true);
      ws.onerror = () => resolve(false);
    });

    assertEquals(opened, true);
    assertEquals(ws.readyState, WebSocketReadyState.OPEN);

    const closed = await new Promise<CloseEvent>((resolve) => {
      ws.onclose = (ev) => resolve(ev);
      ws.close();
    });

    assertEquals(closed.code, 1000);
    assertEquals(ws.readyState, WebSocketReadyState.CLOSED);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockWebSocket - errors when no relay registered", async () => {
  const pool = new MockPool();
  pool.install();

  try {
    const ws = new WebSocket("wss://unknown.relay.com");

    const event = await new Promise<CloseEvent>((resolve) => {
      ws.onclose = (ev) => resolve(ev);
    });

    assertEquals(event.code, 1006);
    assertEquals(ws.readyState, WebSocketReadyState.CLOSED);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockWebSocket - send throws when not open", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.example.com");
  pool.install();

  try {
    const ws = new WebSocket("wss://relay.example.com");

    // CONNECTING状態ではsendできない
    assertThrows(
      () => ws.send("test"),
      DOMException,
    );

    // openを待ってからcloseしてテスト
    await new Promise<void>((resolve) => {
      ws.onopen = () => resolve();
    });

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });

    assertThrows(
      () => ws.send("test"),
      DOMException,
    );
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockWebSocket - message event with addEventListener", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");
  relay.store({
    id: "event1",
    pubkey: "pub1",
    kind: 1,
    content: "test",
    created_at: 1700000000,
    tags: [],
    sig: "sig1",
  });

  pool.install();

  try {
    const ws = new WebSocket("wss://relay.example.com");

    await new Promise<void>((resolve) => {
      ws.onopen = () => resolve();
    });

    const messages: string[] = [];
    ws.addEventListener("message", (ev: MessageEvent) => {
      messages.push(ev.data as string);
    });

    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));

    // 非同期処理の完了を待つ
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    // EVENT + EOSE を受信
    assertEquals(messages.length, 2);

    const eventMsg = JSON.parse(messages[0]);
    assertEquals(eventMsg[0], "EVENT");
    assertEquals(eventMsg[1], "sub1");
    assertEquals(eventMsg[2].id, "event1");

    const eoseMsg = JSON.parse(messages[1]);
    assertEquals(eoseMsg[0], "EOSE");
    assertEquals(eoseMsg[1], "sub1");

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockWebSocket - url property", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.example.com");
  pool.install();

  try {
    const ws = new WebSocket("wss://relay.example.com");
    assertEquals(ws.url, "wss://relay.example.com");

    await new Promise<void>((resolve) => {
      ws.onopen = () => resolve();
    });

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});
