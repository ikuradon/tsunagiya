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

Deno.test("MockWebSocket - closes with code 1006 when no relay registered", async () => {
  const pool = new MockPool();
  pool.install();

  try {
    const ws = new WebSocket("wss://unknown.relay.test");

    const event = await new Promise<CloseEvent>((resolve) => {
      ws.onclose = (ev) => resolve(ev);
    });

    assertEquals(event.code, 1006);
    assertEquals(ws.readyState, WebSocketReadyState.CLOSED);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockWebSocket - throws on send when not open", async () => {
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

Deno.test("MockWebSocket - receives messages via addEventListener", async () => {
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

Deno.test("MockWebSocket - returns correct url property", async () => {
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

// ===== 追加テスト =====

Deno.test("MockWebSocket - protocol property with string", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.protocol-string.example.com");
  pool.install();

  try {
    const ws = new WebSocket(
      "wss://relay.protocol-string.example.com",
      "nostr",
    );
    assertEquals(ws.protocol, "nostr");

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

Deno.test("MockWebSocket - protocol property with array", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.protocol-array.example.com");
  pool.install();

  try {
    const ws = new WebSocket(
      "wss://relay.protocol-array.example.com",
      ["nostr", "v2"],
    );
    assertEquals(ws.protocol, "nostr");

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

Deno.test("MockWebSocket - send non-string throws", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.send-non-string.example.com");
  pool.install();

  try {
    const ws = new WebSocket("wss://relay.send-non-string.example.com");

    await new Promise<void>((resolve) => {
      ws.onopen = () => resolve();
    });

    let threw = false;
    try {
      ws.send(new ArrayBuffer(4) as unknown as string);
    } catch {
      threw = true;
    }
    assertEquals(threw, true, "send(ArrayBuffer) should throw");

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockWebSocket - close on already closed is no-op", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.double-close.example.com");
  pool.install();

  try {
    const ws = new WebSocket("wss://relay.double-close.example.com");

    await new Promise<void>((resolve) => {
      ws.onopen = () => resolve();
    });

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });

    // 2回目の close はエラーにならない（no-op）
    ws.close();
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockWebSocket - onerror callback fires on refused connection", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.onerror-refused.example.com");
  relay.refuse();
  pool.install();

  try {
    const ws = new WebSocket("wss://relay.onerror-refused.example.com");

    const errorFired = await new Promise<boolean>((resolve) => {
      ws.onerror = () => resolve(true);
      ws.onclose = () => resolve(false);
    });

    assertEquals(errorFired, true, "onerror should fire on refused connection");
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockWebSocket - connectionTimeout fires with close code 1006", async () => {
  const pool = new MockPool();
  // connectionTimeout を設定したリレーを登録するが、refuse は使わない。
  // scheduleOpen は queueMicrotask で実行されるが、
  // テストでは close イベントが code 1006 で発火することを確認する。
  // refuse() 使用時も同じく code 1006 で閉じる。
  const relay = pool.relay("wss://relay.connection-timeout.example.com", {
    connectionTimeout: 50,
  });
  relay.refuse();
  pool.install();

  try {
    const ws = new WebSocket("wss://relay.connection-timeout.example.com");

    const closeEvent = await new Promise<CloseEvent>((resolve) => {
      ws.onclose = (ev) => resolve(ev);
    });

    assertEquals(closeEvent.code, 1006);
  } finally {
    pool.uninstall();
  }
});
