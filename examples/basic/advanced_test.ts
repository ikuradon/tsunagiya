/**
 * basic/advanced_test.ts — 高度な機能テスト
 *
 * MockRelay の応用的な機能をテストする。
 *
 * @module
 */

import {
  assert,
  assertEquals,
  assertExists,
  assertGreater,
  test,
} from "../_compat/mod.ts";
import { MockPool } from "../../src/mod.ts";
import {
  EventBuilder,
  startStream,
  streamEvents,
} from "../../src/testing/mod.ts";
import type { NostrEvent, RelayMessage } from "../../src/types.ts";
import { post, stream, timeline } from "./client.ts";

const TEST_RELAY = "wss://relay.test";
const TEST_PUBKEY =
  "aaaa000000000000000000000000000000000000000000000000000000000000";

/** WebSocket を開いて返す */
async function openWs(url: string): Promise<WebSocket> {
  const ws = new WebSocket(url);
  await new Promise<void>((resolve) => {
    ws.onopen = () => resolve();
  });
  return ws;
}

// ===== カスタムハンドラー =====

test("advanced: custom REQ handler - overrides filter logic with onREQ()", async () => {
  const pool = new MockPool();
  const relay = pool.relay(TEST_RELAY);

  // ストアにイベントを登録（これは無視される）
  relay.store(EventBuilder.kind1().content("stored").build());

  // カスタムハンドラーで常に固定のイベントを返す
  const customEvent = EventBuilder.kind1().content("custom response").build();
  relay.onREQ((_subId, _filters) => {
    return [customEvent];
  });

  pool.install();
  try {
    const ws = await openWs(TEST_RELAY);
    try {
      const events = await timeline(ws);
      assertEquals(events.length, 1);
      assertEquals(events[0].content, "custom response");
      assertEquals(events[0].id, customEvent.id);
    } finally {
      ws.close();
      await new Promise<void>((resolve) => {
        ws.onclose = () => resolve();
      });
    }
  } finally {
    pool.uninstall();
  }
});

test("advanced: custom EVENT handler - validates and rejects with onEVENT()", async () => {
  const pool = new MockPool();
  const relay = pool.relay(TEST_RELAY);

  // content が空のイベントを拒否するハンドラー
  relay.onEVENT((event) => {
    if (event.content === "") {
      return ["OK", event.id, false, "blocked: empty content not allowed"];
    }
    return ["OK", event.id, true, ""];
  });

  pool.install();
  try {
    const ws = await openWs(TEST_RELAY);
    try {
      const received: RelayMessage[] = [];
      ws.addEventListener("message", (ev: MessageEvent) => {
        received.push(JSON.parse(ev.data as string) as RelayMessage);
      });

      // 空 content → 拒否
      const emptyEvent = EventBuilder.kind1().content("").build();
      ws.send(JSON.stringify(["EVENT", emptyEvent]));

      await new Promise<void>((resolve) => setTimeout(resolve, 10));

      const okMsg = received.find((m) =>
        m[0] === "OK" && m[1] === emptyEvent.id
      );
      assertExists(okMsg);
      assertEquals(okMsg[2], false);

      // 通常 content → 受理
      received.length = 0;
      const normalEvent = EventBuilder.kind1().content("valid").build();
      ws.send(JSON.stringify(["EVENT", normalEvent]));

      await new Promise<void>((resolve) => setTimeout(resolve, 10));

      const okMsg2 = received.find((m) =>
        m[0] === "OK" && m[1] === normalEvent.id
      );
      assertExists(okMsg2);
      assertEquals(okMsg2[2], true);
    } finally {
      ws.close();
      await new Promise<void>((resolve) => {
        ws.onclose = () => resolve();
      });
    }
  } finally {
    pool.uninstall();
  }
});

// ===== レイテンシ =====

test("advanced: latency - verifies delay with latency option", async () => {
  const pool = new MockPool();
  const relay = pool.relay(TEST_RELAY, {
    latency: { min: 50, max: 80 },
  });

  relay.store(EventBuilder.kind1().content("delayed").build());

  pool.install();
  try {
    const ws = await openWs(TEST_RELAY);
    try {
      const received: RelayMessage[] = [];
      ws.addEventListener("message", (ev: MessageEvent) => {
        received.push(JSON.parse(ev.data as string) as RelayMessage);
      });

      const start = Date.now();

      // REQ を送信
      ws.send(JSON.stringify(["REQ", "lat-test", { kinds: [1] }]));

      // 十分待ってからチェック（各メッセージ 50-80ms の遅延）
      await new Promise<void>((resolve) => setTimeout(resolve, 300));

      const elapsed = Date.now() - start;

      // レイテンシがかかっている
      assertGreater(elapsed, 40);

      // EVENT + EOSE が届いている
      const eventMsgs = received.filter((m) => m[0] === "EVENT");
      const eoseMsgs = received.filter((m) => m[0] === "EOSE");
      assertEquals(eventMsgs.length, 1);
      assertEquals(eoseMsgs.length, 1);
    } finally {
      ws.close();
      await new Promise<void>((resolve) => {
        ws.onclose = () => resolve();
      });
    }
  } finally {
    pool.uninstall();
  }
});

// ===== 切断 =====

test("advanced: disconnect() - closes connections immediately", async () => {
  const pool = new MockPool();
  const relay = pool.relay(TEST_RELAY);
  pool.install();
  try {
    const ws = await openWs(TEST_RELAY);

    const closePromise = new Promise<CloseEvent>((resolve) => {
      ws.onclose = (ev: CloseEvent) => resolve(ev);
    });

    // リレー側から切断
    relay.disconnect(1000, "server shutdown");

    const ev = await closePromise;
    assertEquals(ev.code, 1000);
  } finally {
    pool.uninstall();
  }
});

test("advanced: disconnectAfter() - closes connections after delay", async () => {
  const pool = new MockPool();
  const relay = pool.relay(TEST_RELAY);
  pool.install();
  try {
    const ws = await openWs(TEST_RELAY);

    const closePromise = new Promise<CloseEvent>((resolve) => {
      ws.onclose = (ev: CloseEvent) => resolve(ev);
    });

    const start = Date.now();
    relay.disconnectAfter(50, 1006);

    const ev = await closePromise;
    const elapsed = Date.now() - start;

    assertEquals(ev.code, 1006);
    assertGreater(elapsed, 40);
  } finally {
    pool.uninstall();
  }
});

test("advanced: close(1006) - closes with abnormal close code", async () => {
  const pool = new MockPool();
  const relay = pool.relay(TEST_RELAY);
  pool.install();
  try {
    const ws = await openWs(TEST_RELAY);

    const closePromise = new Promise<CloseEvent>((resolve) => {
      ws.onclose = (ev: CloseEvent) => resolve(ev);
    });

    relay.close(1006);

    const ev = await closePromise;
    assertEquals(ev.code, 1006);
    assertEquals(ev.wasClean, false);
  } finally {
    pool.uninstall();
  }
});

// ===== 接続拒否 =====

test("advanced: refuse() - rejects new connections", async () => {
  const pool = new MockPool();
  const relay = pool.relay(TEST_RELAY);
  relay.refuse();

  pool.install();
  try {
    const ws = new WebSocket(TEST_RELAY);

    let errorFired = false;
    ws.onerror = () => {
      errorFired = true;
    };

    const closeEvent = await new Promise<CloseEvent>((resolve) => {
      ws.onclose = (ev: CloseEvent) => resolve(ev);
    });

    assertEquals(closeEvent.code, 1006);
    assertEquals(errorFired, true);
  } finally {
    pool.uninstall();
  }
});

// ===== NIP-42 AUTH =====

test("advanced: NIP-42 AUTH - handles challenge/response with requiresAuth", async () => {
  const pool = new MockPool();
  const relay = pool.relay(TEST_RELAY, { requiresAuth: true });

  // AUTH バリデーター設定（常に成功）
  relay.requireAuth((_authEvent) => true);

  pool.install();
  try {
    const ws = await openWs(TEST_RELAY);

    try {
      const received: RelayMessage[] = [];
      ws.addEventListener("message", (ev: MessageEvent) => {
        received.push(JSON.parse(ev.data as string) as RelayMessage);
      });

      // AUTH チャレンジを待つ
      await new Promise<void>((resolve) => setTimeout(resolve, 20));

      const authChallenge = received.find((m) => m[0] === "AUTH");
      assertExists(authChallenge);
      const challenge = authChallenge[1];
      assert(typeof challenge === "string");

      // AUTH レスポンスを送信
      const authEvent = EventBuilder.kind(22242)
        .content("")
        .tag("relay", TEST_RELAY)
        .tag("challenge", challenge)
        .build();
      ws.send(JSON.stringify(["AUTH", authEvent]));

      await new Promise<void>((resolve) => setTimeout(resolve, 10));

      // OK レスポンスで認証成功確認
      const okMsg = received.find((m) =>
        m[0] === "OK" && m[1] === authEvent.id
      );
      assertExists(okMsg);
      assertEquals(okMsg[2], true);

      // 認証後は通常操作可能
      relay.store(EventBuilder.kind1().content("authed content").build());
      const events = await timeline(ws);
      assertEquals(events.length, 1);
    } finally {
      ws.close();
      await new Promise<void>((resolve) => {
        ws.onclose = () => resolve();
      });
    }
  } finally {
    pool.uninstall();
  }
});

// ===== スナップショット =====

test("advanced: snapshot/restore - saves and restores relay state", async () => {
  const pool = new MockPool();
  const relay = pool.relay(TEST_RELAY);

  // イベントを2件登録
  const ev1 = EventBuilder.kind1().content("event1").build();
  const ev2 = EventBuilder.kind1().content("event2").build();
  relay.store(ev1);
  relay.store(ev2);

  pool.install();
  try {
    const ws = await openWs(TEST_RELAY);
    try {
      // 投稿してスナップショット前の受信ログを増やす
      await post(ws, "posted before snapshot", TEST_PUBKEY);
      await new Promise<void>((resolve) => setTimeout(resolve, 10));

      // スナップショット取得
      const snap = relay.snapshot();

      // 追加イベント
      relay.store(EventBuilder.kind1().content("event3").build());
      await post(ws, "posted after snapshot", TEST_PUBKEY);
      await new Promise<void>((resolve) => setTimeout(resolve, 10));

      // スナップショット復元
      relay.restore(snap);

      // 復元後のタイムライン: event1, event2 + posted before snapshot
      const events = await timeline(ws);
      const contents = events.map((e) => e.content);
      // event3, posted after snapshot は含まれない
      assertEquals(contents.includes("event3"), false);
      assertEquals(contents.includes("posted after snapshot"), false);
      // event1, event2 は含まれる
      assertEquals(contents.includes("event1"), true);
      assertEquals(contents.includes("event2"), true);
    } finally {
      ws.close();
      await new Promise<void>((resolve) => {
        ws.onclose = () => resolve();
      });
    }
  } finally {
    pool.uninstall();
  }
});

// ===== リアルタイムストリーム =====

test("advanced: streamEvents() - delivers events with timed intervals", async () => {
  const pool = new MockPool();
  const relay = pool.relay(TEST_RELAY);
  pool.install();
  try {
    const ws = await openWs(TEST_RELAY);
    try {
      const received: NostrEvent[] = [];
      const handle = stream(ws, (ev) => {
        received.push(ev);
      });

      // サブスクリプション登録を待つ
      await new Promise<void>((resolve) => setTimeout(resolve, 10));

      const events = EventBuilder.bulk(5);
      const sh = streamEvents(relay, events, { interval: 20 });

      await new Promise<void>((resolve) => setTimeout(resolve, 300));

      sh.stop();
      handle.stop();

      assertEquals(received.length, 5);
    } finally {
      ws.close();
      await new Promise<void>((resolve) => {
        ws.onclose = () => resolve();
      });
    }
  } finally {
    pool.uninstall();
  }
});

test("advanced: startStream() - delivers events via generator-based streaming", async () => {
  const pool = new MockPool();
  const relay = pool.relay(TEST_RELAY);
  pool.install();
  try {
    const ws = await openWs(TEST_RELAY);
    try {
      const received: NostrEvent[] = [];
      const handle = stream(ws, (ev) => {
        received.push(ev);
      });

      await new Promise<void>((resolve) => setTimeout(resolve, 10));

      let counter = 0;
      const sh = startStream(relay, {
        eventGenerator: () => {
          return EventBuilder.kind1().content(`generated-${counter++}`).build();
        },
        interval: 20,
        count: 3,
      });

      await new Promise<void>((resolve) => setTimeout(resolve, 200));

      sh.stop();
      handle.stop();

      assertEquals(received.length, 3);
      assertEquals(received[0].content, "generated-0");
      assertEquals(received[1].content, "generated-1");
      assertEquals(received[2].content, "generated-2");
    } finally {
      ws.close();
      await new Promise<void>((resolve) => {
        ws.onclose = () => resolve();
      });
    }
  } finally {
    pool.uninstall();
  }
});

// ===== NIP-16 イベント種別 =====

test("advanced: NIP-16 - handles replaceable events automatically", async () => {
  const pool = new MockPool();
  pool.relay(TEST_RELAY);
  pool.install();
  try {
    const ws = await openWs(TEST_RELAY);
    try {
      // kind:0 (Replaceable) を2回投稿 — 同じ pubkey
      const ev1 = EventBuilder.kind0()
        .pubkey(TEST_PUBKEY)
        .content(JSON.stringify({ name: "Alice v1" }))
        .createdAt(1700000000)
        .build();
      const ev2 = EventBuilder.kind0()
        .pubkey(TEST_PUBKEY)
        .content(JSON.stringify({ name: "Alice v2" }))
        .createdAt(1700000100)
        .build();

      ws.send(JSON.stringify(["EVENT", ev1]));
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      ws.send(JSON.stringify(["EVENT", ev2]));
      await new Promise<void>((resolve) => setTimeout(resolve, 10));

      // profile 取得 → 最新のみ
      const received: RelayMessage[] = [];
      ws.addEventListener("message", (ev: MessageEvent) => {
        received.push(JSON.parse(ev.data as string) as RelayMessage);
      });

      ws.send(
        JSON.stringify(["REQ", "meta", { kinds: [0], authors: [TEST_PUBKEY] }]),
      );

      await new Promise<void>((resolve) => setTimeout(resolve, 10));

      const events = received
        .filter((m): m is ["EVENT", string, NostrEvent] => m[0] === "EVENT")
        .map((m) => m[2]);

      assertEquals(events.length, 1);
      assertEquals(
        JSON.parse(events[0].content).name,
        "Alice v2",
      );
    } finally {
      ws.close();
      await new Promise<void>((resolve) => {
        ws.onclose = () => resolve();
      });
    }
  } finally {
    pool.uninstall();
  }
});

// ===== NIP-33 Parameterized Replaceable =====

test("advanced: NIP-33 - replaces parameterized events by kind+pubkey+d-tag", async () => {
  const pool = new MockPool();
  pool.relay(TEST_RELAY);
  pool.install();
  try {
    const ws = await openWs(TEST_RELAY);
    try {
      // kind:30023 (Parameterized Replaceable) — 同じ d-tag で2回投稿
      const ev1 = EventBuilder.kind(30023)
        .pubkey(TEST_PUBKEY)
        .tag("d", "my-article")
        .content("Article v1")
        .createdAt(1700000000)
        .build();
      const ev2 = EventBuilder.kind(30023)
        .pubkey(TEST_PUBKEY)
        .tag("d", "my-article")
        .content("Article v2")
        .createdAt(1700000100)
        .build();

      ws.send(JSON.stringify(["EVENT", ev1]));
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      ws.send(JSON.stringify(["EVENT", ev2]));
      await new Promise<void>((resolve) => setTimeout(resolve, 10));

      // REQ で取得
      const received: RelayMessage[] = [];
      ws.addEventListener("message", (ev: MessageEvent) => {
        received.push(JSON.parse(ev.data as string) as RelayMessage);
      });

      ws.send(
        JSON.stringify([
          "REQ",
          "articles",
          { kinds: [30023], authors: [TEST_PUBKEY], "#d": ["my-article"] },
        ]),
      );

      await new Promise<void>((resolve) => setTimeout(resolve, 10));

      const events = received
        .filter((m): m is ["EVENT", string, NostrEvent] => m[0] === "EVENT")
        .map((m) => m[2]);

      // d-tag が同じなので最新のみ
      assertEquals(events.length, 1);
      assertEquals(events[0].content, "Article v2");
    } finally {
      ws.close();
      await new Promise<void>((resolve) => {
        ws.onclose = () => resolve();
      });
    }
  } finally {
    pool.uninstall();
  }
});

// ===== NIP-45 COUNT =====

test("advanced: NIP-45 COUNT - handles COUNT with onCOUNT() handler", async () => {
  const pool = new MockPool();
  const relay = pool.relay(TEST_RELAY);

  // ストアにイベントを登録
  for (const ev of EventBuilder.bulk(5)) {
    relay.store(ev);
  }

  // カスタム COUNT ハンドラー
  relay.onCOUNT((_subId, _filters) => {
    return { count: 42 }; // カスタム値
  });

  pool.install();
  try {
    const ws = await openWs(TEST_RELAY);
    try {
      const received: RelayMessage[] = [];
      ws.addEventListener("message", (ev: MessageEvent) => {
        received.push(JSON.parse(ev.data as string) as RelayMessage);
      });

      ws.send(JSON.stringify(["COUNT", "count-sub", { kinds: [1] }]));

      await new Promise<void>((resolve) => setTimeout(resolve, 10));

      const countMsg = received.find((m) => m[0] === "COUNT");
      assertExists(countMsg);
      assertEquals(countMsg[1], "count-sub");
      assertEquals(
        (countMsg[2] as { count: number }).count,
        42,
      );
    } finally {
      ws.close();
      await new Promise<void>((resolve) => {
        ws.onclose = () => resolve();
      });
    }
  } finally {
    pool.uninstall();
  }
});

// ===== ログ機能 =====

test("advanced: logging - enables logging with custom handler", async () => {
  const logs: unknown[] = [];
  const pool = new MockPool();
  const relay = pool.relay(TEST_RELAY, {
    logging: (entry) => {
      logs.push(entry);
    },
  });

  relay.store(EventBuilder.kind1().content("logged event").build());

  pool.install();
  try {
    const ws = await openWs(TEST_RELAY);
    try {
      await timeline(ws);
      await new Promise<void>((resolve) => setTimeout(resolve, 10));

      // ログが記録されている
      assertGreater(logs.length, 0);

      // receive（クライアント→リレー）と send（リレー→クライアント）両方がある
      const directions = logs.map((l) =>
        (l as { direction: string }).direction
      );
      assertEquals(directions.includes("receive"), true);
      assertEquals(directions.includes("send"), true);
    } finally {
      ws.close();
      await new Promise<void>((resolve) => {
        ws.onclose = () => resolve();
      });
    }
  } finally {
    pool.uninstall();
  }
});

// ===== EventBuilder 活用 =====

test("advanced: EventBuilder thread() - generates reply chain", async () => {
  const pool = new MockPool();
  const relay = pool.relay(TEST_RELAY);

  const thread = EventBuilder.thread(4);
  for (const ev of thread) {
    relay.store(ev);
  }

  pool.install();
  try {
    const ws = await openWs(TEST_RELAY);
    try {
      const events = await timeline(ws);
      assertEquals(events.length, 4);

      // root 以外には e タグがある
      for (let i = 1; i < thread.length; i++) {
        const eTags = thread[i].tags.filter((t) => t[0] === "e");
        assertGreater(eTags.length, 0);
        // root タグは最初のイベントを参照
        const rootTag = eTags.find((t) => t[3] === "root");
        assertExists(rootTag);
        assertEquals(rootTag[1], thread[0].id);
      }
    } finally {
      ws.close();
      await new Promise<void>((resolve) => {
        ws.onclose = () => resolve();
      });
    }
  } finally {
    pool.uninstall();
  }
});

test("advanced: EventBuilder withReactions() - generates reactions for post", async () => {
  const pool = new MockPool();
  const relay = pool.relay(TEST_RELAY);

  const [postEvent, reactions] = EventBuilder.withReactions(3);
  relay.store(postEvent);
  for (const r of reactions) {
    relay.store(r);
  }

  pool.install();
  try {
    const ws = await openWs(TEST_RELAY);
    try {
      // 投稿を取得
      const events = await timeline(ws);
      assertEquals(events.length, 1);
      assertEquals(events[0].id, postEvent.id);

      // リアクション数を COUNT で確認（デフォルトハンドラー）
      const received: RelayMessage[] = [];
      ws.addEventListener("message", (ev: MessageEvent) => {
        received.push(JSON.parse(ev.data as string) as RelayMessage);
      });

      ws.send(
        JSON.stringify([
          "COUNT",
          "reactions",
          { kinds: [7], "#e": [postEvent.id] },
        ]),
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 10));

      const countMsg = received.find((m) => m[0] === "COUNT");
      assertExists(countMsg);
      assertEquals(
        (countMsg[2] as { count: number }).count,
        3,
      );
    } finally {
      ws.close();
      await new Promise<void>((resolve) => {
        ws.onclose = () => resolve();
      });
    }
  } finally {
    pool.uninstall();
  }
});

test("advanced: EventBuilder bulk/timeline - generates events in batch", async () => {
  const pool = new MockPool();
  const relay = pool.relay(TEST_RELAY);

  // timeline で時系列データを生成
  const events = EventBuilder.timeline(10, {
    startTime: 1700000000,
    interval: 60,
  });
  for (const ev of events) {
    relay.store(ev);
  }

  pool.install();
  try {
    const ws = await openWs(TEST_RELAY);
    try {
      const result = await timeline(ws);

      assertEquals(result.length, 10);
      // 降順確認
      for (let i = 0; i < result.length - 1; i++) {
        assertGreater(result[i].created_at, result[i + 1].created_at);
      }
    } finally {
      ws.close();
      await new Promise<void>((resolve) => {
        ws.onclose = () => resolve();
      });
    }
  } finally {
    pool.uninstall();
  }
});
