---
outline: deep
---

# Tutorial

A step-by-step guide to writing tests for Nostr clients using tsunagiya.

## Prerequisites

- Deno installed
- Basic understanding of the Nostr protocol (EVENT, REQ, CLOSE)

## Setup

<!--@include: ../../_shared/snippets/install.md-->

---

## Step 1: Create Your First Test

### Basic Flow

tsunagiya tests consist of three steps:

1. **Create a MockPool and register relays**
2. **Replace WebSocket with `pool.install()`**
3. **Run the code under test, then restore with `pool.uninstall()`**

### Key Points

- Always wrap `pool.install()` and `pool.uninstall()` in `try/finally`
- Pre-register test data with `relay.store()`
- When a REQ is sent, events matching the filter are automatically returned
- EOSE (End of Stored Events) is sent after matching completes

---

## Step 2: Testing Multiple Relays

Real Nostr clients connect to multiple relays. tsunagiya makes this easy to
test.

### Key Points

- Call `pool.relay()` for each URL
- Each relay operates independently
- Connecting to an unregistered URL is treated as a connection failure
  (code: 1006)

---

## Step 3: Simulating Unstable Relays

Real relays experience network latency and errors. You can simulate these with
tsunagiya.

### MockRelayOptions Reference

<!--@include: ../../_shared/tables/mockrelay-options.md-->

---

## Step 4: Using EventBuilder

Writing test data by hand is tedious. EventBuilder makes it concise.

---

## Step 5: Using Verification Helpers

Verify that the client under test sends the correct messages.

---

## Code Examples

<!--@include: ../../_shared/snippets/tutorial-steps.md-->

---

## Next Steps

- [Examples](/en/guide/examples) — Practical example collection
- [Test Patterns](/en/guide/test-patterns) — Common test scenarios
- [API Reference](/en/reference/api) — Full API reference
- [Best Practices](/en/advanced/best-practices) — Test design best practices
