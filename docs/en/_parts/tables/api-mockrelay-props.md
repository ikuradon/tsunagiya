| Property          | Type                               | Description                          |
| ----------------- | ---------------------------------- | ------------------------------------ |
| `url`             | `string` (readonly)                | Relay URL                            |
| `options`         | `MockRelayOptions` (readonly)      | Relay options                        |
| `received`        | `ClientMessage[]` (readonly)       | All received messages                |
| `connectionCount` | `number` (readonly)                | Active connection count              |
| `errors`          | `ReadonlyArray<string>` (readonly) | Log of error responses that occurred |
| `deletedIds`      | `ReadonlySet<string>` (readonly)   | Deleted event IDs (NIP-09)           |
| `logger`          | `Logger \| null` (readonly)        | Logger instance                      |

### NIP-11 Relay Information

| Method    | Signature                                        | Description           |
| --------- | ------------------------------------------------ | --------------------- |
| `setInfo` | `setInfo(info: Partial<RelayInformation>): void` | Set relay information |
| `getInfo` | `getInfo(): RelayInformation`                    | Get relay information |
