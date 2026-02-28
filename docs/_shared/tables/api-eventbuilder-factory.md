| メソッド                                              | 説明                                       |
| ----------------------------------------------------- | ------------------------------------------ |
| `EventBuilder.kind0()`                                | kind:0 (Metadata) ビルダー                 |
| `EventBuilder.kind1()`                                | kind:1 (Short Text Note) ビルダー          |
| `EventBuilder.kind3()`                                | kind:3 (Contacts) ビルダー                 |
| `EventBuilder.kind4()`                                | kind:4 (Encrypted DM) ビルダー             |
| `EventBuilder.kind7()`                                | kind:7 (Reaction) ビルダー                 |
| `EventBuilder.kind(k: number)`                        | 任意の kind                                |
| `EventBuilder.from(event: NostrEvent)`                | 既存イベントからビルダーを復元             |
| `EventBuilder.matchFilter(filter: NostrFilter)`       | フィルターにマッチするイベントを自動生成   |
| `EventBuilder.privateDM(options: ChatMessageOptions)` | NIP-17 プライベートDM一括生成（kind:1059） |
