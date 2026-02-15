/**
 * nostr-tools E2Eテスト
 *
 * nostr-tools v2 の SimplePool を使用して tsunagiya MockRelay と通信。
 * 正規の BIP-340 Schnorr 署名を使用し、署名検証を無効化しない。
 *
 * 注意: Deno の npm compat では、npm モジュールがロード時に WebSocket 参照を
 * 捕捉するため、MockPool.install() 後に動的 import する必要がある。
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
// nostr-tools/pool は WebSocket を使うので、bootstrap 後に dynamic import する。

const _bootstrap = new MockPool();
_bootstrap.relay("wss://bootstrap");
_bootstrap.install();

const { SimplePool } = await import("nostr-tools/pool");

_bootstrap.uninstall();

const sk = generateSecretKey();
const pk = getPublicKey(sk);

let _ts = Math.floor(Date.now() / 1000);

/** 正規署名付きイベントを生成する */
function signEvent(content: string, kind = 1): NostrEvent {
  return finalizeEvent(
    { kind, created_at: _ts++, tags: [], content },
    sk,
  ) as unknown as NostrEvent;
}

/** sig を壊した不正イベントを生成する */
function corruptSig(event: NostrEvent): NostrEvent {
  return { ...event, sig: "0".repeat(128) };
}

Deno.test("nostr-tools: subscribe receives signed events", async () => {
  const mockPool = new MockPool();
  const relay = mockPool.relay("wss://relay.nostr-tools.test");

  const event = signEvent("hello nostr-tools");
  relay.store(event);

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
        ["wss://relay.nostr-tools.test"],
        { kinds: [1], authors: [pk] },
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

    assertEquals(received.length, 1);
    assertEquals(received[0].content, "hello nostr-tools");
    assertEquals(received[0].pubkey, pk);
  } finally {
    mockPool.uninstall();
  }
});

Deno.test("nostr-tools: publish event", async () => {
  const mockPool = new MockPool();
  const relay = mockPool.relay("wss://relay.nostr-tools.test");

  mockPool.install();
  try {
    const pool = new SimplePool();

    const event = finalizeEvent({
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: "published via nostr-tools",
    }, sk);

    await Promise.any(
      pool.publish(["wss://relay.nostr-tools.test"], event),
    );

    assertEquals(relay.hasEvent(event.id), true);
    const stored = relay.findEvent(event.id);
    assertEquals(stored?.content, "published via nostr-tools");
  } finally {
    mockPool.uninstall();
  }
});

Deno.test("nostr-tools: multi-relay subscribe", async () => {
  const mockPool = new MockPool();
  const relay1 = mockPool.relay("wss://relay1.nostr-tools.test");
  const relay2 = mockPool.relay("wss://relay2.nostr-tools.test");

  const event1 = signEvent("from relay1");
  const event2 = signEvent("from relay2");
  relay1.store(event1);
  relay2.store(event2);

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
        ["wss://relay1.nostr-tools.test", "wss://relay2.nostr-tools.test"],
        { kinds: [1], authors: [pk] },
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

    assertEquals(received.length, 2);
    const contents = received.map((e) => e.content).sort();
    assertEquals(contents, ["from relay1", "from relay2"]);
  } finally {
    mockPool.uninstall();
  }
});

Deno.test("nostr-tools: rejects events with bad signatures", async () => {
  const mockPool = new MockPool();
  const relay = mockPool.relay("wss://relay.nostr-tools.test");

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
        ["wss://relay.nostr-tools.test"],
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

    assertEquals(received.length, 1);
    assertEquals(received[0].content, "valid event");
  } finally {
    mockPool.uninstall();
  }
});
