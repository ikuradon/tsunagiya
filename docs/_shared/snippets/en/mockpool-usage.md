```typescript
const pool = new MockPool();
const relay = pool.relay("wss://relay.example.com");

pool.install(); // replace WebSocket
pool.uninstall(); // restore original
pool.reset(); // reset state of all relays
pool.connections; // active connection list (Map<string, number>)
```

Multiple relay usage:

```typescript
const pool = new MockPool();

// register multiple relays (each operates independently)
const relay1 = pool.relay("wss://relay1.example.com");
const relay2 = pool.relay("wss://relay2.example.com");
const relay3 = pool.relay("wss://relay3.example.com");

// register different events per relay
relay1.store(event1);
relay2.store(event2);
relay3.store(event3);

// different settings per relay are also possible
const fastRelay = pool.relay("wss://fast.relay.test", { latency: 10 });
const slowRelay = pool.relay("wss://slow.relay.test", { latency: 500 });

pool.install();
try {
  // client code connecting to multiple relays simultaneously works as-is
  const ws1 = new WebSocket("wss://relay1.example.com");
  const ws2 = new WebSocket("wss://relay2.example.com");
  const ws3 = new WebSocket("wss://relay3.example.com");
  // ... client logic under test
} finally {
  pool.uninstall();
}
```
