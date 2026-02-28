/**
 * nostr-tools 署名統合テスト
 *
 * EventSigner/EventVerifier を nostr-tools の暗号関数で実装し、
 * EventBuilder.buildWith() と MockRelay.setVerifier() の統合テスト。
 *
 * @module
 */

import { assertEquals, test } from "../_compat/mod.ts";
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  verifyEvent,
} from "nostr-tools/pure";
import { MockPool } from "../../src/mod.ts";
import { EventBuilder } from "../../src/testing/mod.ts";
import type {
  EventSigner,
  EventVerifier,
  NostrEvent,
  UnsignedEvent,
} from "../../src/types.ts";

// テスト用鍵ペア
const sk = generateSecretKey();
const pk = getPublicKey(sk);

/** nostr-tools ベースの EventSigner */
function createSigner(secretKey: Uint8Array): EventSigner {
  return {
    getPublicKey: () => getPublicKey(secretKey),
    signEvent: (event: UnsignedEvent) => {
      const finalized = finalizeEvent(
        event,
        secretKey,
      ) as unknown as NostrEvent;
      return { id: finalized.id, sig: finalized.sig };
    },
  };
}

/** nostr-tools ベースの EventVerifier */
const nostrToolsVerifier: EventVerifier = {
  verifyEvent: (event: NostrEvent) => {
    return verifyEvent(event as Parameters<typeof verifyEvent>[0]);
  },
};

test("nostr-tools signing: buildWith creates valid signed event", async () => {
  const signer = createSigner(sk);
  const event = await EventBuilder.kind1()
    .content("signed with nostr-tools")
    .buildWith(signer);

  assertEquals(event.pubkey, pk);
  assertEquals(event.content, "signed with nostr-tools");
  assertEquals(event.kind, 1);
  assertEquals(typeof event.id, "string");
  assertEquals(typeof event.sig, "string");

  // nostr-tools で署名検証
  const valid = verifyEvent(event as Parameters<typeof verifyEvent>[0]);
  assertEquals(valid, true);
});

test("nostr-tools signing: verifier accepts valid signature", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.nt-sign-accept.test");
  relay.setVerifier(nostrToolsVerifier);

  const signer = createSigner(sk);
  const event = await EventBuilder.kind1()
    .content("valid sig")
    .buildWith(signer);

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.nt-sign-accept.test");
    await new Promise<void>((resolve) => {
      ws.onopen = () => resolve();
    });

    const messages: string[] = [];
    ws.addEventListener("message", (ev: MessageEvent) => {
      messages.push(ev.data as string);
    });

    ws.send(JSON.stringify(["EVENT", event]));
    await new Promise((r) => setTimeout(r, 50));

    const ok = messages.find((m) => {
      const parsed = JSON.parse(m);
      return parsed[0] === "OK" && parsed[1] === event.id;
    });
    const parsed = JSON.parse(ok!);
    assertEquals(parsed[2], true);

    ws.close();
  } finally {
    pool.uninstall();
  }
});

test("nostr-tools signing: verifier rejects invalid signature", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.nt-sign-reject.test");
  relay.setVerifier(nostrToolsVerifier);

  // 不正な署名のイベント（buildWith を使わないモック署名）
  const event = EventBuilder.kind1()
    .content("bad sig")
    .pubkey(pk)
    .build();

  pool.install();
  try {
    const ws = new WebSocket("wss://relay.nt-sign-reject.test");
    await new Promise<void>((resolve) => {
      ws.onopen = () => resolve();
    });

    const messages: string[] = [];
    ws.addEventListener("message", (ev: MessageEvent) => {
      messages.push(ev.data as string);
    });

    ws.send(JSON.stringify(["EVENT", event]));
    await new Promise((r) => setTimeout(r, 50));

    const ok = messages.find((m) => {
      const parsed = JSON.parse(m);
      return parsed[0] === "OK" && parsed[1] === event.id;
    });
    const parsed = JSON.parse(ok!);
    assertEquals(parsed[2], false);

    ws.close();
  } finally {
    pool.uninstall();
  }
});
