| Option              | Type                                     | Description                      |
| ------------------- | ---------------------------------------- | -------------------------------- |
| `latency`           | `number \| { min: number; max: number }` | Response latency (ms)            |
| `errorRate`         | `0.0 - 1.0`                              | Probability of error response    |
| `disconnectRate`    | `0.0 - 1.0`                              | Probability of random disconnect |
| `connectionTimeout` | `number`                                 | Connection timeout (ms)          |
| `connectionDelay`   | `number`                                 | Connection start delay (ms)      |
| `requiresAuth`      | `boolean`                                | Enable AUTH requirement          |
| `logging`           | `boolean \| LogHandler`                  | Log output                       |
| `verifier`          | `EventVerifier`                          | EVENT signature verification     |
| `authVerifier`      | `EventVerifier`                          | AUTH signature verification      |
| `clock`             | `Clock`                                  | Override the time source         |
| `random`            | `RandomSource`                           | Override the randomness source   |
