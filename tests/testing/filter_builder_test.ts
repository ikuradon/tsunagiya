import { assertEquals } from "@std/assert";
import { FilterBuilder } from "../../src/testing/filter_builder.ts";

Deno.test("FilterBuilder.timeline() - creates kind:1 filter with defaults", () => {
  const filter = FilterBuilder.timeline();
  assertEquals(filter, { kinds: [1] });
});

Deno.test("FilterBuilder.timeline() - adds limit option", () => {
  const filter = FilterBuilder.timeline({ limit: 20 });
  assertEquals(filter, { kinds: [1], limit: 20 });
});

Deno.test("FilterBuilder.timeline() - adds since/until options", () => {
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

Deno.test("FilterBuilder.profile() - creates kind:0 filter", () => {
  const filter = FilterBuilder.profile("pubkey123");
  assertEquals(filter, { kinds: [0], authors: ["pubkey123"] });
});

Deno.test("FilterBuilder.mentions() - creates kind:1 filter with #p tag", () => {
  const filter = FilterBuilder.mentions("pubkey456");
  assertEquals(filter, { kinds: [1], "#p": ["pubkey456"] });
});

Deno.test("FilterBuilder.reactions() - creates kind:7 filter with #e tag", () => {
  const filter = FilterBuilder.reactions("event789");
  assertEquals(filter, { kinds: [7], "#e": ["event789"] });
});

Deno.test("FilterBuilder.search() - creates search filter", () => {
  const filter = FilterBuilder.search("nostr");
  assertEquals(filter, { search: "nostr" });
});

// ===== NIP-52 Calendar Events =====

Deno.test("FilterBuilder.calendarDateEvents() - creates kind:31922 filter", () => {
  const filter = FilterBuilder.calendarDateEvents();
  assertEquals(filter, { kinds: [31922] });
});

Deno.test("FilterBuilder.calendarTimeEvents() - creates kind:31923 filter", () => {
  const filter = FilterBuilder.calendarTimeEvents();
  assertEquals(filter, { kinds: [31923] });
});

Deno.test("FilterBuilder.calendarEvents() - creates combined calendar filter", () => {
  const filter = FilterBuilder.calendarEvents();
  assertEquals(filter, { kinds: [31922, 31923] });
});

Deno.test("FilterBuilder.calendarCollections() - creates kind:31924 filter", () => {
  const filter = FilterBuilder.calendarCollections();
  assertEquals(filter, { kinds: [31924] });
});

Deno.test("FilterBuilder.rsvps() - creates kind:31925 filter with #a tag", () => {
  const filter = FilterBuilder.rsvps("31922:pubkey1:meetup");
  assertEquals(filter, { kinds: [31925], "#a": ["31922:pubkey1:meetup"] });
});

// ===== NIP-65 Relay List Metadata =====

Deno.test("FilterBuilder.relayList() - creates kind:10002 filter", () => {
  const filter = FilterBuilder.relayList("pubkey123");
  assertEquals(filter, { kinds: [10002], authors: ["pubkey123"] });
});

// ===== NIP-18 Reposts =====

Deno.test("FilterBuilder.reposts() - creates kind:6 filter", () => {
  const filter = FilterBuilder.reposts("event123");
  assertEquals(filter, { kinds: [6], "#e": ["event123"] });
});

Deno.test("FilterBuilder.allReposts() - creates kind:6,16 filter", () => {
  const filter = FilterBuilder.allReposts("event123");
  assertEquals(filter, { kinds: [6, 16], "#e": ["event123"] });
});

// ===== NIP-23 Long-form Content =====

Deno.test("FilterBuilder.longFormContent() - creates kind:30023 filter", () => {
  const filter = FilterBuilder.longFormContent();
  assertEquals(filter, { kinds: [30023] });
});

Deno.test("FilterBuilder.longFormContent() - adds author filter with pubkey", () => {
  const filter = FilterBuilder.longFormContent("pubkey123");
  assertEquals(filter, { kinds: [30023], authors: ["pubkey123"] });
});

Deno.test("FilterBuilder.longFormByTag() - creates kind:30023 filter with #t tag", () => {
  const filter = FilterBuilder.longFormByTag("nostr");
  assertEquals(filter, { kinds: [30023], "#t": ["nostr"] });
});

// ===== NIP-25 Reactions =====

Deno.test("FilterBuilder.reactionsTo() - creates kind:7 filter with #a tag", () => {
  const filter = FilterBuilder.reactionsTo("30023:pubkey:article");
  assertEquals(filter, { kinds: [7], "#a": ["30023:pubkey:article"] });
});

// ===== 汎用ビルダーメソッド =====

Deno.test("FilterBuilder - 汎用メソッド", async (t) => {
  await t.step("author() - authors フィールドが正しく設定される", () => {
    const filter = FilterBuilder.author("pubkey-abc");
    assertEquals(filter, { authors: ["pubkey-abc"] });
  });

  await t.step("kind() - kinds フィールドが正しく設定される", () => {
    const filter = FilterBuilder.kind(30023);
    assertEquals(filter, { kinds: [30023] });
  });

  await t.step("since() - since フィールドが正しく設定される", () => {
    const filter = FilterBuilder.since(1700000000);
    assertEquals(filter, { since: 1700000000 });
  });

  await t.step("tagged() - タグフィルターが正しく設定される", () => {
    const filter = FilterBuilder.tagged("e", ["event1", "event2"]);
    assertEquals(filter, { "#e": ["event1", "event2"] });
  });

  await t.step("tagged() - p タグフィルター", () => {
    const filter = FilterBuilder.tagged("p", ["pubkey1"]);
    assertEquals(filter, { "#p": ["pubkey1"] });
  });
});

// ===== combine =====

Deno.test("FilterBuilder - combine", async (t) => {
  await t.step("2つのフィルターをマージできる", () => {
    const filter = FilterBuilder.combine(
      { kinds: [1] },
      { authors: ["pub1"] },
    );
    assertEquals(filter.kinds, [1]);
    assertEquals(filter.authors, ["pub1"]);
  });

  await t.step("kinds の重複が除去される", () => {
    const filter = FilterBuilder.combine(
      { kinds: [1, 3] },
      { kinds: [1, 7] },
    );
    const kinds = filter.kinds!;
    assertEquals(kinds.includes(1), true);
    assertEquals(kinds.includes(3), true);
    assertEquals(kinds.includes(7), true);
    // 重複なし
    assertEquals(kinds.filter((k) => k === 1).length, 1);
  });

  await t.step("since は最大値、until は最小値でマージされる", () => {
    const filter = FilterBuilder.combine(
      { since: 1700000000, until: 1700002000 },
      { since: 1700001000, until: 1700003000 },
    );
    assertEquals(filter.since, 1700001000); // 最大値
    assertEquals(filter.until, 1700002000); // 最小値
  });

  await t.step("limit は最小値でマージされる", () => {
    const filter = FilterBuilder.combine(
      { limit: 100 },
      { limit: 50 },
    );
    assertEquals(filter.limit, 50);
  });
});

// ===== combine merges tag filters =====

Deno.test("FilterBuilder.combine() - merges tag filters from multiple filters", () => {
  const filter = FilterBuilder.combine(
    { kinds: [1], "#e": ["id1"] },
    { kinds: [1], "#e": ["id2"], "#p": ["pk1"] },
  );

  const eValues = filter["#e"]!;
  assertEquals(eValues.includes("id1"), true);
  assertEquals(eValues.includes("id2"), true);
  // 重複なし
  assertEquals(eValues.filter((v) => v === "id1").length, 1);
  assertEquals(eValues.filter((v) => v === "id2").length, 1);

  const pValues = filter["#p"]!;
  assertEquals(pValues, ["pk1"]);
});

Deno.test("FilterBuilder.combine() - deduplicates tag values", () => {
  const filter = FilterBuilder.combine(
    { "#e": ["id1", "id2"] },
    { "#e": ["id2", "id3"] },
  );

  const eValues = filter["#e"]!;
  // 重複するid2が1件のみ
  assertEquals(eValues.filter((v) => v === "id2").length, 1);
  assertEquals(eValues.includes("id1"), true);
  assertEquals(eValues.includes("id3"), true);
});
