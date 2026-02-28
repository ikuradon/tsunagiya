import {
  assert,
  assertEquals,
  assertNotEquals,
  assertNotStrictEquals,
} from "@std/assert";
import { EventBuilder } from "../../src/testing/event_builder.ts";
import { matchFilter } from "../../src/filter.ts";
import type { EventSigner } from "../../src/types.ts";

// ===== 基本ビルダー =====

Deno.test("EventBuilder.kind1() - builds kind:1 event with valid fields", () => {
  const event = EventBuilder.kind1().content("hello").build();
  assertEquals(event.kind, 1);
  assertEquals(event.content, "hello");
  assertEquals(event.id.length, 64);
  assertEquals(event.pubkey.length, 64);
  assertEquals(event.sig.length, 128);
  assertEquals(typeof event.created_at, "number");
});

Deno.test("EventBuilder.kind0() - builds kind:0 event", () => {
  const event = EventBuilder.kind0().build();
  assertEquals(event.kind, 0);
});

Deno.test("EventBuilder.kind() - builds event with arbitrary kind", () => {
  const event = EventBuilder.kind(42).build();
  assertEquals(event.kind, 42);
});

Deno.test("EventBuilder.tag() - adds tags to event", () => {
  const event = EventBuilder.kind1()
    .tag("e", "event123", "wss://relay.test", "reply")
    .tag("p", "pubkey456")
    .build();

  assertEquals(event.tags.length, 2);
  assertEquals(event.tags[0], ["e", "event123", "wss://relay.test", "reply"]);
  assertEquals(event.tags[1], ["p", "pubkey456"]);
});

Deno.test("EventBuilder.pubkey()/id() - sets pubkey and id fields", () => {
  const event = EventBuilder.kind1()
    .pubkey("mypubkey")
    .id("myid")
    .build();
  assertEquals(event.pubkey, "mypubkey");
  assertEquals(event.id, "myid");
});

Deno.test("EventBuilder.createdAt() - sets created_at timestamp", () => {
  const event = EventBuilder.kind1().createdAt(1700000000).build();
  assertEquals(event.created_at, 1700000000);
});

Deno.test("EventBuilder.sign() - generates mock signature", () => {
  const event = EventBuilder.kind1().sign("privkey").build();
  assertEquals(event.sig.length, 128);
});

// ===== corrupt =====

Deno.test("EventBuilder.corrupt() - corrupts specified fields", () => {
  const event = EventBuilder.kind1()
    .content("test")
    .corrupt({ id: true, sig: true })
    .build();

  assertEquals(event.id.startsWith("corrupted_"), true);
  assertEquals(event.sig.startsWith("corrupted_"), true);
  assertEquals(event.content, "test");
});

Deno.test("EventBuilder.corrupt() - sets created_at to -1", () => {
  const event = EventBuilder.kind1()
    .corrupt({ created_at: true })
    .build();
  assertEquals(event.created_at, -1);
});

// ===== Common Tags =====

Deno.test("EventBuilder.geohash() - adds g tag", () => {
  const event = EventBuilder.kind1().geohash("9q8yy").build();
  assertEquals(event.tags[0], ["g", "9q8yy"]);
});

Deno.test("EventBuilder.emoji() - adds emoji tag", () => {
  const event = EventBuilder.kind1()
    .emoji("fire", "https://example.com/fire.png")
    .build();
  assertEquals(event.tags[0], [
    "emoji",
    "fire",
    "https://example.com/fire.png",
  ]);
});

// ===== random =====

Deno.test("EventBuilder.random() - generates valid random event", () => {
  const event = EventBuilder.random({ kind: 1 });
  assertEquals(event.kind, 1);
  assertEquals(event.id.length, 64);
  assertEquals(event.content.startsWith("random:"), true);
});

Deno.test("EventBuilder.random() - accepts custom pubkey", () => {
  const event = EventBuilder.random({ pubkey: "mypub" });
  assertEquals(event.pubkey, "mypub");
});

// ===== bulk =====

Deno.test("EventBuilder.bulk() - generates multiple unique events", () => {
  const events = EventBuilder.bulk(5, { kind: 1 });
  assertEquals(events.length, 5);
  for (const event of events) {
    assertEquals(event.kind, 1);
  }
  // 全てユニークなID
  const ids = new Set(events.map((e) => e.id));
  assertEquals(ids.size, 5);
});

// ===== timeline =====

Deno.test("EventBuilder - timeline() generates sequential events", () => {
  const events = EventBuilder.timeline(3, {
    kind: 1,
    interval: 60,
    startTime: 1700000000,
  });

  assertEquals(events.length, 3);
  assertEquals(events[0].created_at, 1700000000);
  assertEquals(events[1].created_at, 1700000060);
  assertEquals(events[2].created_at, 1700000120);
});

// ===== thread =====

Deno.test("EventBuilder - thread() generates reply chain", () => {
  const events = EventBuilder.thread(4);

  assertEquals(events.length, 4);
  // rootにはタグなし
  assertEquals(events[0].tags.length, 0);

  // reply1はrootを参照
  const reply1Tags = events[1].tags;
  assertEquals(
    reply1Tags.some((t) => t[0] === "e" && t[1] === events[0].id),
    true,
  );
  assertEquals(
    reply1Tags.some((t) => t[0] === "p" && t[1] === events[0].pubkey),
    true,
  );

  // reply3はrootとreply2を参照
  const reply3Tags = events[3].tags;
  assertEquals(
    reply3Tags.some((t) =>
      t[0] === "e" && t[1] === events[0].id && t[3] === "root"
    ),
    true,
  );
  assertEquals(
    reply3Tags.some((t) =>
      t[0] === "e" && t[1] === events[2].id && t[3] === "reply"
    ),
    true,
  );
});

// ===== withReactions =====

Deno.test("EventBuilder - withReactions() generates post + reactions", () => {
  const [post, reactions] = EventBuilder.withReactions(3);

  assertEquals(post.kind, 1);
  assertEquals(reactions.length, 3);
  for (const r of reactions) {
    assertEquals(r.kind, 7);
    assertEquals(r.content, "+");
    assertEquals(r.tags.some((t) => t[0] === "e" && t[1] === post.id), true);
    assertEquals(
      r.tags.some((t) => t[0] === "p" && t[1] === post.pubkey),
      true,
    );
  }
});

// ===== NIP別テンプレート =====

Deno.test("EventBuilder - metadata() creates kind:0 with JSON content", () => {
  const event = EventBuilder.metadata({
    name: "Alice",
    about: "Nostr user",
    picture: "https://example.com/avatar.png",
  }).build();

  assertEquals(event.kind, 0);
  const profile = JSON.parse(event.content);
  assertEquals(profile.name, "Alice");
  assertEquals(profile.about, "Nostr user");
});

Deno.test("EventBuilder - contacts() creates kind:3 with p tags", () => {
  const event = EventBuilder.contacts(["pub1", "pub2", "pub3"]).build();
  assertEquals(event.kind, 3);
  assertEquals(event.tags.length, 3);
  assertEquals(event.tags[0], ["p", "pub1"]);
  assertEquals(event.tags[2], ["p", "pub3"]);
});

Deno.test("EventBuilder - dm() creates kind:4 builder", () => {
  const event = EventBuilder.dm("recipient", "secret").build();
  assertEquals(event.kind, 4);
  assertEquals(event.content, "mock-encrypted:secret");
  assertEquals(
    event.tags.some((t) => t[0] === "p" && t[1] === "recipient"),
    true,
  );
});

Deno.test("EventBuilder - groupMessage() creates kind:9 with h tag", () => {
  const event = EventBuilder.groupMessage("mygroup").content("hello").build();
  assertEquals(event.kind, 9);
  assertEquals(event.tags[0], ["h", "mygroup"]);
});

Deno.test("EventBuilder - zapRequest() creates kind:9734", () => {
  const event = EventBuilder.zapRequest({
    amount: 1000,
    relays: ["wss://relay.example.com"],
    lnurl: "lnurl1...",
    eventId: "target-event",
    recipientPubkey: "recipient-pub",
  }).build();

  assertEquals(event.kind, 9734);
  assertEquals(
    event.tags.some((t) => t[0] === "amount" && t[1] === "1000"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "lnurl" && t[1] === "lnurl1..."),
    true,
  );
  assertEquals(
    event.tags.some((t) =>
      t[0] === "relays" && t[1] === "wss://relay.example.com"
    ),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "e" && t[1] === "target-event"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "p" && t[1] === "recipient-pub"),
    true,
  );
});

Deno.test("EventBuilder - nip07Request() creates kind:24133", () => {
  const event = EventBuilder.nip07Request().build();
  assertEquals(event.kind, 24133);
});

// ===== NIP-52 Calendar Events =====

Deno.test("EventBuilder - calendarDateEvent() creates kind:31922 with required tags", () => {
  const event = EventBuilder.calendarDateEvent({
    title: "Nostr Meetup",
    startDate: "2026-03-01",
  }).build();

  assertEquals(event.kind, 31922);
  assertEquals(
    event.tags.some((t) => t[0] === "d" && t[1] === "nostr-meetup"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "title" && t[1] === "Nostr Meetup"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "start" && t[1] === "2026-03-01"),
    true,
  );
});

Deno.test("EventBuilder - calendarDateEvent() with optional tags", () => {
  const event = EventBuilder.calendarDateEvent({
    title: "Conference",
    startDate: "2026-03-01",
    endDate: "2026-03-03",
    location: "Tokyo",
    geohash: "xn76g",
    participants: ["pub1", "pub2"],
    hashtags: ["nostr", "conference"],
  }).build();

  assertEquals(
    event.tags.some((t) => t[0] === "end" && t[1] === "2026-03-03"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "location" && t[1] === "Tokyo"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "g" && t[1] === "xn76g"),
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
  assertEquals(
    event.tags.some((t) => t[0] === "t" && t[1] === "nostr"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "t" && t[1] === "conference"),
    true,
  );
});

Deno.test("EventBuilder - calendarTimeEvent() creates kind:31923 with required tags", () => {
  const start = 1740000000;
  const event = EventBuilder.calendarTimeEvent({
    title: "Online Seminar",
    start,
  }).build();

  assertEquals(event.kind, 31923);
  assertEquals(
    event.tags.some((t) => t[0] === "d" && t[1] === "online-seminar"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "title" && t[1] === "Online Seminar"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "start" && t[1] === String(start)),
    true,
  );
});

Deno.test("EventBuilder - calendarTimeEvent() with optional tags", () => {
  const start = 1740000000;
  const end = 1740003600;
  const event = EventBuilder.calendarTimeEvent({
    title: "Workshop",
    start,
    end,
    startTzid: "Asia/Tokyo",
    endTzid: "Asia/Tokyo",
    location: "Shibuya",
    geohash: "xn76g",
    participants: ["pub1"],
    hashtags: ["workshop"],
  }).build();

  assertEquals(
    event.tags.some((t) => t[0] === "end" && t[1] === String(end)),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "start_tzid" && t[1] === "Asia/Tokyo"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "end_tzid" && t[1] === "Asia/Tokyo"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "location" && t[1] === "Shibuya"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "g" && t[1] === "xn76g"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "p" && t[1] === "pub1"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "t" && t[1] === "workshop"),
    true,
  );
});

Deno.test("EventBuilder - calendarCollection() creates kind:31924 with a tags", () => {
  const event = EventBuilder.calendarCollection({
    title: "Tech Events 2026",
    events: ["31922:pubkey1:meetup", "31923:pubkey2:seminar"],
  }).build();

  assertEquals(event.kind, 31924);
  assertEquals(
    event.tags.some((t) => t[0] === "d" && t[1] === "tech-events-2026"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "title" && t[1] === "Tech Events 2026"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "a" && t[1] === "31922:pubkey1:meetup"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "a" && t[1] === "31923:pubkey2:seminar"),
    true,
  );
});

Deno.test("EventBuilder - calendarRsvp() creates kind:31925 with status", () => {
  const event = EventBuilder.calendarRsvp({
    eventAddress: "31922:pubkey1:meetup",
    status: "accepted",
  }).build();

  assertEquals(event.kind, 31925);
  assertEquals(
    event.tags.some((t) => t[0] === "a" && t[1] === "31922:pubkey1:meetup"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "d" && t[1] === "31922:pubkey1:meetup"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "status" && t[1] === "accepted"),
    true,
  );
});

Deno.test("EventBuilder - calendarRsvp() with freebusy and content", () => {
  const event = EventBuilder.calendarRsvp({
    eventAddress: "31923:pubkey1:seminar",
    status: "tentative",
    freebusy: "busy",
    content: "Maybe I'll join",
  }).build();

  assertEquals(
    event.tags.some((t) => t[0] === "status" && t[1] === "tentative"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "freebusy" && t[1] === "busy"),
    true,
  );
  assertEquals(event.content, "Maybe I'll join");
});

Deno.test("EventBuilder - calendarRsvp() returns EventBuilder for customization", () => {
  const event = EventBuilder.calendarRsvp({
    eventAddress: "31922:pubkey1:meetup",
    status: "accepted",
  }).pubkey("my-pubkey").build();

  assertEquals(event.pubkey, "my-pubkey");
  assertEquals(event.kind, 31925);
});

// ===== NIP-65 Relay List Metadata =====

Deno.test("EventBuilder - relayList() creates kind:10002 with r tags", () => {
  const event = EventBuilder.relayList([
    { url: "wss://relay1.example.com" },
    { url: "wss://relay2.example.com", marker: "read" },
    { url: "wss://relay3.example.com", marker: "write" },
  ]).build();

  assertEquals(event.kind, 10002);
  assertEquals(
    event.tags.some((t) =>
      t[0] === "r" && t[1] === "wss://relay1.example.com" && t.length === 2
    ),
    true,
  );
  assertEquals(
    event.tags.some((t) =>
      t[0] === "r" && t[1] === "wss://relay2.example.com" &&
      t[2] === "read"
    ),
    true,
  );
  assertEquals(
    event.tags.some((t) =>
      t[0] === "r" && t[1] === "wss://relay3.example.com" &&
      t[2] === "write"
    ),
    true,
  );
});

// ===== NIP-18 Reposts =====

Deno.test("EventBuilder - repost() creates kind:6 with target event", () => {
  const target = EventBuilder.kind1().content("original post").build();
  const event = EventBuilder.repost(target, "wss://relay.example.com").build();

  assertEquals(event.kind, 6);
  assertEquals(JSON.parse(event.content).id, target.id);
  assertEquals(
    event.tags.some((t) => t[0] === "e" && t[1] === target.id),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "p" && t[1] === target.pubkey),
    true,
  );
});

Deno.test("EventBuilder - genericRepost() creates kind:16 with k tag", () => {
  const target = EventBuilder.kind(30023).content("long form").build();
  const event = EventBuilder.genericRepost(target).build();

  assertEquals(event.kind, 16);
  assertEquals(
    event.tags.some((t) => t[0] === "e" && t[1] === target.id),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "p" && t[1] === target.pubkey),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "k" && t[1] === "30023"),
    true,
  );
});

// ===== NIP-23 Long-form Content =====

Deno.test("EventBuilder - longFormContent() creates kind:30023 with required tags", () => {
  const event = EventBuilder.longFormContent({
    identifier: "my-article",
    title: "My Article",
    content: "# Hello\n\nThis is my article.",
  }).build();

  assertEquals(event.kind, 30023);
  assertEquals(event.content, "# Hello\n\nThis is my article.");
  assertEquals(
    event.tags.some((t) => t[0] === "d" && t[1] === "my-article"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "title" && t[1] === "My Article"),
    true,
  );
});

Deno.test("EventBuilder - longFormContent() with optional tags", () => {
  const event = EventBuilder.longFormContent({
    identifier: "full-article",
    title: "Full Article",
    content: "content",
    summary: "A summary",
    image: "https://example.com/image.png",
    publishedAt: 1700000000,
    hashtags: ["nostr", "article"],
  }).build();

  assertEquals(
    event.tags.some((t) => t[0] === "summary" && t[1] === "A summary"),
    true,
  );
  assertEquals(
    event.tags.some((t) =>
      t[0] === "image" && t[1] === "https://example.com/image.png"
    ),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "published_at" && t[1] === "1700000000"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "t" && t[1] === "nostr"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "t" && t[1] === "article"),
    true,
  );
});

Deno.test("EventBuilder - longFormDraft() creates kind:30024", () => {
  const event = EventBuilder.longFormDraft({
    identifier: "my-draft",
    title: "Draft Post",
    content: "WIP content",
  }).build();

  assertEquals(event.kind, 30024);
  assertEquals(
    event.tags.some((t) => t[0] === "d" && t[1] === "my-draft"),
    true,
  );
});

// ===== NIP-25 Reactions 拡充 =====

Deno.test("EventBuilder - withReactions() backward compatible (no options)", () => {
  const [post, reactions] = EventBuilder.withReactions(2);
  assertEquals(post.kind, 1);
  assertEquals(reactions.length, 2);
  for (const r of reactions) {
    assertEquals(r.content, "+");
  }
});

Deno.test("EventBuilder - withReactions() with targetKind adds k tag", () => {
  const [_post, reactions] = EventBuilder.withReactions(2, {
    targetKind: 30023,
  });
  for (const r of reactions) {
    assertEquals(
      r.tags.some((t) => t[0] === "k" && t[1] === "30023"),
      true,
    );
  }
});

Deno.test("EventBuilder - withReactions() with content for downvote", () => {
  const [_post, reactions] = EventBuilder.withReactions(1, { content: "-" });
  assertEquals(reactions[0].content, "-");
});

Deno.test("EventBuilder - externalReaction() creates kind:17 with i and k tags", () => {
  const event = EventBuilder.externalReaction(
    "https://example.com/article",
    "text/html",
  ).build();

  assertEquals(event.kind, 17);
  assertEquals(event.content, "+");
  assertEquals(
    event.tags.some((t) =>
      t[0] === "i" && t[1] === "https://example.com/article"
    ),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "k" && t[1] === "text/html"),
    true,
  );
});

// ===== build() produces independent copies =====

Deno.test("EventBuilder - build() returns independent objects", () => {
  const builder = EventBuilder.kind1().tag("e", "id1");
  const event1 = builder.build();
  const event2 = builder.build();

  // タグを変更しても影響しない
  event1.tags[0][1] = "modified";
  assertEquals(event2.tags[0][1], "id1");
});

// ===== withExpiration (NIP-40) =====

Deno.test("EventBuilder - withExpiration", async (t) => {
  await t.step("expiration タグが正しく設定される", () => {
    const timestamp = 1700000000;
    const event = EventBuilder.kind1()
      .content("expiring message")
      .withExpiration(timestamp)
      .build();

    assertEquals(
      event.tags.some((t) =>
        t[0] === "expiration" && t[1] === String(timestamp)
      ),
      true,
    );
  });

  await t.step("他のメソッドとチェーンで組み合わせて使える", () => {
    const timestamp = 1800000000;
    const event = EventBuilder.kind1()
      .content("chained message")
      .tag("p", "somepubkey")
      .withExpiration(timestamp)
      .pubkey("mypub")
      .build();

    assertEquals(event.kind, 1);
    assertEquals(event.content, "chained message");
    assertEquals(event.pubkey, "mypub");
    assertEquals(
      event.tags.some((t) => t[0] === "p" && t[1] === "somepubkey"),
      true,
    );
    assertEquals(
      event.tags.some((t) =>
        t[0] === "expiration" && t[1] === String(timestamp)
      ),
      true,
    );
  });
});

// ===== privateDM (NIP-17) =====

Deno.test("EventBuilder - privateDM", async (t) => {
  await t.step(
    "kind:1059 のイベントを返し、p タグに recipientPubkey が含まれる",
    () => {
      const event = EventBuilder.privateDM({
        recipientPubkey: "recipient-pub-123",
        content: "Hello, private!",
      });

      assertEquals(event.kind, 1059);
      assertEquals(
        event.tags.some((t) => t[0] === "p" && t[1] === "recipient-pub-123"),
        true,
      );
    },
  );

  await t.step(
    "content にメッセージ内容が含まれる（mock-giftwrapped 経由）",
    () => {
      const event = EventBuilder.privateDM({
        recipientPubkey: "recipient-pub",
        content: "secret message",
      });

      assert(event.content.includes("mock-giftwrapped:"));
      assert(event.content.includes("secret message"));
    },
  );
});

// ===== from =====

Deno.test("EventBuilder - from", async (t) => {
  await t.step("全フィールドが正しくコピーされる", () => {
    const original = EventBuilder.kind1()
      .content("original content")
      .pubkey("original-pubkey")
      .id("original-id")
      .createdAt(1700000000)
      .tag("e", "event123")
      .tag("p", "pubkey456")
      .build();

    const copied = EventBuilder.from(original).build();

    assertEquals(copied.id, original.id);
    assertEquals(copied.pubkey, original.pubkey);
    assertEquals(copied.kind, original.kind);
    assertEquals(copied.content, original.content);
    assertEquals(copied.created_at, original.created_at);
    assertEquals(copied.tags, original.tags);
    assertEquals(copied.sig, original.sig);
  });

  await t.step("content を変更しても元イベントに影響しない", () => {
    const original = EventBuilder.kind1()
      .content("original")
      .build();

    const modified = EventBuilder.from(original)
      .content("modified")
      .build();

    assertEquals(modified.content, "modified");
    assertEquals(original.content, "original");
  });

  await t.step(
    "タグがディープコピーされ、復元後のタグ変更が元に影響しない",
    () => {
      const original = EventBuilder.kind1()
        .tag("e", "event123")
        .tag("p", "pubkey456")
        .build();

      const copied = EventBuilder.from(original).build();

      // 参照が異なることを確認
      assertNotStrictEquals(copied.tags, original.tags);

      // コピーのタグを変更しても元に影響しない
      copied.tags[0][1] = "modified";
      assertEquals(original.tags[0][1], "event123");
    },
  );
});

// ===== matchFilter =====

Deno.test("EventBuilder - matchFilter", async (t) => {
  await t.step("kinds 指定でマッチするイベント生成", () => {
    const event = EventBuilder.matchFilter({ kinds: [3] });
    assertEquals(event.kind, 3);
    assertEquals(matchFilter(event, { kinds: [3] }), true);
  });

  await t.step("authors 指定でマッチするイベント生成", () => {
    const event = EventBuilder.matchFilter({ authors: ["abc123"] });
    assertEquals(event.pubkey, "abc123");
    assertEquals(matchFilter(event, { authors: ["abc123"] }), true);
  });

  await t.step("since/until 条件でマッチするイベント生成", () => {
    const event = EventBuilder.matchFilter({
      since: 1700000000,
      until: 1700001000,
    });
    assertEquals(event.created_at >= 1700000000, true);
    assertEquals(event.created_at <= 1700001000, true);
    assertEquals(
      matchFilter(event, { since: 1700000000, until: 1700001000 }),
      true,
    );
  });

  await t.step("#e, #p タグフィルターでマッチするイベント生成", () => {
    const eventE = EventBuilder.matchFilter({ "#e": ["target-event-id"] });
    assertEquals(
      eventE.tags.some((t) => t[0] === "e" && t[1] === "target-event-id"),
      true,
    );
    assertEquals(
      matchFilter(eventE, { "#e": ["target-event-id"] }),
      true,
    );

    const eventP = EventBuilder.matchFilter({ "#p": ["target-pubkey"] });
    assertEquals(
      eventP.tags.some((t) => t[0] === "p" && t[1] === "target-pubkey"),
      true,
    );
    assertEquals(
      matchFilter(eventP, { "#p": ["target-pubkey"] }),
      true,
    );
  });

  await t.step("search キーワードが content に含まれるイベント生成", () => {
    const event = EventBuilder.matchFilter({ search: "nostr protocol" });
    assertEquals(event.content.includes("nostr protocol"), true);
    assertEquals(matchFilter(event, { search: "nostr protocol" }), true);
  });

  await t.step("複合条件でマッチするイベント生成", () => {
    const filter = {
      kinds: [1],
      authors: ["author-pub"],
      since: 1700000000,
      until: 1700001000,
      "#p": ["mentioned-pub"],
    };
    const event = EventBuilder.matchFilter(filter);
    assertEquals(event.kind, 1);
    assertEquals(event.pubkey, "author-pub");
    assertEquals(event.created_at >= 1700000000, true);
    assertEquals(event.created_at <= 1700001000, true);
    assertEquals(
      event.tags.some((t) => t[0] === "p" && t[1] === "mentioned-pub"),
      true,
    );
    assertEquals(matchFilter(event, filter), true);
  });
});

// ===== bulk シードオプション =====

Deno.test("EventBuilder - bulk シードオプション", async (t) => {
  await t.step("seed 指定で決定論的な ID/pubkey を生成する", () => {
    const events1 = EventBuilder.bulk(3, { seed: "test-seed" });
    const events2 = EventBuilder.bulk(3, { seed: "test-seed" });
    // 同じシードなら同じ ID/pubkey
    assertEquals(events1[0].id, events2[0].id);
    assertEquals(events1[0].pubkey, events2[0].pubkey);
    assertEquals(events1[1].id, events2[1].id);
  });

  await t.step("異なるシードなら異なる ID を生成する", () => {
    const events1 = EventBuilder.bulk(2, { seed: "seed-a" });
    const events2 = EventBuilder.bulk(2, { seed: "seed-b" });
    assertNotEquals(events1[0].id, events2[0].id);
  });

  await t.step("seed + pubkey 指定時は pubkey が優先される", () => {
    const pubkey = "fixed-pubkey-value";
    const events = EventBuilder.bulk(2, { seed: "test", pubkey });
    assertEquals(events[0].pubkey, pubkey);
    assertEquals(events[1].pubkey, pubkey);
  });
});

// ===== buildWith =====

Deno.test("EventBuilder.buildWith() - signs event with sync signer", async () => {
  const signer: EventSigner = {
    getPublicKey: () => "aabbcc",
    signEvent: (event) => ({
      id: "signed-id-" + event.kind,
      sig: "signed-sig-" + event.kind,
    }),
  };
  const event = await EventBuilder.kind1().content("signed").buildWith(signer);
  assertEquals(event.pubkey, "aabbcc");
  assertEquals(event.id, "signed-id-1");
  assertEquals(event.sig, "signed-sig-1");
  assertEquals(event.content, "signed");
  assertEquals(event.kind, 1);
});

Deno.test("EventBuilder.buildWith() - signs event with async signer", async () => {
  const signer: EventSigner = {
    getPublicKey: () => Promise.resolve("async-pk"),
    signEvent: (event) =>
      Promise.resolve({
        id: "async-id-" + event.content,
        sig: "async-sig",
      }),
  };
  const event = await EventBuilder.kind1().content("hello").buildWith(signer);
  assertEquals(event.pubkey, "async-pk");
  assertEquals(event.id, "async-id-hello");
  assertEquals(event.sig, "async-sig");
});

Deno.test("EventBuilder.buildWith() - overrides manually set pubkey", async () => {
  const signer: EventSigner = {
    getPublicKey: () => "signer-pubkey",
    signEvent: () => ({ id: "id1", sig: "sig1" }),
  };
  const event = await EventBuilder.kind1()
    .pubkey("manual-pubkey")
    .buildWith(signer);
  assertEquals(event.pubkey, "signer-pubkey");
});

// ===== corrupt created_at =====

Deno.test("EventBuilder.corrupt() - created_at: true sets created_at to -1", () => {
  const event = EventBuilder.kind1().corrupt({ created_at: true }).build();
  assertEquals(event.created_at, -1);
});

// ===== timeline with pubkey and kind =====

Deno.test("EventBuilder.timeline() - with pubkey and kind options", () => {
  const events = EventBuilder.timeline(3, { pubkey: "abc", kind: 7 });
  assertEquals(events.length, 3);
  for (const event of events) {
    assertEquals(event.pubkey, "abc");
    assertEquals(event.kind, 7);
  }
});

// ===== matchFilter with ids =====

Deno.test("EventBuilder.matchFilter() - ids prefix match", () => {
  const event = EventBuilder.matchFilter({ ids: ["abc123"] });
  assertEquals(event.id.startsWith("abc123"), true);
});

// ===== matchFilter with tag filters =====

Deno.test("EventBuilder.matchFilter() - tag filter #e contains eventid1", () => {
  const event = EventBuilder.matchFilter({ "#e": ["eventid1"] });
  const hasTag = event.tags.some((t) => t[0] === "e" && t[1] === "eventid1");
  assertEquals(hasTag, true);
});

// ===== matchFilter with search =====

Deno.test("EventBuilder.matchFilter() - search keyword in content", () => {
  const event = EventBuilder.matchFilter({ search: "keyword" });
  assertEquals(event.content.includes("keyword"), true);
});

// ===== repost with relayUrl =====

Deno.test("EventBuilder.repost() - relayUrl in e tag third element", () => {
  const target = EventBuilder.kind1().build();
  const event = EventBuilder.repost(target, "wss://relay.example.com").build();
  const eTag = event.tags.find((t) => t[0] === "e" && t[1] === target.id);
  assertNotEquals(eTag, undefined);
  assertEquals(eTag![2], "wss://relay.example.com");
});

// ===== longFormDraft with all options =====

Deno.test("EventBuilder.longFormDraft() - with all options sets all tags", () => {
  const event = EventBuilder.longFormDraft({
    identifier: "id",
    title: "t",
    content: "c",
    summary: "s",
    image: "i",
    publishedAt: 123,
    hashtags: ["nostr"],
  }).build();

  assertEquals(event.kind, 30024);
  assertEquals(event.tags.some((t) => t[0] === "d" && t[1] === "id"), true);
  assertEquals(event.tags.some((t) => t[0] === "title" && t[1] === "t"), true);
  assertEquals(
    event.tags.some((t) => t[0] === "summary" && t[1] === "s"),
    true,
  );
  assertEquals(event.tags.some((t) => t[0] === "image" && t[1] === "i"), true);
  assertEquals(
    event.tags.some((t) => t[0] === "published_at" && t[1] === "123"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "t" && t[1] === "nostr"),
    true,
  );
});

// ===== bookmarks with addresses and words =====

Deno.test("EventBuilder.bookmarks() - addresses and words tags included", () => {
  const event = EventBuilder.bookmarks({
    addresses: ["30023:pk:d"],
    words: ["bitcoin"],
  }).build();

  assertEquals(
    event.tags.some((t) => t[0] === "a" && t[1] === "30023:pk:d"),
    true,
  );
  assertEquals(
    event.tags.some((t) => t[0] === "word" && t[1] === "bitcoin"),
    true,
  );
});
