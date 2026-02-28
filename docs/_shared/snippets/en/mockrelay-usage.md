Event registration and custom handlers:

```typescript
const relay = pool.relay("wss://relay.example.com");

// pre-register events (auto-matched on REQ)
relay.store(event);

// customize REQ handler
relay.onREQ((subId, filters) => {
  return [customEvent];
});

// customize EVENT handler
relay.onEVENT((event) => {
  return ["OK", event.id, true, ""];
});
```

Simulating unstable relays:

```typescript
pool.relay("wss://unstable.relay.test", {
  latency: { min: 100, max: 2000 },
  errorRate: 0.3,
  disconnectRate: 0.1,
  connectionTimeout: 5000,
});
```

Error case testing:

```typescript
relay.refuse(); // refuse connections
relay.disconnect(); // immediately disconnect all connections
relay.disconnectAfter(3000); // disconnect after 3 seconds
relay.close(1006); // disconnect with specific close code
relay.sendRaw("not json"); // send invalid data
relay.sendNotice("rate-limited"); // send NOTICE
```

NIP-42 AUTH:

```typescript
const relay = pool.relay("wss://auth.relay.test", {
  requiresAuth: true,
});

// Default validation (no validator set): auto-checks relay URL match
// Custom validator: access context.relayUrl / context.challenge
relay.requireAuth((authEvent, context) => {
  return authEvent.tags.some(
    (t) => t[0] === "relay" && t[1] === context.relayUrl,
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
relay.connectionCount; // number of active connections
```
