---
outline: deep
---

# NIP Support Status

NIP (Nostr Implementation Possibilities) support status for tsunagiya
v0.3.0-dev.

---

## Supported NIPs (v0.3.0)

<!--@include: ../../_shared/tables/nip-support.md-->

---

## Details and Examples for Each NIP

<!--@include: ../../_shared/snippets/nip-support-examples.md-->

---

## NIP-01: Basic Protocol Message Reference

### Supported Messages

| Message  | Direction      | NIP    | Support                           |
| -------- | -------------- | ------ | --------------------------------- |
| `EVENT`  | client → relay | NIP-01 | ✅ Receive, store, OK response    |
| `REQ`    | client → relay | NIP-01 | ✅ Filtering, EVENT/EOSE response |
| `CLOSE`  | client → relay | NIP-01 | ✅ Subscription cancellation      |
| `AUTH`   | client → relay | NIP-42 | ✅ AUTH response                  |
| `COUNT`  | client → relay | NIP-45 | ✅ Count query                    |
| `EVENT`  | relay → client | NIP-01 | ✅ Subscription delivery          |
| `OK`     | relay → client | NIP-01 | ✅ EVENT accept/reject            |
| `EOSE`   | relay → client | NIP-01 | ✅ End of stored events           |
| `CLOSED` | relay → client | NIP-01 | ✅ Subscription terminated        |
| `NOTICE` | relay → client | NIP-01 | ✅ `sendNotice()`                 |
| `AUTH`   | relay → client | NIP-42 | ✅ Challenge                      |
| `COUNT`  | relay → client | NIP-45 | ✅ Count result response          |

---

## NIP-01: Event Type Store Behavior (formerly NIP-16/NIP-33)

> NIP-16 (Event Treatment) and NIP-33 (Parameterized Replaceable Events →
> Addressable Events) have been merged into NIP-01.

| Type                                             | NIP-01 Defined kind Range | Store Behavior                                                   |
| ------------------------------------------------ | ------------------------- | ---------------------------------------------------------------- |
| Regular                                          | 1, 2, 4-44, 1000-9999     | Added normally                                                   |
| Replaceable                                      | 0, 3, 10000-19999         | Old events with same kind+pubkey are deleted before adding       |
| Ephemeral                                        | 20000-29999               | Not stored                                                       |
| Addressable (formerly Parameterized Replaceable) | 30000-39999               | Old events with same kind+pubkey+d-tag are deleted before adding |

> **Note:** Kinds not classified by NIP-01 (45-999, 40000+, etc.) are treated as
> Regular by this library and stored normally.

---

## Planned NIPs (v0.3.0 and later)

| NIP    | Description   | Target Version | Overview               |
| ------ | ------------- | -------------- | ---------------------- |
| NIP-94 | File Metadata | v0.3.0         | Template for kind:1063 |

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
