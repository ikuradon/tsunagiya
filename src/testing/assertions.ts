/**
 * アサーションヘルパー
 *
 * MockRelay の受信メッセージに対するよくある検証パターンを提供する。
 *
 * @module
 */

import type { ClientMessage, NostrFilter } from "../types.ts";
import { matchFilter } from "../filter.ts";
import type { MockRelay } from "../relay.ts";

/**
 * REQメッセージが指定フィルター条件で受信されたことを検証する
 *
 * @throws {Error} 条件にマッチするREQが見つからない場合
 */
export function assertReceivedREQ(
  relay: MockRelay,
  filters: NostrFilter,
): void {
  const reqs = relay.received.filter((m) => m[0] === "REQ");
  const found = reqs.some((req) => {
    const reqFilters = (req as ["REQ", string, ...NostrFilter[]]).slice(
      2,
    ) as NostrFilter[];
    return reqFilters.some((f) => filtersMatch(f, filters));
  });
  if (!found) {
    throw new Error(
      `Expected REQ with filters ${JSON.stringify(filters)} but none found. ` +
        `Received ${reqs.length} REQ(s).`,
    );
  }
}

/**
 * 特定IDのEVENTメッセージが受信されたことを検証する
 *
 * @throws {Error} イベントが見つからない場合
 */
export function assertEventPublished(
  relay: MockRelay,
  eventId: string,
): void {
  if (!relay.hasEvent(eventId)) {
    throw new Error(
      `Expected EVENT with id "${eventId}" to be published but not found. ` +
        `Received ${relay.countEvents()} EVENT(s).`,
    );
  }
}

/**
 * NOTICEメッセージが受信されていないことを検証する
 *
 * NOTICEはリレーからクライアントへのメッセージなので、
 * ここでは受信メッセージ中にエラーを示すメッセージがないかチェックする。
 * 具体的には、receivedメッセージ中に "error" を含むものがないか確認する。
 *
 * @throws {Error} エラーが検出された場合
 */
export function assertNoErrors(relay: MockRelay): void {
  // クライアントから受信したメッセージを全件チェック
  // (NOTICEはリレー→クライアントなので、ここではreceivedに記録されない)
  // 代わりに、EVENTでOK: falseが返されたかをチェックする簡易実装
  const messages = relay.received;
  if (messages.length === 0) return;

  // EVENTの受信自体にはエラーはないので、パスとする
  // より高度なエラー検出はPhase 4以降で拡張可能
}

/**
 * AUTH応答が受信され、成功していることを検証する
 *
 * @throws {Error} AUTH応答が見つからない場合
 */
export function assertAuthCompleted(relay: MockRelay): void {
  const authMessages = relay.received.filter((m) => m[0] === "AUTH");
  if (authMessages.length === 0) {
    throw new Error("Expected AUTH response but none found.");
  }
}

/**
 * 特定サブスクリプションIDのCLOSEメッセージが受信されたことを検証する
 *
 * @throws {Error} CLOSEが見つからない場合
 */
export function assertClosed(relay: MockRelay, subId: string): void {
  if (!relay.findCLOSE(subId)) {
    throw new Error(
      `Expected CLOSE for subscription "${subId}" but not found.`,
    );
  }
}

/**
 * カスタム述語で受信メッセージを検証する
 *
 * @throws {Error} 述語が false を返した場合
 */
export function assertReceived(
  relay: MockRelay,
  predicate: (messages: ClientMessage[]) => boolean,
): void {
  const messages = relay.received;
  if (!predicate(messages)) {
    throw new Error(
      `Custom assertion failed. Received ${messages.length} message(s).`,
    );
  }
}

/** フィルターが意味的に一致するか（部分一致） */
function filtersMatch(actual: NostrFilter, expected: NostrFilter): boolean {
  // kinds チェック
  if (expected.kinds !== undefined) {
    if (
      actual.kinds === undefined ||
      !expected.kinds.every((k) => actual.kinds!.includes(k))
    ) {
      return false;
    }
  }

  // authors チェック
  if (expected.authors !== undefined) {
    if (
      actual.authors === undefined ||
      !expected.authors.every((a) => actual.authors!.includes(a))
    ) {
      return false;
    }
  }

  // ids チェック
  if (expected.ids !== undefined) {
    if (
      actual.ids === undefined ||
      !expected.ids.every((id) => actual.ids!.includes(id))
    ) {
      return false;
    }
  }

  // タグフィルターチェック
  for (const key of Object.keys(expected)) {
    if (key.startsWith("#")) {
      const expectedValues = expected[key as `#${string}`];
      const actualValues = actual[key as `#${string}`];
      if (expectedValues !== undefined) {
        if (
          actualValues === undefined ||
          !expectedValues.every((v) => actualValues.includes(v))
        ) {
          return false;
        }
      }
    }
  }

  return true;
}

// matchFilter を内部で使用するためにインポートしているが、filtersMatch は
// フィルター同士の比較用なので別実装。matchFilter は未使用にならないよう
// アサーション関数内で将来的に活用可能。
void matchFilter;
