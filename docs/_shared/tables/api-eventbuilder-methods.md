すべてのビルダーメソッドは `EventBuilder` を返す（チェーン可能）。

| メソッド                                | 説明                                 |
| --------------------------------------- | ------------------------------------ |
| `content(text: string)`                 | コンテンツ設定                       |
| `tag(key: string, ...values: string[])` | タグ追加                             |
| `pubkey(pubkey: string)`                | 公開鍵設定                           |
| `id(id: string)`                        | ID 設定                              |
| `createdAt(timestamp: number)`          | created_at 設定                      |
| `sign(privateKey?: string)`             | モック署名生成（暗号的に正しくない） |
| `corrupt(options: CorruptOptions)`      | フィールドを不正な値に置換           |
| `geohash(hash: string)`                 | geohash タグ追加 (NIP-52)            |
| `emoji(name: string, url: string)`      | emoji タグ追加 (NIP-30)              |
| `withExpiration(timestamp: number)`     | NIP-40 有効期限タグを追加            |
| `build()`                               | `NostrEvent` を構築して返す          |
