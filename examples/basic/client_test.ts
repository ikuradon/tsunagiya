/**
 * basic/client.ts のモックテスト
 *
 * 各コマンドのコア関数を MockPool + EventBuilder でテストする。
 *
 * @module
 */

import { assertEquals, assertExists, test } from "../_compat/mod.ts";
import { MockPool } from "../../src/mod.ts";
import { EventBuilder } from "../../src/testing/mod.ts";
import type { NostrEvent } from "../../src/types.ts";
import {
  deleteEvent,
  dmPost,
  like,
  post,
  powa,
  profile,
  puru,
  reply,
  repost,
  search,
  stream,
  timeline,
} from "./client.ts";

// ===== ユーティリティ =====

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

/** テスト用の定型パターン */
async function withRelay(
  fn: (relay: ReturnType<MockPool["relay"]>, ws: WebSocket) => Promise<void>,
): Promise<void> {
  const pool = new MockPool();
  const relay = pool.relay(TEST_RELAY);
  pool.install();
  try {
    const ws = await openWs(TEST_RELAY);
    try {
      await fn(relay, ws);
    } finally {
      ws.close();
      await new Promise<void>((resolve) => {
        ws.onclose = () => resolve();
      });
    }
  } finally {
    pool.uninstall();
  }
}

// ===== テストケース =====

test("basic: timeline - store済みイベント取得、created_at降順ソート", async () => {
  await withRelay(async (relay, ws) => {
    // 時系列のイベントを3件登録（古い→新しい順）
    const events = EventBuilder.timeline(3, {
      startTime: 1700000000,
      interval: 60,
    });
    for (const ev of events) {
      relay.store(ev);
    }

    const result = await timeline(ws);

    assertEquals(result.length, 3);
    // 降順ソート確認
    assertEquals(result[0].created_at >= result[1].created_at, true);
    assertEquals(result[1].created_at >= result[2].created_at, true);
    // 最新が先頭
    assertEquals(result[0].id, events[2].id);
  });
});

test("basic: post - EVENT送信 → OK受信、relay.hasEvent()確認", async () => {
  await withRelay(async (relay, ws) => {
    const id = await post(ws, "hello nostr", TEST_PUBKEY);

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assertExists(id);
    assertEquals(relay.hasEvent(id), true);

    // 受信メッセージから content を確認
    const found = relay.findEvent(id);
    assertExists(found);
    assertEquals(found.content, "hello nostr");
    assertEquals(found.kind, 1);
  });
});

test("basic: reply - e/pタグ付きEVENT送信、relay側でタグ検証", async () => {
  await withRelay(async (relay, ws) => {
    const targetPubkey =
      "bbbb000000000000000000000000000000000000000000000000000000000000";
    const targetEventId =
      "cccc000000000000000000000000000000000000000000000000000000000000";

    const id = await reply(
      ws,
      targetEventId,
      targetPubkey,
      "nice post",
      TEST_PUBKEY,
    );

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assertEquals(relay.hasEvent(id), true);

    const found = relay.findEvent(id);
    assertExists(found);
    assertEquals(found.content, "nice post");
    assertEquals(found.kind, 1);

    // e タグ確認
    const eTag = found.tags.find((t) => t[0] === "e");
    assertExists(eTag);
    assertEquals(eTag[1], targetEventId);
    assertEquals(eTag[3], "reply");

    // p タグ確認
    const pTag = found.tags.find((t) => t[0] === "p");
    assertExists(pTag);
    assertEquals(pTag[1], targetPubkey);
  });
});

test("basic: repost - kind:6 リポストイベント送信", async () => {
  await withRelay(async (relay, ws) => {
    const targetEvent = EventBuilder.kind1().content("original").build();

    const id = await repost(ws, targetEvent, TEST_PUBKEY);

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assertEquals(relay.hasEvent(id), true);

    const found = relay.findEvent(id);
    assertExists(found);
    assertEquals(found.kind, 6);

    // content にオリジナルイベントの JSON が含まれる
    const parsed = JSON.parse(found.content) as NostrEvent;
    assertEquals(parsed.id, targetEvent.id);

    // e/p タグ確認
    const eTag = found.tags.find((t) => t[0] === "e");
    assertExists(eTag);
    assertEquals(eTag[1], targetEvent.id);
  });
});

test("basic: like - kind:7 リアクションイベント送信", async () => {
  await withRelay(async (relay, ws) => {
    const targetEvent = EventBuilder.kind1().content("likable").build();
    const id = await like(
      ws,
      targetEvent.id,
      targetEvent.pubkey,
      TEST_PUBKEY,
    );

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assertEquals(relay.hasEvent(id), true);

    const found = relay.findEvent(id);
    assertExists(found);
    assertEquals(found.kind, 7);
    assertEquals(found.content, "+");

    const eTag = found.tags.find((t) => t[0] === "e");
    assertExists(eTag);
    assertEquals(eTag[1], targetEvent.id);
  });
});

test("basic: delete - kind:5 削除リクエスト送信、NIP-09処理確認", async () => {
  await withRelay(async (relay, ws) => {
    // 先にイベントを投稿
    const originalId = await post(ws, "to be deleted", TEST_PUBKEY);

    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    assertEquals(relay.hasEvent(originalId), true);

    // 削除リクエスト送信
    const delId = await deleteEvent(ws, originalId, TEST_PUBKEY);

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assertEquals(relay.hasEvent(delId), true);
    const found = relay.findEvent(delId);
    assertExists(found);
    assertEquals(found.kind, 5);

    // e タグに削除対象 ID
    const eTag = found.tags.find((t) => t[0] === "e");
    assertExists(eTag);
    assertEquals(eTag[1], originalId);
  });
});

test("basic: search - NIP-50 search フィルター、content部分一致", async () => {
  await withRelay(async (relay, ws) => {
    // 検索対象のイベントを登録
    const ev1 = EventBuilder.kind1().content("hello world").build();
    const ev2 = EventBuilder.kind1().content("hello nostr").build();
    const ev3 = EventBuilder.kind1().content("goodbye").build();
    relay.store(ev1);
    relay.store(ev2);
    relay.store(ev3);

    const results = await search(ws, "hello");

    // NIP-50 の search フィルターで content 部分一致
    assertEquals(results.length, 2);
    const ids = results.map((e) => e.id).sort();
    const expected = [ev1.id, ev2.id].sort();
    assertEquals(ids, expected);
  });
});

test("basic: profile - kind:0 metadata取得、JSON解析", async () => {
  await withRelay(async (relay, ws) => {
    const targetPubkey =
      "dddd000000000000000000000000000000000000000000000000000000000000";
    const meta = EventBuilder.kind0()
      .pubkey(targetPubkey)
      .content(JSON.stringify({ name: "Alice", about: "test user" }))
      .build();
    relay.store(meta);

    const result = await profile(ws, targetPubkey);

    assertExists(result);
    assertEquals(result.name, "Alice");
    assertEquals(result.about, "test user");
  });
});

test("basic: stream - リアルタイム購読 + streamEvents()で時間差配信", async () => {
  const { streamEvents } = await import("../../src/testing/mod.ts");

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

      // EOSE を待つ
      await new Promise<void>((resolve) => setTimeout(resolve, 20));

      // streamEvents でイベントを時間差配信
      const events = EventBuilder.bulk(3);
      const streamHandle = streamEvents(relay, events, { interval: 30 });

      // 配信完了を待つ
      await new Promise<void>((resolve) => setTimeout(resolve, 200));

      streamHandle.stop();
      handle.stop();

      assertEquals(received.length, 3);
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

test("basic: dm-post - kind:4 DM送信", async () => {
  await withRelay(async (relay, ws) => {
    const recipientPk =
      "eeee000000000000000000000000000000000000000000000000000000000000";

    const id = await dmPost(ws, recipientPk, "secret message", TEST_PUBKEY);

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assertEquals(relay.hasEvent(id), true);

    const found = relay.findEvent(id);
    assertExists(found);
    assertEquals(found.kind, 4);
    assertEquals(found.content, "mock-encrypted:secret message");

    const pTag = found.tags.find((t) => t[0] === "p");
    assertExists(pTag);
    assertEquals(pTag[1], recipientPk);
  });
});

test("basic: powa - 「ぽわ〜」投稿 → relay.hasEvent()で内容確認", async () => {
  await withRelay(async (relay, ws) => {
    const id = await powa(ws, TEST_PUBKEY);

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assertEquals(relay.hasEvent(id), true);
    const found = relay.findEvent(id);
    assertExists(found);
    assertEquals(found.content, "ぽわ〜");
    assertEquals(found.kind, 1);
  });
});

test("basic: puru - 「ぷる」投稿 → relay.hasEvent()で内容確認", async () => {
  await withRelay(async (relay, ws) => {
    const id = await puru(ws, TEST_PUBKEY);

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assertEquals(relay.hasEvent(id), true);
    const found = relay.findEvent(id);
    assertExists(found);
    assertEquals(found.content, "ぷる");
    assertEquals(found.kind, 1);
  });
});

test("basic: 複数リレー - 2リレーへの同時接続・送受信", async () => {
  const pool = new MockPool();
  const relay1 = pool.relay("wss://relay1.test");
  const relay2 = pool.relay("wss://relay2.test");

  const ev1 = EventBuilder.kind1().content("from relay1").build();
  const ev2 = EventBuilder.kind1().content("from relay2").build();
  relay1.store(ev1);
  relay2.store(ev2);

  pool.install();
  try {
    const ws1 = await openWs("wss://relay1.test");
    const ws2 = await openWs("wss://relay2.test");

    try {
      // 各リレーからタイムライン取得
      const [result1, result2] = await Promise.all([
        timeline(ws1),
        timeline(ws2),
      ]);

      assertEquals(result1.length, 1);
      assertEquals(result1[0].content, "from relay1");

      assertEquals(result2.length, 1);
      assertEquals(result2[0].content, "from relay2");

      // 各リレーに投稿
      const id1 = await post(ws1, "posted to relay1", TEST_PUBKEY);
      const id2 = await post(ws2, "posted to relay2", TEST_PUBKEY);

      await new Promise<void>((resolve) => setTimeout(resolve, 10));

      assertEquals(relay1.hasEvent(id1), true);
      assertEquals(relay2.hasEvent(id2), true);
      // 交差しない
      assertEquals(relay1.hasEvent(id2), false);
      assertEquals(relay2.hasEvent(id1), false);
    } finally {
      ws1.close();
      ws2.close();
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
  } finally {
    pool.uninstall();
  }
});

test("basic: 接続失敗 - 未登録URL → code:1006", async () => {
  const pool = new MockPool();
  // relay.test のみ登録し、unknown.test は登録しない
  pool.relay(TEST_RELAY);

  pool.install();
  try {
    const ws = new WebSocket("wss://unknown.test");

    const closeEvent = await new Promise<CloseEvent>((resolve) => {
      ws.onclose = (ev: CloseEvent) => resolve(ev);
    });

    assertEquals(closeEvent.code, 1006);
  } finally {
    pool.uninstall();
  }
});
