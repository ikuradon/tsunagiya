---
outline: deep
---

# ベストプラクティス

繋ぎ屋を使った Nostr クライアントテストの設計指針です。

---

## テストの構成方法

---

## テストの粒度

### 良い例：1テスト1検証

```typescript
Deno.test("REQ送信後にEOSEを受信する", async () => {/* ... */});
Deno.test("storeしたイベントがフィルターにマッチする", async () => {/* ... */});
Deno.test("未登録URLへの接続はcode:1006で閉じる", async () => {/* ... */});
```

### 悪い例：1テストで複数のことを検証

```typescript
// ❌ これは分割すべき
Deno.test("リレーの全機能テスト", async () => {
  // REQ → EVENT → CLOSE → AUTH → disconnect... 全部入り
});
```

---

## テストの命名規則

### 日本語での命名を推奨

繋ぎ屋は日本語プロジェクトなので、テスト名も日本語で書くと分かりやすいです。

```typescript
// ✅ 良い例
Deno.test("kind:1のイベントがフィルターにマッチする", () => {});
Deno.test("接続拒否後の新規接続はエラーになる", () => {});
Deno.test("1000件のイベントを100ms以内に処理する", () => {});

// ❌ 悪い例
Deno.test("test1", () => {});
Deno.test("it works", () => {});
```

### 命名パターン

| パターン                     | 例                                  |
| ---------------------------- | ----------------------------------- |
| `[対象]が[条件]で[期待結果]` | `フィルターがkind:1で1件マッチする` |
| `[操作]すると[結果]`         | `refuse()すると接続が拒否される`    |
| `[状況]のとき[動作]`         | `未登録URLのとき接続失敗する`       |

---

## DRY 原則の適用

---

## テストの実行速度最適化

### 1. レイテンシを最小限にする

```typescript
// ❌ 遅い：実際の遅延をシミュレート
pool.relay("wss://relay.example.com", { latency: 2000 });

// ✅ 速い：遅延テスト以外ではレイテンシ0
pool.relay("wss://relay.example.com"); // デフォルトは0ms
```

### 2. タイムアウトを短くする

```typescript
pool.relay("wss://relay.example.com", { connectionTimeout: 50 });
```

### 3. streamEvents の間隔を短くする

```typescript
const stableRandom = {
  next: () => 0.5,
  fill(bytes: Uint8Array) {
    bytes.fill(0x22);
  },
};

// ❌ 遅い
streamEvents(relay, events, {
  interval: 1000,
  jitter: 100,
  random: stableRandom,
});

// ✅ 速い
streamEvents(relay, events, { interval: 10, jitter: 2, random: stableRandom });
```

---

## try/finally パターンの徹底

**`pool.install()` と `pool.uninstall()` は必ず `try/finally` で囲むこと。**

`uninstall()` を忘れると `globalThis.WebSocket`
が差し替えられたままになり、後続のテストが壊れます。

---

## コード例

<!--@include: ../_shared/snippets/best-practices.md-->

---

## 関連ドキュメント

- [テストパターン](/guide/test-patterns) — テストパターン集
- [パフォーマンス](/advanced/performance) — パフォーマンス最適化
- [トラブルシューティング](/help/troubleshooting) — エラー解決
