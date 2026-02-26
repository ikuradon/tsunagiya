---
outline: deep
---

# FAQ

繋ぎ屋に関するよくある質問と回答です。

---

### Q1. 未登録 URL に接続したらどうなる？

`pool.relay()` で登録していない URL に `new WebSocket()`
すると、接続失敗として扱われます。`onerror` イベント → `onclose` イベント（code:
1006）が発火します。実際のリレーに接続できなかった場合と同じ動作です。

---

### Q2. 複数リレーの追加方法は？

`pool.relay()` を URL ごとに呼び出します。各リレーは完全に独立して動作します。

---

### Q3. テストが遅い場合の対処法は？

1. **レイテンシを 0 にする**（デフォルト）。速度テスト以外では `latency`
   を設定しない
2. **streamEvents の interval を短くする**（10ms 程度）
3. **独立したテストは並行実行する**
4. **`pool.reset()` で状態をクリア**してインスタンスを再利用

詳しくは [パフォーマンスガイド](/advanced/performance) を参照。

---

### Q4. 実際の暗号署名は検証される？

いいえ。繋ぎ屋はモックライブラリなので、`id`, `pubkey`, `sig`
の暗号的検証は行いません。EventBuilder が生成するのもランダムな hex
文字列です。署名検証のテストが必要な場合は、`onEVENT`
ハンドラー内で独自に実装してください。

---

### Q5. Deno 以外のランタイム（Node.js, Bun）で使える？

v0.2.0 以降では、以下の主要 Nostr クライアントライブラリとの互換性を E2E
テストで検証しています:

- **nostr-tools** (`npm:nostr-tools@^2`) - SimplePool での REQ/EVENT 処理
- **NDK** (`npm:@nostr-dev-kit/ndk@^2`) - NDK
  インスタンス経由のイベント取得・投稿
- **rx-nostr** (`npm:rx-nostr@^3`) - RxNostr の Reactive API（createRxNostr /
  use）
- **nostr-fetch** (`npm:nostr-fetch@^0`) - NostrFetcher
  によるイベント取得（fetch / iterator）

これらのライブラリは Deno の npm 互換性機能を利用して動作します。

---

### Q6. テストフレームワーク依存はある？

ありません。`Deno.test`
に加えて、任意のテストフレームワークで使用できます。`@ikuradon/tsunagiya/testing`
のアサーション関数は `throw Error` でフレームワーク非依存です。

---

### Q7. `onREQ` を設定すると `store()` のイベントは使われない？

はい。`onREQ` ハンドラーを設定すると、自動フィルタリング（store
内のイベント検索）はスキップされ、ハンドラーの戻り値だけが使われます。両方使いたい場合は、ハンドラー内で手動フィルタリングしてください。

---

### Q8. 同じ URL に対して `pool.relay()` を複数回呼んだらどうなる？

2回目以降は既存のインスタンスが返されます。オプションは最初の呼び出し時のものが使われます。

---

### Q9. EVENT メッセージの OK レスポンスをカスタマイズするには？

`onEVENT` ハンドラーを使います。

---

### Q10. AUTH のチャレンジ文字列を取得するには？

`onmessage` で `["AUTH", challenge]` メッセージを受信します。

---

### Q11. スナップショットにはハンドラーや接続状態も含まれる？

いいえ。スナップショットに含まれるのは **ストア内のイベント** と
**受信メッセージログ** だけです。`onREQ`, `onEVENT`
ハンドラーや接続状態は保存・復元されません。

---

### Q12. `reset()` と `restore()` の違いは？

- `reset()`: 完全にクリア（ストア、受信ログ、ハンドラー、AUTH 状態）
- `restore()`: スナップショット時点の **ストアと受信ログ**
  に戻す。ハンドラーは変更しない

---

### Q13. バイナリメッセージは送信できる？

MockWebSocket は文字列メッセージのみ対応です。`ArrayBuffer`, `Blob` 等を
`send()` すると `Error` がスローされます。Nostr プロトコルは JSON
文字列ベースなので、通常は問題ありません。

---

### Q14. テスト中に `globalThis.WebSocket` を直接使いたい場合は？

`pool.install()` 後は全ての `new WebSocket()` が MockWebSocket
になります。一部だけ実際の WebSocket を使いたい場合は、install
前に参照を保存してください。

---

### Q15. 外部依存はある？

ゼロです。繋ぎ屋は外部パッケージに一切依存しません。テストモジュールの
`@std/assert`
は繋ぎ屋自体のテスト用であり、ライブラリとしての依存ではありません。

---

### Q16. CI で使うときの注意点は？

特別な設定は不要です。`globalThis.WebSocket`
の差し替えはプロセス内で完結するため、ネットワークアクセスも不要です。`--allow-net`
フラグなしで動作します。

---

### Q17. EventBuilder で生成されるイベントのフィールド値は？

<!--@include: ../_shared/snippets/faq.md-->

---

## コード例（各 Q&A）

詳細なコード例は [使用例集](/guide/examples) および
[チュートリアル](/guide/tutorial) を参照してください。

---

## 関連ドキュメント

- [チュートリアル](/guide/tutorial) — 基本的な使い方
- [トラブルシューティング](/help/troubleshooting) — エラー解決
- [API リファレンス](/reference/api) — API 詳細
