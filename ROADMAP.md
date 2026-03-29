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

## 実装済み（v0.5.0）

### リレーモック実装

| NIP    | 内容                | 対応バージョン | 備考                                                                       |
| ------ | ------------------- | -------------- | -------------------------------------------------------------------------- |
| NIP-01 | Basic Protocol      | v0.1.0         | EVENT, REQ, CLOSE, EOSE, OK, NOTICE + Event Treatment + Addressable Events |
| NIP-09 | Event Deletion      | v0.2.0         | kind:5 e-tag/a-tag 削除、リアルタイム配信                                  |
| NIP-11 | Relay Info Document | v0.2.2         | setInfo/getInfo + fetch インターセプト                                     |
| NIP-42 | Authentication      | v0.1.0         | AUTH チャレンジ/レスポンス                                                 |
| NIP-45 | COUNT               | v0.2.0         | COUNT メッセージ対応                                                       |
| NIP-50 | Search              | v0.2.0         | content 部分一致検索                                                       |

> **Note:** 旧 NIP-16 (Event Treatment) および旧 NIP-33 (Parameterized
> Replaceable Events → Addressable Events) は NIP-01 に統合されました。v0.2.0
> で実装した Regular/Replaceable/Ephemeral/Addressable イベント処理は NIP-01
> 対応の一部です。

### EventBuilder テンプレート

| NIP    | 内容                                  | 対応バージョン        |
| ------ | ------------------------------------- | --------------------- |
| NIP-04 | Encrypted DM ⚠️ deprecated (→ NIP-17) | v0.2.0                |
| NIP-10 | Reply Threading (e/p タグ)            | v0.2.0                |
| NIP-17 | Private Direct Messages               | v0.3.0                |
| NIP-18 | Reposts                               | v0.3.0                |
| NIP-23 | Long-form Content                     | v0.3.0                |
| NIP-25 | Reactions                             | v0.2.0 (拡充: v0.3.0) |
| NIP-29 | Relay-based Groups                    | v0.2.0                |
| NIP-30 | Custom Emoji タグ                     | v0.2.0                |
| NIP-40 | Expiration Timestamp（タグ付与）      | v0.3.0                |
| NIP-51 | Lists                                 | v0.3.0                |
| NIP-52 | Calendar Events（全4種対応）          | v0.2.5                |
| NIP-57 | Lightning Zaps                        | v0.2.0                |
| NIP-65 | Relay List Metadata                   | v0.3.0                |

### v0.2.3 品質改善（監査対応）

- MockPool 多重 install 防止（Critical fix）
- kind:5 削除イベントのリアルタイム配信
- snapshot/restore のディープコピー修正
- assertAuthCompleted 認証成功検証の強化
- assertNoErrors 不正メッセージ検出の改善
- connectionTimeout 修正
- examples の OK:false エラーハンドリング追加

---

### v0.4.0–v0.5.0 新機能

| 機能                             | 内容                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------- |
| npm 公開                         | `@ikuradon/tsunagiya` として npm にも公開（dnt ビルド）                       |
| `waitFor` ヘルパー               | ポーリングベースの条件待ち。固定 setTimeout の CI フレンドリーな代替          |
| ネットワーク条件シミュレーション | `MockRelayOptions.network` による接続遅延、ジッター、順序シャッフル、一時切断 |

---

## v0.6.0（高度な機能）

> **Note:** ネットワーク条件シミュレーション（`MockRelayOptions.network`）は
> v0.5.0 で実装済みです。

リレー側処理の拡充：

1. **NIP-40** - Expiration
   Timestamp（リレー側処理：期限切れイベントの配信除外・受信拒否。EventBuilderは実装済み）
2. **NIP-57** - Zaps フロー処理（リレー側の Zap Request → Receipt
   連鎖。EventBuilderは実装済み）
3. **NIP-28** - Public Chat（kind:40/41/42/43/44 チャンネルメッセージ）
4. **NIP-70** - Protected Events（`-` タグによる保護イベントの再配信制限）
5. **NIP-13** - PoW（Proof of Work：`min_pow` フィルターチェック）
6. **レート制限シミュレート**

---

## v0.7.0（専門的機能）

分散サービス・署名機能：

1. **NIP-90** - DVM（Job処理フロー）
2. **NIP-46** - Remote Signing
3. **NIP-47** - Wallet Connect
4. **NIP-53** - Live Activities

---

## v0.8.0（高難度）

高度な同期・セキュリティ機能：

7. **NIP-77** - Negentropy（同期プロトコル）
8. **NIP-59** - Gift
   Wrap（リレー側処理：内部イベント非参照。EventBuilderは実装済み）

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
