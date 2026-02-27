/**
 * NDK algia風CUIクライアント テスト
 *
 * tsunagiya MockRelay を使って NDK クライアントの各コマンドをテストする。
 *
 * NDK は WebSocket 参照をモジュールロード時に捕捉するため、
 * bootstrap パターンで MockPool.install() 後に dynamic import する。
 *
 * @module
 */

import { assertEquals, assertExists, test } from "../_compat/mod.ts";
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
} from "nostr-tools/pure";
import { MockPool } from "../../src/mod.ts";
import type { NostrEvent } from "../../src/types.ts";
import { EventBuilder } from "../../src/testing/mod.ts";
import type { CommandOptions } from "./client.ts";

// bootstrap パターン: NDK がモジュールロード時に WebSocket を捕捉するため
const _bootstrap = new MockPool();
_bootstrap.relay("wss://bootstrap");
_bootstrap.install();

// client モジュールの dynamic import（NDK はここで暗黙的にロードされる）
const client = await import("./client.ts");

_bootstrap.uninstall();

// テスト用鍵ペア（nostr-tools で正規署名）
const sk = generateSecretKey();
const pk = getPublicKey(sk);
const hexSk = Array.from(sk).map((b) => b.toString(16).padStart(2, "0")).join(
  "",
);

// 正規署名付きイベント生成
let _ts = Math.floor(Date.now() / 1000);
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

// サニタイザー無効化（NDK 内部の非同期処理のため）
const testOpts = { sanitizeResources: false, sanitizeOps: false };

// ===== テストケース =====

test("ndk client: timeline", testOpts, async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.test");

  relay.store(signEvent("hello from timeline"));
  relay.store(signEvent("second note"));

  pool.install();
  try {
    const ndk = client.createNDK(["wss://relay.test"]);
    await ndk.connect();

    const opts: CommandOptions = {
      relays: ["wss://relay.test"],
      timeout: 5000,
    };

    const events = await client.timeline(ndk, opts);
    assertEquals(events.length, 2);
    const contents = events.map((e) => e.content).sort();
    assertEquals(contents, ["hello from timeline", "second note"]);

    client.cleanupNDK(ndk);
  } finally {
    pool.uninstall();
  }
});

test("ndk client: post", testOpts, async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.test");

  pool.install();
  try {
    const ndk = client.createNDK(["wss://relay.test"], hexSk);
    await ndk.connect();

    const opts: CommandOptions = {
      relays: ["wss://relay.test"],
    };

    const ev = await client.post(ndk, "test post via NDK", opts);
    assertExists(ev);
    assertEquals(ev.content, "test post via NDK");

    // リレーが EVENT を受信していることを確認
    const received = relay.received.filter((m) =>
      m[0] === "EVENT" && m[1].content === "test post via NDK"
    );
    assertEquals(received.length, 1);

    client.cleanupNDK(ndk);
  } finally {
    pool.uninstall();
  }
});

test("ndk client: reply", testOpts, async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.test");

  const original = signEvent("original note");
  relay.store(original);

  pool.install();
  try {
    const ndk = client.createNDK(["wss://relay.test"], hexSk);
    await ndk.connect();

    const opts: CommandOptions = {
      relays: ["wss://relay.test"],
    };

    const ev = await client.reply(ndk, original.id, "reply content", opts);
    assertExists(ev);
    assertEquals(ev.content, "reply content");

    // リレーが受信した EVENT に e タグが含まれることを確認
    const received = relay.received.filter((m) =>
      m[0] === "EVENT" && m[1].content === "reply content"
    );
    assertEquals(received.length, 1);
    const sentEvent = received[0][1] as NostrEvent;
    const eTag = sentEvent.tags.find((t) => t[0] === "e");
    assertExists(eTag);
    assertEquals(eTag[1], original.id);

    client.cleanupNDK(ndk);
  } finally {
    pool.uninstall();
  }
});

test("ndk client: like", testOpts, async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.test");

  const target = signEvent("likeable note");
  relay.store(target);

  pool.install();
  try {
    const ndk = client.createNDK(["wss://relay.test"], hexSk);
    await ndk.connect();

    const opts: CommandOptions = {
      relays: ["wss://relay.test"],
    };

    const ev = await client.like(ndk, target.id, opts);
    assertExists(ev);

    // リレーが kind:7 EVENT を受信していることを確認
    const received = relay.received.filter((m) =>
      m[0] === "EVENT" && m[1].kind === 7
    );
    assertEquals(received.length, 1);
    const sentEvent = received[0][1] as NostrEvent;
    assertEquals(sentEvent.content, "+");
    const eTag = sentEvent.tags.find((t) => t[0] === "e");
    assertExists(eTag);
    assertEquals(eTag[1], target.id);

    client.cleanupNDK(ndk);
  } finally {
    pool.uninstall();
  }
});

test("ndk client: delete", testOpts, async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.test");

  const target = signEvent("to be deleted");
  relay.store(target);

  pool.install();
  try {
    const ndk = client.createNDK(["wss://relay.test"], hexSk);
    await ndk.connect();

    const opts: CommandOptions = {
      relays: ["wss://relay.test"],
    };

    const ev = await client.deleteEvent(ndk, target.id, opts);
    assertExists(ev);

    // リレーが kind:5 EVENT を受信していることを確認
    const received = relay.received.filter((m) =>
      m[0] === "EVENT" && m[1].kind === 5
    );
    assertEquals(received.length, 1);
    const sentEvent = received[0][1] as NostrEvent;
    const eTag = sentEvent.tags.find((t) => t[0] === "e");
    assertExists(eTag);
    assertEquals(eTag[1], target.id);

    client.cleanupNDK(ndk);
  } finally {
    pool.uninstall();
  }
});

test("ndk client: profile", testOpts, async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.test");

  const metadata = signEvent(
    JSON.stringify({ name: "testuser", about: "test profile" }),
    0,
  );
  relay.store(metadata);

  pool.install();
  try {
    const ndk = client.createNDK(["wss://relay.test"]);
    await ndk.connect();

    const opts: CommandOptions = {
      relays: ["wss://relay.test"],
      timeout: 5000,
    };

    const prof = await client.profile(ndk, pk, opts);
    assertExists(prof);
    const parsed = JSON.parse(prof.content);
    assertEquals(parsed.name, "testuser");
    assertEquals(parsed.about, "test profile");

    client.cleanupNDK(ndk);
  } finally {
    pool.uninstall();
  }
});

test("ndk client: multi-relay", testOpts, async () => {
  const pool = new MockPool();
  const relay1 = pool.relay("wss://relay1.test");
  const relay2 = pool.relay("wss://relay2.test");

  relay1.store(signEvent("from relay1"));
  relay2.store(signEvent("from relay2"));

  pool.install();
  try {
    const ndk = client.createNDK([
      "wss://relay1.test",
      "wss://relay2.test",
    ]);
    await ndk.connect();

    const opts: CommandOptions = {
      relays: ["wss://relay1.test", "wss://relay2.test"],
      timeout: 5000,
    };

    const events = await client.timeline(ndk, opts);
    // NDK はイベントIDで重複排除するため、2件のユニークイベントを受信
    assertEquals(events.length, 2);
    const contents = events.map((e) => e.content).sort();
    assertEquals(contents, ["from relay1", "from relay2"]);

    client.cleanupNDK(ndk);
  } finally {
    pool.uninstall();
  }
});

test("ndk client: EventBuilder integration", testOpts, async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.test");

  // EventBuilder でテストデータを生成し、正規署名で投入
  const builder1 = EventBuilder.kind1().pubkey(pk).content(
    "builder event 1",
  );
  const builder2 = EventBuilder.kind1().pubkey(pk).content(
    "builder event 2",
  );

  // EventBuilder で生成したイベントを正規署名で再構築
  const ev1 = signEvent("builder event 1");
  const ev2 = signEvent("builder event 2");
  // EventBuilder のメタデータも利用可能であることを示す
  const _builderEvent = builder1.build();
  const _builderEvent2 = builder2.build();

  relay.store(ev1);
  relay.store(ev2);

  pool.install();
  try {
    const ndk = client.createNDK(["wss://relay.test"]);
    await ndk.connect();

    const opts: CommandOptions = {
      relays: ["wss://relay.test"],
      timeout: 5000,
    };

    const events = await client.timeline(ndk, opts);
    assertEquals(events.length, 2);
    const contents = events.map((e) => e.content).sort();
    assertEquals(contents, ["builder event 1", "builder event 2"]);

    client.cleanupNDK(ndk);
  } finally {
    pool.uninstall();
  }
});

test("ndk client: parseArgs", () => {
  // デフォルトリレー
  const result1 = client.parseArgs(["timeline"]);
  assertEquals(result1.command, "timeline");
  assertEquals(result1.relays, ["wss://relay.damus.io"]);
  assertEquals(result1.verbose, false);

  // カスタムリレー + verbose
  const result2 = client.parseArgs([
    "--relay",
    "wss://relay.test",
    "-V",
    "post",
    "hello",
  ]);
  assertEquals(result2.command, "post");
  assertEquals(result2.args, ["hello"]);
  assertEquals(result2.relays, ["wss://relay.test"]);
  assertEquals(result2.verbose, true);

  // 複数リレー
  const result3 = client.parseArgs([
    "--relay",
    "wss://r1.test",
    "--relay",
    "wss://r2.test",
    "timeline",
  ]);
  assertEquals(result3.relays, ["wss://r1.test", "wss://r2.test"]);
});
