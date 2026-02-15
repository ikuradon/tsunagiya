/**
 * アサーションヘルパー
 *
 * MockRelay の受信メッセージに対するよくある検証パターンを提供する。
 *
 * @module
 */

import type { ClientMessage, NostrFilter } from "../types.ts";
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
 * エラーレスポンスが発生していないことを検証する
 *
 * MockRelay が送信したエラーレスポンス（OK:false、CLOSED、error NOTICE）を
 * チェックし、1件でもあれば失敗する。
 *
 * @throws {Error} エラーレスポンスが検出された場合
 */
export function assertNoErrors(relay: MockRelay): void {
  const errors = relay.errors;
  if (errors.length > 0) {
    throw new Error(
      `Expected no errors but found ${errors.length}: ${errors.join(", ")}`,
    );
  }
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
