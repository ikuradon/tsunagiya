| Option              | Type                                     | Description                       |
| ------------------- | ---------------------------------------- | --------------------------------- |
| `latency`           | `number \| { min: number; max: number }` | Response delay (ms)               |
| `errorRate`         | `0.0 - 1.0`                              | Probability of error responses    |
| `disconnectRate`    | `0.0 - 1.0`                              | Probability of random disconnects |
| `connectionTimeout` | `number`                                 | Connection timeout (ms)           |
| `requiresAuth`      | `boolean`                                | Enable AUTH requirement           |
| `logging`           | `boolean \| LogHandler`                  | Log output                        |
