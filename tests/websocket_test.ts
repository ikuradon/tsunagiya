import { assertEquals, assertThrows } from "@std/assert";
import { MockPool } from "../src/pool.ts";
import { waitFor } from "../src/testing/wait.ts";
import { WebSocketReadyState } from "../src/types.ts";

async function openWs(
  url: string,
  protocol?: string | string[],
): Promise<WebSocket> {
  const ws = protocol === undefined
    ? new WebSocket(url)
    : new WebSocket(url, protocol);
  await new Promise<void>((resolve) => {
    ws.onopen = () => resolve();
  });
  return ws;
}

async function waitForMessageCount(
  messages: string[],
  count: number,
): Promise<void> {
  await waitFor(() => messages.length >= count, {
    timeout: 1000,
    interval: 5,
  });
}

async function closeWs(ws: WebSocket): Promise<void> {
  const closed = new Promise<void>((resolve) => {
    ws.addEventListener("close", () => resolve(), { once: true });
  });
  ws.close();
  await closed;
}

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
    const ws = await openWs("wss://relay.example.com");

    const messages: string[] = [];
    ws.addEventListener("message", (ev: MessageEvent) => {
      messages.push(ev.data as string);
    });

    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await waitForMessageCount(messages, 2);

    // EVENT + EOSE を受信
    assertEquals(messages.length, 2);

    const eventMsg = JSON.parse(messages[0]);
    assertEquals(eventMsg[0], "EVENT");
    assertEquals(eventMsg[1], "sub1");
    assertEquals(eventMsg[2].id, "event1");

    const eoseMsg = JSON.parse(messages[1]);
    assertEquals(eoseMsg[0], "EOSE");
    assertEquals(eoseMsg[1], "sub1");

    await closeWs(ws);
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

    await closeWs(ws);
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
    const ws = await openWs(
      "wss://relay.protocol-string.example.com",
      "nostr",
    );
    assertEquals(ws.protocol, "nostr");
    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockWebSocket - protocol property with array", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.protocol-array.example.com");
  pool.install();

  try {
    const ws = await openWs(
      "wss://relay.protocol-array.example.com",
      ["nostr", "v2"],
    );
    assertEquals(ws.protocol, "nostr");
    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockWebSocket - protocol property with empty array", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.protocol-empty.example.com");
  pool.install();

  try {
    const ws = await openWs(
      "wss://relay.protocol-empty.example.com",
      [],
    );
    assertEquals(ws.protocol, "");
    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockWebSocket - send non-string throws", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.send-non-string.example.com");
  pool.install();

  try {
    const ws = await openWs("wss://relay.send-non-string.example.com");

    let threw = false;
    try {
      ws.send(new ArrayBuffer(4) as unknown as string);
    } catch {
      threw = true;
    }
    assertEquals(threw, true, "send(ArrayBuffer) should throw");

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockWebSocket - close on already closed is no-op", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.double-close.example.com");
  pool.install();

  try {
    const ws = await openWs("wss://relay.double-close.example.com");
    await closeWs(ws);

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
  // connectionDelay > connectionTimeout なので timeout が先に発火する
  pool.relay("wss://relay.connection-timeout.example.com", {
    connectionDelay: 200,
    connectionTimeout: 50,
  });
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

Deno.test("MockWebSocket - connectionDelay within timeout opens successfully", async () => {
  const pool = new MockPool();
  // connectionDelay < connectionTimeout なので open が先に発火する
  pool.relay("wss://relay.connection-delay.example.com", {
    connectionDelay: 10,
    connectionTimeout: 200,
  });
  pool.install();

  try {
    const ws = new WebSocket("wss://relay.connection-delay.example.com");

    const opened = await new Promise<boolean>((resolve) => {
      ws.onopen = () => resolve(true);
      ws.onerror = () => resolve(false);
    });

    assertEquals(opened, true);
    assertEquals(ws.readyState, WebSocketReadyState.OPEN);

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});
