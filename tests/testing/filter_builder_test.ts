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
