/**
 * Node.js 22 向け CloseEvent ポリフィル。
 * CloseEvent がグローバルに存在しない場合のみ定義する。
 * @module
 */

if (typeof globalThis.CloseEvent === "undefined") {
  class CloseEventPolyfill extends Event {
    readonly code: number;
    readonly reason: string;
    readonly wasClean: boolean;

    constructor(
      type: string,
      init?: { code?: number; reason?: string; wasClean?: boolean },
    ) {
      super(type);
      this.code = init?.code ?? 0;
      this.reason = init?.reason ?? "";
      this.wasClean = init?.wasClean ?? false;
    }
  }
  (globalThis as unknown as Record<string, unknown>).CloseEvent =
    CloseEventPolyfill;
}
