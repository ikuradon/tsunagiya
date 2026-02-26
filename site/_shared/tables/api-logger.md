| メソッド/プロパティ   | 型                                   | 説明                   |
| --------------------- | ------------------------------------ | ---------------------- |
| `level`               | `LogLevel` (readonly)                | 現在のログレベル       |
| `entries`             | `ReadonlyArray<LogEntry>` (readonly) | 蓄積されたログエントリ |
| `setLevel(level)`     | `void`                               | ログレベル変更         |
| `setHandler(handler)` | `void`                               | カスタムハンドラー設定 |
| `clear()`             | `void`                               | ログエントリクリア     |
| `log(entry, level?)`  | `void`                               | ログ記録               |
