---
outline: deep
---

# トラブルシューティング

繋ぎ屋でよくあるエラーと解決方法です。

---

## テストがタイムアウトする

### 症状

テストが `Deno.test` のデフォルトタイムアウト（5秒）で失敗する。

### 原因と対策

**1. `pool.uninstall()` の呼び忘れ**

→ 必ず `try/finally` で囲む。

**2. WebSocket の `onclose` が発火しない**

Promise が resolve されず、テストが終了しない。

→ EOSE 受信後に `ws.close()` を呼ぶ。

**3. レイテンシ設定が大きすぎる**

→ テストでは小さい値を使う。速度テスト以外では `latency: 0`（デフォルト）。

**4. streamEvents が止まらない**

→ `count` を指定するか、テスト終了時に `handle.stop()` を呼ぶ。

**5. Deno テストのタイムアウトを延長する**

```typescript
Deno.test({
  name: "時間のかかるテスト",
  fn: async () => {/* ... */},
  sanitizeOps: false,
  sanitizeResources: false,
});
```

---

## イベントが受信されない

### 症状

REQ を送信してもイベントが返ってこない。

### 原因と対策

**1. `relay.store()` の呼び忘れ**

→ テストデータを `store()` で登録する。

**2. フィルターが合っていない**

→ store したイベントの kind とフィルターの kinds が一致しているか確認する。

**3. `pool.install()` の前に WebSocket を作成している**

→ `pool.install()` を WebSocket 作成の前に呼ぶ。

**4. `onREQ` ハンドラーが空配列を返している**

→ `onREQ`
を設定すると自動マッチングがスキップされる。ハンドラーからイベントを返すか、`onREQ`
を使わずに `store()` を使う。

---

## WebSocket 接続に失敗する

### 症状

接続時に `onerror` → `onclose(code: 1006)` が発火する。

### 原因と対策

**1. URL が未登録**

→ 接続先 URL を `pool.relay()` で登録する。

**2. `refuse()` が呼ばれている**

→ `refuse()` を呼ぶ前の接続か確認する。`reset()` でリセットできる。

**3. `connectionTimeout` が短すぎる**

→ タイムアウトの値を適切に設定する。

---

## 「MockPool is already installed」エラー

### 症状

```
Error: MockPool is already installed
```

### 原因

`pool.install()` を2回呼んでいる。

---

## 「MockPool is not installed」エラー

### 症状

```
Error: MockPool is not installed
```

### 原因

`pool.uninstall()` を install 前に呼んでいる、または2回呼んでいる。

---

## 「WebSocket is not open」エラー

### 症状

```
DOMException: WebSocket is not open
```

### 原因

`readyState` が `OPEN` でないのに `send()` を呼んでいる。

---

## デバッグ方法

---

## コード例

<!--@include: ../../_shared/snippets/troubleshooting.md-->

---

## 関連ドキュメント

- [FAQ](/help/faq) — よくある質問
- [API リファレンス](/reference/api) — 正しい API の使い方
- [チュートリアル](/guide/tutorial) — 基本的な使い方
