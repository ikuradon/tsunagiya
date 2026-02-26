---
outline: deep
---

# NIP Support Status

NIP (Nostr Implementation Possibilities) support status for tsunagiya v0.2.0.

---

## Supported NIPs (v0.2.0)

<!--@include: ../../_shared/tables/nip-support.md-->

---

## Details and Examples for Each NIP

<!--@include: ../../_shared/snippets/nip-support-examples.md-->

---

## NIP-01: Basic Protocol Message Reference

### Supported Messages

| Message  | Direction      | Support                           |
| -------- | -------------- | --------------------------------- |
| `EVENT`  | client → relay | ✅ Receive, store, OK response    |
| `REQ`    | client → relay | ✅ Filtering, EVENT/EOSE response |
| `CLOSE`  | client → relay | ✅ Subscription cancellation      |
| `EVENT`  | relay → client | ✅ Subscription delivery          |
| `OK`     | relay → client | ✅ EVENT accept/reject            |
| `EOSE`   | relay → client | ✅ End of stored events           |
| `NOTICE` | relay → client | ✅ `sendNotice()`                 |
| `AUTH`   | relay → client | ✅ NIP-42 challenge               |

---

## NIP-16: Event Type Store Behavior

| Type                      | kind Range     | Store Behavior                                                   |
| ------------------------- | -------------- | ---------------------------------------------------------------- |
| Regular                   | 0-9999, 40000+ | Added normally                                                   |
| Replaceable               | 10000-19999    | Old events with same kind+pubkey are deleted before adding       |
| Ephemeral                 | 20000-29999    | Not stored, broadcast only                                       |
| Parameterized Replaceable | 30000-39999    | Old events with same kind+pubkey+d-tag are deleted before adding |

---

## Planned NIPs (v0.3.0 and later)

| NIP    | Description         | Target Version | Overview                            |
| ------ | ------------------- | -------------- | ----------------------------------- |
| NIP-11 | Relay Information   | v0.3.0         | Mock relay info returned by `GET /` |
| NIP-65 | Relay List Metadata | v0.3.0         | Template for kind:10002 events      |
| NIP-94 | File Metadata       | v0.3.0         | Template for kind:1063              |

---

## Unsupported NIPs (No Plans)

| NIP    | Description       | Reason for Non-support                                                                                                                    |
| ------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| NIP-05 | DNS Identifier    | DNS resolution is outside the scope of a mock library                                                                                     |
| NIP-07 | Browser Extension | Browser API mocking should be handled by a separate library (※ kind:24133 test events can be generated via `EventBuilder.nip07Request()`) |
| NIP-19 | bech32 Encoding   | Encoding is client-side processing                                                                                                        |
| NIP-46 | Nostr Connect     | Remote signing is outside the scope of a mock relay                                                                                       |

---

## Related Documentation

- [API Reference](/en/reference/api) — API details
- [Examples](/en/guide/examples) — Usage examples
- [Tutorial](/en/guide/tutorial) — Tutorial
