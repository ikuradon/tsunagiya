| Property          | Type                                                                                | Description                          |
| ----------------- | ----------------------------------------------------------------------------------- | ------------------------------------ |
| `url`             | `string` (readonly)                                                                 | Relay URL                            |
| `options`         | `MockRelayOptions` (readonly)                                                       | Relay options                        |
| `received`        | `ClientMessage[]` (readonly)                                                        | All received messages                |
| `connectionCount` | `number` (readonly)                                                                 | Number of active connections         |
| `errors`          | `ReadonlyArray<string>` (readonly)                                                  | Log of error responses that occurred |
| `deletedIds`      | `ReadonlySet<string>` (readonly)                                                    | Deleted event IDs (NIP-09)           |
| `logger`          | `Logger \| null` (readonly)                                                         | Logger instance                      |
| `authResults`     | `ReadonlyArray<{ eventId: string; accepted: boolean; message: string }>` (readonly) | AUTH authentication result log       |

### Subscription Management

| Method                              | Return Type                                       | Description                                      |
| ----------------------------------- | ------------------------------------------------- | ------------------------------------------------ |
| `getSubscriptions()`                | `ReadonlyMap<string, ReadonlyArray<NostrFilter>>` | List of active subscriptions                     |
| `clearOlderThan(timestamp: number)` | `number`                                          | Delete events older than the specified timestamp |
| `broadcast(event: NostrEvent)`      | `void`                                            | Deliver event to active subscriptions            |

### NIP-11 Relay Information

| Method    | Signature                                        | Description           |
| --------- | ------------------------------------------------ | --------------------- |
| `setInfo` | `setInfo(info: Partial<RelayInformation>): void` | Set relay information |
| `getInfo` | `getInfo(): RelayInformation`                    | Get relay information |
