/**
 * runtime.ts のユニットテスト
 */

import { assertEquals } from "@std/assert";
import {
  systemClock,
  systemRandomSource,
  wallClockNow,
} from "../../src/internal/runtime.ts";

// --- wallClockNow ---

Deno.test("wallClockNow: Date.now() の呼び出し前後の範囲内の数値を返す", () => {
  const before = Date.now();
  const result = wallClockNow();
  const after = Date.now();

  assertEquals(typeof result, "number");
  assertEquals(result >= before, true);
  assertEquals(result <= after, true);
});

Deno.test("wallClockNow: 正の数値を返す", () => {
  const result = wallClockNow();
  assertEquals(result > 0, true);
});

// --- systemClock ---

Deno.test("systemClock.now: 正の数値を返す", () => {
  const result = systemClock.now();
  assertEquals(typeof result, "number");
  assertEquals(result > 0, true);
});

Deno.test("systemClock.now: Date.now() の呼び出し前後の範囲内の値を返す", () => {
  const before = Date.now();
  const result = systemClock.now();
  const after = Date.now();

  assertEquals(result >= before, true);
  assertEquals(result <= after, true);
});

Deno.test("systemClock.now: 連続した呼び出しで単調増加または同値", () => {
  const first = systemClock.now();
  const second = systemClock.now();
  assertEquals(second >= first, true);
});

// --- systemRandomSource ---

Deno.test("systemRandomSource.next: [0, 1) の範囲の数値を返す", () => {
  for (let i = 0; i < 100; i++) {
    const result = systemRandomSource.next();
    assertEquals(typeof result, "number");
    assertEquals(result >= 0, true);
    assertEquals(result < 1, true);
  }
});

Deno.test("systemRandomSource.fill: Uint8Array にランダムなバイトを埋める", () => {
  const bytes = new Uint8Array(32);
  systemRandomSource.fill(bytes);

  // 全てゼロではないこと（32バイトが全てゼロになる確率は天文学的に低い）
  const allZero = bytes.every((b) => b === 0);
  assertEquals(allZero, false);
});

Deno.test("systemRandomSource.fill: 指定サイズの配列を埋める", () => {
  const bytes = new Uint8Array(16);
  systemRandomSource.fill(bytes);
  assertEquals(bytes.length, 16);
});

Deno.test("systemRandomSource.fill: 同じ配列に2回呼ぶと異なる値になる（高確率）", () => {
  const bytes1 = new Uint8Array(32);
  const bytes2 = new Uint8Array(32);
  systemRandomSource.fill(bytes1);
  systemRandomSource.fill(bytes2);

  // 32バイトが全て同じになる確率は無視できるほど低い
  const allSame = bytes1.every((b, i) => b === bytes2[i]);
  assertEquals(allSame, false);
});

Deno.test("systemRandomSource.fill: 空配列でもエラーにならない", () => {
  const bytes = new Uint8Array(0);
  systemRandomSource.fill(bytes);
  assertEquals(bytes.length, 0);
});
