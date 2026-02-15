/**
 * rx-nostr E2Eテスト
 *
 * rx-nostr を使用して tsunagiya MockRelay と通信。
 * @rx-nostr/crypto の verifier で署名検証を有効化。
 *
 * 注意: Deno の npm compat では、npm モジュールがロード時に WebSocket 参照を
 * 捕捉するため、MockPool.install() 後に動的 import する必要がある。
 *
 * @module
 */

import { assertEquals, assertGreater } from "@std/assert";
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
} from "nostr-tools/pure";
import { MockPool } from "../../src/mod.ts";
import type { NostrEvent } from "../../src/types.ts";

// rx-nostr は WebSocket を使うので、bootstrap 後に dynamic import する。
const _bootstrap = new MockPool();
_bootstrap.relay("wss://bootstrap");
_bootstrap.install();

const rxNostrMod = await import("rx-nostr");
const cryptoMod = await import("@rx-nostr/crypto");

_bootstrap.uninstall();

const { createRxNostr, createRxBackwardReq } = rxNostrMod;
const { verifier, seckeySigner } = cryptoMod;

const sk = generateSecretKey();
const pk = getPublicKey(sk);
const hexSk = Array.from(sk).map((b) => b.toString(16).padStart(2, "0")).join(
  "",
);

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

Deno.test("rx-nostr: subscribe receives signed events", async () => {
  const mockPool = new MockPool();
  const relay = mockPool.relay("wss://relay.rx-nostr.test");

  const event = signEvent("hello rx-nostr");
  relay.store(event);

  mockPool.install();
  try {
    const rxNostr = createRxNostr({ verifier });
    rxNostr.setDefaultRelays(["wss://relay.rx-nostr.test"]);

    const rxReq = createRxBackwardReq();
    const received: NostrEvent[] = [];

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timeout waiting for completion")),
        5000,
      );
      rxNostr.use(rxReq).subscribe({
        next: (packet) => {
          received.push(packet.event as unknown as NostrEvent);
        },
        complete: () => {
          clearTimeout(timeout);
          resolve();
        },
      });
      rxReq.emit({ kinds: [1], authors: [pk] });
      rxReq.over();
    });

    assertEquals(received.length, 1);
    assertEquals(received[0].content, "hello rx-nostr");
    assertEquals(received[0].pubkey, pk);

    rxNostr.dispose();
  } finally {
    mockPool.uninstall();
  }
});

Deno.test("rx-nostr: publish event", async () => {
  const mockPool = new MockPool();
  const relay = mockPool.relay("wss://relay.rx-nostr.test");

  mockPool.install();
  try {
    const rxNostr = createRxNostr({
      verifier,
      signer: seckeySigner(hexSk),
    });
    rxNostr.setDefaultRelays(["wss://relay.rx-nostr.test"]);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timeout waiting for send")),
        5000,
      );
      rxNostr.send({
        kind: 1,
        content: "published via rx-nostr",
        tags: [],
      }).subscribe({
        next: () => {},
        complete: () => {
          clearTimeout(timeout);
          resolve();
        },
        error: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });
    });

    assertGreater(relay.countEvents(), 0);
    const received = relay.received.filter((m) =>
      m[0] === "EVENT" && m[1].content === "published via rx-nostr"
    );
    assertEquals(received.length, 1);

    rxNostr.dispose();
  } finally {
    mockPool.uninstall();
  }
});

Deno.test("rx-nostr: multi-relay subscribe", async () => {
  const mockPool = new MockPool();
  const relay1 = mockPool.relay("wss://relay1.rx-nostr.test");
  const relay2 = mockPool.relay("wss://relay2.rx-nostr.test");

  relay1.store(signEvent("from relay1"));
  relay2.store(signEvent("from relay2"));

  mockPool.install();
  try {
    const rxNostr = createRxNostr({ verifier });
    rxNostr.setDefaultRelays([
      "wss://relay1.rx-nostr.test",
      "wss://relay2.rx-nostr.test",
    ]);

    const rxReq = createRxBackwardReq();
    const received: NostrEvent[] = [];

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timeout waiting for completion")),
        5000,
      );
      rxNostr.use(rxReq).subscribe({
        next: (packet) => {
          received.push(packet.event as unknown as NostrEvent);
        },
        complete: () => {
          clearTimeout(timeout);
          resolve();
        },
      });
      rxReq.emit({ kinds: [1], authors: [pk] });
      rxReq.over();
    });

    assertEquals(received.length, 2);
    const contents = received.map((e) => e.content).sort();
    assertEquals(contents, ["from relay1", "from relay2"]);

    rxNostr.dispose();
  } finally {
    mockPool.uninstall();
  }
});

Deno.test("rx-nostr: rejects events with bad signatures", async () => {
  const mockPool = new MockPool();
  const relay = mockPool.relay("wss://relay.rx-nostr.test");

  const goodEvent = signEvent("valid event");
  const badEvent = corruptSig(signEvent("invalid event"));
  relay.store(goodEvent);
  relay.store(badEvent);

  mockPool.install();
  try {
    const rxNostr = createRxNostr({ verifier });
    rxNostr.setDefaultRelays(["wss://relay.rx-nostr.test"]);

    const rxReq = createRxBackwardReq();
    const received: NostrEvent[] = [];

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timeout waiting for completion")),
        5000,
      );
      rxNostr.use(rxReq).subscribe({
        next: (packet) => {
          received.push(packet.event as unknown as NostrEvent);
        },
        complete: () => {
          clearTimeout(timeout);
          resolve();
        },
      });
      rxReq.emit({ kinds: [1] });
      rxReq.over();
    });

    assertEquals(received.length, 1);
    assertEquals(received[0].content, "valid event");

    rxNostr.dispose();
  } finally {
    mockPool.uninstall();
  }
});
