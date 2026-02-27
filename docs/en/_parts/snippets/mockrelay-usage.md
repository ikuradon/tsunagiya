Registering events and custom handlers:

```typescript
const relay = pool.relay("wss://relay.example.com");

// Pre-register events (automatically matched when REQ is received)
relay.store(event);

// Customize REQ handler
relay.onREQ((subId, filters) => {
  return [customEvent];
});

// Customize EVENT handler
relay.onEVENT((event) => {
  return ["OK", event.id, true, ""];
});
```

Simulating an unstable relay:

```typescript
pool.relay("wss://unstable.relay.com", {
  latency: { min: 100, max: 2000 },
  errorRate: 0.3,
  disconnectRate: 0.1,
  connectionTimeout: 5000,
});
```

Error case testing:

```typescript
relay.refuse(); // reject connections
relay.disconnect(); // disconnect all connections immediately
relay.disconnectAfter(3000); // disconnect after 3 seconds
relay.close(1006); // disconnect with specific close code
relay.sendRaw("not json"); // send invalid data
relay.sendNotice("rate-limited"); // send NOTICE
```

NIP-42 AUTH:

```typescript
const relay = pool.relay("wss://auth.relay.com", {
  requiresAuth: true,
});

relay.requireAuth((authEvent) => {
  return authEvent.tags.some(
    (t) => t[0] === "relay" && t[1] === "wss://auth.relay.com",
  );
});
```

Verification helpers:

```typescript
relay.received; // all received messages
relay.findREQ("sub1"); // find REQ
relay.countREQs(); // count REQs
relay.hasREQ("sub1"); // check if REQ exists
relay.findEvent("id1"); // find EVENT
relay.countEvents(); // count EVENTs
relay.hasEvent("id1"); // check if EVENT exists
relay.findCLOSE("sub1"); // find CLOSE
relay.connectionCount; // active connection count
```
