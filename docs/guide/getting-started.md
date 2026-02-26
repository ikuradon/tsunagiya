---
outline: deep
---

# はじめに

繋ぎ屋 (tsunagiya) は Nostr リレーのモックライブラリです。`globalThis.WebSocket`
を差し替えることで、**既存の Nostr
クライアントコードを一切変更せず**にテストできます。

## インストール

<!--@include: ../_shared/snippets/install.md-->

## 基本的な使い方

<!--@include: ../_shared/snippets/basic-usage.md-->

## 機能

- WebSocket 完全乗っ取り型モック
- 複数リレー同時対応
- NIP-01 フィルター自動マッチング + カスタムハンドラー
- 不安定リレーのシミュレート（レイテンシ、エラー率、切断）
- NIP-42 AUTH チャレンジ/レスポンス
- 送信メッセージの記録・検証ヘルパー
- NIP-16 イベント種別自動処理（Regular/Replaceable/Ephemeral）
- NIP-33 Parameterized Replaceable Events
- NIP-09 Event Deletion Request
- NIP-45 COUNT メッセージ対応
- NIP-50 検索フィルター対応
- テスト支援ヘルパー（EventBuilder, FilterBuilder, assertions）
- リアルタイムストリーム・スナップショット
- ログ機能（console / カスタムハンドラー）
- テストフレームワーク非依存
- 外部依存ゼロ
- E2Eテスト対応（nostr-tools, NDK, rx-nostr, nostr-fetch）

## MockPool

テストのエントリポイント。複数の `MockRelay` を管理し、`globalThis.WebSocket`
を差し替えます。

<!--@include: ../_shared/tables/api-mockpool.md-->

<!--@include: ../_shared/snippets/mockpool-usage.md-->

> **注意:** `pool.relay()` で登録していない URL
> に接続しようとすると、接続失敗として扱われます（エラーイベント +
> クローズイベント
> code:1006）。これは実際のリレーに接続できなかった場合と同じ動作です。

## MockRelay

URL 単位で動作する仮想リレー。

### プロパティ

<!--@include: ../_shared/tables/api-mockrelay-props.md-->

### 使い方

<!--@include: ../_shared/snippets/mockrelay-usage.md-->

## テスト支援ヘルパー

`@ikuradon/tsunagiya/testing` からインポートします。

<!--@include: ../_shared/snippets/testing-helpers.md-->

## 対応 NIP

<!--@include: ../_shared/tables/nip-support.md-->

## E2Eテスト対応

繋ぎ屋は以下の主要 Nostr クライアントライブラリとの互換性を E2E
テストで検証しています。

| ライブラリ  | テストコマンド                  | 検証内容                                            |
| ----------- | ------------------------------- | --------------------------------------------------- |
| nostr-tools | `deno task example:nostr-tools` | SimplePool での REQ/EVENT 処理                      |
| NDK         | `deno task example:ndk`         | NDK インスタンス経由のイベント取得・投稿            |
| rx-nostr    | `deno task example:rx-nostr`    | RxNostr の Reactive API（createRxNostr / use）      |
| nostr-fetch | `deno task example:nostr-fetch` | NostrFetcher によるイベント取得（fetch / iterator） |

```bash
deno task example             # 全 E2E テスト実行
deno task test:all            # ユニットテスト + E2E テスト
```

## 次のステップ

- [チュートリアル](/guide/tutorial) — ステップバイステップガイド
- [使用例集](/guide/examples) — 実践的な使用例（14例）
- [API リファレンス](/reference/api) — 全 API の詳細
