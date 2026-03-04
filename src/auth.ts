/**
 * NIP-42 AUTH チャレンジ/レスポンス
 *
 * リレーがクライアントに認証を要求するための機能を提供する。
 *
 * @module
 */

import type {
  AuthContext,
  AuthValidator,
  NostrEvent,
  RelayMessage,
} from "./types.ts";
import type { MockWebSocket } from "./websocket.ts";

/**
 * AUTHチャレンジ文字列を生成する
 *
 * @returns ランダムなチャレンジ文字列
 */
export function generateChallenge(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 接続ごとのAUTH状態を管理する
 */
export class AuthState {
  #validator: AuthValidator | null = null;
  #challenges: Map<MockWebSocket, string> = new Map();
  #authenticated: Set<MockWebSocket> = new Set();

  /**
   * AUTHバリデーターを設定する
   */
  setValidator(validator: AuthValidator): void {
    this.#validator = validator;
  }

  /** バリデーターが設定されているか */
  get hasValidator(): boolean {
    return this.#validator !== null;
  }

  /**
   * 接続にAUTHチャレンジを送信する
   *
   * @returns チャレンジ文字列を含むAUTHメッセージ
   */
  sendChallenge(ws: MockWebSocket): RelayMessage {
    const challenge = generateChallenge();
    this.#challenges.set(ws, challenge);
    return ["AUTH", challenge];
  }

  /**
   * AUTH応答を検証する
   *
   * kind:22242 と challenge タグは常にチェックする。
   * カスタムバリデーター設定時はそれを呼び出し、
   * 未設定時は relay タグの URL 一致を標準チェックする。
   *
   * @returns [accepted, message] - 認証結果
   */
  async handleAuthResponse(
    ws: MockWebSocket,
    authEvent: NostrEvent,
    relayUrl: string,
  ): Promise<[boolean, string]> {
    const challenge = this.#challenges.get(ws);
    if (!challenge) {
      return [false, "auth-required: no challenge issued"];
    }

    // kind:22242 チェック
    if (authEvent.kind !== 22242) {
      return [false, "auth-required: invalid auth event kind"];
    }

    // challengeタグチェック
    const challengeTag = authEvent.tags.find(
      (t) => t[0] === "challenge" && t[1] === challenge,
    );
    if (!challengeTag) {
      return [false, "auth-required: challenge mismatch"];
    }

    if (this.#validator) {
      // カスタムバリデーター: 標準の relay 検証を置き換える
      const context: AuthContext = { relayUrl, challenge };
      const valid = await this.#validator(authEvent, context);
      if (!valid) {
        return [false, "auth-required: validation failed"];
      }
    } else {
      // 標準: relay タグの URL 一致を確認
      const relayTag = authEvent.tags.find(
        (t) => t[0] === "relay" && t[1] === relayUrl,
      );
      if (!relayTag) {
        return [false, "auth-required: relay URL mismatch"];
      }
    }

    this.#challenges.delete(ws);
    this.#authenticated.add(ws);
    return [true, ""];
  }

  /** 接続が認証済みか */
  isAuthenticated(ws: MockWebSocket): boolean {
    return this.#authenticated.has(ws);
  }

  /** 接続のAUTH状態をクリアする */
  removeConnection(ws: MockWebSocket): void {
    this.#challenges.delete(ws);
    this.#authenticated.delete(ws);
  }

  /** 全状態をリセットする */
  reset(): void {
    this.#validator = null;
    this.#challenges.clear();
    this.#authenticated.clear();
  }
}
