import { assert, assertEquals } from "@std/assert";
import { MockPool } from "../src/pool.ts";
import { EventBuilder } from "../src/testing/event_builder.ts";
import { waitFor } from "../src/testing/wait.ts";
import type { LogEntry, NostrEvent, RandomSource } from "../src/types.ts";

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

/** WebSocketを開いて待機するヘルパー */
async function openWs(url: string): Promise<WebSocket> {
  const ws = new WebSocket(url);
  await new Promise<void>((resolve) => {
    ws.onopen = () => resolve();
  });
  return ws;
}

/** メッセージを収集するヘルパー */
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

function makeConstantRandom(value: number): RandomSource {
  return {
    next(): number {
      return value;
    },
    fill(bytes: Uint8Array): void {
      bytes.fill(0);
    },
  };
}

function makeSequenceRandom(values: number[]): RandomSource {
  let index = 0;
  return {
    next(): number {
      const value = values[index];
      index += 1;
      return value ?? 1;
    },
    fill(bytes: Uint8Array): void {
      bytes.fill(0);
    },
  };
}

Deno.test("MockRelay - returns matched events for REQ after store", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.store(makeEvent({ id: "e1", kind: 1 }));
  relay.store(makeEvent({ id: "e2", kind: 0 }));
  relay.store(makeEvent({ id: "e3", kind: 1 }));

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));

    await waitForMessageCount(messages, 3);

    // kind:1が2件 + EOSE
    assertEquals(messages.length, 3);

    const eventIds = messages.slice(0, 2).map((m) => JSON.parse(m)[2].id);
    assertEquals(eventIds.includes("e1"), true);
    assertEquals(eventIds.includes("e3"), true);

    const eose = JSON.parse(messages[2]);
    assertEquals(eose[0], "EOSE");
    assertEquals(eose[1], "sub1");

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - overrides default REQ behavior with onREQ handler", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.store(makeEvent({ id: "stored", kind: 1 }));

  const customEvent = makeEvent({ id: "custom", kind: 1 });
  relay.onREQ((_subId, _filters) => {
    return [customEvent];
  });

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));

    await waitForMessageCount(messages, 2);

    assertEquals(messages.length, 2); // EVENT + EOSE
    const eventMsg = JSON.parse(messages[0]);
    assertEquals(eventMsg[2].id, "custom");

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - invokes custom onEVENT handler", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.onEVENT((event) => {
    return ["OK", event.id, true, "custom: accepted"];
  });

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    const event = makeEvent({ id: "sent1" });
    ws.send(JSON.stringify(["EVENT", event]));

    await waitForMessageCount(messages, 1);

    assertEquals(messages.length, 1);
    const okMsg = JSON.parse(messages[0]);
    assertEquals(okMsg, ["OK", "sent1", true, "custom: accepted"]);

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - stores event and returns OK with default handler", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    const event = makeEvent({ id: "published" });
    ws.send(JSON.stringify(["EVENT", event]));

    await waitForMessageCount(messages, 1);

    assertEquals(messages.length, 1);
    const okMsg = JSON.parse(messages[0]);
    assertEquals(okMsg, ["OK", "published", true, ""]);

    // ストアに追加されているか確認（REQで取得）
    ws.send(JSON.stringify(["REQ", "check", { ids: ["published"] }]));

    await waitForMessageCount(messages, 3);

    // EVENT + EOSE
    assertEquals(messages.length, 3);
    const eventMsg = JSON.parse(messages[1]);
    assertEquals(eventMsg[2].id, "published");

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - provides verification helpers for REQ, EVENT, and CLOSE", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    collectMessages(ws);

    // REQ送信
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    ws.send(JSON.stringify(["REQ", "sub2", { kinds: [0] }]));

    // EVENT送信
    const event = makeEvent({ id: "evt1" });
    ws.send(JSON.stringify(["EVENT", event]));

    // CLOSE送信
    ws.send(JSON.stringify(["CLOSE", "sub1"]));

    await waitFor(() => relay.received.length === 4, {
      timeout: 1000,
      interval: 5,
    });

    // REQ検証
    assertEquals(relay.countREQs(), 2);
    assertEquals(relay.hasREQ("sub1"), true);
    assertEquals(relay.hasREQ("sub2"), true);
    assertEquals(relay.hasREQ("sub3"), false);

    const req = relay.findREQ("sub1");
    assertEquals(req?.[0], "REQ");
    assertEquals(req?.[1], "sub1");

    // EVENT検証
    assertEquals(relay.countEvents(), 1);
    assertEquals(relay.hasEvent("evt1"), true);
    assertEquals(relay.hasEvent("unknown"), false);

    const found = relay.findEvent("evt1");
    assertEquals(found?.id, "evt1");

    // CLOSE検証
    const close = relay.findCLOSE("sub1");
    assertEquals(close, ["CLOSE", "sub1"]);
    assertEquals(relay.findCLOSE("sub2"), undefined);

    // received
    assertEquals(relay.received.length, 4);

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - getSubscriptions returns defensive copies of filters", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    collectMessages(ws);

    ws.send(JSON.stringify([
      "REQ",
      "sub-copy",
      { kinds: [1], "#p": ["pub1"] },
    ]));

    await waitFor(() => relay.getSubscriptions().has("sub-copy"), {
      timeout: 1000,
      interval: 5,
    });

    const subscriptions = relay.getSubscriptions();
    const filters = subscriptions.get("sub-copy");
    filters?.[0].kinds?.push(9999);
    filters?.[0]["#p"]?.push("pub2");

    const freshSubscriptions = relay.getSubscriptions();
    assertEquals(freshSubscriptions.get("sub-copy"), [
      { kinds: [1], "#p": ["pub1"] },
    ]);

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - clears state on reset", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.store(makeEvent({ id: "e1" }));
  relay.onREQ(() => []);
  relay.onEVENT((e) => ["OK", e.id, true, ""]);

  relay.reset();

  // ストアが空であることを間接的に確認
  // (received もクリアされている)
  assertEquals(relay.received.length, 0);
  assertEquals(relay.countREQs(), 0);
  assertEquals(relay.countEvents(), 0);
});

Deno.test("MockRelay - resets handlers to default on reset", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  // Set custom handlers
  relay.onREQ(() => [makeEvent({ id: "custom-req", kind: 1 })]);
  relay.onEVENT((e) => ["OK", e.id, true, "custom"]);

  relay.reset();

  // After reset, default REQ handler should use store
  relay.store(makeEvent({ id: "stored-after-reset", kind: 1 }));

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    // REQ should use default handler (return from store)
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await waitForMessageCount(messages, 2);

    const eventMsg = JSON.parse(messages[0]);
    assertEquals(eventMsg[0], "EVENT");
    assertEquals(eventMsg[2].id, "stored-after-reset");

    // EVENT should use default handler (store + OK)
    const newEvent = makeEvent({ id: "new-event", kind: 1 });
    ws.send(JSON.stringify(["EVENT", newEvent]));
    await waitForMessageCount(messages, 3);

    const okMsg = JSON.parse(messages[messages.length - 1]);
    assertEquals(okMsg, ["OK", "new-event", true, ""]);

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

// ===== 回帰テスト: Issue 1 - subId 接続間衝突 =====

Deno.test("MockRelay - isolates subId across connections", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.store(makeEvent({ id: "e1", kind: 1, content: "hello" }));

  pool.install();
  try {
    // 2つの接続を開く
    const ws1 = await openWs("wss://relay.example.com");
    const ws2 = await openWs("wss://relay.example.com");
    const messages1 = collectMessages(ws1);
    const messages2 = collectMessages(ws2);

    // 同じ subId で購読
    ws1.send(JSON.stringify(["REQ", "same-sub", { kinds: [1] }]));
    ws2.send(JSON.stringify(["REQ", "same-sub", { kinds: [1] }]));

    await Promise.all([
      waitForMessageCount(messages1, 2),
      waitForMessageCount(messages2, 2),
    ]);

    // 両方が EVENT + EOSE を受信
    assertEquals(messages1.length, 2, "ws1 should receive EVENT + EOSE");
    assertEquals(messages2.length, 2, "ws2 should receive EVENT + EOSE");

    assertEquals(JSON.parse(messages1[0])[0], "EVENT");
    assertEquals(JSON.parse(messages2[0])[0], "EVENT");

    // ws1 の購読を閉じても ws2 はブロードキャストを受信する
    ws1.send(JSON.stringify(["CLOSE", "same-sub"]));
    await waitFor(() => relay.findCLOSE("same-sub") !== undefined, {
      timeout: 1000,
      interval: 5,
    });

    // 新しいイベントを publish
    relay.store(makeEvent({ id: "e2", kind: 1, content: "new" }));
    const ws3 = await openWs("wss://relay.example.com");
    ws3.send(JSON.stringify(["EVENT", makeEvent({ id: "e2", kind: 1 })]));
    await waitFor(() => {
      const ws2Events = messages2.filter((m) => JSON.parse(m)[0] === "EVENT");
      return ws2Events.length >= 2;
    }, {
      timeout: 1000,
      interval: 5,
    });

    // ws2 はまだ購読が残っているので新イベントのブロードキャストを受信
    const ws2Events = messages2.filter((m) => JSON.parse(m)[0] === "EVENT");
    assert(ws2Events.length >= 2, "ws2 should still receive broadcast events");

    await Promise.all([closeWs(ws1), closeWs(ws2), closeWs(ws3)]);
  } finally {
    pool.uninstall();
  }
});

// ===== 回帰テスト: Issue 2 - 不正メッセージでクラッシュしない =====

Deno.test("MockRelay - handles malformed EVENT message without crash", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    // EVENT without event object
    ws.send(JSON.stringify(["EVENT"]));
    await waitForMessageCount(messages, 1);

    // 接続がまだ有効で NOTICE が返る
    assertEquals(ws.readyState, WebSocket.OPEN);
    assert(messages.length >= 1, "should receive NOTICE for malformed EVENT");
    const notice = JSON.parse(messages[0]);
    assertEquals(notice[0], "NOTICE");

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - handles malformed REQ and CLOSE messages without crash", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    // REQ without subId
    ws.send(JSON.stringify(["REQ"]));
    await waitForMessageCount(messages, 1);

    assertEquals(ws.readyState, WebSocket.OPEN);
    assert(messages.length >= 1, "should receive NOTICE for malformed REQ");
    assertEquals(JSON.parse(messages[0])[0], "NOTICE");

    // CLOSE without subId
    ws.send(JSON.stringify(["CLOSE"]));
    await waitForMessageCount(messages, 2);
    assertEquals(ws.readyState, WebSocket.OPEN);

    // empty array
    ws.send(JSON.stringify([]));
    await waitForMessageCount(messages, 3);
    assertEquals(ws.readyState, WebSocket.OPEN);

    // non-array JSON
    ws.send(JSON.stringify("not-array"));
    await waitForMessageCount(messages, 4);
    assertEquals(ws.readyState, WebSocket.OPEN);

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - rejects REQ and COUNT with invalid filter types", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const invalidMessages: unknown[] = [
      // フィルターが数値
      ["REQ", "s", 1],
      // フィルターが null
      ["REQ", "s", null],
      // フィルターが配列
      ["REQ", "s", [1]],
      // フィルター0件
      ["REQ", "s"],
      // COUNT でも同様
      ["COUNT", "s", 1],
      ["COUNT", "s", null],
      ["COUNT", "s", [1]],
      ["COUNT", "s"],
    ];

    for (const msg of invalidMessages) {
      const ws = await openWs("wss://relay.example.com");
      const messages = collectMessages(ws);

      ws.send(JSON.stringify(msg));
      await waitForMessageCount(messages, 1);

      assertEquals(
        ws.readyState,
        WebSocket.OPEN,
        `connection should stay open for: ${JSON.stringify(msg)}`,
      );
      assert(
        messages.length >= 1,
        `should receive NOTICE for: ${JSON.stringify(msg)}`,
      );
      const notice = JSON.parse(messages[0]);
      assertEquals(notice[0], "NOTICE");

      await closeWs(ws);
    }
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - rejects EVENT with missing or invalid fields", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const invalidEvents: unknown[] = [
      // pubkey欠落
      ["EVENT", {
        id: "abc",
        created_at: 0,
        kind: 1,
        tags: [],
        content: "",
        sig: "sig",
      }],
      // created_at非number
      [
        "EVENT",
        {
          id: "abc",
          pubkey: "pk",
          created_at: "not-a-number",
          kind: 1,
          tags: [],
          content: "",
          sig: "sig",
        },
      ],
      // kind非number
      [
        "EVENT",
        {
          id: "abc",
          pubkey: "pk",
          created_at: 0,
          kind: "1",
          tags: [],
          content: "",
          sig: "sig",
        },
      ],
      // tags非配列
      [
        "EVENT",
        {
          id: "abc",
          pubkey: "pk",
          created_at: 0,
          kind: 1,
          tags: "not-array",
          content: "",
          sig: "sig",
        },
      ],
      // content欠落
      ["EVENT", {
        id: "abc",
        pubkey: "pk",
        created_at: 0,
        kind: 1,
        tags: [],
        sig: "sig",
      }],
      // sig欠落
      ["EVENT", {
        id: "abc",
        pubkey: "pk",
        created_at: 0,
        kind: 1,
        tags: [],
        content: "",
      }],
    ];

    for (const msg of invalidEvents) {
      const ws = await openWs("wss://relay.example.com");
      const messages = collectMessages(ws);

      ws.send(JSON.stringify(msg));
      await waitForMessageCount(messages, 1);

      assertEquals(
        ws.readyState,
        WebSocket.OPEN,
        `connection should stay open for: ${JSON.stringify(msg)}`,
      );
      assert(
        messages.length >= 1,
        `should receive NOTICE for: ${JSON.stringify(msg)}`,
      );
      const notice = JSON.parse(messages[0]);
      assertEquals(notice[0], "NOTICE");
      assertEquals(notice[1], "error: malformed EVENT message");

      await closeWs(ws);
    }
  } finally {
    pool.uninstall();
  }
});

// ===== 回帰テスト: Issue 3 - store(kind:5) で削除処理が走る =====

Deno.test("MockRelay - manages multiple connections and handles partial disconnect", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.store(makeEvent({ id: "e1", kind: 1, content: "hello" }));

  pool.install();
  try {
    // 3つの接続を開く
    const ws1 = await openWs("wss://relay.example.com");
    const ws2 = await openWs("wss://relay.example.com");
    const ws3 = await openWs("wss://relay.example.com");
    const messages1 = collectMessages(ws1);
    const messages2 = collectMessages(ws2);
    const messages3 = collectMessages(ws3);

    assertEquals(relay.connectionCount, 3);

    // 全接続で購読
    ws1.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    ws2.send(JSON.stringify(["REQ", "sub2", { kinds: [1] }]));
    ws3.send(JSON.stringify(["REQ", "sub3", { kinds: [1] }]));
    await Promise.all([
      waitForMessageCount(messages1, 2),
      waitForMessageCount(messages2, 2),
      waitForMessageCount(messages3, 2),
    ]);

    // 全接続がイベントを受信
    assertEquals(messages1.length, 2); // EVENT + EOSE
    assertEquals(messages2.length, 2);
    assertEquals(messages3.length, 2);

    // ws2 を切断
    await closeWs(ws2);

    assertEquals(relay.connectionCount, 2);

    // 新しいイベントをブロードキャスト
    const newEvent = makeEvent({ id: "e2", kind: 1, content: "new" });
    relay.store(newEvent);
    relay.broadcast(newEvent);
    await waitFor(() => {
      const ws1Events = messages1.filter((m) => JSON.parse(m)[0] === "EVENT");
      const ws3Events = messages3.filter((m) => JSON.parse(m)[0] === "EVENT");
      return ws1Events.length >= 2 && ws3Events.length >= 2;
    }, {
      timeout: 1000,
      interval: 5,
    });

    // ws1, ws3 はブロードキャストを受信、ws2 は受信しない
    const ws1Events = messages1.filter((m) => JSON.parse(m)[0] === "EVENT");
    const ws3Events = messages3.filter((m) => JSON.parse(m)[0] === "EVENT");
    assert(ws1Events.length >= 2, "ws1 should receive broadcast");
    assert(ws3Events.length >= 2, "ws3 should receive broadcast");

    // ws2 のメッセージは切断前の2件のまま
    assertEquals(messages2.length, 2);

    // 残りの接続でREQが正常動作
    ws1.send(JSON.stringify(["REQ", "sub1-new", { kinds: [1] }]));
    await waitFor(() => messages1.length >= 6, {
      timeout: 1000,
      interval: 5,
    });

    // e1 + e2 の2件 + EOSE
    const ws1NewMsgs = messages1.slice(messages1.length - 3);
    assert(ws1NewMsgs.length >= 2, "ws1 should still receive REQ results");

    await Promise.all([closeWs(ws1), closeWs(ws3)]);

    assertEquals(relay.connectionCount, 0);
  } finally {
    pool.uninstall();
  }
});

// ===== getSubscriptions =====

Deno.test("MockRelay - getSubscriptions", async (t) => {
  await t.step("初期状態では空の Map を返す", () => {
    const pool = new MockPool();
    const relay = pool.relay("wss://relay.example.com");
    const subs = relay.getSubscriptions();
    assertEquals(subs.size, 0);
  });

  await t.step("REQ 後にサブスクリプションが含まれる", async () => {
    const pool = new MockPool();
    const relay = pool.relay("wss://relay.example.com");

    pool.install();
    try {
      const ws = await openWs("wss://relay.example.com");
      collectMessages(ws);

      ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
      ws.send(
        JSON.stringify(["REQ", "sub2", { kinds: [0] }, { authors: ["pub1"] }]),
      );

      await waitFor(() => relay.getSubscriptions().size === 2, {
        timeout: 1000,
        interval: 5,
      });

      const subs = relay.getSubscriptions();
      assertEquals(subs.size, 2);
      assertEquals(subs.has("sub1"), true);
      assertEquals(subs.has("sub2"), true);

      const sub1Filters = subs.get("sub1")!;
      assertEquals(sub1Filters.length, 1);
      assertEquals(sub1Filters[0].kinds, [1]);

      const sub2Filters = subs.get("sub2")!;
      assertEquals(sub2Filters.length, 2);

      await closeWs(ws);
    } finally {
      pool.uninstall();
    }
  });

  await t.step("CLOSE 後にサブスクリプションが削除される", async () => {
    const pool = new MockPool();
    const relay = pool.relay("wss://relay.example.com");

    pool.install();
    try {
      const ws = await openWs("wss://relay.example.com");
      collectMessages(ws);

      ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
      ws.send(JSON.stringify(["REQ", "sub2", { kinds: [0] }]));

      await waitFor(() => relay.getSubscriptions().size === 2, {
        timeout: 1000,
        interval: 5,
      });

      assertEquals(relay.getSubscriptions().size, 2);

      ws.send(JSON.stringify(["CLOSE", "sub1"]));

      await waitFor(() => relay.getSubscriptions().size === 1, {
        timeout: 1000,
        interval: 5,
      });

      const subs = relay.getSubscriptions();
      assertEquals(subs.size, 1);
      assertEquals(subs.has("sub1"), false);
      assertEquals(subs.has("sub2"), true);

      await closeWs(ws);
    } finally {
      pool.uninstall();
    }
  });
});

Deno.test("NIP-09 deletion - processes kind:5 deletion via store", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  const author = "author-pub";
  const target = makeEvent({ id: "target-event", pubkey: author, kind: 1 });
  const other = makeEvent({ id: "other-event", pubkey: "other-pub", kind: 1 });

  relay.store(target);
  relay.store(other);

  // kind:5 削除イベントを store() で追加
  const deletion = makeEvent({
    id: "deletion-event",
    pubkey: author,
    kind: 5,
    tags: [["e", "target-event"]],
  });
  const stored = relay.store(deletion);
  assertEquals(stored, true);

  // deletedIds に target-event が含まれる
  assert(
    relay.deletedIds.has("target-event"),
    "target should be in deletedIds",
  );
  // 他人のイベントは削除されていない
  assertEquals(relay.deletedIds.has("other-event"), false);

  // REQ で確認: target-event は返されない
  pool.install();
  try {
    const ws = await openWs("wss://relay.example.com");
    const messages = collectMessages(ws);

    ws.send(JSON.stringify(["REQ", "check", { kinds: [1] }]));
    await waitForMessageCount(messages, 2);

    const eventMsgs = messages
      .map((m) => JSON.parse(m))
      .filter((m: unknown[]) => m[0] === "EVENT");
    const eventIds = eventMsgs.map((m: unknown[]) => (m[2] as NostrEvent).id);

    assertEquals(eventIds.includes("target-event"), false);
    assertEquals(eventIds.includes("other-event"), true);

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

// ===== clearOlderThan =====

Deno.test("MockRelay - clearOlderThan", async (t) => {
  await t.step("指定タイムスタンプより古いイベントを削除する", () => {
    const pool = new MockPool();
    const relay = pool.relay("wss://relay.example.com");
    // 異なるタイムスタンプのイベントを登録
    relay.store(EventBuilder.kind1().createdAt(100).content("old1").build());
    relay.store(EventBuilder.kind1().createdAt(200).content("old2").build());
    relay.store(EventBuilder.kind1().createdAt(300).content("new1").build());
    relay.store(EventBuilder.kind1().createdAt(400).content("new2").build());

    const deleted = relay.clearOlderThan(300);
    assertEquals(deleted, 2);
  });

  await t.step("削除対象がない場合は 0 を返す", () => {
    const pool = new MockPool();
    const relay = pool.relay("wss://relay.example.com");
    relay.store(EventBuilder.kind1().createdAt(500).build());
    const deleted = relay.clearOlderThan(100);
    assertEquals(deleted, 0);
  });

  await t.step("空のストアでも正常に動作する", () => {
    const pool = new MockPool();
    const relay = pool.relay("wss://relay.example.com");
    const deleted = relay.clearOlderThan(1000);
    assertEquals(deleted, 0);
  });
});

// ===== setVerifier =====

Deno.test("MockRelay - setVerifier accepts valid events", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.verifier-accept.test");
  relay.setVerifier({
    verifyEvent: () => true,
  });

  pool.install();
  try {
    const ws = await openWs("wss://relay.verifier-accept.test");
    const messages = collectMessages(ws);

    const event = makeEvent({ id: "verified-ok" });
    ws.send(JSON.stringify(["EVENT", event]));
    await waitFor(() =>
      messages.some((m) => {
        const parsed = JSON.parse(m);
        return parsed[0] === "OK" && parsed[1] === "verified-ok";
      }), {
      timeout: 1000,
      interval: 5,
    });

    const ok = messages.find((m) => {
      const parsed = JSON.parse(m);
      return parsed[0] === "OK" && parsed[1] === "verified-ok";
    });
    assert(ok);
    const parsed = JSON.parse(ok);
    assertEquals(parsed[2], true);
    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - setVerifier rejects invalid events", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.verifier-reject.test");
  relay.setVerifier({
    verifyEvent: () => false,
  });

  pool.install();
  try {
    const ws = await openWs("wss://relay.verifier-reject.test");
    const messages = collectMessages(ws);

    const event = makeEvent({ id: "bad-sig" });
    ws.send(JSON.stringify(["EVENT", event]));
    await waitFor(() =>
      messages.some((m) => {
        const parsed = JSON.parse(m);
        return parsed[0] === "OK" && parsed[1] === "bad-sig";
      }), {
      timeout: 1000,
      interval: 5,
    });

    const ok = messages.find((m) => {
      const parsed = JSON.parse(m);
      return parsed[0] === "OK" && parsed[1] === "bad-sig";
    });
    assert(ok);
    const parsed = JSON.parse(ok);
    assertEquals(parsed[2], false);
    assert(parsed[3].includes("invalid"));
    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - verifier via MockRelayOptions", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.verifier-opts.test", {
    verifier: { verifyEvent: () => false },
  });

  pool.install();
  try {
    const ws = await openWs("wss://relay.verifier-opts.test");
    const messages = collectMessages(ws);

    const event = makeEvent({ id: "opts-bad-sig" });
    ws.send(JSON.stringify(["EVENT", event]));
    await waitFor(() =>
      messages.some((m) => {
        const parsed = JSON.parse(m);
        return parsed[0] === "OK" && parsed[1] === "opts-bad-sig";
      }), {
      timeout: 1000,
      interval: 5,
    });

    const ok = messages.find((m) => {
      const parsed = JSON.parse(m);
      return parsed[0] === "OK" && parsed[1] === "opts-bad-sig";
    });
    assert(ok);
    const parsed = JSON.parse(ok);
    assertEquals(parsed[2], false);
    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

// ===== 追加テスト =====

Deno.test("MockRelay - logger getter returns non-null when logging is true", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.logger-test.example.com", {
    logging: true,
  });

  assert(relay.logger !== null, "logger should be non-null when logging: true");
});

Deno.test("MockRelay - logger uses injected clock for log timestamps", async () => {
  const pool = new MockPool();
  const entries: LogEntry[] = [];
  pool.relay("wss://relay.logger-clock.example.com", {
    clock: {
      now(): number {
        return 1234567890;
      },
    },
    logging: (entry) => entries.push(entry),
  });

  pool.install();
  try {
    const ws = await openWs("wss://relay.logger-clock.example.com");
    collectMessages(ws);

    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    await waitFor(() => entries.length >= 2, {
      timeout: 1000,
      interval: 5,
    });

    assertEquals(
      entries.every((entry) => entry.timestamp === 1234567890),
      true,
    );

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - snapshot/restore with REQ/COUNT restores received", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.snapshot-test.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.snapshot-test.example.com");
    collectMessages(ws);

    ws.send(JSON.stringify(["REQ", "snap-sub1", { kinds: [1] }]));
    ws.send(JSON.stringify(["COUNT", "snap-count1", { kinds: [1] }]));

    await waitFor(() => relay.received.length === 2, {
      timeout: 1000,
      interval: 5,
    });

    assertEquals(relay.received.length, 2);
    assertEquals(relay.hasREQ("snap-sub1"), true);
    assertEquals(relay.hasCOUNT("snap-count1"), true);

    const snap = relay.snapshot();

    // リセットしてから復元
    relay.reset();
    assertEquals(relay.received.length, 0);

    relay.restore(snap);

    assertEquals(relay.received.length, 2);
    assertEquals(relay.hasREQ("snap-sub1"), true);
    assertEquals(relay.hasCOUNT("snap-count1"), true);

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - reset clears pendingTimers without error", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.pending-timers.example.com", {
    latency: 100,
  });

  pool.install();
  try {
    const ws = await openWs("wss://relay.pending-timers.example.com");
    collectMessages(ws);

    ws.send(JSON.stringify(["REQ", "timer-sub", { kinds: [1] }]));
    // タイマーが積まれた直後にリセット
    relay.reset();

    // エラーが起きないことを確認（タイマーのclearが正常に行われる）
    await new Promise<void>((r) => setTimeout(r, 50));

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - close before delayed REQ delivery drops scheduled messages", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.delay-close.example.com", {
    latency: 80,
  });
  relay.store(makeEvent({ id: "delayed-event" }));

  pool.install();
  try {
    const ws = await openWs("wss://relay.delay-close.example.com");
    const messages = collectMessages(ws);

    ws.send(JSON.stringify(["REQ", "delay-sub", { kinds: [1] }]));

    const closed = new Promise<void>((resolve) => {
      ws.addEventListener("close", () => resolve(), { once: true });
    });
    ws.close();
    await closed;

    await new Promise<void>((resolve) => setTimeout(resolve, 120));

    assertEquals(messages.length, 0);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - delayed REQ preserves EVENT before EOSE order", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.delay-order.example.com", {
    latency: 40,
  });
  relay.store(makeEvent({ id: "delay-order-event" }));

  pool.install();
  try {
    const ws = await openWs("wss://relay.delay-order.example.com");
    const messages = collectMessages(ws);

    ws.send(JSON.stringify(["REQ", "delay-order-sub", { kinds: [1] }]));

    await waitForMessageCount(messages, 2);

    const first = JSON.parse(messages[0]);
    const second = JSON.parse(messages[1]);
    assertEquals(first[0], "EVENT");
    assertEquals(first[1], "delay-order-sub");
    assertEquals(first[2].id, "delay-order-event");
    assertEquals(second, ["EOSE", "delay-order-sub"]);

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - random disconnect does not block delayed broadcast to other subscribers", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.random-broadcast.example.com", {
    latency: 50,
    disconnectRate: 0.5,
    random: makeSequenceRandom([0, 1]),
  });

  pool.install();
  try {
    const ws1 = await openWs("wss://relay.random-broadcast.example.com");
    const ws2 = await openWs("wss://relay.random-broadcast.example.com");
    const ws1Messages = collectMessages(ws1);
    const ws2Messages = collectMessages(ws2);

    const ws1Closed = new Promise<void>((resolve) => {
      ws1.addEventListener("close", () => resolve(), { once: true });
    });

    ws1.send(JSON.stringify(["REQ", "rand-sub-1", { kinds: [1] }]));
    await ws1Closed;

    ws2.send(JSON.stringify(["REQ", "rand-sub-2", { kinds: [1] }]));
    await waitForMessageCount(ws2Messages, 1);

    relay.broadcast(makeEvent({ id: "broadcast-after-random-disconnect" }));
    await waitForMessageCount(ws2Messages, 2);

    assertEquals(ws1Messages.length, 0);
    const ws2Event = JSON.parse(ws2Messages[1]);
    assertEquals(ws2Event[0], "EVENT");
    assertEquals(ws2Event[2].id, "broadcast-after-random-disconnect");

    await closeWs(ws2);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - random disconnect drops pending delayed broadcast for that socket", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.random-drop.example.com", {
    latency: 50,
    disconnectRate: 0.5,
    random: makeSequenceRandom([1, 0]),
  });

  pool.install();
  try {
    const ws = await openWs("wss://relay.random-drop.example.com");
    const messages = collectMessages(ws);

    ws.send(JSON.stringify(["REQ", "rand-live", { kinds: [1] }]));
    await waitForMessageCount(messages, 1);

    relay.broadcast(makeEvent({ id: "broadcast-before-random-disconnect" }));

    const closed = new Promise<void>((resolve) => {
      ws.addEventListener("close", () => resolve(), { once: true });
    });
    ws.send(JSON.stringify(["REQ", "rand-disconnect", { kinds: [1] }]));
    await closed;

    await new Promise<void>((resolve) => setTimeout(resolve, 80));

    assertEquals(messages.length, 1);
    const first = JSON.parse(messages[0]);
    assertEquals(first[0], "EOSE");
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - handles rapid REQ EVENT COUNT on one connection", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.concurrent.example.com");
  relay.store(makeEvent({ id: "stored-concurrent", kind: 1 }));

  pool.install();
  try {
    const ws = await openWs("wss://relay.concurrent.example.com");
    const messages = collectMessages(ws);

    const liveEvent = makeEvent({
      id: "live-concurrent",
      kind: 1,
      created_at: 1700000001,
    });

    ws.send(JSON.stringify(["REQ", "combo-sub", { kinds: [1] }]));
    ws.send(JSON.stringify(["EVENT", liveEvent]));
    ws.send(JSON.stringify(["COUNT", "combo-count", { kinds: [1] }]));

    await waitFor(() => {
      const parsed = messages.map((message) => JSON.parse(message));
      const eventIds = parsed
        .filter((message: unknown[]) => message[0] === "EVENT")
        .map((message: unknown[]) => (message[2] as NostrEvent).id);
      return (
        eventIds.includes("stored-concurrent") &&
        eventIds.includes("live-concurrent") &&
        parsed.some((message: unknown[]) =>
          message[0] === "EOSE" && message[1] === "combo-sub"
        ) &&
        parsed.some((message: unknown[]) =>
          message[0] === "OK" && message[1] === "live-concurrent" &&
          message[2] === true
        ) &&
        parsed.some((message: unknown[]) =>
          message[0] === "COUNT" && message[1] === "combo-count"
        )
      );
    }, {
      timeout: 1000,
      interval: 5,
    });

    const countMessage = messages
      .map((message) => JSON.parse(message))
      .find((message: unknown[]) =>
        message[0] === "COUNT" && message[1] === "combo-count"
      );

    assert(countMessage);
    assertEquals(relay.hasREQ("combo-sub"), true);
    assertEquals(relay.hasCOUNT("combo-count"), true);
    assertEquals((countMessage[2] as { count: number }).count >= 1, true);

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - malformed AUTH message returns NOTICE", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.auth-malformed.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.auth-malformed.example.com");
    const messages = collectMessages(ws);

    ws.send(JSON.stringify(["AUTH", "not_an_object"]));
    await waitForMessageCount(messages, 1);

    assert(messages.length >= 1, "should receive NOTICE for malformed AUTH");
    const notice = JSON.parse(messages[0]);
    assertEquals(notice[0], "NOTICE");
    assert(
      (notice[1] as string).includes("malformed"),
      "NOTICE should mention malformed",
    );

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - invalid JSON returns error NOTICE", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.invalid-json.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.invalid-json.example.com");
    const messages = collectMessages(ws);

    ws.send("{invalid json");
    await waitForMessageCount(messages, 1);

    assert(messages.length >= 1, "should receive NOTICE for invalid JSON");
    const notice = JSON.parse(messages[0]);
    assertEquals(notice[0], "NOTICE");
    assert(
      (notice[1] as string).includes("invalid JSON"),
      "NOTICE should mention invalid JSON",
    );

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - errorRate: 1.0 returns error NOTICE for REQ", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.error-rate.example.com", { errorRate: 1.0 });

  pool.install();
  try {
    const ws = await openWs("wss://relay.error-rate.example.com");
    const messages = collectMessages(ws);

    ws.send(JSON.stringify(["REQ", "err-sub", { kinds: [1] }]));
    await waitForMessageCount(messages, 1);

    assert(messages.length >= 1, "should receive NOTICE when errorRate is 1.0");
    const notice = JSON.parse(messages[0]);
    assertEquals(notice[0], "NOTICE");

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - injected random source drives errorRate deterministically", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.error-seeded.example.com", {
    errorRate: 0.5,
    random: makeConstantRandom(0.25),
  });

  pool.install();
  try {
    const ws = await openWs("wss://relay.error-seeded.example.com");
    const messages = collectMessages(ws);

    ws.send(JSON.stringify(["REQ", "err-sub", { kinds: [1] }]));
    await waitForMessageCount(messages, 1);

    assert(
      messages.length >= 1,
      "should receive NOTICE when random < errorRate",
    );
    const notice = JSON.parse(messages[0]);
    assertEquals(notice[0], "NOTICE");

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - disconnectRate: 1.0 disconnects on REQ", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.disconnect-rate.example.com", {
    disconnectRate: 1.0,
  });

  pool.install();
  try {
    const ws = await openWs("wss://relay.disconnect-rate.example.com");
    collectMessages(ws);

    const closed = await new Promise<CloseEvent>((resolve) => {
      ws.onclose = (ev) => resolve(ev);
      ws.send(JSON.stringify(["REQ", "dc-sub", { kinds: [1] }]));
    });

    // 接続が切断されることを確認
    assertEquals(closed.code, 1006);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - injected random source drives disconnectRate deterministically", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.disconnect-seeded.example.com", {
    disconnectRate: 0.5,
    random: makeConstantRandom(0.25),
  });

  pool.install();
  try {
    const ws = await openWs("wss://relay.disconnect-seeded.example.com");
    collectMessages(ws);

    const closed = await new Promise<CloseEvent>((resolve) => {
      ws.onclose = (ev) => resolve(ev);
      ws.send(JSON.stringify(["REQ", "dc-sub", { kinds: [1] }]));
    });

    assertEquals(closed.code, 1006);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - unsupported message type returns NOTICE", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.unsupported-msg.example.com");

  pool.install();
  try {
    const ws = await openWs("wss://relay.unsupported-msg.example.com");
    const messages = collectMessages(ws);

    ws.send(JSON.stringify(["UNKNOWN"]));
    await waitForMessageCount(messages, 1);

    assert(messages.length >= 1, "should receive NOTICE for unsupported type");
    const notice = JSON.parse(messages[0]);
    assertEquals(notice[0], "NOTICE");
    assert(
      (notice[1] as string).includes("unsupported message type"),
      "NOTICE should mention unsupported message type",
    );

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - deleted event re-post is rejected with blocked", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.deleted-repost.example.com");

  const author = "author-pub-delete-test";
  const target = makeEvent({
    id: "target-to-delete",
    pubkey: author,
    kind: 1,
  });
  relay.store(target);

  // kind:5 削除イベントを store
  relay.store(
    makeEvent({
      id: "deletion-event-repost",
      pubkey: author,
      kind: 5,
      tags: [["e", "target-to-delete"]],
    }),
  );

  pool.install();
  try {
    const ws = await openWs("wss://relay.deleted-repost.example.com");
    const messages = collectMessages(ws);

    // 削除済みイベントを再投稿
    ws.send(JSON.stringify(["EVENT", target]));
    await waitForMessageCount(messages, 1);

    assert(messages.length >= 1, "should receive OK for re-posted event");
    const ok = JSON.parse(messages[0]);
    assertEquals(ok[0], "OK");
    assertEquals(ok[1], "target-to-delete");
    assertEquals(ok[2], false);
    assert(
      (ok[3] as string).includes("blocked"),
      "OK message should include blocked",
    );

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - onREQ handler throws returns CLOSED", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.req-throws.example.com");

  relay.onREQ(() => {
    throw new Error("REQ handler error");
  });

  pool.install();
  try {
    const ws = await openWs("wss://relay.req-throws.example.com");
    const messages = collectMessages(ws);

    ws.send(JSON.stringify(["REQ", "throwing-sub", { kinds: [1] }]));
    await waitForMessageCount(messages, 1);

    assert(messages.length >= 1, "should receive CLOSED when onREQ throws");
    const closed = JSON.parse(messages[0]);
    assertEquals(closed[0], "CLOSED");
    assertEquals(closed[1], "throwing-sub");

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - onEVENT handler throws returns OK false", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.event-throws.example.com");

  relay.onEVENT(() => {
    throw new Error("EVENT handler error");
  });

  pool.install();
  try {
    const ws = await openWs("wss://relay.event-throws.example.com");
    const messages = collectMessages(ws);

    const event = makeEvent({ id: "throw-event" });
    ws.send(JSON.stringify(["EVENT", event]));
    await waitForMessageCount(messages, 1);

    assert(messages.length >= 1, "should receive OK false when onEVENT throws");
    const ok = JSON.parse(messages[0]);
    assertEquals(ok[0], "OK");
    assertEquals(ok[1], "throw-event");
    assertEquals(ok[2], false);

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - onCOUNT handler throws returns NOTICE", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.count-throws.example.com");

  relay.onCOUNT(() => {
    throw new Error("COUNT handler error");
  });

  pool.install();
  try {
    const ws = await openWs("wss://relay.count-throws.example.com");
    const messages = collectMessages(ws);

    ws.send(JSON.stringify(["COUNT", "throw-count-sub", { kinds: [1] }]));
    await waitForMessageCount(messages, 1);

    assert(messages.length >= 1, "should receive NOTICE when onCOUNT throws");
    const notice = JSON.parse(messages[0]);
    assertEquals(notice[0], "NOTICE");

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - replaceable event with same timestamp and larger id is skipped", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.replaceable-same-ts.example.com");

  const pubkey = "pub-replaceable-test";
  // kind:0 は replaceable
  const existing = makeEvent({
    id: "aaaa",
    pubkey,
    kind: 0,
    created_at: 1700000000,
  });
  relay.store(existing);

  // 同じ created_at で id が大きい (id >= existing.id)
  const newer = makeEvent({
    id: "zzzz",
    pubkey,
    kind: 0,
    created_at: 1700000000,
  });
  const stored = relay.store(newer);
  assertEquals(
    stored,
    false,
    "replaceable event with same timestamp and larger id should not be stored",
  );

  pool.install();
  try {
    const ws = await openWs("wss://relay.replaceable-same-ts.example.com");
    const messages = collectMessages(ws);

    ws.send(JSON.stringify(["REQ", "rep-sub", { kinds: [0] }]));
    await waitForMessageCount(messages, 2);

    const eventMsgs = messages
      .map((m) => JSON.parse(m))
      .filter((m: unknown[]) => m[0] === "EVENT");

    // 元のイベント (id: aaaa) のみが存在する
    assertEquals(eventMsgs.length, 1);
    assertEquals((eventMsgs[0] as unknown[])[2] as { id: string }, {
      ...existing,
    });

    await closeWs(ws);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - parameterized replaceable event with same timestamp and larger id is skipped", () => {
  const pool = new MockPool();
  const relay = pool.relay(
    "wss://relay.param-replaceable-same-ts.example.com",
  );

  const pubkey = "pub-param-replaceable-test";
  // kind:30000 は parameterized replaceable
  const existing = makeEvent({
    id: "aaaa-param",
    pubkey,
    kind: 30000,
    created_at: 1700000000,
    tags: [["d", "same-dtag"]],
  });
  relay.store(existing);

  // 同じ created_at と d-tag で id が大きい
  const newer = makeEvent({
    id: "zzzz-param",
    pubkey,
    kind: 30000,
    created_at: 1700000000,
    tags: [["d", "same-dtag"]],
  });
  const stored = relay.store(newer);
  assertEquals(
    stored,
    false,
    "parameterized replaceable event with same timestamp and larger id should not be stored",
  );
});

// ===== NetworkConditions =====

Deno.test("MockRelay - network.connectDelay delays WebSocket open event", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.example.com", {
    network: { connectDelay: 50 },
  });
  pool.install();
  try {
    const start = Date.now();
    const ws = new WebSocket("wss://relay.example.com");
    await new Promise<void>((resolve) => {
      ws.onopen = () => resolve();
    });
    const elapsed = Date.now() - start;
    assertEquals(elapsed >= 40, true, `Expected >= 40ms, got ${elapsed}ms`);
    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - network.messageDelay delays responses", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com", {
    network: { messageDelay: 30 },
    random: { next: () => 0.5, fill: (b: Uint8Array) => b.fill(0) },
  });
  relay.store(makeEvent());
  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    await new Promise<void>((resolve) => {
      ws.onopen = () => resolve();
    });

    const start = Date.now();
    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));

    await new Promise<void>((resolve) => {
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data as string);
        if (msg[0] === "EVENT") resolve();
      };
    });
    const elapsed = Date.now() - start;
    assertEquals(elapsed >= 20, true, `Expected >= 20ms, got ${elapsed}ms`);

    ws.close();
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
    });
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - network.transientDisconnect triggers close", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com", {
    network: {
      transientDisconnect: { probability: 1.0, duration: 100 },
    },
    random: { next: () => 0.0, fill: (b: Uint8Array) => b.fill(0) },
  });
  relay.store(makeEvent());
  pool.install();
  try {
    const ws = new WebSocket("wss://relay.example.com");
    await new Promise<void>((resolve) => {
      ws.onopen = () => resolve();
    });

    const closePromise = new Promise<CloseEvent>((resolve) => {
      ws.onclose = (ev) => resolve(ev);
    });

    ws.send(JSON.stringify(["REQ", "sub1", { kinds: [1] }]));
    const closeEvent = await closePromise;
    assertEquals(closeEvent.code, 1001);
  } finally {
    pool.uninstall();
  }
});

Deno.test("MockRelay - network.transientDisconnect cooldown rejects reconnection", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.example.com", {
    network: {
      transientDisconnect: { probability: 1.0, duration: 200 },
    },
    random: { next: () => 0.0, fill: (b: Uint8Array) => b.fill(0) },
  });
  pool.install();
  try {
    // First connection
    const ws1 = new WebSocket("wss://relay.example.com");
    await new Promise<void>((resolve) => {
      ws1.onopen = () => resolve();
    });
    // Trigger transient disconnect
    const ws1Close = new Promise<void>((resolve) => {
      ws1.onclose = () => resolve();
    });
    ws1.send(JSON.stringify(["REQ", "sub1", {}]));
    await ws1Close;

    // Try to reconnect during cooldown — should be rejected
    const ws2 = new WebSocket("wss://relay.example.com");
    const closeEvent = await new Promise<CloseEvent>((resolve) => {
      ws2.addEventListener("close", (ev) => resolve(ev), { once: true });
    });
    assertEquals(closeEvent.code, 1001);
  } finally {
    pool.uninstall();
  }
});
