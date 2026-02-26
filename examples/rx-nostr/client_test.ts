/**
 * rx-nostr クライアント テスト
 *
 * tsunagiya MockRelay を使って rx-nostr クライアントの各コマンドをテスト。
 * rx-nostr 内部の非同期操作がテスト境界を超えるため sanitize を無効化。
 *
 * @module
 */

import { assertEquals, assertGreater, test } from "../_compat/mod.ts";
import { MockPool } from "../../src/mod.ts";
import type { NostrEvent } from "../../src/types.ts";
import { streamEvents } from "../../src/testing/mod.ts";

import {
  createRxNostr,
  deleteEvent,
  generateKey,
  like,
  post,
  seckeySigner,
  signEvent,
  stream,
  timeline,
  verifier,
} from "./client.ts";

const { sk, pk, hexSk } = generateKey();

/** テスト共通オプション: rx-nostr 内部の非同期リークを許容 */
const testOpts = { sanitizeResources: false, sanitizeOps: false };

test("rx-nostr: timeline (backward)", testOpts, async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.rx-tl.test");

  const ev1 = signEvent(sk, "first post");
  const ev2 = signEvent(sk, "second post");
  const ev3 = signEvent(sk, "third post");
  relay.store(ev1);
  relay.store(ev2);
  relay.store(ev3);

  pool.install();
  try {
    const rxNostr = createRxNostr({ verifier });
    rxNostr.setDefaultRelays(["wss://relay.rx-tl.test"]);

    const events = await timeline(rxNostr, { authors: [pk] });

    assertEquals(events.length, 3);
    // created_at 降順
    assertEquals(events[0].content, "third post");
    assertEquals(events[1].content, "second post");
    assertEquals(events[2].content, "first post");

    rxNostr.dispose();
  } finally {
    pool.uninstall();
  }
});

test("rx-nostr: post", testOpts, async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.rx-post.test");

  pool.install();
  try {
    const rxNostr = createRxNostr({
      verifier,
      signer: seckeySigner(hexSk),
    });
    rxNostr.setDefaultRelays(["wss://relay.rx-post.test"]);

    await post(rxNostr, "hello from rx-nostr");

    assertGreater(relay.countEvents(), 0);
    const posted = relay.received.filter((m) =>
      m[0] === "EVENT" &&
      (m[1] as NostrEvent).content === "hello from rx-nostr"
    );
    assertEquals(posted.length, 1);

    rxNostr.dispose();
  } finally {
    pool.uninstall();
  }
});

test("rx-nostr: like", testOpts, async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.rx-like.test");

  const targetEvent = signEvent(sk, "target post");
  relay.store(targetEvent);

  pool.install();
  try {
    const rxNostr = createRxNostr({
      verifier,
      signer: seckeySigner(hexSk),
    });
    rxNostr.setDefaultRelays(["wss://relay.rx-like.test"]);

    await like(rxNostr, targetEvent.id, targetEvent.pubkey);

    const reactions = relay.received.filter((m): m is ["EVENT", NostrEvent] =>
      m[0] === "EVENT" && (m[1] as NostrEvent).kind === 7
    );
    assertEquals(reactions.length, 1);
    assertEquals(reactions[0][1].content, "+");

    rxNostr.dispose();
  } finally {
    pool.uninstall();
  }
});

test("rx-nostr: delete", testOpts, async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.rx-del.test");

  const targetEvent = signEvent(sk, "to be deleted");
  relay.store(targetEvent);

  pool.install();
  try {
    const rxNostr = createRxNostr({
      verifier,
      signer: seckeySigner(hexSk),
    });
    rxNostr.setDefaultRelays(["wss://relay.rx-del.test"]);

    await deleteEvent(rxNostr, targetEvent.id);

    const deletions = relay.received.filter((m): m is ["EVENT", NostrEvent] =>
      m[0] === "EVENT" && (m[1] as NostrEvent).kind === 5
    );
    assertEquals(deletions.length, 1);
    const tags = deletions[0][1].tags;
    const eTag = tags.find((t) => t[0] === "e");
    assertEquals(eTag?.[1], targetEvent.id);

    rxNostr.dispose();
  } finally {
    pool.uninstall();
  }
});

test("rx-nostr: stream (forward)", testOpts, async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.rx-stream.test");

  pool.install();
  try {
    const rxNostr = createRxNostr({ verifier });
    rxNostr.setDefaultRelays(["wss://relay.rx-stream.test"]);

    const received: NostrEvent[] = [];
    const handle = stream(rxNostr, (ev) => {
      received.push(ev);
    });

    // 少し待ってからストリームイベントを配信
    await new Promise<void>((resolve) => setTimeout(resolve, 200));

    const streamedEvents = [
      signEvent(sk, "stream event 1"),
      signEvent(sk, "stream event 2"),
      signEvent(sk, "stream event 3"),
    ];
    const sh = streamEvents(relay, streamedEvents, { interval: 50 });

    // イベントが届くまで待つ
    await new Promise<void>((resolve) => setTimeout(resolve, 500));

    sh.stop();
    handle.stop();

    assertGreater(received.length, 0);
    const contents = received.map((e) => e.content);
    // ストリームで少なくとも1つ以上届いているはず
    const hasStreamEvent = contents.some((c) => c.startsWith("stream event"));
    assertEquals(hasStreamEvent, true);

    rxNostr.dispose();
  } finally {
    pool.uninstall();
  }
});

test("rx-nostr: 複数リレー", testOpts, async () => {
  const pool = new MockPool();
  const relay1 = pool.relay("wss://relay1.rx-multi.test");
  const relay2 = pool.relay("wss://relay2.rx-multi.test");

  relay1.store(signEvent(sk, "from relay1"));
  relay2.store(signEvent(sk, "from relay2"));

  pool.install();
  try {
    const rxNostr = createRxNostr({ verifier });
    rxNostr.setDefaultRelays([
      "wss://relay1.rx-multi.test",
      "wss://relay2.rx-multi.test",
    ]);

    const events = await timeline(rxNostr, { authors: [pk] });

    assertEquals(events.length, 2);
    const contents = events.map((e) => e.content).sort();
    assertEquals(contents, ["from relay1", "from relay2"]);

    rxNostr.dispose();
  } finally {
    pool.uninstall();
  }
});

test("rx-nostr: クリーンアップ (dispose)", testOpts, () => {
  const pool = new MockPool();
  pool.relay("wss://relay.rx-cleanup.test");

  pool.install();
  try {
    const rxNostr = createRxNostr({ verifier });
    rxNostr.setDefaultRelays(["wss://relay.rx-cleanup.test"]);

    // dispose 後はエラーなく終了する
    rxNostr.dispose();

    // 2回 dispose しても問題ない
    rxNostr.dispose();
  } finally {
    pool.uninstall();
  }
});
