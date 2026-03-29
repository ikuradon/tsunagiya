/**
 * validation.ts のユニットテスト
 */

import { assertEquals } from "@std/assert";
import {
  isEventShape,
  isFilterShape,
  isRecord,
} from "../../src/internal/validation.ts";

// --- isRecord ---

Deno.test("isRecord: 通常のオブジェクトは true", () => {
  assertEquals(isRecord({ key: "value" }), true);
});

Deno.test("isRecord: 空のオブジェクトは true", () => {
  assertEquals(isRecord({}), true);
});

Deno.test("isRecord: null は false", () => {
  assertEquals(isRecord(null), false);
});

Deno.test("isRecord: 配列は false", () => {
  assertEquals(isRecord([1, 2, 3]), false);
});

Deno.test("isRecord: 空配列は false", () => {
  assertEquals(isRecord([]), false);
});

Deno.test("isRecord: 文字列は false", () => {
  assertEquals(isRecord("hello"), false);
});

Deno.test("isRecord: 数値は false", () => {
  assertEquals(isRecord(42), false);
});

Deno.test("isRecord: boolean は false", () => {
  assertEquals(isRecord(true), false);
});

Deno.test("isRecord: undefined は false", () => {
  assertEquals(isRecord(undefined), false);
});

// --- isFilterShape ---

Deno.test("isFilterShape: 有効なフィルターオブジェクトは true", () => {
  assertEquals(isFilterShape({ kinds: [1], limit: 10 }), true);
});

Deno.test("isFilterShape: 空のオブジェクトは true", () => {
  assertEquals(isFilterShape({}), true);
});

Deno.test("isFilterShape: null は false", () => {
  assertEquals(isFilterShape(null), false);
});

Deno.test("isFilterShape: 配列は false", () => {
  assertEquals(isFilterShape([]), false);
});

Deno.test("isFilterShape: 文字列は false", () => {
  assertEquals(isFilterShape("filter"), false);
});

Deno.test("isFilterShape: 数値は false", () => {
  assertEquals(isFilterShape(123), false);
});

// --- isEventShape ---

Deno.test("isEventShape: 有効なイベントは true", () => {
  const event = {
    id: "abc123",
    pubkey: "pubkey001",
    created_at: 1700000000,
    kind: 1,
    tags: [["e", "ref001"]],
    content: "hello",
    sig: "sig001",
  };
  assertEquals(isEventShape(event), true);
});

Deno.test("isEventShape: tags が空配列でも true", () => {
  const event = {
    id: "abc123",
    pubkey: "pubkey001",
    created_at: 1700000000,
    kind: 1,
    tags: [],
    content: "",
    sig: "sig001",
  };
  assertEquals(isEventShape(event), true);
});

Deno.test("isEventShape: null は false", () => {
  assertEquals(isEventShape(null), false);
});

Deno.test("isEventShape: 配列は false", () => {
  assertEquals(isEventShape([]), false);
});

Deno.test("isEventShape: id が欠落していれば false", () => {
  const event = {
    pubkey: "pubkey001",
    created_at: 1700000000,
    kind: 1,
    tags: [],
    content: "",
    sig: "sig001",
  };
  assertEquals(isEventShape(event), false);
});

Deno.test("isEventShape: pubkey が欠落していれば false", () => {
  const event = {
    id: "abc123",
    created_at: 1700000000,
    kind: 1,
    tags: [],
    content: "",
    sig: "sig001",
  };
  assertEquals(isEventShape(event), false);
});

Deno.test("isEventShape: created_at が欠落していれば false", () => {
  const event = {
    id: "abc123",
    pubkey: "pubkey001",
    kind: 1,
    tags: [],
    content: "",
    sig: "sig001",
  };
  assertEquals(isEventShape(event), false);
});

Deno.test("isEventShape: kind が欠落していれば false", () => {
  const event = {
    id: "abc123",
    pubkey: "pubkey001",
    created_at: 1700000000,
    tags: [],
    content: "",
    sig: "sig001",
  };
  assertEquals(isEventShape(event), false);
});

Deno.test("isEventShape: tags が欠落していれば false", () => {
  const event = {
    id: "abc123",
    pubkey: "pubkey001",
    created_at: 1700000000,
    kind: 1,
    content: "",
    sig: "sig001",
  };
  assertEquals(isEventShape(event), false);
});

Deno.test("isEventShape: content が欠落していれば false", () => {
  const event = {
    id: "abc123",
    pubkey: "pubkey001",
    created_at: 1700000000,
    kind: 1,
    tags: [],
    sig: "sig001",
  };
  assertEquals(isEventShape(event), false);
});

Deno.test("isEventShape: sig が欠落していれば false", () => {
  const event = {
    id: "abc123",
    pubkey: "pubkey001",
    created_at: 1700000000,
    kind: 1,
    tags: [],
    content: "",
  };
  assertEquals(isEventShape(event), false);
});

Deno.test("isEventShape: id が数値型なら false", () => {
  const event = {
    id: 123,
    pubkey: "pubkey001",
    created_at: 1700000000,
    kind: 1,
    tags: [],
    content: "",
    sig: "sig001",
  };
  assertEquals(isEventShape(event), false);
});

Deno.test("isEventShape: created_at が文字列型なら false", () => {
  const event = {
    id: "abc123",
    pubkey: "pubkey001",
    created_at: "1700000000",
    kind: 1,
    tags: [],
    content: "",
    sig: "sig001",
  };
  assertEquals(isEventShape(event), false);
});

Deno.test("isEventShape: kind が文字列型なら false", () => {
  const event = {
    id: "abc123",
    pubkey: "pubkey001",
    created_at: 1700000000,
    kind: "1",
    tags: [],
    content: "",
    sig: "sig001",
  };
  assertEquals(isEventShape(event), false);
});

Deno.test("isEventShape: tags が配列でなければ false", () => {
  const event = {
    id: "abc123",
    pubkey: "pubkey001",
    created_at: 1700000000,
    kind: 1,
    tags: "invalid",
    content: "",
    sig: "sig001",
  };
  assertEquals(isEventShape(event), false);
});

Deno.test("isEventShape: tags の要素が配列でなければ false", () => {
  const event = {
    id: "abc123",
    pubkey: "pubkey001",
    created_at: 1700000000,
    kind: 1,
    tags: ["not-an-array"],
    content: "",
    sig: "sig001",
  };
  assertEquals(isEventShape(event), false);
});

Deno.test("isEventShape: tags の要素が文字列以外を含むなら false", () => {
  const event = {
    id: "abc123",
    pubkey: "pubkey001",
    created_at: 1700000000,
    kind: 1,
    tags: [["e", 123]],
    content: "",
    sig: "sig001",
  };
  assertEquals(isEventShape(event), false);
});
