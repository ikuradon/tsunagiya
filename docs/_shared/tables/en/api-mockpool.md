| Method/Property                               | Description                                          |
| --------------------------------------------- | ---------------------------------------------------- |
| `relay(url, options?): MockRelay`             | Register and retrieve a MockRelay                    |
| `install(): void`                             | Replace `globalThis.WebSocket` with MockWebSocket    |
| `uninstall(): void`                           | Restore the original WebSocket                       |
| `reset(): void`                               | Reset the state of all relays                        |
| `connections: Map<string, number>` (readonly) | Current active connections                           |
| `installed: boolean` (readonly)               | Whether install has been called                      |
| `[Symbol.dispose](): void`                    | For `using` syntax. Calls `uninstall()` if installed |
| `[Symbol.asyncDispose](): Promise<void>`      | For `await using` syntax. Same as above              |
