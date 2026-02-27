| Method / Property                             | Description                                       |
| --------------------------------------------- | ------------------------------------------------- |
| `relay(url, options?): MockRelay`             | Register and retrieve a MockRelay                 |
| `install(): void`                             | Replace `globalThis.WebSocket` with MockWebSocket |
| `uninstall(): void`                           | Restore the original WebSocket                    |
| `reset(): void`                               | Reset the state of all relays                     |
| `connections: Map<string, number>` (readonly) | Currently active connections                      |
| `installed: boolean` (readonly)               | Whether install has been called                   |
