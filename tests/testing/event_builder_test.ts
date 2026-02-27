import { assertEquals } from "@std/assert";
import { EventBuilder } from "../../src/testing/event_builder.ts";

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
    .tag("e", "event123", "wss://relay.com", "reply")
    .tag("p", "pubkey456")
    .build();

  assertEquals(event.tags.length, 2);
  assertEquals(event.tags[0], ["e", "event123", "wss://relay.com", "reply"]);
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
  });

  assertEquals(event.kind, 0);
  const profile = JSON.parse(event.content);
  assertEquals(profile.name, "Alice");
  assertEquals(profile.about, "Nostr user");
});

Deno.test("EventBuilder - contacts() creates kind:3 with p tags", () => {
  const event = EventBuilder.contacts(["pub1", "pub2", "pub3"]);
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
  });

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
  const event = EventBuilder.nip07Request();
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
