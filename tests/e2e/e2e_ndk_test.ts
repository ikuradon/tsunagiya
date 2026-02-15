/**
 * NDK (Nostr Development Kit) E2Eテスト
 *
 * @nostr-dev-kit/ndk を使用して tsunagiya MockRelay と通信。
 * 正規の BIP-340 Schnorr 署名を使用し、署名検証を無効化しない。
 *
 * 注意: Deno の npm compat では、npm モジュールがロード時に WebSocket 参照を
 * 捕捉するため、MockPool.install() 後に動的 import する必要がある。
 *
 * NDK は内部でタイマーや非同期処理を管理するため、Deno のリソース/オペレーション
 * サニタイザーを無効化している。
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

// NDK は WebSocket を使うので、bootstrap 後に dynamic import する。
const _bootstrap = new MockPool();
_bootstrap.relay("wss://bootstrap");
_bootstrap.install();

const ndkMod = await import("@nostr-dev-kit/ndk");
const NDK = ndkMod.default;
type NDK = InstanceType<typeof NDK>;
const NDKEvent = ndkMod.NDKEvent;
type NDKEvent = InstanceType<typeof NDKEvent>;
const NDKPrivateKeySigner = ndkMod.NDKPrivateKeySigner;

_bootstrap.uninstall();

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

/** NDK インスタンスを生成する */
function createNDK(relayUrls: string[], withSigner = false): NDK {
  const opts: Record<string, unknown> = {
    explicitRelayUrls: relayUrls,
    autoConnectUserRelays: false,
    enableOutboxModel: false,
  };
  if (withSigner) {
    opts.signer = new NDKPrivateKeySigner(hexSk);
  }
  return new NDK(opts);
}

/** NDK を安全にクリーンアップする */
function cleanupNDK(ndk: NDK): void {
  try {
    for (const r of ndk.pool.relays.values()) {
      try {
        r.disconnect();
      } catch {
        // ignore individual relay disconnect errors
      }
    }
  } catch {
    // cleanup errors are expected during test teardown
  }
}

// NDK は内部でタイマーや非同期処理を管理するため、サニタイザーを無効化
const testOpts = { sanitizeResources: false, sanitizeOps: false };

Deno.test("ndk: subscribe receives signed events", testOpts, async () => {
  const mockPool = new MockPool();
  const relay = mockPool.relay("wss://relay.ndk.test");

  const event = signEvent("hello NDK");
  relay.store(event);

  mockPool.install();
  try {
    const ndk = createNDK(["wss://relay.ndk.test"]);
    await ndk.connect();

    const received: NDKEvent[] = [];

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timeout waiting for EOSE")),
        5000,
      );
      const sub = ndk.subscribe({ kinds: [1], authors: [pk] });
      sub.on("event", (ev: NDKEvent) => received.push(ev));
      sub.on("eose", () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    assertEquals(received.length, 1);
    assertEquals(received[0].content, "hello NDK");
    assertEquals(received[0].pubkey, pk);

    cleanupNDK(ndk);
  } finally {
    mockPool.uninstall();
  }
});

Deno.test("ndk: publish event", testOpts, async () => {
  const mockPool = new MockPool();
  const relay = mockPool.relay("wss://relay.ndk.test");

  mockPool.install();
  try {
    const ndk = createNDK(["wss://relay.ndk.test"], true);
    await ndk.connect();

    // ndk.connect() が resolve した時点でリレーは接続済み
    // NDK の内部処理が完了するのを少し待つ
    await new Promise((r) => setTimeout(r, 50));

    const ndkEvent = new NDKEvent(ndk);
    ndkEvent.kind = 1;
    ndkEvent.content = "published via NDK";
    ndkEvent.tags = [];
    await ndkEvent.publish();

    assertGreater(relay.countEvents(), 0);
    const received = relay.received.filter((m) =>
      m[0] === "EVENT" && m[1].content === "published via NDK"
    );
    assertEquals(received.length, 1);

    cleanupNDK(ndk);
  } finally {
    mockPool.uninstall();
  }
});

Deno.test("ndk: multi-relay subscribe", testOpts, async () => {
  const mockPool = new MockPool();
  const relay1 = mockPool.relay("wss://relay1.ndk.test");
  const relay2 = mockPool.relay("wss://relay2.ndk.test");

  relay1.store(signEvent("from relay1"));
  relay2.store(signEvent("from relay2"));

  mockPool.install();
  try {
    const ndk = createNDK([
      "wss://relay1.ndk.test",
      "wss://relay2.ndk.test",
    ]);
    await ndk.connect();

    const received: NDKEvent[] = [];

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timeout waiting for EOSE")),
        5000,
      );
      const sub = ndk.subscribe({ kinds: [1], authors: [pk] });
      sub.on("event", (ev: NDKEvent) => received.push(ev));
      sub.on("eose", () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    // NDK deduplicates by event id, so we expect 2 unique events
    assertEquals(received.length, 2);
    const contents = received.map((e) => e.content).sort();
    assertEquals(contents, ["from relay1", "from relay2"]);

    cleanupNDK(ndk);
  } finally {
    mockPool.uninstall();
  }
});

Deno.test("ndk: rejects events with bad signatures", testOpts, async () => {
  const mockPool = new MockPool();
  const relay = mockPool.relay("wss://relay.ndk.test");

  const goodEvent = signEvent("valid event");
  const badEvent = corruptSig(signEvent("invalid event"));
  relay.store(goodEvent);
  relay.store(badEvent);

  mockPool.install();
  try {
    const ndk = createNDK(["wss://relay.ndk.test"]);
    await ndk.connect();

    const received: NDKEvent[] = [];

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timeout waiting for EOSE")),
        5000,
      );
      const sub = ndk.subscribe({ kinds: [1] });
      sub.on("event", (ev: NDKEvent) => received.push(ev));
      sub.on("eose", () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    assertEquals(received.length, 1);
    assertEquals(received[0].content, "valid event");

    cleanupNDK(ndk);
  } finally {
    mockPool.uninstall();
  }
});
