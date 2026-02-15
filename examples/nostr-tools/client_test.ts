/**
 * nostr-tools クライアント モックテスト
 *
 * tsunagiya MockPool を使用して各コマンドの動作を検証する。
 * nostr-tools の SimplePool + 正規 BIP-340 署名を使用。
 *
 * @module
 */

import { assertEquals } from "@std/assert";
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
} from "nostr-tools/pure";
import { MockPool } from "../../src/mod.ts";
import {
  assertEventPublished,
  assertReceivedREQ,
} from "../../src/testing/mod.ts";
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
  timeline,
} from "./client.ts";
import type { ClientOptions } from "./client.ts";

// --- bootstrap: SimplePool の動的インポート ---
// nostr-tools/pool は WebSocket をモジュールロード時に参照するため、
// MockPool.install() 後に動的インポートが必要。
const _bootstrap = new MockPool();
_bootstrap.relay("wss://bootstrap");
_bootstrap.install();

const { SimplePool } = await import("nostr-tools/pool");

_bootstrap.uninstall();

// --- テスト用鍵ペア ---
const sk = generateSecretKey();
const pk = getPublicKey(sk);

let _ts = Math.floor(Date.now() / 1000);

/** 正規署名付きイベントを生成する */
function signEvent(
  content: string,
  kind = 1,
  tags: string[][] = [],
): NostrEvent {
  return finalizeEvent(
    { kind, created_at: _ts++, tags, content },
    sk,
  ) as unknown as NostrEvent;
}

/** sig を壊した不正イベントを生成する */
function corruptSig(event: NostrEvent): NostrEvent {
  return { ...event, sig: "0".repeat(128) };
}

/** テスト用 ClientOptions を生成する */
function createTestOpts(
  relays: string[],
): { opts: ClientOptions; simplePool: InstanceType<typeof SimplePool> } {
  const simplePool = new SimplePool();
  return {
    opts: { pool: simplePool, relays, sk },
    simplePool,
  };
}

// --- テストケース ---

Deno.test("nostr-tools: timeline", async () => {
  const mockPool = new MockPool();
  const relay = mockPool.relay("wss://relay.timeline.test");

  const ev1 = signEvent("hello timeline");
  const ev2 = signEvent("second note");
  relay.store(ev1);
  relay.store(ev2);

  mockPool.install();
  try {
    const { opts } = createTestOpts(["wss://relay.timeline.test"]);
    const result = await timeline(opts);

    assertEquals(result.ok, true);
    assertEquals(result.events!.length, 2);

    // REQ が送信されたことを検証
    assertReceivedREQ(relay, { kinds: [1] });
  } finally {
    mockPool.uninstall();
  }
});

Deno.test("nostr-tools: post", async () => {
  const mockPool = new MockPool();
  const relay = mockPool.relay("wss://relay.post.test");

  mockPool.install();
  try {
    const { opts } = createTestOpts(["wss://relay.post.test"]);
    const result = await post(opts, "hello from nostr-tools");

    assertEquals(result.ok, true);
    assertEquals(result.published!.content, "hello from nostr-tools");
    assertEquals(result.published!.kind, 1);
    assertEquals(result.published!.pubkey, pk);

    // リレーに到達したことを検証
    assertEventPublished(relay, result.published!.id);
  } finally {
    mockPool.uninstall();
  }
});

Deno.test("nostr-tools: reply", async () => {
  const mockPool = new MockPool();
  const relay = mockPool.relay("wss://relay.reply.test");

  // リプライ対象のイベント
  const target = signEvent("original note");
  relay.store(target);

  mockPool.install();
  try {
    const { opts } = createTestOpts(["wss://relay.reply.test"]);
    const result = await reply(opts, target.id, target.pubkey, "nice post!");

    assertEquals(result.ok, true);
    assertEquals(result.published!.kind, 1);
    assertEquals(result.published!.content, "nice post!");

    // e タグと p タグが正しいことを検証
    const eTags = result.published!.tags.filter((t) => t[0] === "e");
    const pTags = result.published!.tags.filter((t) => t[0] === "p");
    assertEquals(eTags.length, 1);
    assertEquals(eTags[0][1], target.id);
    assertEquals(pTags.length, 1);
    assertEquals(pTags[0][1], target.pubkey);

    assertEventPublished(relay, result.published!.id);
  } finally {
    mockPool.uninstall();
  }
});

Deno.test("nostr-tools: repost", async () => {
  const mockPool = new MockPool();
  const relay = mockPool.relay("wss://relay.repost.test");

  const target = signEvent("event to repost");
  relay.store(target);

  mockPool.install();
  try {
    const { opts } = createTestOpts(["wss://relay.repost.test"]);
    const result = await repost(opts, target.id, target.pubkey);

    assertEquals(result.ok, true);
    assertEquals(result.published!.kind, 6);

    const eTags = result.published!.tags.filter((t) => t[0] === "e");
    const pTags = result.published!.tags.filter((t) => t[0] === "p");
    assertEquals(eTags.length, 1);
    assertEquals(eTags[0][1], target.id);
    assertEquals(pTags.length, 1);
    assertEquals(pTags[0][1], target.pubkey);

    assertEventPublished(relay, result.published!.id);
  } finally {
    mockPool.uninstall();
  }
});

Deno.test("nostr-tools: like", async () => {
  const mockPool = new MockPool();
  const relay = mockPool.relay("wss://relay.like.test");

  const target = signEvent("event to like");
  relay.store(target);

  mockPool.install();
  try {
    const { opts } = createTestOpts(["wss://relay.like.test"]);
    const result = await like(opts, target.id, target.pubkey);

    assertEquals(result.ok, true);
    assertEquals(result.published!.kind, 7);
    assertEquals(result.published!.content, "+");

    const eTags = result.published!.tags.filter((t) => t[0] === "e");
    assertEquals(eTags[0][1], target.id);

    assertEventPublished(relay, result.published!.id);
  } finally {
    mockPool.uninstall();
  }
});

Deno.test("nostr-tools: delete", async () => {
  const mockPool = new MockPool();
  const relay = mockPool.relay("wss://relay.delete.test");

  const target = signEvent("event to delete");
  relay.store(target);

  mockPool.install();
  try {
    const { opts } = createTestOpts(["wss://relay.delete.test"]);
    const result = await deleteEvent(opts, target.id);

    assertEquals(result.ok, true);
    assertEquals(result.published!.kind, 5);

    const eTags = result.published!.tags.filter((t) => t[0] === "e");
    assertEquals(eTags.length, 1);
    assertEquals(eTags[0][1], target.id);

    assertEventPublished(relay, result.published!.id);
  } finally {
    mockPool.uninstall();
  }
});

Deno.test("nostr-tools: search", async () => {
  const mockPool = new MockPool();
  const relay = mockPool.relay("wss://relay.search.test");

  const ev1 = signEvent("nostr is great");
  const ev2 = signEvent("hello world");
  relay.store(ev1);
  relay.store(ev2);

  mockPool.install();
  try {
    const { opts } = createTestOpts(["wss://relay.search.test"]);
    const result = await search(opts, "nostr");

    assertEquals(result.ok, true);
    // NIP-50 search フィルターで REQ が送信されたことを検証
    assertReceivedREQ(relay, { kinds: [1], search: "nostr" });
  } finally {
    mockPool.uninstall();
  }
});

Deno.test("nostr-tools: profile", async () => {
  const mockPool = new MockPool();
  const relay = mockPool.relay("wss://relay.profile.test");

  const metadata = signEvent(
    JSON.stringify({ name: "testuser", about: "hello" }),
    0,
  );
  relay.store(metadata);

  mockPool.install();
  try {
    const { opts } = createTestOpts(["wss://relay.profile.test"]);
    const result = await profile(opts, pk);

    assertEquals(result.ok, true);
    assertEquals(result.events!.length, 1);

    const content = JSON.parse(result.events![0].content);
    assertEquals(content.name, "testuser");

    assertReceivedREQ(relay, { kinds: [0], authors: [pk] });
  } finally {
    mockPool.uninstall();
  }
});

Deno.test("nostr-tools: multi-relay aggregation", async () => {
  const mockPool = new MockPool();
  const relay1 = mockPool.relay("wss://relay1.multi.test");
  const relay2 = mockPool.relay("wss://relay2.multi.test");

  const ev1 = signEvent("from relay1");
  const ev2 = signEvent("from relay2");
  relay1.store(ev1);
  relay2.store(ev2);

  mockPool.install();
  try {
    const { opts } = createTestOpts([
      "wss://relay1.multi.test",
      "wss://relay2.multi.test",
    ]);
    const result = await timeline(opts);

    assertEquals(result.ok, true);
    assertEquals(result.events!.length, 2);
    const contents = result.events!.map((e) => e.content).sort();
    assertEquals(contents, ["from relay1", "from relay2"]);
  } finally {
    mockPool.uninstall();
  }
});

Deno.test("nostr-tools: rejects events with bad signatures", async () => {
  const mockPool = new MockPool();
  const relay = mockPool.relay("wss://relay.badsig.test");

  const goodEvent = signEvent("valid event");
  const badEvent = corruptSig(signEvent("invalid event"));
  relay.store(goodEvent);
  relay.store(badEvent);

  mockPool.install();
  try {
    const pool = new SimplePool();
    const received: NostrEvent[] = [];

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timeout waiting for EOSE")),
        5000,
      );
      pool.subscribe(
        ["wss://relay.badsig.test"],
        { kinds: [1] },
        {
          onevent(ev) {
            received.push(ev as unknown as NostrEvent);
          },
          oneose() {
            clearTimeout(timeout);
            resolve();
          },
        },
      );
    });

    // nostr-tools は不正署名のイベントをフィルタする
    assertEquals(received.length, 1);
    assertEquals(received[0].content, "valid event");
  } finally {
    mockPool.uninstall();
  }
});

Deno.test("nostr-tools: dm-post", async () => {
  const mockPool = new MockPool();
  const relay = mockPool.relay("wss://relay.dm.test");

  // DM の宛先鍵ペア
  const recipientSk = generateSecretKey();
  const recipientPk = getPublicKey(recipientSk);

  mockPool.install();
  try {
    const { opts } = createTestOpts(["wss://relay.dm.test"]);
    const result = await dmPost(opts, recipientPk, "secret message");

    assertEquals(result.ok, true);
    assertEquals(result.published!.kind, 4);
    assertEquals(result.published!.content, "secret message");

    const pTags = result.published!.tags.filter((t) => t[0] === "p");
    assertEquals(pTags.length, 1);
    assertEquals(pTags[0][1], recipientPk);

    assertEventPublished(relay, result.published!.id);
  } finally {
    mockPool.uninstall();
  }
});

Deno.test("nostr-tools: powa", async () => {
  const mockPool = new MockPool();
  const relay = mockPool.relay("wss://relay.powa.test");

  mockPool.install();
  try {
    const { opts } = createTestOpts(["wss://relay.powa.test"]);
    const result = await powa(opts);

    assertEquals(result.ok, true);
    assertEquals(result.published!.content, "ぽわ〜");
    assertEquals(result.published!.kind, 1);

    assertEventPublished(relay, result.published!.id);
  } finally {
    mockPool.uninstall();
  }
});

Deno.test("nostr-tools: puru", async () => {
  const mockPool = new MockPool();
  const relay = mockPool.relay("wss://relay.puru.test");

  mockPool.install();
  try {
    const { opts } = createTestOpts(["wss://relay.puru.test"]);
    const result = await puru(opts);

    assertEquals(result.ok, true);
    assertEquals(result.published!.content, "ぷる");
    assertEquals(result.published!.kind, 1);

    assertEventPublished(relay, result.published!.id);
  } finally {
    mockPool.uninstall();
  }
});

Deno.test("nostr-tools: assertion helpers", async () => {
  const mockPool = new MockPool();
  const relay = mockPool.relay("wss://relay.assert.test");

  mockPool.install();
  try {
    const { opts } = createTestOpts(["wss://relay.assert.test"]);

    // post で投稿
    const result = await post(opts, "assertion test");
    assertEquals(result.ok, true);

    // assertEventPublished でイベントが公開されたことを検証
    assertEventPublished(relay, result.published!.id);

    // timeline を取得して REQ のアサーション
    await timeline(opts);
    assertReceivedREQ(relay, { kinds: [1] });
  } finally {
    mockPool.uninstall();
  }
});
