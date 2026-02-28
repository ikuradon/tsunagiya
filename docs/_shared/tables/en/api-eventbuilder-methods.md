All builder methods return `EventBuilder` (chainable).

| Method                                  | Description                                           |
| --------------------------------------- | ----------------------------------------------------- |
| `content(text: string)`                 | Set content                                           |
| `tag(key: string, ...values: string[])` | Add tag                                               |
| `pubkey(pubkey: string)`                | Set public key                                        |
| `id(id: string)`                        | Set ID                                                |
| `createdAt(timestamp: number)`          | Set created_at                                        |
| `sign(privateKey?: string)`             | Generate mock signature (not cryptographically valid) |
| `corrupt(options: CorruptOptions)`      | Replace fields with invalid values                    |
| `geohash(hash: string)`                 | Add geohash tag (NIP-52)                              |
| `emoji(name: string, url: string)`      | Add emoji tag (NIP-30)                                |
| `withExpiration(timestamp: number)`     | Add NIP-40 expiration tag                             |
| `build()`                               | Build and return `NostrEvent`                         |
