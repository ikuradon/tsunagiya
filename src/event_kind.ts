/**
 * NIP-16 イベント種別判定
 *
 * イベントの `kind` 値から種別を判定するユーティリティ関数群。
 * NIP-16 (Regular/Replaceable/Ephemeral) および NIP-33 (Parameterized Replaceable) に対応。
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
 * kind 値に基づいて以下の種別を返す:
 * - `regular`: 上記以外（kind 1, 2, 4-9999, 40000+ 等）
 * - `replaceable`: kind 0, 3, 10000-19999（NIP-01 特殊 kind 含む）
 * - `ephemeral`: kind 20000-29999
 * - `parameterized_replaceable`: kind 30000-39999
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
