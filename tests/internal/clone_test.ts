/**
 * clone.ts のユニットテスト
 */

import { assertEquals, assertNotStrictEquals } from "@std/assert";
import {
  cloneClientMessage,
  cloneEvent,
  cloneFilter,
  cloneRelayInformation,
} from "../../src/internal/clone.ts";
import type {
  ClientMessage,
  NostrEvent,
  NostrFilter,
  RelayInformation,
} from "../../src/types.ts";

// テスト用のダミーイベント
function makeEvent(): NostrEvent {
  return {
    id: "abc123",
    pubkey: "pubkey001",
    created_at: 1700000000,
    kind: 1,
    tags: [
      ["e", "ref001"],
      ["p", "pubkey002"],
    ],
    content: "hello world",
    sig: "sig001",
  };
}

Deno.test("cloneEvent: ディープコピーを返す", () => {
  const original = makeEvent();
  const cloned = cloneEvent(original);

  assertEquals(cloned, original);
  assertNotStrictEquals(cloned, original);
});

Deno.test("cloneEvent: クローン変更が元を汚染しない", () => {
  const original = makeEvent();
  const cloned = cloneEvent(original);

  cloned.content = "modified";
  assertEquals(original.content, "hello world");
});

Deno.test("cloneEvent: tags が深くクローンされる（配列の配列）", () => {
  const original = makeEvent();
  const cloned = cloneEvent(original);

  // tags 配列自体が別オブジェクト
  assertNotStrictEquals(cloned.tags, original.tags);
  // 各タグも別オブジェクト
  assertNotStrictEquals(cloned.tags[0], original.tags[0]);
  assertNotStrictEquals(cloned.tags[1], original.tags[1]);
});

Deno.test("cloneEvent: タグの値が同じ", () => {
  const original = makeEvent();
  const cloned = cloneEvent(original);

  assertEquals(cloned.tags[0], ["e", "ref001"]);
  assertEquals(cloned.tags[1], ["p", "pubkey002"]);
});

Deno.test("cloneEvent: クローンのタグ変更が元を汚染しない", () => {
  const original = makeEvent();
  const cloned = cloneEvent(original);

  cloned.tags[0][1] = "modified-ref";
  assertEquals(original.tags[0][1], "ref001");
});

Deno.test("cloneFilter: ディープコピーを返す", () => {
  const filter: NostrFilter = {
    kinds: [1, 2],
    authors: ["pubkey001"],
    limit: 10,
  };
  const cloned = cloneFilter(filter);

  assertEquals(cloned, filter);
  assertNotStrictEquals(cloned, filter);
});

Deno.test("cloneFilter: クローン変更が元を汚染しない", () => {
  const filter: NostrFilter = { kinds: [1, 2], limit: 10 };
  const cloned = cloneFilter(filter);

  cloned.limit = 999;
  assertEquals(filter.limit, 10);
});

Deno.test("cloneFilter: 配列フィールドが深くクローンされる", () => {
  const filter: NostrFilter = { kinds: [1, 2] };
  const cloned = cloneFilter(filter);

  assertNotStrictEquals(cloned.kinds, filter.kinds);
  cloned.kinds!.push(3);
  assertEquals(filter.kinds, [1, 2]);
});

Deno.test("cloneClientMessage: EVENT メッセージをクローンする", () => {
  const event = makeEvent();
  const message: ClientMessage = ["EVENT", event];
  const cloned = cloneClientMessage(message);

  assertEquals(cloned[0], "EVENT");
  assertEquals(cloned[1], event);
  assertNotStrictEquals(cloned[1], event);
});

Deno.test("cloneClientMessage: REQ メッセージをクローンする", () => {
  const filter1: NostrFilter = { kinds: [1] };
  const filter2: NostrFilter = { authors: ["pubkey001"] };
  const message: ClientMessage = ["REQ", "sub1", filter1, filter2];
  const cloned = cloneClientMessage(message);

  assertEquals(cloned[0], "REQ");
  assertEquals(cloned[1], "sub1");
  assertEquals(cloned[2], filter1);
  assertNotStrictEquals(cloned[2], filter1);
  assertEquals(cloned[3], filter2);
  assertNotStrictEquals(cloned[3], filter2);
});

Deno.test("cloneClientMessage: COUNT メッセージをクローンする", () => {
  const filter: NostrFilter = { kinds: [1], limit: 5 };
  const message: ClientMessage = ["COUNT", "sub2", filter];
  const cloned = cloneClientMessage(message);

  assertEquals(cloned[0], "COUNT");
  assertEquals(cloned[1], "sub2");
  assertEquals(cloned[2], filter);
  assertNotStrictEquals(cloned[2], filter);
});

Deno.test("cloneClientMessage: CLOSE メッセージをクローンする", () => {
  const message: ClientMessage = ["CLOSE", "sub3"];
  const cloned = cloneClientMessage(message);

  assertEquals(cloned, ["CLOSE", "sub3"]);
  assertNotStrictEquals(cloned, message);
});

Deno.test("cloneRelayInformation: ディープコピーを返す", () => {
  const info: RelayInformation = {
    name: "Test Relay",
    description: "A test relay",
    supported_nips: [1, 11, 42],
    limitation: {
      max_message_length: 65536,
      max_subscriptions: 20,
    },
  };
  const cloned = cloneRelayInformation(info);

  assertEquals(cloned, info);
  assertNotStrictEquals(cloned, info);
});

Deno.test("cloneRelayInformation: ネストされたオブジェクトが深くクローンされる", () => {
  const info: RelayInformation = {
    name: "Test Relay",
    limitation: {
      max_message_length: 65536,
    },
  };
  const cloned = cloneRelayInformation(info);

  assertNotStrictEquals(cloned.limitation, info.limitation);
  cloned.limitation!.max_message_length = 1000;
  assertEquals(info.limitation!.max_message_length, 65536);
});

Deno.test("cloneRelayInformation: supported_nips 配列が深くクローンされる", () => {
  const info: RelayInformation = {
    name: "Test Relay",
    supported_nips: [1, 11, 42],
  };
  const cloned = cloneRelayInformation(info);

  assertNotStrictEquals(cloned.supported_nips, info.supported_nips);
  cloned.supported_nips!.push(99);
  assertEquals(info.supported_nips, [1, 11, 42]);
});
