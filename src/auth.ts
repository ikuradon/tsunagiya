/**
 * NIP-42 AUTH 互換エクスポート
 *
 * 公開 API の互換性のために `AuthState` と `generateChallenge` を再エクスポートする。
 *
 * @module
 */

import { AuthService, generateChallenge } from "./relay/auth_service.ts";

/**
 * 接続ごとのAUTH状態を管理する
 *
 * 互換性維持のための公開クラス。実装本体は `AuthService` に委譲される。
 */
export class AuthState extends AuthService {}

export { generateChallenge };
