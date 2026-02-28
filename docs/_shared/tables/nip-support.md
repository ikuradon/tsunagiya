| NIP    | 内容                                  | 対応状況                                                                   |
| ------ | ------------------------------------- | -------------------------------------------------------------------------- |
| NIP-01 | Basic Protocol                        | EVENT, REQ, CLOSE, EOSE, OK, NOTICE + Event Treatment + Addressable Events |
| NIP-04 | Encrypted DM ⚠️ deprecated (→ NIP-17) | EventBuilder テンプレート（NIP-17 への移行推奨）                           |
| NIP-09 | Event Deletion                        | kind:5 削除リクエスト処理                                                  |
| NIP-10 | Reply Threading                       | EventBuilder e/p タグ                                                      |
| NIP-11 | Relay Information                     | setInfo/getInfo + fetch インターセプト                                     |
| NIP-17 | Private Direct Messages               | EventBuilder テンプレート（chatMessage/seal/giftWrap/dmRelayList）         |
| NIP-18 | Reposts                               | EventBuilder テンプレート（repost/genericRepost）                          |
| NIP-23 | Long-form Content                     | EventBuilder テンプレート（longFormContent/longFormDraft）                 |
| NIP-25 | Reactions                             | EventBuilder withReactions / externalReaction                              |
| NIP-29 | Relay-based Groups                    | EventBuilder テンプレート                                                  |
| NIP-30 | Custom Emoji                          | EventBuilder emoji タグ                                                    |
| NIP-40 | Expiration Timestamp                  | EventBuilder `withExpiration()`                                            |
| NIP-42 | AUTH                                  | チャレンジ/レスポンス                                                      |
| NIP-45 | COUNT                                 | COUNT メッセージ対応                                                       |
| NIP-50 | Search                                | content 部分一致検索                                                       |
| NIP-51 | Lists                                 | EventBuilder テンプレート（muteList/pinList/bookmarks/followSet等）        |
| NIP-52 | Calendar Events                       | EventBuilder テンプレート（全4種対応: Date/Time/Collection/RSVP）          |
| NIP-57 | Lightning Zaps                        | EventBuilder テンプレート                                                  |
| NIP-65 | Relay List Metadata                   | EventBuilder relayList（kind:10002）                                       |

> **Note:** 旧 NIP-16 (Event Treatment) および旧 NIP-33 (Parameterized
> Replaceable Events) は現在 NIP-01 に統合されています。本ライブラリの
> Regular/Replaceable/Ephemeral/Addressable イベント処理は NIP-01
> 対応の一部です。
