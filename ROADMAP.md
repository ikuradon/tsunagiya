# 繋ぎ屋 ロードマップ

繋ぎ屋は**リレー側の処理が必要なNIP**のみを実装するモックライブラリです。
イベント内容・タグのみに関わるNIPは`EventBuilder`で対応します。

---

## リレーモック範疇外（EventBuilderで十分）

以下のNIPはイベント内容/タグに関するもので、リレー側の特別な処理は不要です：

- **NIP-05** - DNS Identifier（HTTP/.well-known/）
- **NIP-19** - bech32エンコード（クライアント側ユーティリティ）
- **NIP-24** - Extra metadata（kind:0の拡張フィールド）
- **NIP-27** - Text References（nostr:参照はイベント内容）
- **NIP-32** - Labeling（kind:1985、タグ処理のみ）
- **NIP-36** - Sensitive Content（content-warningタグ）
- **NIP-84** - Highlights（kind:9802、特別なリレー処理なし）
- **NIP-92** - Media Attachments（imetaタグ、特別な処理なし）

---

## 実装済み（v0.2.4）

### リレーモック実装

| NIP    | 内容                          | 対応バージョン | 備考                                  |
| ------ | ----------------------------- | -------------- | ------------------------------------- |
| NIP-01 | Basic Protocol                | v0.1.0         | EVENT, REQ, CLOSE, EOSE, OK, NOTICE  |
| NIP-09 | Event Deletion                | v0.2.0         | kind:5 e-tag/a-tag 削除、リアルタイム配信 |
| NIP-11 | Relay Info Document           | v0.2.2         | setInfo/getInfo + fetch インターセプト |
| NIP-16 | Event Treatment               | v0.2.0         | Regular/Replaceable/Ephemeral 自動処理 |
| NIP-33 | Parameterized Replaceable     | v0.2.0         | kind+pubkey+d-tag 置き換え            |
| NIP-42 | Authentication                | v0.1.0         | AUTH チャレンジ/レスポンス            |
| NIP-45 | COUNT                         | v0.2.0         | COUNT メッセージ対応                  |
| NIP-50 | Search                        | v0.2.0         | content 部分一致検索                  |

### EventBuilder テンプレート

| NIP    | 内容                          | 対応バージョン |
| ------ | ----------------------------- | -------------- |
| NIP-04 | Encrypted DM                  | v0.2.0         |
| NIP-10 | e/p タグ                      | v0.2.0         |
| NIP-25 | Reactions                     | v0.2.0         |
| NIP-29 | グループチャット              | v0.2.0         |
| NIP-30 | Emoji タグ                    | v0.2.0         |
| NIP-52 | Geohash タグ                  | v0.2.0         |
| NIP-57 | Zap Request                   | v0.2.0         |

### v0.2.3 品質改善（監査対応）

- MockPool 多重 install 防止（Critical fix）
- kind:5 削除イベントのリアルタイム配信
- snapshot/restore のディープコピー修正
- assertAuthCompleted 認証成功検証の強化
- assertNoErrors 不正メッセージ検出の改善
- connectionTimeout 修正
- examples の OK:false エラーハンドリング追加

---

## v0.3.0（よく使う機能）

ソーシャル機能の基本NIP：

1. **NIP-25** - Reactions（kind:7 リレー側処理）
2. **NIP-51** - Lists（replaceable処理）
3. **NIP-23** - Long-form（NIP-33の実例）
4. **NIP-18** - Reposts（kind:6処理）
5. **NIP-65** - Relay List（kind:10002処理）

---

## v0.4.0（高度な機能）

チャット・決済機能：

6. **NIP-57** - Zaps（フロー処理）
7. **NIP-17** - Private DMs
8. **NIP-28** - Public Chat
9. **レート制限シミュレート**

---

## v0.5.0（専門的機能）

分散サービス・署名機能：

10. **NIP-90** - DVM（Job処理フロー）
11. **NIP-46** - Remote Signing
12. **NIP-47** - Wallet Connect
13. **NIP-53** - Live Activities
14. **NIP-52** - Calendar（リレー側処理）

---

## v0.6.0（高難度）

高度な同期・セキュリティ機能：

15. **NIP-77** - Negentropy（同期プロトコル）
16. **NIP-70** - Protected Events
17. **NIP-59** - Gift Wrap
18. **NIP-20** - Command Results
19. **NIP-40** - Expiration
20. **NIP-13** - PoW（Proof of Work）

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
