| プロパティ        | 型                                                                                  | 説明                           |
| ----------------- | ----------------------------------------------------------------------------------- | ------------------------------ |
| `url`             | `string` (readonly)                                                                 | リレーURL                      |
| `options`         | `MockRelayOptions` (readonly)                                                       | リレーオプション               |
| `received`        | `ClientMessage[]` (readonly)                                                        | 全受信メッセージ               |
| `connectionCount` | `number` (readonly)                                                                 | アクティブ接続数               |
| `errors`          | `ReadonlyArray<string>` (readonly)                                                  | 発生したエラーレスポンスのログ |
| `deletedIds`      | `ReadonlySet<string>` (readonly)                                                    | 削除済みイベントID (NIP-09)    |
| `logger`          | `Logger \| null` (readonly)                                                         | ロガーインスタンス             |
| `authResults`     | `ReadonlyArray<{ eventId: string; accepted: boolean; message: string }>` (readonly) | AUTH認証結果のログ             |

### サブスクリプション管理

| メソッド                            | 戻り値                                            | 説明                                           |
| ----------------------------------- | ------------------------------------------------- | ---------------------------------------------- |
| `getSubscriptions()`                | `ReadonlyMap<string, ReadonlyArray<NostrFilter>>` | アクティブなサブスクリプション一覧             |
| `clearOlderThan(timestamp: number)` | `number`                                          | 指定タイムスタンプより古いイベントを削除       |
| `broadcast(event: NostrEvent)`      | `void`                                            | イベントをアクティブなサブスクリプションに配信 |

### NIP-11 リレー情報

| メソッド  | シグネチャ                                       | 説明             |
| --------- | ------------------------------------------------ | ---------------- |
| `setInfo` | `setInfo(info: Partial<RelayInformation>): void` | リレー情報を設定 |
| `getInfo` | `getInfo(): RelayInformation`                    | リレー情報を取得 |
