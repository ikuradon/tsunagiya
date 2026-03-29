import { assertEquals } from "@std/assert";
import { EventBuilder } from "../../src/testing/event_builder.ts";
import { FilterBuilder } from "../../src/testing/filter_builder.ts";
import type { RandomSource } from "../../src/types.ts";

function expectedHex(start: number, bytes: number): string {
  return Array.from(
    { length: bytes },
    (_, i) => ((start + i) & 0xff).toString(16).padStart(2, "0"),
  ).join("");
}

function makeSequentialRandom(nextValue = 0.25): RandomSource {
  let nextByte = 0;
  return {
    next(): number {
      return nextValue;
    },
    fill(bytes: Uint8Array): void {
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = nextByte & 0xff;
        nextByte++;
      }
    },
  };
}

// ===== NIP-17 Chat Message (kind:14) =====

Deno.test("EventBuilder.chatMessage() - creates kind:14 with p tag", () => {
  const event = EventBuilder.chatMessage({
    recipientPubkey: "recipient-pub",
    content: "Hello, this is a private message",
  }).build();

  assertEquals(event.kind, 14);
  assertEquals(event.content, "Hello, this is a private message");
  assertEquals(
    event.tags.some((t) => t[0] === "p" && t[1] === "recipient-pub"),
    true,
  );
});

Deno.test("EventBuilder.chatMessage() - adds e tag with replyTo", () => {
  const event = EventBuilder.chatMessage({
    recipientPubkey: "recipient-pub",
    content: "This is a reply",
    replyTo: "original-event-id",
  }).build();

  assertEquals(event.kind, 14);
  assertEquals(
    event.tags.some((t) =>
      t[0] === "e" && t[1] === "original-event-id" && t[3] === "reply"
    ),
    true,
  );
});

Deno.test("EventBuilder.chatMessage() - adds subject tag", () => {
  const event = EventBuilder.chatMessage({
    recipientPubkey: "recipient-pub",
    content: "Message with subject",
    subject: "Important Topic",
  }).build();

  assertEquals(event.kind, 14);
  assertEquals(
    event.tags.some((t) => t[0] === "subject" && t[1] === "Important Topic"),
    true,
  );
});

Deno.test("EventBuilder.chatMessage() - supports all options combined", () => {
  const event = EventBuilder.chatMessage({
    recipientPubkey: "recipient-pub",
    content: "Full message",
    replyTo: "event-id",
    subject: "Topic",
  }).build();

  assertEquals(event.kind, 14);
  assertEquals(event.content, "Full message");
  assertEquals(
    event.tags.some((t) => t[0] === "p" && t[1] === "recipient-pub"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "e" && t[1] === "event-id"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "subject" && t[1] === "Topic"),
    true,
  );
});

// ===== NIP-17 Seal (kind:13) =====

Deno.test("EventBuilder.seal() - creates kind:13 with mock encrypted content", () => {
  const inner = EventBuilder.chatMessage({
    recipientPubkey: "pub1",
    content: "secret",
  }).build();
  const event = EventBuilder.seal(inner).build();

  assertEquals(event.kind, 13);
  assertEquals(event.content.startsWith("mock-sealed:"), true);
  const parsed = JSON.parse(event.content.replace("mock-sealed:", ""));
  assertEquals(parsed.kind, 14);
  assertEquals(parsed.content, "secret");
});

// ===== NIP-17 Gift Wrap (kind:1059) =====

Deno.test("EventBuilder.giftWrap() - creates kind:1059 with random pubkey", () => {
  const inner = EventBuilder.kind1().content("inner event").build();
  const event = EventBuilder.giftWrap({
    recipientPubkey: "recipient-pub",
    innerEvent: inner,
  }).build();

  assertEquals(event.kind, 1059);
  // pubkey はランダムなので元の inner イベントの pubkey とは異なる
  assertEquals(event.pubkey.length, 64);
  assertEquals(
    event.tags.some((t) => t[0] === "p" && t[1] === "recipient-pub"),
    true,
  );
  assertEquals(event.content.startsWith("mock-giftwrapped:"), true);
});

Deno.test("EventBuilder.giftWrap() - randomizes created_at timestamp", () => {
  const inner = EventBuilder.kind1().build();
  const event = EventBuilder.giftWrap({
    recipientPubkey: "pub1",
    innerEvent: inner,
  }).build();

  const now = Math.floor(Date.now() / 1000);
  // created_at は現在から最大2日前の範囲
  assertEquals(event.created_at <= now, true);
  assertEquals(event.created_at >= now - 172800, true);
});

Deno.test("EventBuilder.giftWrap() - wraps inner event in content", () => {
  const inner = EventBuilder.kind1().content("wrapped content").build();
  const event = EventBuilder.giftWrap({
    recipientPubkey: "pub1",
    innerEvent: inner,
  }).build();

  const parsed = JSON.parse(
    event.content.replace("mock-giftwrapped:", ""),
  );
  assertEquals(parsed.id, inner.id);
  assertEquals(parsed.content, "wrapped content");
});

Deno.test("EventBuilder.giftWrap() - accepts injected clock and random", () => {
  const inner = EventBuilder.kind1().content("wrapped content").build();
  const event = EventBuilder.giftWrap({
    recipientPubkey: "pub1",
    innerEvent: inner,
  }, {
    clock: {
      now(): number {
        return 1700000000000;
      },
    },
    random: makeSequentialRandom(0.25),
  }).build();

  assertEquals(event.created_at, 1699956800);
  assertEquals(event.pubkey, expectedHex(128, 32));
});

// ===== NIP-17 DM Relay List (kind:10050) =====

Deno.test("EventBuilder.dmRelayList() - creates kind:10050 with relay tags", () => {
  const event = EventBuilder.dmRelayList([
    "wss://dm-relay1.example.com",
    "wss://dm-relay2.example.com",
  ]).build();

  assertEquals(event.kind, 10050);
  assertEquals(
    event.tags.some((t) =>
      t[0] === "relay" && t[1] === "wss://dm-relay1.example.com"
    ),
    true,
  );
  assertEquals(
    event.tags.some((t) =>
      t[0] === "relay" && t[1] === "wss://dm-relay2.example.com"
    ),
    true,
  );
});

// ===== NIP-17 FilterBuilder =====

Deno.test("FilterBuilder.giftWraps() - creates kind:1059 filter", () => {
  const filter = FilterBuilder.giftWraps("pubkey123");
  assertEquals(filter, { kinds: [1059], "#p": ["pubkey123"] });
});

Deno.test("FilterBuilder.dmRelayList() - creates kind:10050 filter", () => {
  const filter = FilterBuilder.dmRelayList("pubkey123");
  assertEquals(filter, { kinds: [10050], authors: ["pubkey123"] });
});
