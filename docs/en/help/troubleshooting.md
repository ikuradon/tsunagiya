---
outline: deep
---

# Troubleshooting

Common errors and solutions for tsunagiya.

---

## Test Times Out

### Symptom

Test fails with `Deno.test` default timeout (5 seconds).

### Causes and Solutions

**1. Forgot to call `pool.uninstall()`**

→ Always wrap in `try/finally`.

**2. WebSocket `onclose` never fires**

Promise never resolves, so the test never completes.

→ Call `ws.close()` after receiving EOSE.

**3. Latency setting is too large**

→ Use small values in tests. Use `latency: 0` (default) for all but
latency-specific tests.

**4. streamEvents keeps running**

→ Specify `count` or call `handle.stop()` at test end.

**5. Extend Deno test timeout**

```typescript
Deno.test({
  name: "slow test",
  fn: async () => {/* ... */},
  sanitizeOps: false,
  sanitizeResources: false,
});
```

---

## Events Not Received

### Symptom

Sending REQ returns no events.

### Causes and Solutions

**1. Forgot to call `relay.store()`**

→ Register test data using `store()`.

**2. Filter doesn't match**

→ Verify that the kind of stored events matches the kinds in the filter.

**3. Created WebSocket before calling `pool.install()`**

→ Call `pool.install()` before creating WebSocket connections.

**4. `onREQ` handler returns an empty array**

→ Setting an `onREQ` handler skips auto-matching. Return events from the handler
or use `store()` without `onREQ`.

---

## WebSocket Connection Fails

### Symptom

`onerror` → `onclose(code: 1006)` fires on connection.

### Causes and Solutions

**1. URL not registered**

→ Register the target URL with `pool.relay()`.

**2. `refuse()` was called**

→ Check whether the connection was before `refuse()` was called. Use `reset()`
to reset.

**3. `connectionTimeout` is too short**

→ Set the timeout to an appropriate value.

---

## "MockPool is already installed" Error

### Symptom

```
Error: MockPool is already installed
```

### Cause

`pool.install()` was called twice.

---

## "MockPool is not installed" Error

### Symptom

```
Error: MockPool is not installed
```

### Cause

`pool.uninstall()` was called before install, or called twice.

---

## "WebSocket is not open" Error

### Symptom

```
DOMException: WebSocket is not open
```

### Cause

`send()` was called when `readyState` is not `OPEN`.

---

## Debugging

---

## Code Examples

<!--@include: ../../_shared/snippets/troubleshooting.md-->

---

## Related Documentation

- [FAQ](/en/help/faq) — Frequently asked questions
- [API Reference](/en/reference/api) — Correct API usage
- [Tutorial](/en/guide/tutorial) — Basic usage
