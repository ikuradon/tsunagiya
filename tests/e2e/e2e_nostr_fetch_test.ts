/**
 * nostr-fetch E2Eテスト
 *
 * nostr-fetch の NostrFetcher を使用して tsunagiya MockRelay と通信。
 * 正規の BIP-340 Schnorr 署名を使用し、署名検証を無効化しない。
 *
 * 注意: Deno の npm compat では、npm モジュールがロード時に WebSocket 参照を
 * 捕捉するため、MockPool.install() 後に動的 import する必要がある。
 *
 * nostr-fetch は内部でタイマーや非同期処理を管理するため、Deno のリソース/オペレーション
 * サニタイザーを無効化している。
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
import type { NostrEvent } from "../../src/types.ts";

// nostr-tools/pure は WebSocket を使わないので static import OK。
// nostr-fetch は WebSocket を使うので、bootstrap 後に dynamic import する。

const _bootstrap = new MockPool();
_bootstrap.relay("wss://bootstrap");
_bootstrap.install();

const { NostrFetcher } = await import("nostr-fetch");

_bootstrap.uninstall();

const sk = generateSecretKey();
const pk = getPublicKey(sk);

// nostr-fetch はデフォルトで until=現在時刻 なので、過去のタイムスタンプを使う
let _ts = Math.floor(Date.now() / 1000) - 3600; // 1時間前から開始

/** 正規署名付きイベントを生成する */
function signEvent(content: string, kind = 1): NostrEvent {
  return finalizeEvent(
    { kind, created_at: _ts++, tags: [], content },
    sk,
  ) as unknown as NostrEvent;
}

// nostr-fetch は内部でタイマーや非同期処理を管理するため、サニタイザーを無効化
const testOpts = { sanitizeResources: false, sanitizeOps: false };

Deno.test(
  "nostr-fetch: fetchAllEvents receives signed events",
  testOpts,
  async () => {
    const mockPool = new MockPool();
    const relay = mockPool.relay("wss://relay.nostr-fetch.test");

    const event1 = signEvent("hello nostr-fetch");
    const event2 = signEvent("second event");
    relay.store(event1);
    relay.store(event2);

    mockPool.install();
    try {
      const fetcher = NostrFetcher.init();

      const events = await fetcher.fetchAllEvents(
        ["wss://relay.nostr-fetch.test"],
        { kinds: [1], authors: [pk] },
        {},
      );

      assertEquals(events.length, 2);
      const contents = events.map((e) => e.content).sort();
      assertEquals(contents, ["hello nostr-fetch", "second event"]);
      assertEquals(events[0].pubkey, pk);

      fetcher.shutdown();
    } finally {
      mockPool.uninstall();
    }
  },
);

Deno.test(
  "nostr-fetch: fetchLastEvent retrieves most recent event",
  testOpts,
  async () => {
    const mockPool = new MockPool();
    const relay = mockPool.relay("wss://relay.nostr-fetch.test");

    const event1 = signEvent("first event");
    const event2 = signEvent("last event");
    relay.store(event1);
    relay.store(event2);

    mockPool.install();
    try {
      const fetcher = NostrFetcher.init();

      const lastEvent = await fetcher.fetchLastEvent(
        ["wss://relay.nostr-fetch.test"],
        { kinds: [1], authors: [pk] },
        {},
      );

      assertEquals(lastEvent?.content, "last event");
      assertEquals(lastEvent?.pubkey, pk);

      fetcher.shutdown();
    } finally {
      mockPool.uninstall();
    }
  },
);

Deno.test("nostr-fetch: multi-relay fetch", testOpts, async () => {
  const mockPool = new MockPool();
  const relay1 = mockPool.relay("wss://relay1.nostr-fetch.test");
  const relay2 = mockPool.relay("wss://relay2.nostr-fetch.test");

  const event1 = signEvent("from relay1");
  const event2 = signEvent("from relay2");
  relay1.store(event1);
  relay2.store(event2);

  mockPool.install();
  try {
    const fetcher = NostrFetcher.init();

    const events = await fetcher.fetchAllEvents(
      ["wss://relay1.nostr-fetch.test", "wss://relay2.nostr-fetch.test"],
      { kinds: [1], authors: [pk] },
      {},
    );

    assertEquals(events.length, 2);
    const contents = events.map((e) => e.content).sort();
    assertEquals(contents, ["from relay1", "from relay2"]);

    fetcher.shutdown();
  } finally {
    mockPool.uninstall();
  }
});

Deno.test(
  "nostr-fetch: allEventsIterator streams events",
  testOpts,
  async () => {
    const mockPool = new MockPool();
    const relay = mockPool.relay("wss://relay.nostr-fetch.test");

    const event1 = signEvent("streamed event 1");
    const event2 = signEvent("streamed event 2");
    const event3 = signEvent("streamed event 3");
    relay.store(event1);
    relay.store(event2);
    relay.store(event3);

    mockPool.install();
    try {
      const fetcher = NostrFetcher.init();

      const received: NostrEvent[] = [];
      const iterator = fetcher.allEventsIterator(
        ["wss://relay.nostr-fetch.test"],
        { kinds: [1], authors: [pk] },
        {},
      );

      for await (const ev of iterator) {
        received.push(ev as unknown as NostrEvent);
      }

      assertEquals(received.length, 3);
      const contents = received.map((e) => e.content).sort();
      assertEquals(contents, [
        "streamed event 1",
        "streamed event 2",
        "streamed event 3",
      ]);

      fetcher.shutdown();
    } finally {
      mockPool.uninstall();
    }
  },
);
