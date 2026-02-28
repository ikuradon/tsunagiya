| Option              | Type                                     | Description                      |
| ------------------- | ---------------------------------------- | -------------------------------- |
| `latency`           | `number \| { min: number; max: number }` | Response latency (ms)            |
| `errorRate`         | `0.0 - 1.0`                              | Probability of error response    |
| `disconnectRate`    | `0.0 - 1.0`                              | Probability of random disconnect |
| `connectionTimeout` | `number`                                 | Connection timeout (ms)          |
| `requiresAuth`      | `boolean`                                | Enable AUTH requirement          |
| `logging`           | `boolean \| LogHandler`                  | Log output                       |
