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
deno task test              # ユニットテスト実行
deno task test:all          # 全テスト実行（ユニット + E2E）
deno task check             # 型チェック + lint + format確認
deno task fmt               # フォーマット
deno task coverage          # テストカバレッジ測定
deno task coverage:report   # カバレッジレポート (LCOV)
deno publish --dry-run      # JSR公開プレビュー
deno task docs:build        # VitePress ドキュメントビルド
deno task docs:dev          # ドキュメント開発サーバー
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
├── relay_error_test.ts
├── websocket_test.ts
├── filter_test.ts
├── auth_test.ts
├── event_kind_test.ts
├── logger_test.ts
├── nip09_test.ts
├── nip11_test.ts
├── nip16_test.ts
├── nip33_test.ts
├── nip45_test.ts
├── nip50_test.ts
├── nip_combined_integration_test.ts
├── integration_test.ts
├── stream_snapshot_integration_test.ts
├── performance_test.ts
└── testing/
    ├── event_builder_test.ts
    ├── filter_builder_test.ts
    ├── assertions_test.ts
    ├── stream_test.ts
    ├── snapshot_test.ts
    ├── nip17_test.ts
    └── nip51_test.ts

examples/                  # E2E テスト兼ユーザー向け使用例
├── _compat/               # クロスランタイム互換レイヤー
├── basic/                 # raw WebSocket サンプル
├── nostr-tools/           # nostr-tools 統合テスト
├── ndk/                   # NDK 統合テスト
├── rx-nostr/              # rx-nostr 統合テスト
└── nostr-fetch/           # nostr-fetch 統合テスト
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
  chatMessage/seal/giftWrap/dmRelayList/privateDM）
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
- **NIP-40**: Expiration Timestamp（EventBuilder withExpiration）
- **NIP-57**: Lightning Zaps（EventBuilderテンプレート）
- **NIP-65**: Relay List Metadata（EventBuilder relayList / FilterBuilder
  relayList）

## テスト支援ヘルパー (`src/testing/`)

- **EventBuilder**: テスト用イベント生成
  - 正常/壊れた/署名エラーのイベント
  - バルク生成（bulk, timeline）、シード指定で決定論的生成
  - クローン＋修正（from）、フィルターマッチ自動生成（matchFilter）
  - リレーションシップ（thread, withReactions）
  - Common tags（geohash, e/p, emoji, expiration）
  - NIP別テンプレート（metadata, contacts, DM, zap, repost, longForm, lists,
    chatMessage, privateDM 等）
- **FilterBuilder**:
  よくあるフィルターパターン生成（NIP-17/18/23/25/51/52/65対応）+
  汎用メソッド（author, kind, since, tagged, combine）
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

## E2E テスト

`examples/` ディレクトリがユーザー向け使用例と E2E テストを兼ねる。
各クライアントライブラリ（nostr-tools, NDK, rx-nostr, nostr-fetch）の
`client.ts` が実装例、`client_test.ts` が MockPool を使ったテスト。 `_compat/`
のクロスランタイム互換レイヤーにより Deno/Node.js/Bun で実行可能。

- Deno: `deno task example` または `deno task example:<library>`
- Node.js: `npx tsx <library>/client_test.ts`（examples/ 内で `npm install` 後）
- Bun: `bun test <library>/client_test.ts`（examples/ 内で `bun install` 後）
- 全テスト（ユニット + E2E）: `deno task test:all`

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
`.claude/agents/` に配置。

### ロール定義

| ロール                         | 担当範囲                                           | 対象ファイル                                | モデル | permissionMode    |
| ------------------------------ | -------------------------------------------------- | ------------------------------------------- | ------ | ----------------- |
| **総括 (director)**            | 設計判断・タスク割り当て・進捗管理・最終判断       | なし（統括のみ）                            | opus   | bypassPermissions |
| **開発 (engineer)**            | src/ コード実装・修正・リファクタリング            | `src/**/*.ts`, `examples/**/*.ts`           | sonnet | bypassPermissions |
| **QA (qa-engineer)**           | テスト計画・テスト作成・品質検証・ドキュメント検証 | `tests/**/*.ts`（作成）、全ファイル（検証） | opus   | default           |
| **ドキュメント (tech-writer)** | ドキュメント作成・更新                             | `docs/**/*.md`, `README.md`                 | sonnet | bypassPermissions |
| **DevOps (devops-engineer)**   | CI/CD・E2Eテスト・マルチランタイム互換性・JSR公開  | `.github/**`, `examples/**`, `deno.json`    | sonnet | bypassPermissions |

### ワークフロー順序

```
director（設計判断・統括）
  ├─ 1. engineer        → src/ 実装                              ← 並列可
  ├─ 1. qa-engineer     → tests/ テスト作成 + コード品質検証     ← 並列可
  ├─ 2. tech-writer     → ドキュメント更新（engineer の変更に基づく）  ← 並列可
  ├─ 2. devops-engineer → E2Eテスト・CI/CD更新                        ← 並列可
  └─ 3. qa-engineer     → ドキュメント整合性検証
```

### 並列実行時の注意

- `engineer` + `qa-engineer`（src/ と tests/ で分担）— ファイル競合なし
- `engineer` + `tech-writer`（ファイル競合しない場合のみ）
- `tech-writer` + `devops-engineer`（ファイル競合しない）
- **`team_name` と `isolation: "worktree"` を同時に使わない** — `teammateMode`
  が worktree isolation を上書きする場合がある。
  チーム内エージェントはファイル分担で競合を防ぎ、worktree 隔離が必要な場合は
  `team_name` なしの独立 Task で起動する

### 各ロールの完了条件

- **director**: 全チームメイトのタスクが完了し、最終確認済み
- **engineer**: `deno task check` と `deno task test` がパス
- **qa-engineer**:
  全テストパス、型チェック・lint・フォーマットクリーン、ドキュメントと公開APIに矛盾がない
- **tech-writer**: ドキュメントが実装と一致している
- **devops-engineer**: `deno task test:all` がパス、CI
  ワークフローが正しく構成されている
