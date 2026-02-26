import { assertEquals } from "@std/assert";
import { EventBuilder } from "../../src/testing/event_builder.ts";
import { FilterBuilder } from "../../src/testing/filter_builder.ts";

// ===== NIP-51 Mute List (kind:10000) =====

Deno.test("EventBuilder - muteList() creates kind:10000 with p tags", () => {
  const event = EventBuilder.muteList({
    pubkeys: ["pub1", "pub2"],
  }).build();

  assertEquals(event.kind, 10000);
  assertEquals(
    event.tags.some((t) => t[0] === "p" && t[1] === "pub1"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "p" && t[1] === "pub2"),
    true,
  );
});

Deno.test("EventBuilder - muteList() with e and word tags", () => {
  const event = EventBuilder.muteList({
    eventIds: ["event1"],
    words: ["spam", "scam"],
  }).build();

  assertEquals(event.kind, 10000);
  assertEquals(
    event.tags.some((t) => t[0] === "e" && t[1] === "event1"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "word" && t[1] === "spam"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "word" && t[1] === "scam"),
    true,
  );
});

Deno.test("EventBuilder - muteList() with all tag types", () => {
  const event = EventBuilder.muteList({
    pubkeys: ["pub1"],
    eventIds: ["event1"],
    addresses: ["30023:pub1:article"],
    hashtags: ["nsfw"],
    words: ["badword"],
  }).build();

  assertEquals(event.kind, 10000);
  assertEquals(
    event.tags.some((t) => t[0] === "p" && t[1] === "pub1"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "e" && t[1] === "event1"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "a" && t[1] === "30023:pub1:article"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "t" && t[1] === "nsfw"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "word" && t[1] === "badword"),
    true,
  );
});

Deno.test("EventBuilder - muteList() with empty options has no tags", () => {
  const event = EventBuilder.muteList({}).build();

  assertEquals(event.kind, 10000);
  assertEquals(event.tags.length, 0);
});

// ===== NIP-51 Pin List (kind:10001) =====

Deno.test("EventBuilder - pinList() creates kind:10001 with e tags", () => {
  const event = EventBuilder.pinList(["event1", "event2", "event3"]).build();

  assertEquals(event.kind, 10001);
  assertEquals(
    event.tags.filter((t) => t[0] === "e").length,
    3,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "e" && t[1] === "event1"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "e" && t[1] === "event3"),
    true,
  );
});

// ===== NIP-51 Bookmarks (kind:10003) =====

Deno.test("EventBuilder - bookmarks() creates kind:10003 with e and a tags", () => {
  const event = EventBuilder.bookmarks({
    eventIds: ["event1", "event2"],
    addresses: ["30023:pub1:article"],
  }).build();

  assertEquals(event.kind, 10003);
  assertEquals(
    event.tags.some((t) => t[0] === "e" && t[1] === "event1"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "e" && t[1] === "event2"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "a" && t[1] === "30023:pub1:article"),
    true,
  );
});

Deno.test("EventBuilder - bookmarks() with t tags", () => {
  const event = EventBuilder.bookmarks({
    hashtags: ["nostr", "bitcoin"],
  }).build();

  assertEquals(event.kind, 10003);
  assertEquals(
    event.tags.some((t) => t[0] === "t" && t[1] === "nostr"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "t" && t[1] === "bitcoin"),
    true,
  );
});

// ===== NIP-51 Follow Set (kind:30000) =====

Deno.test("EventBuilder - followSet() creates kind:30000 with d and p tags", () => {
  const event = EventBuilder.followSet("developers", ["pub1", "pub2"]).build();

  assertEquals(event.kind, 30000);
  assertEquals(
    event.tags.some((t) => t[0] === "d" && t[1] === "developers"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "p" && t[1] === "pub1"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "p" && t[1] === "pub2"),
    true,
  );
});

// ===== NIP-51 Relay Set (kind:30002) =====

Deno.test("EventBuilder - relaySet() creates kind:30002 with d and relay tags", () => {
  const event = EventBuilder.relaySet("my-relays", [
    "wss://relay1.example.com",
    "wss://relay2.example.com",
  ]).build();

  assertEquals(event.kind, 30002);
  assertEquals(
    event.tags.some((t) => t[0] === "d" && t[1] === "my-relays"),
    true,
  );
  assertEquals(
    event.tags.some((t) =>
      t[0] === "relay" && t[1] === "wss://relay1.example.com"
    ),
    true,
  );
  assertEquals(
    event.tags.some((t) =>
      t[0] === "relay" && t[1] === "wss://relay2.example.com"
    ),
    true,
  );
});

// ===== NIP-51 Emoji Set (kind:30030) =====

Deno.test("EventBuilder - emojiSet() creates kind:30030 with d and emoji tags", () => {
  const event = EventBuilder.emojiSet("my-emojis", [
    ["fire", "https://example.com/fire.png"],
    ["heart", "https://example.com/heart.png"],
  ]).build();

  assertEquals(event.kind, 30030);
  assertEquals(
    event.tags.some((t) => t[0] === "d" && t[1] === "my-emojis"),
    true,
  );
  assertEquals(
    event.tags.some((t) =>
      t[0] === "emoji" && t[1] === "fire" &&
      t[2] === "https://example.com/fire.png"
    ),
    true,
  );
  assertEquals(
    event.tags.some((t) =>
      t[0] === "emoji" && t[1] === "heart" &&
      t[2] === "https://example.com/heart.png"
    ),
    true,
  );
});

// ===== NIP-51 FilterBuilder =====

Deno.test("FilterBuilder - muteList()", () => {
  const filter = FilterBuilder.muteList("pubkey123");
  assertEquals(filter, { kinds: [10000], authors: ["pubkey123"] });
});

Deno.test("FilterBuilder - pinList()", () => {
  const filter = FilterBuilder.pinList("pubkey123");
  assertEquals(filter, { kinds: [10001], authors: ["pubkey123"] });
});

Deno.test("FilterBuilder - bookmarks()", () => {
  const filter = FilterBuilder.bookmarks("pubkey123");
  assertEquals(filter, { kinds: [10003], authors: ["pubkey123"] });
});

Deno.test("FilterBuilder - followSets()", () => {
  const filter = FilterBuilder.followSets("pubkey123");
  assertEquals(filter, { kinds: [30000], authors: ["pubkey123"] });
});
