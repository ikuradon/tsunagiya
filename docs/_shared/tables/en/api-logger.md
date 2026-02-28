| Method/Property       | Type                                 | Description             |
| --------------------- | ------------------------------------ | ----------------------- |
| `level`               | `LogLevel` (readonly)                | Current log level       |
| `entries`             | `ReadonlyArray<LogEntry>` (readonly) | Accumulated log entries |
| `setLevel(level)`     | `void`                               | Change log level        |
| `setHandler(handler)` | `void`                               | Set custom handler      |
| `clear()`             | `void`                               | Clear log entries       |
| `log(entry, level?)`  | `void`                               | Record a log entry      |
