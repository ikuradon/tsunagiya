/**
 * クロスランタイム互換テストランナー。
 * Deno → Deno.test()、Node.js/Bun → node:test にディスパッチ。
 * sanitizeResources/sanitizeOps は Deno 以外では無視する。
 * @module
 */

import "./polyfill.ts";

/** テスト関数 */
type TestFn = () => void | Promise<void>;

/** Deno 互換テストオプション（Node.js/Bun では無視） */
interface TestOptions {
  sanitizeResources?: boolean;
  sanitizeOps?: boolean;
}

let _nodeTest:
  | ((name: string, fn: () => void | Promise<void>) => void)
  | undefined;

if (!("Deno" in globalThis)) {
  const mod = await import("node:test");
  _nodeTest = mod.test as typeof _nodeTest;

  // テスト完了後にプロセスを強制終了する。
  // NDK 等のライブラリがタイマーをリークし Node.js が終了しないケースへの対策。
  // process.exitCode は node:test が結果に基づき設定済み。
  if (typeof mod.after === "function") {
    mod.after(() => {
      // deno-lint-ignore no-process-global
      setTimeout(() => process.exit(), 500);
    });
  }
}

/** テストを登録する */
export function test(name: string, fn: TestFn): void;
export function test(name: string, options: TestOptions, fn: TestFn): void;
export function test(
  name: string,
  fnOrOptions: TestFn | TestOptions,
  fn?: TestFn,
): void {
  if ("Deno" in globalThis) {
    if (typeof fnOrOptions === "function") {
      Deno.test(name, fnOrOptions);
    } else {
      Deno.test({ name, fn: fn!, ...fnOrOptions });
    }
  } else {
    const testFn = typeof fnOrOptions === "function" ? fnOrOptions : fn!;
    _nodeTest!(name, testFn);
  }
}
