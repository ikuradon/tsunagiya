---
outline: deep
---

# Best Practices

Design guidelines for Nostr client testing with tsunagiya.

---

## Test Organization

---

## Test Granularity

### Good: One assertion per test

```typescript
Deno.test("receives EOSE after sending REQ", async () => {/* ... */});
Deno.test("stored event matches filter", async () => {/* ... */});
Deno.test("unregistered URL closes with code:1006", async () => {/* ... */});
```

### Bad: Multiple assertions in one test

```typescript
// ❌ This should be split
Deno.test("test all relay features", async () => {
  // REQ → EVENT → CLOSE → AUTH → disconnect... all in one
});
```

---

## Test Naming Conventions

### Recommended: Descriptive names

Use clear, descriptive test names that describe behavior.

```typescript
// ✅ Good
Deno.test("kind:1 event matches filter", () => {});
Deno.test("new connection after refuse returns error", () => {});
Deno.test("processes 1000 events within 100ms", () => {});

// ❌ Bad
Deno.test("test1", () => {});
Deno.test("it works", () => {});
```

### Naming Patterns

| Pattern                               | Example                                      |
| ------------------------------------- | -------------------------------------------- |
| `[subject] [condition] [expectation]` | `filter matches kind:1 with one result`      |
| `[action] results in [outcome]`       | `refuse() causes connection to be rejected`  |
| `when [situation], [behavior]`        | `when URL is unregistered, connection fails` |

---

## Applying the DRY Principle

---

## Test Execution Speed Optimization

### 1. Minimize latency

```typescript
// ❌ Slow: simulates actual delay
pool.relay("wss://relay.example.com", { latency: 2000 });

// ✅ Fast: zero latency for non-latency tests
pool.relay("wss://relay.example.com"); // default is 0ms
```

### 2. Set short timeouts

```typescript
pool.relay("wss://relay.example.com", { connectionTimeout: 50 });
```

### 3. Use short intervals for streamEvents

```typescript
// ❌ Slow
streamEvents(relay, events, { interval: 1000 });

// ✅ Fast
streamEvents(relay, events, { interval: 10 });
```

---

## Always Use try/finally

**Always wrap `pool.install()` and `pool.uninstall()` in `try/finally`.**

Forgetting `uninstall()` leaves `globalThis.WebSocket` replaced, which will
break subsequent tests.

---

## Code Examples

<!--@include: ../../_shared/snippets/en/best-practices.md-->

---

## Related Documentation

- [Test Patterns](/en/guide/test-patterns) — Test pattern collection
- [Performance](/en/advanced/performance) — Performance optimization
- [Troubleshooting](/en/help/troubleshooting) — Error resolution
