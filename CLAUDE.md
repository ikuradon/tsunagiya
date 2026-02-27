# CLAUDE.md - 繋ぎ屋 開発ガイド

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
deno task test          # テスト実行
deno task check         # 型チェック + lint + format確認
deno task fmt           # フォーマット
deno publish --dry-run  # JSR公開プレビュー
deno task docs:build    # VitePress ドキュメントビルド
deno task docs:dev      # ドキュメント開発サーバー
```

## 開発ワークフロー

モジュール完成後は**必ずこの順序**で品質チェックを行う:

1. `deno task fmt` — コード自動整形（**必ず最初に実行**、formatエラー防止）
2. `deno task test` — テスト実行
3. `deno task check` — 品質確認（型チェック + lint + format確認）
4. エラーがあれば修正し、再度 `deno task fmt` から実行
5. 全チェックパス後に commit

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

### ディレクトリ構造

```
src/
├── mod.ts              # メインエントリポイント
├── pool.ts             # MockPool
├── relay.ts            # MockRelay
├── websocket.ts        # MockWebSocket
├── filter.ts           # フィルターマッチング
├── auth.ts             # NIP-42 AUTH
├── event_kind.ts       # イベント種別判定
├── types.ts            # 型定義
├── logger.ts           # ログ機能
└── testing/
    ├── mod.ts          # テスト支援エントリポイント
    ├── event_builder.ts
    ├── filter_builder.ts
    ├── assertions.ts
    ├── stream.ts
    └── snapshot.ts

tests/
├── pool_test.ts
├── relay_test.ts
├── websocket_test.ts
├── filter_test.ts
├── auth_test.ts
├── integration_test.ts
└── testing/
    ├── event_builder_test.ts
    ├── filter_builder_test.ts
    ├── assertions_test.ts
    ├── stream_test.ts
    └── snapshot_test.ts
```

## テスト方針

- 各モジュールごとにユニットテスト
- `integration_test.ts` でエンドツーエンドシナリオ
- テスト内で必ず `pool.uninstall()` を呼ぶ（finally使用）
- 非同期テストでは適切にawait/タイムアウト管理

## NIP対応

- **NIP-01**: 完全実装（EVENT, REQ, CLOSE, EOSE, OK, NOTICE + Event Treatment +
  Addressable Events）
  - 旧 NIP-16 (Event Treatment: Regular/Replaceable/Ephemeral) は NIP-01
    に統合済み
  - 旧 NIP-33 (Parameterized Replaceable → Addressable Events) は NIP-01
    に統合済み
- **NIP-04**: Encrypted DM（EventBuilderテンプレート）— deprecated、NIP-17 推奨
- **NIP-09**: Event Deletion（kind:5 削除リクエスト処理）
- **NIP-10**: e/p タグ（EventBuilderで対応）
- **NIP-11**: Relay Information Document（setInfo/getInfo + fetch
  インターセプト）
- **NIP-17**: Private Direct Messages（EventBuilder
  chatMessage/seal/giftWrap/dmRelayList）
- **NIP-18**: Reposts（EventBuilder repost/genericRepost）
- **NIP-23**: Long-form Content（EventBuilder longFormContent/longFormDraft）
- **NIP-25**: Reactions（EventBuilder withReactions[options] +
  externalReaction）
- **NIP-29**: Relay-based Groups（EventBuilderで対応）
- **NIP-30**: Custom Emoji タグ（EventBuilderで対応）
- **NIP-42**: AUTH チャレンジ/レスポンス
- **NIP-45**: COUNT メッセージ対応
- **NIP-50**: Search フィルター対応（content 部分一致検索）
- **NIP-51**: Lists（EventBuilder
  muteList/pinList/bookmarks/followSet/relaySet/emojiSet）
- **NIP-52**: Calendar Events（EventBuilder テンプレート — 全4種対応:
  Date/Time/Collection/RSVP）
- **NIP-57**: Lightning Zaps（EventBuilderテンプレート）
- **NIP-65**: Relay List Metadata（EventBuilder relayList / FilterBuilder
  relayList）

## テスト支援ヘルパー (`src/testing/`)

- **EventBuilder**: テスト用イベント生成
  - 正常/壊れた/署名エラーのイベント
  - バルク生成（bulk, timeline）
  - リレーションシップ（thread, withReactions）
  - Common tags（geohash, e/p, emoji）
  - NIP別テンプレート（metadata, contacts, DM, zap, repost, longForm, lists,
    chatMessage等）
- **FilterBuilder**:
  よくあるフィルターパターン生成（NIP-17/18/23/25/51/52/65対応）
- **リアルタイムシミュレート**: streamEvents, startStream
- **スナップショット**: relay.snapshot() / restore()
- **アサーションヘルパー**: assertReceivedREQ, assertEventPublished等

テスト支援ヘルパーは `@ikuradon/tsunagiya/testing` としてエクスポート。

## ドキュメントサイト (`docs/`)

VitePress による日英バイリンガルドキュメント。GitHub Pages で公開。

- **公開URL**: https://ikuradon.github.io/tsunagiya/
- **構成**: `docs/` がVitePressプロジェクトルート
- **共有コンテンツ**: `docs/_shared/snippets/`, `docs/_shared/tables/`
  を日英ページから `<!--@include: -->` で参照
- **include パス**: ルート直下ページ（`guide/`, `reference/` 等）は
  `../_shared/`、`en/` 配下ページは `../../_shared/`
- **ランタイム**: Deno（`docs/deno.json` + `docs/package.json` で依存管理、
  `deno install` で `node_modules` 生成）
- **デプロイ**: `.github/workflows/deploy-docs.yml` で `docs/**`
  変更時に自動デプロイ

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

## E2E テスト

- Deno: `deno task test`（`-A` フラグで全パーミッション付与）
- Node.js 互換モード: `globalThis.WebSocket` の差し替えが前提のため、 WebSocket
  polyfill（`ws` パッケージ等）が必要
- Node.js 環境での E2E テストは `deno task test:node`（設定済みの場合）で実行

## 注意点

- `globalThis.WebSocket` の差し替えはテスト間で干渉しうるため、必ず復元すること
- フィルターマッチングは副作用なしの純粋関数として実装
- レイテンシ等の非決定的挙動はシード指定可能にしておくと再現性が上がる
- **署名検証は実装しない** —
  テスト用ライブラリとして、署名は文字列として扱う（実際の暗号処理は依存を増やすため避ける）
- EventBuilderの `.sign()` はモック署名（ランダム文字列）を生成
- **リリース時のバージョン更新**: git tag を作成する際は、`deno.json` の
  `version` フィールドも必ず同じバージョンに更新すること

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
