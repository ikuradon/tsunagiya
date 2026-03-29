/**
 * search.ts のユニットテスト
 */

import { assertEquals } from "@std/assert";
import {
  normalizeSearchText,
  tokenizeSearchText,
} from "../../src/internal/search.ts";

// --- normalizeSearchText ---

Deno.test("normalizeSearchText: 大文字を小文字に変換する", () => {
  assertEquals(normalizeSearchText("Hello World"), "hello world");
});

Deno.test("normalizeSearchText: NFKC 正規化を行う", () => {
  // 全角英数字 → 半角
  assertEquals(normalizeSearchText("Ｈｅｌｌｏ"), "hello");
});

Deno.test("normalizeSearchText: 区切り文字をスペースに変換する", () => {
  assertEquals(normalizeSearchText("hello-world"), "hello world");
});

Deno.test("normalizeSearchText: 複数の区切り文字を1スペースに変換する", () => {
  assertEquals(normalizeSearchText("hello---world"), "hello world");
});

Deno.test("normalizeSearchText: 前後の空白をトリムする", () => {
  assertEquals(normalizeSearchText("  hello world  "), "hello world");
});

Deno.test("normalizeSearchText: 連続したスペースを1スペースに変換する", () => {
  assertEquals(normalizeSearchText("hello   world"), "hello world");
});

Deno.test("normalizeSearchText: 空文字列は空文字列を返す", () => {
  assertEquals(normalizeSearchText(""), "");
});

Deno.test("normalizeSearchText: スペースのみは空文字列を返す", () => {
  assertEquals(normalizeSearchText("   "), "");
});

Deno.test("normalizeSearchText: 日本語テキストはそのまま（文字は保持）", () => {
  const result = normalizeSearchText("こんにちは世界");
  assertEquals(result, "こんにちは世界");
});

Deno.test("normalizeSearchText: 混在テキストを正規化する", () => {
  const result = normalizeSearchText("Hello　World"); // 全角スペース
  assertEquals(result, "hello world");
});

Deno.test("normalizeSearchText: アンダースコアは区切り文字として処理される", () => {
  assertEquals(normalizeSearchText("hello_world"), "hello world");
});

Deno.test("normalizeSearchText: 記号は区切り文字として処理される", () => {
  assertEquals(normalizeSearchText("foo.bar"), "foo bar");
});

// --- tokenizeSearchText ---

Deno.test("tokenizeSearchText: スペース区切りでトークン化する", () => {
  assertEquals(tokenizeSearchText("hello world"), ["hello", "world"]);
});

Deno.test("tokenizeSearchText: 重複トークンを除去する", () => {
  const tokens = tokenizeSearchText("hello world hello");
  // Set で重複除去されるため、hello は1つだけ
  assertEquals(tokens.includes("hello"), true);
  assertEquals(tokens.includes("world"), true);
  assertEquals(tokens.filter((t) => t === "hello").length, 1);
});

Deno.test("tokenizeSearchText: 空文字列は空配列を返す", () => {
  assertEquals(tokenizeSearchText(""), []);
});

Deno.test("tokenizeSearchText: スペースのみは空配列を返す", () => {
  assertEquals(tokenizeSearchText("   "), []);
});

Deno.test("tokenizeSearchText: 単一トークンを配列で返す", () => {
  assertEquals(tokenizeSearchText("hello"), ["hello"]);
});

Deno.test("tokenizeSearchText: 大文字を小文字に変換してトークン化する", () => {
  const tokens = tokenizeSearchText("Hello World");
  assertEquals(tokens.includes("hello"), true);
  assertEquals(tokens.includes("world"), true);
});

Deno.test("tokenizeSearchText: 区切り文字でトークン化する", () => {
  const tokens = tokenizeSearchText("foo-bar");
  assertEquals(tokens.includes("foo"), true);
  assertEquals(tokens.includes("bar"), true);
});

Deno.test("tokenizeSearchText: 重複なしの場合は全トークンを返す", () => {
  const tokens = tokenizeSearchText("apple banana cherry");
  assertEquals(tokens.length, 3);
  assertEquals(tokens.includes("apple"), true);
  assertEquals(tokens.includes("banana"), true);
  assertEquals(tokens.includes("cherry"), true);
});
