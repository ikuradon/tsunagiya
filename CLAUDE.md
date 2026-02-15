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

機能開発は以下の5ロールで分担する。リードが各ロールのチームメイトを生成し、タスクを割り当てる。

### ロール定義

| ロール                      | 担当範囲                          | 対象ファイル                                   |
| --------------------------- | --------------------------------- | ---------------------------------------------- |
| **設計 (architect)**        | 要件分析、API設計、影響範囲の特定 | なし（plan mode必須）                          |
| **開発 (developer)**        | src/ 以下の実装、テスト追加       | `src/**/*.ts`, `tests/**/*.ts`                 |
| **ドキュメント (docs)**     | ドキュメント作成・更新            | `docs/**/*.md`, `README.md`                    |
| **開発QA (dev-qa)**         | コードの品質検証、テスト実行      | `src/**/*.ts`, `tests/**/*.ts`（読み取り中心） |
| **ドキュメントQA (doc-qa)** | ドキュメントと実装の整合性検証    | `docs/**/*.md`, `src/**/*.ts`（読み取り中心）  |

### ワークフロー順序

```
1. architect  → 設計・計画を作成（plan mode）
2. developer  → 実装・テスト追加（architect の計画に基づく）
3. docs       → ドキュメント更新（developer の変更に基づく）
4. dev-qa     → テスト実行・コードレビュー
5. doc-qa     → ドキュメントと実装の整合性検証
```

### 並列実行可能な組み合わせ

- `developer` + `docs`（ファイル競合しない場合）
- `dev-qa` + `doc-qa`（両方とも読み取り中心）

### 各ロールの完了条件

- **architect**: 設計ドキュメントが承認された
- **developer**: `deno task check` と `deno test tests/` がパス
- **docs**: ドキュメントが実装と一致している
- **dev-qa**: 全テストパス、型チェック・lint・フォーマットクリーン
- **doc-qa**: ドキュメントと公開APIに矛盾がない
