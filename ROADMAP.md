# tsunagiya ロードマップ

tsunagiyaは**リレー側の処理が必要なNIP**のみを実装するモックライブラリです。
イベント内容・タグのみに関わるNIPは`EventBuilder`で対応します。

---

## リレーモック範疇外（EventBuilderで十分）

以下のNIPはイベント内容/タグに関するもので、リレー側の特別な処理は不要です：

- **NIP-05** - DNS Identifier（HTTP/.well-known/）
- **NIP-11** - Relay Info Document（HTTP経由）
- **NIP-19** - bech32エンコード（クライアント側ユーティリティ）
- **NIP-24** - Extra metadata（kind:0の拡張フィールド）
- **NIP-27** - Text References（nostr:参照はイベント内容）
- **NIP-32** - Labeling（kind:1985、タグ処理のみ）
- **NIP-36** - Sensitive Content（content-warningタグ）
- **NIP-84** - Highlights（kind:9802、特別なリレー処理なし）
- **NIP-92** - Media Attachments（imetaタグ、特別な処理なし）

---

## 実装済み（v0.1.0）

| NIP    | 内容           | 対応状況    |
| ------ | -------------- | ----------- |
| NIP-01 | Basic Protocol | ✅ 完全対応 |
| NIP-42 | Authentication | ✅ 完全対応 |

---

## v0.2.0（基本動作）

リレーの基本的なイベント処理を拡張：

1. **NIP-16** - Event Treatment（ephemeral/replaceable処理）
2. **NIP-33** - Parameterized Replaceable（d-tag処理）
3. **NIP-09** - Event Deletion（削除リクエスト処理）
4. **NIP-45** - COUNT（カウント処理）
5. **NIP-50** - Search（検索処理）

**見積り:** 8-12時間

---

## v0.3.0（よく使う機能）

ソーシャル機能の基本NIP：

6. **NIP-25** - Reactions（kind:7処理）
7. **NIP-51** - Lists（replaceable処理）
8. **NIP-23** - Long-form（NIP-33の実例）
9. **NIP-18** - Reposts（kind:6処理）
10. **NIP-65** - Relay List（kind:10002処理）

---

## v0.4.0（高度な機能）

チャット・決済機能：

11. **NIP-57** - Zaps（フロー処理）
12. **NIP-17** - Private DMs
13. **NIP-28** - Public Chat
14. **レート制限シミュレート**

---

## v0.5.0（専門的機能）

分散サービス・署名機能：

15. **NIP-90** - DVM（Job処理フロー）
16. **NIP-46** - Remote Signing
17. **NIP-47** - Wallet Connect
18. **NIP-53** - Live Activities
19. **NIP-52** - Calendar

---

## v0.6.0（高難度）

高度な同期・セキュリティ機能：

20. **NIP-77** - Negentropy（同期プロトコル）
21. **NIP-70** - Protected Events
22. **NIP-59** - Gift Wrap
23. **NIP-20** - Command Results
24. **NIP-40** - Expiration
25. **NIP-13** - PoW（Proof of Work）

---

## 設計方針

### リレー実装が必要なNIPの判断基準

✅ **実装する:**

- WebSocketメッセージ処理が必要
- イベントの保存・削除・検索ロジックが必要
- リレーの挙動に影響する

❌ **EventBuilderで対応:**

- イベント内容・タグのみに関わる
- クライアント側のユーティリティ機能
- HTTP経由の機能

### 後方互換性

各バージョンで既存APIの破壊的変更は行いません。
内部処理の拡張とヘルパー関数の追加で対応します。

---
