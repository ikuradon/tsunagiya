# TODO — 繋ぎ屋 改良案

## 優先度: 中

### NIP 対応

- [ ] NIP-17 (Private Direct Messages) — NIP-04 deprecated に伴い
      `EventBuilder.privateDM()` テンプレート追加
- [ ] NIP-40 (Expiration Timestamp) — `EventBuilder.withExpiration()`
      メソッド追加

### テスト支援ヘルパー

- [ ] `EventBuilder.from(existingEvent)` — 既存イベントのクローン＋修正
- [ ] `EventBuilder.matchFilter(filter)` —
      フィルターにマッチするイベント自動生成
- [ ] FilterBuilder 拡充 — `author()`, `kind()`, `since()`, `tagged()`,
      `combine()`

### E2E テスト

- [ ] 複数リレーフェッチ＋フォールバック（遅いリレー → 別リレーから取得）
- [ ] オフラインシミュレーション（全リレー切断 → 再接続復帰）
- [ ] 部分的 AUTH 失敗（リレーA成功 + リレーB失敗の混合動作）

### CI/CD

- [ ] テストカバレッジ測定の追加（`deno test --coverage`）

### API 設計

- [ ] `MockRelay.getSubscriptions()` — 現在のサブスクリプション一覧取得
- [ ] JSDoc の充実 — パラメータ詳細、エッジケース、使用例の追加

## 優先度: 低

- [ ] Replaceable イベント置換で `filter()` → `findIndex()` + `splice()` に変更
      (`src/relay.ts`)
- [ ] 大量イベントストア時のメモリ最適化 `clearOlderThan()` メソッド追加
- [ ] スナップショットにメタデータ追加（タイムスタンプ、サブスクリプション状態等）
- [ ] `EventBuilder.bulk()` にシード指定オプション（再現性向上）
- [ ] ログレベルの詳細化（`trace` 追加）、ログフィルタリング機能
- [ ] CI マトリクス拡充（Deno v1.x / Node.js 18.x）
- [ ] `ARCHITECTURE.md` 作成 — MockPool → MockRelay → MockWebSocket のフロー図
