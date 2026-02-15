/**
 * NostrClient E2Eテスト
 *
 * node:test + node:assert を使用し、Deno / Node.js / Bun で動作する。
 *
 * @example
 * ```bash
 * deno run -A tests/e2e/e2e_client_test.ts
 * npx tsx tests/e2e/e2e_client_test.ts
 * bun run tests/e2e/e2e_client_test.ts
 * ```
 *
 * @module
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MockPool } from "../../src/mod.ts";
import { NostrClient } from "../../examples/client/mod.ts";
import type { NostrEvent } from "../../src/types.ts";

let _testTimestamp = Math.floor(Date.now() / 1000);

/** テスト用イベントを生成する (created_at は呼び出し順に増加) */
function makeEvent(
  id: string,
  content: string,
  kind = 1,
  pubkey = "a".repeat(64),
): NostrEvent {
  return {
    id: id.padEnd(64, "0"),
    pubkey,
    created_at: _testTimestamp++,
    kind,
    tags: [],
    content,
    sig: "s".repeat(128),
  };
}

describe("NostrClient E2E", () => {
  it("connect and subscribe", async () => {
    const pool = new MockPool();
    const relay = pool.relay("wss://relay.test.com");

    const event1 = makeEvent("aaa1", "hello world");
    const event2 = makeEvent("bbb2", "second note");
    relay.store(event1);
    relay.store(event2);

    pool.install();
    try {
      const client = new NostrClient(["wss://relay.test.com"]);

      const received: NostrEvent[] = [];
      let eoseSubId = "";
      let eoseRelay = "";
      client.onEvent((ev) => received.push(ev));
      client.onEose((subId, r) => {
        eoseSubId = subId;
        eoseRelay = r;
      });

      await client.connect();
      const sub = client.subscribe([{ kinds: [1] }]);

      assert.equal(received.length, 2);
      assert.equal(received[0].content, "second note"); // sorted by created_at desc
      assert.equal(received[1].content, "hello world");
      assert.equal(eoseSubId, sub.id);
      assert.equal(eoseRelay, "wss://relay.test.com");

      client.disconnect();
    } finally {
      pool.uninstall();
    }
  });

  it("publish and receive OK", async () => {
    const pool = new MockPool();
    const relay = pool.relay("wss://relay.test.com");

    pool.install();
    try {
      const client = new NostrClient(["wss://relay.test.com"]);

      let okEventId = "";
      let okAccepted = false;
      client.onOk((eventId, accepted) => {
        okEventId = eventId;
        okAccepted = accepted;
      });

      await client.connect();
      const published = client.publishNote("test note", "b".repeat(64));

      assert.equal(okEventId, published.id);
      assert.equal(okAccepted, true);
      assert.equal(relay.hasEvent(published.id), true);

      client.disconnect();
    } finally {
      pool.uninstall();
    }
  });

  it("multi-relay", async () => {
    const pool = new MockPool();
    const relay1 = pool.relay("wss://relay1.test.com");
    const relay2 = pool.relay("wss://relay2.test.com");

    relay1.store(makeEvent("r1ev", "from relay1"));
    relay2.store(makeEvent("r2ev", "from relay2"));

    pool.install();
    try {
      const client = new NostrClient([
        "wss://relay1.test.com",
        "wss://relay2.test.com",
      ]);

      const received: Array<{ event: NostrEvent; relay: string }> = [];
      client.onEvent((ev, r) => received.push({ event: ev, relay: r }));

      await client.connect();
      client.subscribe([{ kinds: [1] }]);

      assert.equal(received.length, 2);

      const relays = received.map((r) => r.relay).sort();
      assert.deepEqual(relays, [
        "wss://relay1.test.com",
        "wss://relay2.test.com",
      ]);

      const contents = received.map((r) => r.event.content).sort();
      assert.deepEqual(contents, ["from relay1", "from relay2"]);

      client.disconnect();
    } finally {
      pool.uninstall();
    }
  });

  it("publish then retrieve", async () => {
    const pool = new MockPool();
    pool.relay("wss://relay.test.com");

    pool.install();
    try {
      const client = new NostrClient(["wss://relay.test.com"]);
      await client.connect();

      const published = client.publishNote("find me", "c".repeat(64));

      const received: NostrEvent[] = [];
      client.onEvent((ev) => received.push(ev));
      client.subscribe([{ ids: [published.id] }]);

      assert.equal(received.length, 1);
      assert.equal(received[0].id, published.id);
      assert.equal(received[0].content, "find me");

      client.disconnect();
    } finally {
      pool.uninstall();
    }
  });

  it("close subscription", async () => {
    const pool = new MockPool();
    const relay = pool.relay("wss://relay.test.com");

    pool.install();
    try {
      const client = new NostrClient(["wss://relay.test.com"]);
      await client.connect();

      const sub = client.subscribe([{ kinds: [1] }], "test-sub");
      sub.close();

      const found = relay.findCLOSE("test-sub");
      assert.ok(found);
      assert.deepEqual(found, ["CLOSE", "test-sub"]);

      client.disconnect();
    } finally {
      pool.uninstall();
    }
  });

  it("relay disconnect", async () => {
    const pool = new MockPool();
    const relay = pool.relay("wss://relay.test.com");

    pool.install();
    try {
      const client = new NostrClient(["wss://relay.test.com"]);

      let errorFired = false;
      let errorMsg = "";
      client.onError((msg) => {
        errorFired = true;
        errorMsg = msg;
      });

      await client.connect();
      assert.equal(
        client.relayStatuses.get("wss://relay.test.com"),
        "open",
      );

      relay.disconnect();

      assert.equal(errorFired, true);
      assert.ok(errorMsg.length > 0);
      assert.equal(
        client.relayStatuses.get("wss://relay.test.com"),
        "error",
      );

      client.disconnect();
    } finally {
      pool.uninstall();
    }
  });

  it("NOTICE handling", async () => {
    const pool = new MockPool();
    const relay = pool.relay("wss://relay.test.com");

    pool.install();
    try {
      const client = new NostrClient(["wss://relay.test.com"]);

      let noticeMsg = "";
      let noticeRelay = "";
      client.onNotice((msg, r) => {
        noticeMsg = msg;
        noticeRelay = r;
      });

      await client.connect();
      relay.sendNotice("rate limit exceeded");

      assert.equal(noticeMsg, "rate limit exceeded");
      assert.equal(noticeRelay, "wss://relay.test.com");

      client.disconnect();
    } finally {
      pool.uninstall();
    }
  });

  it("connection failure", async () => {
    const pool = new MockPool();
    // wss://unregistered.test.com は登録しない
    pool.install();
    try {
      const client = new NostrClient(["wss://unregistered.test.com"], {
        timeout: 1000,
      });

      await assert.rejects(
        () => client.connect(),
        (err: Error) => {
          assert.match(err.message, /failed/);
          return true;
        },
      );
    } finally {
      pool.uninstall();
    }
  });
});
