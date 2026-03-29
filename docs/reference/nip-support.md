---
outline: deep
---

# NIP 対応状況

繋ぎ屋 v0.4.0 の NIP（Nostr Implementation Possibilities）対応状況です。

---

## サポート済み NIP（v0.4.0）

<!--@include: ../_shared/tables/nip-support.md-->

---

## 各 NIP の詳細と使用例

<!--@include: ../_shared/snippets/nip-support-examples.md-->

---

## NIP-01: Basic Protocol メッセージ一覧

### 対応メッセージ

| メッセージ | 方向           | NIP    | 対応                               |
| ---------- | -------------- | ------ | ---------------------------------- |
| `EVENT`    | client → relay | NIP-01 | ✅ 受信・ストア追加・OK 応答       |
| `REQ`      | client → relay | NIP-01 | ✅ フィルタリング・EVENT/EOSE 応答 |
| `CLOSE`    | client → relay | NIP-01 | ✅ サブスクリプション解除          |
| `AUTH`     | client → relay | NIP-42 | ✅ AUTH レスポンス送信             |
| `COUNT`    | client → relay | NIP-45 | ✅ カウントクエリ                  |
| `EVENT`    | relay → client | NIP-01 | ✅ サブスクリプション配信          |
| `OK`       | relay → client | NIP-01 | ✅ EVENT 受理/拒否                 |
| `EOSE`     | relay → client | NIP-01 | ✅ ストアイベント送信完了          |
| `CLOSED`   | relay → client | NIP-01 | ✅ サブスクリプション終了          |
| `NOTICE`   | relay → client | NIP-01 | ✅ `sendNotice()`                  |
| `AUTH`     | relay → client | NIP-42 | ✅ チャレンジ送信                  |
| `COUNT`    | relay → client | NIP-45 | ✅ カウント結果応答                |

---

## NIP-01: イベント種別ストア挙動（旧 NIP-16/NIP-33）

> 旧 NIP-16 (Event Treatment) および旧 NIP-33 (Parameterized Replaceable Events
> → Addressable Events) は現在 NIP-01 に統合されています。

| 種別                                       | NIP-01 定義の kind 範囲 | ストア挙動                                        |
| ------------------------------------------ | ----------------------- | ------------------------------------------------- |
| Regular                                    | 1, 2, 4-44, 1000-9999   | 通常通り追加                                      |
| Replaceable                                | 0, 3, 10000-19999       | 同一 kind+pubkey の古いイベントを削除し追加       |
| Ephemeral                                  | 20000-29999             | ストアに追加しない                                |
| Addressable (旧 Parameterized Replaceable) | 30000-39999             | 同一 kind+pubkey+d-tag の古いイベントを削除し追加 |

> **Note:** NIP-01 で未分類の kind（45-999, 40000+ 等）は、本ライブラリでは
> Regular として扱いストアに保存します。

---

## 実装予定 NIP（v0.4.0 以降）

| NIP    | 内容          | 予定バージョン | 概要                     |
| ------ | ------------- | -------------- | ------------------------ |
| NIP-94 | File Metadata | v0.4.x         | kind:1063 のテンプレート |

---

## 非対応 NIP（対応予定なし）

| NIP    | 内容              | 非対応理由                                                                                                                  |
| ------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| NIP-05 | DNS Identifier    | DNS 解決はモックライブラリの範囲外                                                                                          |
| NIP-07 | Browser Extension | ブラウザ API のモックは別ライブラリで対応すべき（※ `EventBuilder.nip07Request()` で kind:24133 テストイベントの生成は可能） |
| NIP-19 | bech32 Encoding   | エンコーディングはクライアント側の処理                                                                                      |
| NIP-46 | Nostr Connect     | リモート署名はモックリレーの範囲外                                                                                          |

---

## 関連ドキュメント

- [API リファレンス](/reference/api) — API 詳細
- [使用例集](/guide/examples) — 使用例
- [チュートリアル](/guide/tutorial) — チュートリアル
