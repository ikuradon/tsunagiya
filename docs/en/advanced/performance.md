---
outline: deep
---

# Performance Guide

Optimization strategies for large-scale testing with tsunagiya.

---

## Best Practices for Large Volume Event Processing

It is recommended to use `EventBuilder.bulk()` to efficiently generate events.
Using `timeline()` for time-series data is also important. Leveraging `limit` to
narrow filtering can significantly improve performance.

---

## Memory Usage Optimization

### Free Memory with pool.reset()

When reusing a MockPool between tests, use `reset()` to clear the store and
received message log.

### Watch Snapshot Size

Snapshots create deep copies of the store and received log. With large amounts
of data, memory usage can double.

### Disable Unnecessary Logging

`logging: true` accumulates all messages in memory. Disable it for large-scale
tests (disabled by default).

---

## Benchmark Results

Reference values from tsunagiya v0.4.x (environment-dependent).

### Event Store Registration

```
1,000 events  → < 5ms
10,000 events → < 30ms
100,000 events → < 300ms
```

### Filter Matching (filterEvents)

From a store of 10,000 events:

```
kinds only          → < 5ms
kinds + authors     → < 8ms
tag filter          → < 15ms
limit: 10           → < 3ms (slice after sort)
```

### WebSocket Message Send/Receive

```
1 REQ → 100 EVENT + EOSE  → < 10ms (latency: 0)
1 REQ → 1000 EVENT + EOSE → < 50ms (latency: 0)
```

---

## Code Examples

<!--@include: ../../_shared/snippets/en/performance.md-->

---

## Related Documentation

- [Best Practices](/en/advanced/best-practices) — Test design guidelines
- [API Reference](/en/reference/api) — API details
- [Test Patterns](/en/guide/test-patterns) — Test patterns
