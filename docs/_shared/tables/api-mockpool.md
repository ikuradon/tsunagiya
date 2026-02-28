| メソッド/プロパティ                           | 説明                                                  |
| --------------------------------------------- | ----------------------------------------------------- |
| `relay(url, options?): MockRelay`             | MockRelay を登録・取得する                            |
| `install(): void`                             | `globalThis.WebSocket` を MockWebSocket に差し替える  |
| `uninstall(): void`                           | 元の WebSocket を復元する                             |
| `reset(): void`                               | 全リレーの状態をリセットする                          |
| `connections: Map<string, number>` (readonly) | 現在のアクティブ接続一覧                              |
| `installed: boolean` (readonly)               | install 済みかどうか                                  |
| `[Symbol.dispose](): void`                    | `using` 構文用。install 済みなら `uninstall()` を呼ぶ |
| `[Symbol.asyncDispose](): Promise<void>`      | `await using` 構文用。同上                            |
