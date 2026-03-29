import { assert, assertEquals } from "@std/assert";
import { MockPool } from "../src/pool.ts";
import { DEFAULT_MESSAGE_VALIDATION_LIMITS } from "../src/relay/message_codec.ts";
import { waitFor } from "../src/testing/wait.ts";
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

async function waitForElapsed(ms: number): Promise<void> {
  const startedAt = Date.now();
  await waitFor(() => Date.now() - startedAt >= ms, {
    timeout: ms + 500,
    interval: 5,
  });
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

Deno.test("MockRelay - closes with code 1001 going away", async () => {
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

Deno.test("MockRelay - closes with code 1011 server error", async () => {
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

    await waitForMessageCount(messages, 1);

    assertEquals(messages.length, 1);
    assertEquals(messages[0], "this is not json");

    await closeWs(ws);
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

    await waitForMessageCount(messages, 1);

    assertEquals(messages.length, 1);
    const parsed = JSON.parse(messages[0]);
    assertEquals(parsed, ["NOTICE", "rate-limited"]);

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - rejects message exceeding max_message_length", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.message-limit.example.com");
  relay.setInfo({
    limitation: {
      max_message_length: 64,
    },
  });

  pool.install();
  try {
    const ws = await openWs("wss://relay.message-limit.example.com");
    const messages = collectMessages(ws);

    const oversized = JSON.stringify([
      "EVENT",
      makeEvent({ content: "x".repeat(256) }),
    ]);
    ws.send(oversized);
    await waitForMessageCount(messages, 1);

    assert(messages.length >= 1, "should receive NOTICE for oversized message");
    const parsed = JSON.parse(messages[0]);
    assertEquals(parsed[0], "NOTICE");
    assert(parsed[1].includes("max_message_length"));
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - rejects REQ exceeding filter count limit", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.filter-limit.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.filter-limit.example.com");
    const messages = collectMessages(ws);

    const filters = Array.from({
      length: DEFAULT_MESSAGE_VALIDATION_LIMITS.maxFilterCount + 1,
    }, () => ({ kinds: [1] }));
    ws.send(JSON.stringify(["REQ", "too-many-filters", ...filters]));
    await waitForMessageCount(messages, 1);

    assert(messages.length >= 1, "should receive NOTICE for too many filters");
    const parsed = JSON.parse(messages[0]);
    assertEquals(parsed[0], "NOTICE");
    assert(parsed[1].includes("filter count limit"));
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - rejects EVENT exceeding relay limitation max_event_tags", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.tag-limit.example.com");
  relay.setInfo({
    limitation: {
      max_event_tags: 1,
    },
  });

  pool.install();
  try {
    const ws = await openWs("wss://relay.tag-limit.example.com");
    const messages = collectMessages(ws);

    ws.send(JSON.stringify([
      "EVENT",
      makeEvent({
        tags: [["p", "pub1"], ["e", "event1"]],
      }),
    ]));
    await waitForMessageCount(messages, 1);

    assert(messages.length >= 1, "should receive NOTICE for too many tags");
    const parsed = JSON.parse(messages[0]);
    assertEquals(parsed[0], "NOTICE");
    assert(parsed[1].includes("max_event_tags"));
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - rejects EVENT exceeding relay limitation max_content_length", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.content-limit.example.com");
  relay.setInfo({
    limitation: {
      max_content_length: 8,
    },
  });

  pool.install();
  try {
    const ws = await openWs("wss://relay.content-limit.example.com");
    const messages = collectMessages(ws);

    ws.send(JSON.stringify([
      "EVENT",
      makeEvent({
        content: "this content is too long",
      }),
    ]));
    await waitForMessageCount(messages, 1);

    assert(messages.length >= 1, "should receive NOTICE for large content");
    const parsed = JSON.parse(messages[0]);
    assertEquals(parsed[0], "NOTICE");
    assert(parsed[1].includes("max_content_length"));
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - rejects REQ exceeding relay limitation max_subid_length", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.subid-limit.example.com");
  relay.setInfo({
    limitation: {
      max_subid_length: 4,
    },
  });

  pool.install();
  try {
    const ws = await openWs("wss://relay.subid-limit.example.com");
    const messages = collectMessages(ws);

    ws.send(JSON.stringify(["REQ", "too-long", { kinds: [1] }]));
    await waitForMessageCount(messages, 1);

    assert(messages.length >= 1, "should receive NOTICE for long subId");
    const parsed = JSON.parse(messages[0]);
    assertEquals(parsed[0], "NOTICE");
    assert(parsed[1].includes("max_subid_length"));
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - rejects REQ exceeding relay limitation max_limit", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.max-limit.example.com");
  relay.setInfo({
    limitation: {
      max_limit: 2,
    },
  });

  pool.install();
  try {
    const ws = await openWs("wss://relay.max-limit.example.com");
    const messages = collectMessages(ws);

    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1], limit: 3 }]));
    await waitForMessageCount(messages, 1);

    assert(messages.length >= 1, "should receive NOTICE for large limit");
    const parsed = JSON.parse(messages[0]);
    assertEquals(parsed[0], "NOTICE");
    assert(parsed[1].includes("max_limit"));
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

    await closeWs(ws);

    // timeout タイマーが残っていても、readyState チェックで no-op になる
    await waitForElapsed(60);
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
    const startedAt = Date.now();

    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await waitForMessageCount(messages, 2);

    assertEquals(Date.now() - startedAt >= 50, true);

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - delays responses with latency range {min, max}", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com", {
    latency: { min: 30, max: 60 },
  });
  relay.store(makeEvent({ id: "e1" }));

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);
    const startedAt = Date.now();

    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await waitForMessageCount(messages, 2);

    assertEquals(Date.now() - startedAt >= 30, true);

    await closeWs(ws);
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

// ===== カスタムハンドラー例外処理 =====

Deno.test("MockRelay error handling - returns OK false when onEVENT throws", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.onEVENT((_event) => {
    return Promise.reject(new Error("handler crash"));
  });

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    ws.send(JSON.stringify(["EVENT", makeEvent()]));
    await waitForMessageCount(messages, 1);

    assert(messages.length >= 1, "should receive at least one message");
    const parsed = JSON.parse(messages[0]);
    assertEquals(parsed[0], "OK");
    assertEquals(parsed[2], false);
    assert(
      parsed[3].includes("error: internal error processing EVENT"),
      `OK message should contain error detail, got: ${parsed[3]}`,
    );

    assert(relay.errors.length > 0);
    assert(
      relay.errors.some((e) => e.includes("internal error processing EVENT")),
    );

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay error handling - returns CLOSED when onREQ throws", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.onREQ((_subId, _filters) => {
    return Promise.reject(new Error("handler crash"));
  });

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await waitForMessageCount(messages, 1);

    assert(messages.length >= 1, "should receive at least one message");
    const parsed = JSON.parse(messages[0]);
    assertEquals(parsed[0], "CLOSED");
    assertEquals(parsed[1], "sub1");
    assert(
      parsed[2].includes("error: internal error processing REQ"),
      `CLOSED message should contain error detail, got: ${parsed[2]}`,
    );

    assert(
      relay.errors.some((e) => e.includes("internal error processing REQ")),
    );
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay error handling - returns NOTICE when onCOUNT throws", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.onCOUNT((_subId, _filters) => {
    return Promise.reject(new Error("handler crash"));
  });

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    ws.send(JSON.stringify(["COUNT", "c1", { kinds: [1] }]));
    await waitForMessageCount(messages, 1);

    assert(messages.length >= 1, "should receive at least one message");
    const parsed = JSON.parse(messages[0]);
    assertEquals(parsed[0], "NOTICE");
    assert(parsed[1].includes("internal error processing COUNT"));

    assert(
      relay.errors.some((e) => e.includes("internal error processing COUNT")),
    );
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay error handling - returns OK false when auth validator throws", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.requireAuth((_event: NostrEvent) => {
    return Promise.reject(new Error("validator crash"));
  });

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    await waitForMessageCount(messages, 1);

    // チャレンジを取得
    assert(messages.length >= 1, "should receive AUTH challenge");
    const challengeMsg = JSON.parse(messages[0]);
    assertEquals(challengeMsg[0], "AUTH");
    const challenge = challengeMsg[1] as string;
    messages.length = 0;

    // 正しいチャレンジタグ付き AUTH レスポンスを送信
    const authEvent = makeEvent({
      kind: 22242,
      id: "auth1",
      tags: [["challenge", challenge], ["relay", "wss://relay.example.com"]],
    });
    ws.send(JSON.stringify(["AUTH", authEvent]));
    await waitForMessageCount(messages, 1);

    assert(messages.length >= 1, "should receive at least one message");
    const parsed = JSON.parse(messages[0]);
    assertEquals(parsed[0], "OK");
    assertEquals(parsed[2], false);
    assert(
      parsed[3].includes("error: internal error processing AUTH"),
      `OK message should contain error detail, got: ${parsed[3]}`,
    );

    assert(
      relay.errors.some((e) => e.includes("internal error processing AUTH")),
    );
  } finally {
    pool.uninstall();
  }
});

// ===== 未知メッセージタイプ =====

Deno.test("MockRelay error handling - returns NOTICE for unknown message type", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");
  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    ws.send(JSON.stringify(["UNKNOWN", "data"]));
    await waitForMessageCount(messages, 1);

    assert(messages.length >= 1, "should receive at least one message");
    const parsed = JSON.parse(messages[0]);
    assertEquals(parsed[0], "NOTICE");
    assert(parsed[1].includes("unsupported message type"));
    assert(parsed[1].includes("UNKNOWN"));

    assert(
      relay.errors.some((e) => e.includes("unsupported message type")),
    );
  } finally {
    pool.uninstall();
  }
});
