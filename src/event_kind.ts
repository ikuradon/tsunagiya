/**
 * NIP-01 イベント種別判定
 *
 * イベントの `kind` 値から種別を判定するユーティリティ関数群。
 * NIP-01 で定義される Regular/Replaceable/Ephemeral/Addressable に対応。
 *
 * （旧 NIP-16 Event Treatment および旧 NIP-33 Parameterized Replaceable は NIP-01 に統合済み）
 *
 * @module
 */

import type { NostrEvent } from "./types.ts";

/** イベント種別 */
export type EventKind =
  | "regular"
  | "replaceable"
  | "ephemeral"
  | "parameterized_replaceable";

/**
 * イベント種別を判定する
 *
 * NIP-01 の定義に基づいて以下の種別を返す:
 * - `replaceable`: kind 0, 3, 10000-19999
 * - `ephemeral`: kind 20000-29999
 * - `parameterized_replaceable`: kind 30000-39999
 * - `regular`: 上記以外（NIP-01 では 1, 2, 4-44, 1000-9999 と定義。
 *   本ライブラリでは未分類の kind（45-999, 40000+ 等）も
 *   regular として扱い、ストアに保存する）
 *
 * @param kind イベントのkind値
 * @returns イベント種別
 */
export function classifyEvent(kind: number): EventKind {
  // NIP-01: kind 0 (metadata), kind 3 (contacts) は replaceable
  if (kind === 0 || kind === 3) return "replaceable";
  if (kind >= 10000 && kind < 20000) return "replaceable";
  if (kind >= 20000 && kind < 30000) return "ephemeral";
  if (kind >= 30000 && kind < 40000) return "parameterized_replaceable";
  return "regular";
}

/**
 * Replaceable イベントかどうか判定する
 *
 * kind: 0, 3, 10000-19999 のイベントが対象。
 */
export function isReplaceable(kind: number): boolean {
  return kind === 0 || kind === 3 || (kind >= 10000 && kind < 20000);
}

/**
 * Ephemeral イベントかどうか判定する
 *
 * kind: 20000-29999 のイベントが対象。
 */
export function isEphemeral(kind: number): boolean {
  return kind >= 20000 && kind < 30000;
}

/**
 * Parameterized Replaceable イベントかどうか判定する
 *
 * kind: 30000-39999 のイベントが対象。
 */
export function isParameterizedReplaceable(kind: number): boolean {
  return kind >= 30000 && kind < 40000;
}

/**
 * Parameterized Replaceable イベントの識別キーを取得する
 *
 * kind:30000-39999 のイベントの場合、`kind:pubkey:d-tag-value` 形式の識別キーを返す。
 * それ以外のイベントの場合は `null` を返す。
 *
 * @param event Nostrイベント
 * @returns 識別キー文字列、または null
 */
export function getParameterizedId(event: NostrEvent): string | null {
  if (!isParameterizedReplaceable(event.kind)) return null;
  const dTag = event.tags.find((t) => t[0] === "d")?.[1] ?? "";
  return `${event.kind}:${event.pubkey}:${dTag}`;
}
