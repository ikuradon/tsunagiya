# CLAUDE.md - tsunagiya 開発ガイド

## プロジェクト概要

Nostrリレーのモックライブラリ。`globalThis.WebSocket`を差し替えて、既存クライアントコードを無変更でテスト可能にする。

## 技術スタック

- **ランタイム**: Deno (Node.js互換)
- **言語**: TypeScript (strict mode)
- **テスト**: Deno.test
- **パッケージ**: JSR (`@ikuradon/tsunagiya`)
- **外部依存**: なし

## コマンド

```bash
deno task test        # テスト実行
deno task check       # 型チェック + lint + format確認
deno task fmt         # フォーマット
deno publish --dry-run  # JSR公開プレビュー
```

## コーディング規約

- `export` は各ファイルで行い、`src/mod.ts` で re-export
- 型は `src/types.ts` に集約
- テストファイルは `tests/` に `*_test.ts` で配置
- エラーメッセージは英語
- JSDoc コメントは日本語可、公開APIには必須
- `any` 禁止、`unknown` を使う

## アーキテクチャ

1. **MockPool** — 全体管理。install/uninstallでWebSocket差し替え
2. **MockRelay** — URL単位の仮想リレー。ストア・ハンドラー・検証機能
3. **MockWebSocket** — WebSocket APIの模倣。MockRelayへルーティング
4. **filter.ts** — NIP-01フィルターマッチング（純粋関数）
5. **auth.ts** — NIP-42 AUTH チャレンジ/レスポンス

## テスト方針

- 各モジュールごとにユニットテスト
- `integration_test.ts` でエンドツーエンドシナリオ
- テスト内で必ず `pool.uninstall()` を呼ぶ（finally使用）
- 非同期テストでは適切にawait/タイムアウト管理

## NIP対応

- **NIP-01**: 完全実装（EVENT, REQ, CLOSE, EOSE, OK, NOTICE）
- **NIP-42**: AUTH チャレンジ/レスポンス
- **NIP-10**: e/p タグ（EventBuilderで対応）
- **NIP-29**: グループチャット（EventBuilderで対応）
- **NIP-30**: Emoji タグ（EventBuilderで対応）
- **NIP-52**: Geohash タグ（EventBuilderで対応）
- **NIP-57**: Zap Request（EventBuilderテンプレート）

## テスト支援ヘルパー (`src/testing/`)

- **EventBuilder**: テスト用イベント生成
  - 正常/壊れた/署名エラーのイベント
  - バルク生成（bulk, timeline）
  - リレーションシップ（thread, withReactions）
  - Common tags（geohash, e/p, emoji）
  - NIP別テンプレート（metadata, contacts, DM, zap等）
- **FilterBuilder**: よくあるフィルターパターン生成
- **リアルタイムシミュレート**: streamEvents, startStream
- **スナップショット**: relay.snapshot() / restore()
- **アサーションヘルパー**: assertReceivedREQ, assertEventPublished等

テスト支援ヘルパーは `@ikuradon/tsunagiya/testing` としてエクスポート。

## 実装の優先順位

1. **Phase 1: コア機能**
   - MockPool, MockRelay, MockWebSocket
   - NIP-01フィルターマッチング
   - 基本的な検証ヘルパー
2. **Phase 2: エラーシミュレート**
   - 不安定性（レイテンシ揺れ、切断、エラー率）
   - WebSocket 1006対応
   - AUTH (NIP-42)
3. **Phase 3: テスト支援ヘルパー**
   - EventBuilder（基本機能）
   - FilterBuilder
   - アサーションヘルパー
4. **Phase 4: 高度な機能**
   - リアルタイムシミュレート
   - スナップショット
   - NIP別テンプレート拡充

## 注意点

- `globalThis.WebSocket` の差し替えはテスト間で干渉しうるため、必ず復元すること
- フィルターマッチングは副作用なしの純粋関数として実装
- レイテンシ等の非決定的挙動はシード指定可能にしておくと再現性が上がる
- **署名検証は実装しない** —
  テスト用ライブラリとして、署名は文字列として扱う（実際の暗号処理は依存を増やすため避ける）
- EventBuilderの `.sign()` はモック署名（ランダム文字列）を生成

## エージェントチーム ワークフロー

機能開発は以下の5ロールで分担する。director
が設計判断と全体統括を担い、各ロールのチームメイトにタスクを割り当てる。エージェント定義は
`.claude/agents/` に配置。tmux モードで各エージェントが分割ペインで動作する。

### ロール定義

| ロール                         | 担当範囲                                           | 対象ファイル                                | モデル | permissionMode    |
| ------------------------------ | -------------------------------------------------- | ------------------------------------------- | ------ | ----------------- |
| **総括 (director)**            | 設計判断・タスク割り当て・進捗管理・最終判断       | なし（統括のみ）                            | opus   | bypassPermissions |
| **開発 (engineer)**            | src/ コード実装・修正・リファクタリング            | `src/**/*.ts`, `examples/**/*.ts`           | sonnet | bypassPermissions |
| **QA (qa-engineer)**           | テスト計画・テスト作成・品質検証・ドキュメント検証 | `tests/**/*.ts`（作成）、全ファイル（検証） | opus   | default           |
| **ドキュメント (tech-writer)** | ドキュメント作成・更新                             | `docs/**/*.md`, `README.md`                 | sonnet | bypassPermissions |
| **DevOps (devops-engineer)**   | CI/CD・E2Eテスト・マルチランタイム互換性・JSR公開  | `.github/**`, `tests/e2e/**`, `deno.json`   | sonnet | bypassPermissions |

### ワークフロー順序

```
director（設計判断・統括）
  ├─ 1. engineer        → src/ 実装                              ← 並列可
  ├─ 1. qa-engineer     → tests/ テスト作成 + コード品質検証     ← 並列可
  ├─ 2. tech-writer     → ドキュメント更新（engineer の変更に基づく）  ← 並列可
  ├─ 2. devops-engineer → E2Eテスト・CI/CD更新                        ← 並列可
  └─ 3. qa-engineer     → ドキュメント整合性検証
```

### 並列実行可能な組み合わせ

- `engineer` + `qa-engineer`（src/ と tests/ で分担）
- `engineer` + `tech-writer`（ファイル競合しない場合）
- `tech-writer` + `devops-engineer`（ファイル競合しない）

### 各ロールの完了条件

- **director**: 全チームメイトのタスクが完了し、最終確認済み
- **engineer**: `deno task check` と `deno task test` がパス
- **qa-engineer**:
  全テストパス、型チェック・lint・フォーマットクリーン、ドキュメントと公開APIに矛盾がない
- **tech-writer**: ドキュメントが実装と一致している
- **devops-engineer**: `deno task test:all` がパス、CI
  ワークフローが正しく構成されている
