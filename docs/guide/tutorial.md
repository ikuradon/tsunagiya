---
outline: deep
---

# チュートリアル

繋ぎ屋を使って Nostr
クライアントのテストを書く方法を、ステップバイステップで解説します。

## 前提条件

- Deno がインストール済み
- Nostr プロトコルの基本（EVENT, REQ, CLOSE）を理解している

## セットアップ

<!--@include: ../_shared/snippets/install.md-->

---

## ステップ 1: 最初のテストを作成する

### 基本的な流れ

繋ぎ屋のテストは以下の3ステップで構成されます：

1. **MockPool を作成し、リレーを登録する**
2. **`pool.install()` で WebSocket を差し替える**
3. **テスト対象コードを実行し、`pool.uninstall()` で復元する**

### ポイント

- `pool.install()` と `pool.uninstall()` は必ず `try/finally` で囲む
- `relay.store()` で事前にテストデータを登録しておく
- REQ を送信すると、フィルターにマッチするイベントが自動的に返される
- マッチング後に EOSE（End of Stored Events）が送信される

---

## ステップ 2: 複数リレーのテスト

実際の Nostr
クライアントは複数のリレーに接続します。繋ぎ屋はこれを簡単にテストできます。

### ポイント

- `pool.relay()` を URL ごとに呼び出す
- 各リレーは独立して動作する
- 未登録 URL に接続すると、接続失敗（code: 1006）として扱われる

---

## ステップ 3: 不安定リレーのシミュレート

実際のリレーはネットワーク遅延やエラーが発生します。繋ぎ屋でこれをシミュレートできます。

### MockRelayOptions 一覧

<!--@include: ../_shared/tables/mockrelay-options.md-->

---

## ステップ 4: EventBuilder の活用

テストデータを手書きするのは面倒です。EventBuilder を使えば簡潔に書けます。

---

## ステップ 5: 検証ヘルパーの使い方

テスト対象のクライアントが正しいメッセージを送信したか検証します。

---

## コード例

<!--@include: ../_shared/snippets/tutorial-steps.md-->

---

## 次のステップ

- [使用例集](/guide/examples) — 実践的な使用例集
- [テストパターン](/guide/test-patterns) — よくあるテストシナリオ
- [API リファレンス](/reference/api) — 全 API の詳細リファレンス
- [ベストプラクティス](/advanced/best-practices) —
  テスト設計のベストプラクティス
