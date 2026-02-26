import { assertEquals } from "@std/assert";
import { MockPool } from "../src/pool.ts";
import type { NostrEvent } from "../src/types.ts";

function makeEvent(overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: "event1",
    pubkey: "pub1",
    kind: 1,
    content: "hello",
    created_at: 1700000000,
    tags: [],
    sig: "sig1",
    ...overrides,
  };
}

async function openWs(url: string): Promise<WebSocket> {
  const ws = new WebSocket(url);
  await new Promise<void>((resolve) => {
    ws.onopen = () => resolve();
  });
  return ws;
}

function collectMessages(ws: WebSocket): string[] {
  const messages: string[] = [];
  ws.addEventListener("message", (ev: MessageEvent) => {
    messages.push(ev.data as string);
  });
  return messages;
}

// ===== refuse =====

Deno.test("MockRelay - refuse() rejects new connections", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");
  relay.refuse();

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");

    const closeEvent = await new Promise<CloseEvent>((resolve) => {
      ws.onclose = (ev) => resolve(ev);
    });

    assertEquals(closeEvent.code, 1006);
    assertEquals(ws.readyState, WebSocket.CLOSED);
  } finally {
    pool.uninstall();
  }
});

// ===== disconnect =====

Deno.test("MockRelay - disconnect() closes all connections", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");

    const closePromise = new Promise<CloseEvent>((resolve) => {
      ws.onclose = (ev) => resolve(ev);
    });

    relay.disconnect();

    const closeEvent = await closePromise;
    assertEquals(closeEvent.code, 1000);
    assertEquals(ws.readyState, WebSocket.CLOSED);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - disconnect(code) uses specified code", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");

    const closePromise = new Promise<CloseEvent>((resolve) => {
      ws.onclose = (ev) => resolve(ev);
    });

    relay.disconnect(1008, "Policy Violation");

    const closeEvent = await closePromise;
    assertEquals(closeEvent.code, 1008);
  } finally {
    pool.uninstall();
  }
});

// ===== disconnectAfter =====

Deno.test("MockRelay - disconnectAfter() closes after delay", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");

    const closePromise = new Promise<CloseEvent>((resolve) => {
      ws.onclose = (ev) => resolve(ev);
    });

    relay.disconnectAfter(50);

    // まだ接続中
    assertEquals(ws.readyState, WebSocket.OPEN);

    const closeEvent = await closePromise;
    assertEquals(closeEvent.code, 1006);
  } finally {
    pool.uninstall();
  }
});

// ===== close(code) =====

Deno.test("MockRelay - close(1006) simulates abnormal closure", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");

    const closePromise = new Promise<CloseEvent>((resolve) => {
      ws.onclose = (ev) => resolve(ev);
    });

    relay.close(1006);

    const closeEvent = await closePromise;
    assertEquals(closeEvent.code, 1006);
    assertEquals(closeEvent.wasClean, false);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - close(1001) going away", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");

    const closePromise = new Promise<CloseEvent>((resolve) => {
      ws.onclose = (ev) => resolve(ev);
    });

    relay.close(1001);

    const closeEvent = await closePromise;
    assertEquals(closeEvent.code, 1001);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - close(1011) server error", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");

    const closePromise = new Promise<CloseEvent>((resolve) => {
      ws.onclose = (ev) => resolve(ev);
    });

    relay.close(1011);

    const closeEvent = await closePromise;
    assertEquals(closeEvent.code, 1011);
  } finally {
    pool.uninstall();
  }
});

// ===== sendRaw =====

Deno.test("MockRelay - sendRaw() sends raw data", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    relay.sendRaw("this is not json");

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assertEquals(messages.length, 1);
    assertEquals(messages[0], "this is not json");

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

// ===== sendNotice =====

Deno.test("MockRelay - sendNotice() sends NOTICE message", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    relay.sendNotice("rate-limited");

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assertEquals(messages.length, 1);
    const parsed = JSON.parse(messages[0]);
    assertEquals(parsed, ["NOTICE", "rate-limited"]);

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

// ===== connectionTimeout =====

Deno.test("MockRelay - connectionTimeout allows normal open when fast enough", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.example.com", {
    connectionTimeout: 50,
  });

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");

    // Mock接続は即座に開くので、timeout前に接続完了する
    await new Promise<void>((resolve) => {
      ws.onopen = () => resolve();
    });

    assertEquals(ws.readyState, WebSocket.OPEN);

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });

    // timeout タイマーが残っていても、readyState チェックで no-op になる
    await new Promise<void>((resolve) => setTimeout(resolve, 60));
  } finally {
    pool.uninstall();
  }
});

// ===== latency =====

Deno.test("MockRelay - latency delays responses", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com", {
    latency: 50,
  });
  relay.store(makeEvent({ id: "e1" }));

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));

    // すぐには来ない
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    assertEquals(messages.length, 0);

    // 遅延後に届く
    await new Promise<void>((resolve) => setTimeout(resolve, 80));
    assertEquals(messages.length >= 1, true);

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - latency range {min, max}", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com", {
    latency: { min: 30, max: 60 },
  });
  relay.store(makeEvent({ id: "e1" }));

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));

    // 遅延後に届く
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    assertEquals(messages.length >= 1, true);

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

// ===== reset clears error state =====

Deno.test("MockRelay - reset() clears refuse state", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");
  relay.refuse();

  // reset でrefuse解除
  relay.reset();

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");

    const opened = await new Promise<boolean>((resolve) => {
      ws.onopen = () => resolve(true);
      ws.onerror = () => resolve(false);
    });

    assertEquals(opened, true);

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});
