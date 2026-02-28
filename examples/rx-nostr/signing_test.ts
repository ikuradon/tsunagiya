/**
 * rx-nostr 署名統合テスト
 *
 * EventSigner/EventVerifier を nostr-tools の暗号関数で実装し、
 * EventBuilder.buildWith() と MockRelay.setVerifier() の統合テスト。
 * rx-nostr ディレクトリ向けの署名検証テスト。
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

const sk = generateSecretKey();
const pk = getPublicKey(sk);

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

const nostrToolsVerifier: EventVerifier = {
  verifyEvent: (event: NostrEvent) => {
    return verifyEvent(event as Parameters<typeof verifyEvent>[0]);
  },
};

const testOpts = { sanitizeResources: false, sanitizeOps: false };

test(
  "rx-nostr signing: buildWith creates valid signed event",
  testOpts,
  async () => {
    const signer = createSigner(sk);
    const event = await EventBuilder.kind1()
      .content("signed for rx-nostr")
      .buildWith(signer);

    assertEquals(event.pubkey, pk);
    assertEquals(event.content, "signed for rx-nostr");
    assertEquals(event.kind, 1);
    assertEquals(typeof event.id, "string");
    assertEquals(typeof event.sig, "string");

    const valid = verifyEvent(event as Parameters<typeof verifyEvent>[0]);
    assertEquals(valid, true);
  },
);

test(
  "rx-nostr signing: verifier accepts valid, rejects invalid",
  testOpts,
  async () => {
    const pool = new MockPool();
    const relay = pool.relay("wss://relay.rx-sign.test");
    relay.setVerifier(nostrToolsVerifier);

    const signer = createSigner(sk);
    const validEvent = await EventBuilder.kind1()
      .content("valid rx event")
      .buildWith(signer);
    // build() はモック署名を使用するため nostr-tools verifier では無効と判定される
    const invalidEvent = EventBuilder.kind1()
      .content("invalid rx event")
      .pubkey(pk)
      .build();

    pool.install();
    try {
      const ws = new WebSocket("wss://relay.rx-sign.test");
      await new Promise<void>((resolve) => {
        ws.onopen = () => resolve();
      });

      const messages: string[] = [];
      ws.addEventListener("message", (ev: MessageEvent) => {
        messages.push(ev.data as string);
      });

      ws.send(JSON.stringify(["EVENT", validEvent]));
      await new Promise((r) => setTimeout(r, 50));

      ws.send(JSON.stringify(["EVENT", invalidEvent]));
      await new Promise((r) => setTimeout(r, 50));

      const validOk = messages.find((m) => {
        const p = JSON.parse(m);
        return p[0] === "OK" && p[1] === validEvent.id;
      });
      assertEquals(JSON.parse(validOk!)[2], true);

      const invalidOk = messages.find((m) => {
        const p = JSON.parse(m);
        return p[0] === "OK" && p[1] === invalidEvent.id;
      });
      assertEquals(JSON.parse(invalidOk!)[2], false);

      ws.close();
    } finally {
      pool.uninstall();
    }
  },
);
