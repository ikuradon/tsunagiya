| オプション          | 型                                       | 説明                  |
| ------------------- | ---------------------------------------- | --------------------- |
| `latency`           | `number \| { min: number; max: number }` | 応答遅延 (ms)         |
| `errorRate`         | `0.0 - 1.0`                              | エラー応答の確率      |
| `disconnectRate`    | `0.0 - 1.0`                              | ランダム切断の確率    |
| `connectionTimeout` | `number`                                 | 接続タイムアウト (ms) |
| `connectionDelay`   | `number`                                 | 接続開始遅延 (ms)     |
| `requiresAuth`      | `boolean`                                | AUTH 要求の有効化     |
| `logging`           | `boolean \| LogHandler`                  | ログ出力              |
| `verifier`          | `EventVerifier`                          | EVENT 署名検証        |
| `authVerifier`      | `EventVerifier`                          | AUTH 署名検証         |
| `clock`             | `Clock`                                  | 時刻ソースの差し替え  |
| `random`            | `RandomSource`                           | 乱数ソースの差し替え  |
