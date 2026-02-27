Timeout caused by forgetting uninstall:

```typescript
// ❌ forgetting uninstall breaks the next test
pool.install();
// test...
// pool.uninstall() is missing!

// ✅ always wrap in try/finally
pool.install();
try {
  // test
} finally {
  pool.uninstall();
}
```

Forgetting to call WebSocket close():

```typescript
// ❌ not calling close() after EOSE
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg[0] === "EOSE") {
    // forgot ws.close()
  }
};

// ✅ call close() after receiving EOSE
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg[0] === "EOSE") {
    ws.close();
  }
};
```

Creating WebSocket before install:

```typescript
// ❌ the real WebSocket will be used
const ws = new WebSocket("wss://relay.example.com");
pool.install(); // install is too late

// ✅ create WebSocket after install
pool.install();
const ws = new WebSocket("wss://relay.example.com");
```

"MockPool is already installed" error:

```typescript
// ❌ double install
pool.install();
pool.install(); // Error!

// ✅ check the installed property
if (!pool.installed) {
  pool.install();
}
```

"MockPool is not installed" error:

```typescript
// ✅ check the installed property
if (pool.installed) {
  pool.uninstall();
}
```

"WebSocket is not open" error:

```typescript
// ✅ send in onopen
ws.onopen = () => {
  ws.send(JSON.stringify(["REQ", "s", { kinds: [1] }]));
};

// ❌ send immediately (still in CONNECTING state)
const ws = new WebSocket("wss://relay.example.com");
ws.send(JSON.stringify(["REQ", "s", { kinds: [1] }])); // Error!
```

Debugging: enabling logs:

```typescript
pool.relay("wss://relay.example.com", { logging: true });
```

Custom log handler:

```typescript
const logs: LogEntry[] = [];
pool.relay("wss://relay.example.com", {
  logging: (entry) => {
    logs.push(entry);
    console.log(JSON.stringify(entry, null, 2));
  },
});
```

Inspecting with the received property:

```typescript
// inspect after the test
console.log("Received messages:", JSON.stringify(relay.received, null, 2));
console.log("REQ count:", relay.countREQs());
console.log("EVENT count:", relay.countEvents());
```

Inspecting with the connections property:

```typescript
console.log("Active connections:", pool.connections);
```
