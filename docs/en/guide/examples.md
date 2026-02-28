---
outline: deep
---

# Examples

Practical usage examples for tsunagiya.

## Table of Contents

1. [Basic REQ/EVENT Testing](#basic-reqevent-testing)
2. [Event Publishing Testing](#event-publishing-testing)
3. [Multiple Relay Testing](#multiple-relay-testing)
4. [Filter Matching Testing](#filter-matching-testing)
5. [Custom REQ Handlers](#custom-req-handlers)
6. [Error Handling Testing](#error-handling-testing)
7. [NIP-42 AUTH Testing](#nip-42-auth-testing)
8. [Large Volume Event Testing](#large-volume-event-testing)
9. [Real-time Stream Testing](#real-time-stream-testing)
10. [Thread and Reaction Testing](#thread-and-reaction-testing)
11. [Invalid Data and Logging Testing](#invalid-data-and-logging-testing)
12. [Snapshot-based Testing](#snapshot-based-testing)
13. [Early-Capture Library Support](#early-capture-library-support)

---

## Basic REQ/EVENT Testing

<!--@include: ../../_shared/snippets/en/examples-basic.md-->

---

## Custom REQ Handlers, Error Handling, and AUTH

<!--@include: ../../_shared/snippets/en/examples-advanced.md-->

---

## Streams, Threads, Reactions, and Snapshots

<!--@include: ../../_shared/snippets/en/examples-helpers.md-->

---

## Early-Capture Library Support

Some Nostr client libraries (such as NDK) **capture a reference to
`globalThis.WebSocket` at module load time**. This means that even if you call
`pool.install()`, those libraries may not use the MockWebSocket.

For libraries with this "early-capture" behavior, use the **bootstrap pattern**.

### Why the Normal Approach Doesn't Work

```typescript
// ❌ This won't work — NDK already captured WebSocket at module load time
import NDK from "@nostr-dev-kit/ndk";

const pool = new MockPool();
pool.install();
// NDK already holds a reference to the real WebSocket and won't use MockWebSocket
```

### The Bootstrap Pattern

Install `pool.install()` first, then use a dynamic import for the library. This
allows the library to capture MockWebSocket during its module load.

<!--@include: ../../_shared/snippets/en/ndk-bootstrap.md-->

### Applying It in Real Test Files

In a real project, run the bootstrap at the top level of the test file, then use
a regular MockPool inside each test function.

```typescript
// test_file.ts

import { MockPool } from "@ikuradon/tsunagiya";

// Bootstrap at the file top level (runs only once)
const _bootstrap = new MockPool();
_bootstrap.relay("wss://bootstrap");
_bootstrap.install();

// Dynamic import NDK (captures MockWebSocket)
const client = await import("./client.ts"); // module that imports NDK

_bootstrap.uninstall();

// Use a regular MockPool in each test as usual
Deno.test("fetch timeline", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.store(EventBuilder.kind1().content("hello").build());

  pool.install();
  try {
    const events = await client.timeline(["wss://relay.example.com"]);
    assertEquals(events.length, 1);
  } finally {
    pool.uninstall();
  }
});
```

> **Note:** Run the bootstrap **only once at the top level of the test file**.
> Do not repeat it inside individual test functions.

---

## Related Documentation

- [API Reference](/en/reference/api) — Full API details
- [Test Patterns](/en/guide/test-patterns) — Test pattern collection
- [Best Practices](/en/advanced/best-practices) — Test design best practices
