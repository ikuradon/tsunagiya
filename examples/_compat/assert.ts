/**
 * クロスランタイム互換アサーション。
 * Deno → @std/assert、Node.js/Bun → node:assert/strict にディスパッチ。
 * アサーション型（asserts）を保持し、型の絞り込みが正しく動作する。
 * @module
 */

/** アサーション関数群の型定義 */
interface Assertions {
  assert: (expr: unknown, msg?: string) => asserts expr;
  assertEquals: (actual: unknown, expected: unknown, msg?: string) => void;
  assertExists: <T>(
    actual: T,
    msg?: string,
  ) => asserts actual is NonNullable<T>;
  assertGreater: (actual: number, expected: number, msg?: string) => void;
}

async function loadDeno(): Promise<Assertions> {
  const mod = await import("@std/assert");
  return mod as unknown as Assertions;
}

async function loadNode(): Promise<Assertions> {
  // ok/deepStrictEqual の型からアサーション戻り値を除外し TS2775 を回避
  const nodeAssert = (await import("node:assert/strict")).default as {
    ok(value: unknown, message?: string | Error): void;
    deepStrictEqual(
      actual: unknown,
      expected: unknown,
      message?: string | Error,
    ): void;
  };

  return {
    assert(expr, msg?) {
      nodeAssert.ok(expr, msg);
    },
    assertEquals(actual, expected, msg?) {
      nodeAssert.deepStrictEqual(actual, expected, msg);
    },
    assertExists(actual, msg?) {
      nodeAssert.ok(
        actual !== null && actual !== undefined,
        msg ?? "Expected value to exist",
      );
    },
    assertGreater(actual, expected, msg?) {
      nodeAssert.ok(
        actual > expected,
        msg ?? `Expected ${actual} > ${expected}`,
      );
    },
  } as Assertions;
}

const _mod: Assertions = "Deno" in globalThis
  ? await loadDeno()
  : await loadNode();

export const assert: Assertions["assert"] = _mod.assert;
export const assertEquals: Assertions["assertEquals"] = _mod.assertEquals;
export const assertExists: Assertions["assertExists"] = _mod.assertExists;
export const assertGreater: Assertions["assertGreater"] = _mod.assertGreater;
