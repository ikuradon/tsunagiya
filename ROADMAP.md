# tsunagiya - 実装ロードマップ

## Phase 1: コア機能 🎯

### 1.1 型定義 (`src/types.ts`)

- [ ] NostrEvent 型
- [ ] NostrFilter 型
- [ ] NostrMessage 型（["EVENT", ...] 等）
- [ ] MockRelayOptions 型
- [ ] LogEntry / LogHandler 型

### 1.2 MockPool (`src/pool.ts`)

- [ ] MockPool クラス実装
- [ ] `relay(url, options?)` メソッド
- [ ] `install()` / `uninstall()` - WebSocket差し替え
- [ ] `reset()` - 全リレー状態リセット
- [ ] `connections` プロパティ
- [ ] テスト (`tests/pool_test.ts`)

### 1.3 MockRelay (`src/relay.ts`)

- [ ] MockRelay クラス実装
- [ ] `store(event)` - イベント登録
- [ ] `onREQ(handler)` - カスタムハンドラー
- [ ] `onEVENT(handler)` - EVENT受信処理
- [ ] 検証ヘルパー
  - [ ] `received` プロパティ
  - [ ] `findREQ(subId)`
  - [ ] `countREQs()`
  - [ ] `hasREQ(subId)`
  - [ ] `findEvent(eventId)`
  - [ ] `countEvents()`
  - [ ] `hasEvent(eventId)`
  - [ ] `findCLOSE(subId)`
- [ ] テスト (`tests/relay_test.ts`)

### 1.4 MockWebSocket (`src/websocket.ts`)

- [ ] MockWebSocket クラス（WebSocket互換）
- [ ] globalThis.WebSocket 差し替え機構
- [ ] URL別ルーティング（MockPoolとの連携）
- [ ] 接続・切断のライフサイクル
- [ ] メッセージ送受信
- [ ] テスト (`tests/websocket_test.ts`)

### 1.5 フィルターマッチング (`src/filter.ts`)

- [ ] `matchFilter(event, filter)` 関数
- [ ] ids - プレフィックスマッチ
- [ ] authors - プレフィックスマッチ
- [ ] kinds - 完全一致
- [ ] since / until - 時間範囲
- [ ] タグフィルター (#e, #p 等)
- [ ] limit - 返却数制限
- [ ] テスト (`tests/filter_test.ts`)

### 1.6 統合テスト

- [ ] 基本的なREQ/EVENTフロー (`tests/integration_test.ts`)
- [ ] 複数リレー同時接続
- [ ] カスタムハンドラーのオーバーライド

---

## Phase 2: エラーシミュレート 🔥

### 2.1 不安定性シミュレート (`src/relay.ts` 拡張)

- [ ] レイテンシ揺れ (latency: { min, max })
- [ ] エラー率 (errorRate)
- [ ] ランダム切断 (disconnectRate)
- [ ] 接続タイムアウト (connectionTimeout)
- [ ] 再接続遅延 (reconnectDelay)

### 2.2 エラーケース (`src/relay.ts` 拡張)

- [ ] `refuse()` - 接続拒否
- [ ] `disconnect()` / `disconnectAfter(ms)` - 切断
- [ ] `close(code)` - WebSocketクローズコード指定
  - [ ] 1006 (Abnormal Closure)
  - [ ] 1000, 1001, 1008, 1011 対応
- [ ] `sendRaw(data)` - 不正JSON送信
- [ ] `sendNotice(msg)` - NOTICE送信

### 2.3 NIP-42 AUTH (`src/auth.ts`)

- [ ] AUTH チャレンジ生成
- [ ] `requireAuth(validator)` メソッド
- [ ] AUTH応答の検証
- [ ] テスト (`tests/auth_test.ts`)

### 2.4 統合テスト

- [ ] 不安定リレーの再接続テスト
- [ ] WebSocket 1006エラーのハンドリング
- [ ] AUTH失敗/成功のシナリオ

---

## Phase 3: テスト支援ヘルパー 🛠️

### 3.1 EventBuilder (`src/testing/event_builder.ts`)

- [ ] 基本機能
  - [ ] `kind1()`, `kind0()` 等のビルダー
  - [ ] `content(text)`, `tag(key, ...values)`, `sign(privkey)` メソッド
  - [ ] `random(options)` - ランダム生成
  - [ ] `corrupt(options)` - 壊れたイベント生成
- [ ] バルク生成
  - [ ] `bulk(count, options)` - 大量生成
  - [ ] `timeline(count, options)` - 時系列データ
- [ ] リレーションシップ
  - [ ] `thread(depth)` - リプライチェーン
  - [ ] `withReactions(count)` - リアクション付き
- [ ] Common Tags
  - [ ] `geohash(hash)` - NIP-52
  - [ ] `emoji(name, url)` - NIP-30
  - [ ] `groupMessage(groupId)` - NIP-29
- [ ] NIP別テンプレート
  - [ ] `metadata(profile)` - kind:0
  - [ ] `contacts(pubkeys)` - kind:3
  - [ ] `dm(recipient, content)` - kind:4
  - [ ] `zapRequest(options)` - kind:9734
  - [ ] `nip07Request()` - kind:24133
- [ ] テスト (`tests/testing/event_builder_test.ts`)

### 3.2 FilterBuilder (`src/testing/filter_builder.ts`)

- [ ] `timeline(options)` - タイムラインフィルター
- [ ] `profile(pubkey)` - プロフィールフィルター
- [ ] `mentions(pubkey)` - メンションフィルター
- [ ] `reactions(eventId)` - リアクションフィルター
- [ ] テスト (`tests/testing/filter_builder_test.ts`)

### 3.3 アサーションヘルパー (`src/testing/assertions.ts`)

- [ ] `assertReceivedREQ(filters)` - REQ検証
- [ ] `assertEventPublished(eventId)` - EVENT検証
- [ ] `assertNoErrors()` - エラーなし検証
- [ ] `assertAuthCompleted()` - AUTH成功検証
- [ ] `assertClosed(subId)` - CLOSE検証
- [ ] `assertReceived(predicate)` - カスタム検証
- [ ] テスト (`tests/testing/assertions_test.ts`)

### 3.4 エントリポイント

- [ ] `src/testing/mod.ts` - re-export

---

## Phase 4: 高度な機能 🚀

### 4.1 リアルタイムシミュレート (`src/testing/stream.ts`)

- [ ] `streamEvents(events, options)` - 時間差送信
- [ ] `startStream(options)` - 継続的ストリーム
- [ ] `stream.stop()` - 手動停止
- [ ] テスト (`tests/testing/stream_test.ts`)

### 4.2 スナップショット (`src/testing/snapshot.ts`)

- [ ] `snapshot()` - 状態保存
- [ ] `restore(snapshot)` - 状態復元
- [ ] テスト (`tests/testing/snapshot_test.ts`)

### 4.3 ログ機能 (`src/logger.ts`)

- [ ] LogHandler インターフェース
- [ ] console出力モード
- [ ] カスタムハンドラーモード
- [ ] ログレベル（silent/error/info/debug）

### 4.4 統合テスト

- [ ] リアルタイムストリーム + フィルタリング
- [ ] スナップショット復元後の動作確認
- [ ] 全機能を組み合わせたシナリオテスト

---

## Phase 5: 仕上げ 📦

### 5.1 ドキュメント

- [ ] README.md 完成（使用例、インストール方法）
- [ ] JSDoc コメント追加（全公開API）
- [ ] CHANGELOG.md 作成

### 5.2 品質チェック

- [ ] `deno task check` 全パス
- [ ] テストカバレッジ 90%以上確認
- [ ] パフォーマンステスト（1000件フィルタリング < 10ms）

### 5.3 公開準備

- [ ] `deno publish --dry-run` 確認
- [ ] JSR公開: `@ikuradon/tsunagiya`
- [ ] Git タグ作成: `v0.1.0`

---

## 進捗管理

- [ ] Phase 1 完了
- [ ] Phase 2 完了
- [ ] Phase 3 完了
- [ ] Phase 4 完了
- [ ] Phase 5 完了

---

## Notes

- 各Phaseの完了時にDiscordスレッドに報告
- 問題が発生したらスレッドで相談
- テストは実装と同時に書く（後回しにしない）
