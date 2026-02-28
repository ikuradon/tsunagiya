---
outline: deep
---

# 使用例集

繋ぎ屋の実践的な使用例を紹介します。

## 目次

1. [基本的な REQ/EVENT テスト](#基本的な-reqevent-テスト)
2. [イベントの投稿テスト](#イベントの投稿テスト)
3. [複数リレーのテスト](#複数リレーのテスト)
4. [フィルターマッチングのテスト](#フィルターマッチングのテスト)
5. [カスタム REQ ハンドラー](#カスタム-req-ハンドラー)
6. [エラーハンドリングのテスト](#エラーハンドリングのテスト)
7. [NIP-42 AUTH 処理のテスト](#nip-42-auth-処理のテスト)
8. [大量イベントのテスト](#大量イベントのテスト)
9. [リアルタイムストリームのテスト](#リアルタイムストリームのテスト)
10. [スレッド・リアクションのテスト](#スレッドリアクションのテスト)
11. [不正データ・ログのテスト](#不正データログのテスト)
12. [スナップショットを使ったテスト](#スナップショットを使ったテスト)
13. [早期キャプチャライブラリへの対応](#早期キャプチャライブラリへの対応)

---

## 基本的な REQ/EVENT テスト

<!--@include: ../_shared/snippets/examples-basic.md-->

---

## カスタム REQ ハンドラー・エラーハンドリング・AUTH

<!--@include: ../_shared/snippets/examples-advanced.md-->

---

## ストリーム・スレッド・リアクション・スナップショット

<!--@include: ../_shared/snippets/examples-helpers.md-->

---

## 早期キャプチャライブラリへの対応

一部の Nostr クライアントライブラリ（NDK など）は、**モジュールのロード時に
`globalThis.WebSocket` への参照をキャプチャ**します。このため、通常の
`pool.install()` では MockWebSocket を使ってもらえないことがあります。

このような「早期キャプチャ」が起こるライブラリをテストするには、
**ブートストラップパターン**を使います。

### なぜ通常の方法では動かないのか

```typescript
// ❌ これは動かない（NDK はモジュールロード時に WebSocket を捕捉済み）
import NDK from "@nostr-dev-kit/ndk";

const pool = new MockPool();
pool.install();
// NDK はすでに実際の WebSocket を参照しているため、MockWebSocket を使わない
```

### ブートストラップパターン

`pool.install()` を先に行い、その後でライブラリを dynamic import することで、
ライブラリのモジュールロード時に MockWebSocket をキャプチャさせます。

<!--@include: ../_shared/snippets/ndk-bootstrap.md-->

### 実際のテストファイルでの適用

実際のプロジェクトでは、テストファイルのトップレベルでブートストラップを行い、
テスト関数内では通常の MockPool を使います。

```typescript
// test_file.ts

import { MockPool } from "@ikuradon/tsunagiya";

// ファイルのトップレベルでブートストラップ（一度だけ実行）
const _bootstrap = new MockPool();
_bootstrap.relay("wss://bootstrap");
_bootstrap.install();

// NDK を dynamic import（MockWebSocket を捕捉する）
const client = await import("./client.ts"); // NDK をインポートするモジュール

_bootstrap.uninstall();

// 各テストでは通常通り MockPool を使う
Deno.test("timeline を取得する", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.store(EventBuilder.kind1().content("hello").build());

  pool.install();
  try {
    const events = await client.timeline(["wss://relay.example.com"]);
    assertEquals(events.length, 1);
  } finally {
    pool.uninstall();
  }
});
```

> **注意:** ブートストラップは**テストファイルのトップレベルで一度だけ**
> 実行します。各テスト関数内で繰り返さないでください。

---

## 関連ドキュメント

- [API リファレンス](/reference/api) — 全 API の詳細
- [テストパターン](/guide/test-patterns) — テストパターン集
- [ベストプラクティス](/advanced/best-practices) —
  テスト設計のベストプラクティス
