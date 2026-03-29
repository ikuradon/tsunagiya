/**
 * AUTH challenge issuance and validation.
 *
 * @module
 */

import type {
  AuthContext,
  AuthValidator,
  EventVerifier,
  NostrEvent,
  RandomSource,
  RelayMessage,
} from "../types.ts";
import { systemRandomSource } from "../internal/runtime.ts";
import {
  AUTH_REQUIRED_CHALLENGE_MISMATCH,
  AUTH_REQUIRED_INVALID_AUTH_EVENT_KIND,
  AUTH_REQUIRED_NO_CHALLENGE_ISSUED,
  AUTH_REQUIRED_RELAY_URL_MISMATCH,
  AUTH_REQUIRED_VALIDATION_FAILED,
  INVALID_BAD_SIGNATURE,
} from "./error_messages.ts";
import type { MockWebSocket } from "../websocket.ts";

const AUTH_EVENT_KIND = 22242;

/**
 * AUTHチャレンジ文字列を生成する
 *
 * @returns ランダムなチャレンジ文字列
 */
export function generateChallenge(
  random: RandomSource = systemRandomSource,
): string {
  const bytes = new Uint8Array(32);
  random.fill(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface AuthServiceOptions {
  random?: RandomSource;
}

/**
 * 接続ごとのAUTH状態を管理する
 */
export class AuthService {
  readonly #random: RandomSource;
  #validator: AuthValidator | null = null;
  #verifier: EventVerifier | null = null;
  #challenges: Map<MockWebSocket, string> = new Map();
  #authenticated: Set<MockWebSocket> = new Set();

  constructor(options: AuthServiceOptions = {}) {
    this.#random = options.random ?? systemRandomSource;
  }

  /**
   * AUTHバリデーターを設定する
   */
  setValidator(validator: AuthValidator): void {
    this.#validator = validator;
  }

  /**
   * AUTH用署名検証器を設定する
   */
  setVerifier(verifier: EventVerifier | null): void {
    this.#verifier = verifier;
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
    const challenge = generateChallenge(this.#random);
    this.#challenges.set(ws, challenge);
    return ["AUTH", challenge];
  }

  /**
   * 接続に未発行ならAUTHチャレンジを作成する
   *
   * @returns 新規に発行したAUTHメッセージ。既に発行済みなら null
   */
  issueChallengeIfMissing(ws: MockWebSocket): RelayMessage | null {
    if (this.#challenges.has(ws)) {
      return null;
    }
    return this.sendChallenge(ws);
  }

  /**
   * AUTH応答を検証する
   *
   * kind:22242 と challenge タグは常にチェックする。
   * AUTH verifier 設定時は署名を検証し、
   * カスタムバリデーター設定時はそれを呼び出す。
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
      return [false, AUTH_REQUIRED_NO_CHALLENGE_ISSUED];
    }

    if (authEvent.kind !== AUTH_EVENT_KIND) {
      return [false, AUTH_REQUIRED_INVALID_AUTH_EVENT_KIND];
    }

    const challengeTag = authEvent.tags.find(
      (tag) => tag[0] === "challenge" && tag[1] === challenge,
    );
    if (!challengeTag) {
      return [false, AUTH_REQUIRED_CHALLENGE_MISMATCH];
    }

    if (this.#verifier) {
      const valid = await this.#verifier.verifyEvent(authEvent);
      if (!valid) {
        return [false, INVALID_BAD_SIGNATURE];
      }
    }

    if (this.#validator) {
      const context: AuthContext = { relayUrl, challenge };
      const valid = await this.#validator(authEvent, context);
      if (!valid) {
        return [false, AUTH_REQUIRED_VALIDATION_FAILED];
      }
    } else {
      const relayTag = authEvent.tags.find(
        (tag) => tag[0] === "relay" && tag[1] === relayUrl,
      );
      if (!relayTag) {
        return [false, AUTH_REQUIRED_RELAY_URL_MISMATCH];
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
    this.#verifier = null;
    this.#challenges.clear();
    this.#authenticated.clear();
  }
}
