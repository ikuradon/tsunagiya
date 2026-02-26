import { assertEquals } from "@std/assert";
import { FilterBuilder } from "../../src/testing/filter_builder.ts";

Deno.test("FilterBuilder - timeline() with default options", () => {
  const filter = FilterBuilder.timeline();
  assertEquals(filter, { kinds: [1] });
});

Deno.test("FilterBuilder - timeline() with limit", () => {
  const filter = FilterBuilder.timeline({ limit: 20 });
  assertEquals(filter, { kinds: [1], limit: 20 });
});

Deno.test("FilterBuilder - timeline() with since/until", () => {
  const filter = FilterBuilder.timeline({
    since: 1700000000,
    until: 1700001000,
  });
  assertEquals(filter, {
    kinds: [1],
    since: 1700000000,
    until: 1700001000,
  });
});

Deno.test("FilterBuilder - profile()", () => {
  const filter = FilterBuilder.profile("pubkey123");
  assertEquals(filter, { kinds: [0], authors: ["pubkey123"] });
});

Deno.test("FilterBuilder - mentions()", () => {
  const filter = FilterBuilder.mentions("pubkey456");
  assertEquals(filter, { kinds: [1], "#p": ["pubkey456"] });
});

Deno.test("FilterBuilder - reactions()", () => {
  const filter = FilterBuilder.reactions("event789");
  assertEquals(filter, { kinds: [7], "#e": ["event789"] });
});

Deno.test("FilterBuilder - search()", () => {
  const filter = FilterBuilder.search("nostr");
  assertEquals(filter, { search: "nostr" });
});

// ===== NIP-52 Calendar Events =====

Deno.test("FilterBuilder - calendarDateEvents()", () => {
  const filter = FilterBuilder.calendarDateEvents();
  assertEquals(filter, { kinds: [31922] });
});

Deno.test("FilterBuilder - calendarTimeEvents()", () => {
  const filter = FilterBuilder.calendarTimeEvents();
  assertEquals(filter, { kinds: [31923] });
});

Deno.test("FilterBuilder - calendarEvents()", () => {
  const filter = FilterBuilder.calendarEvents();
  assertEquals(filter, { kinds: [31922, 31923] });
});

Deno.test("FilterBuilder - calendarCollections()", () => {
  const filter = FilterBuilder.calendarCollections();
  assertEquals(filter, { kinds: [31924] });
});

Deno.test("FilterBuilder - rsvps()", () => {
  const filter = FilterBuilder.rsvps("31922:pubkey1:meetup");
  assertEquals(filter, { kinds: [31925], "#a": ["31922:pubkey1:meetup"] });
});
