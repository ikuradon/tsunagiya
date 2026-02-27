---
outline: deep
---

# Architecture

## Overview

Tsunagiya is a mock library that makes existing Nostr client code testable
without modification by replacing `globalThis.WebSocket`.

```mermaid
flowchart LR
    TC["Test Code"]
    GWS["globalThis.WebSocket"]
    GF["globalThis.fetch"]
    MWS["MockWebSocket"]
    NIP11["NIP-11 Interceptor"]
    MR1["MockRelay (wss://relay1)"]
    MR2["MockRelay (wss://relay2)"]

    TC -->|"pool.install()"| GWS
    TC -->|"pool.install()"| GF
    GWS --> MWS
    GF --> NIP11
    MWS --> MR1
    MWS --> MR2
```

---

## Component Structure

```
src/
├── pool.ts         MockPool       — Global manager, WebSocket replacement
├── relay.ts        MockRelay      — Per-URL virtual relay
├── websocket.ts    MockWebSocket  — WebSocket API-compatible mock
├── filter.ts       matchFilter etc — NIP-01 filter matching (pure functions)
├── auth.ts         AuthState      — NIP-42 AUTH challenge/response
├── event_kind.ts                  — Event kind classification (Regular/Replaceable/Ephemeral etc.)
├── logger.ts                      — Logger
└── types.ts                       — Type definitions
```

### MockPool (`src/pool.ts`)

A container that manages multiple MockRelay instances keyed by URL. The entry
point for tests.

| Member               | Type                       | Role                                    |
| -------------------- | -------------------------- | --------------------------------------- |
| `#relays`            | `Map<string, MockRelay>`   | URL → MockRelay mapping                 |
| `#originalWebSocket` | `typeof WebSocket \| null` | Stores original WebSocket for uninstall |
| `#originalFetch`     | `typeof fetch \| null`     | Stores original fetch for uninstall     |

**Key methods:**

- `relay(url, options?)` — Register/retrieve a MockRelay (returns existing
  instance for same URL)
- `install()` — Replaces `globalThis.WebSocket` and `globalThis.fetch`
- `uninstall()` — Restores original implementations
- `reset()` — Clears state of all relays

### MockRelay (`src/relay.ts`)

A virtual Nostr relay operating per URL. Provides event store, filtering, custom
handlers, assertion helpers, instability simulation, and NIP-42 AUTH.

| Field            | Type                                             | Role                              |
| ---------------- | ------------------------------------------------ | --------------------------------- |
| `#store`         | `NostrEvent[]`                                   | Event store (persistent events)   |
| `#received`      | `ReceivedMessage[]`                              | Log of received messages          |
| `#connections`   | `Set<MockWebSocket>`                             | List of active connections        |
| `#subscriptions` | `Map<MockWebSocket, Map<string, NostrFilter[]>>` | Subscriptions per connection      |
| `#authState`     | `AuthState`                                      | NIP-42 authentication state       |
| `#pendingTimers` | `Set<ReturnType<typeof setTimeout>>`             | Pending timers (cleared on reset) |

### MockWebSocket (`src/websocket.ts`)

The replacement for `globalThis.WebSocket`. Extends `EventTarget` to emulate the
WebSocket API.

| Member                      | Role                                              |
| --------------------------- | ------------------------------------------------- |
| `static _resolveRelay`      | URL → MockRelay resolver function set by MockPool |
| `#relay`                    | The MockRelay this socket is routed to            |
| `send(data)`                | Forwards to `relay._handleMessage()`              |
| `_receiveMessage(data)`     | Receive callback invoked by the relay             |
| `_forceClose(code, reason)` | Forced disconnect invoked by the relay            |

### filter.ts

Pure functions for NIP-01 filter matching. No side effects.

| Function                       | Description                                                             |
| ------------------------------ | ----------------------------------------------------------------------- |
| `matchFilter(event, filter)`   | Checks if an event matches a single filter (all conditions AND)         |
| `matchFilters(event, filters)` | Checks if an event matches any of multiple filters (OR between filters) |
| `filterEvents(events, filter)` | Filters event array, sorts descending, applies limit                    |

### auth.ts (NIP-42)

Manages AUTH challenge/response per connection.

| Member                               | Role                                                |
| ------------------------------------ | --------------------------------------------------- |
| `#validator`                         | Custom validator function                           |
| `#challenges`                        | Connection → challenge string mapping               |
| `#authenticated`                     | Set of authenticated connections                    |
| `sendChallenge(ws)`                  | Generates a random challenge and sends AUTH message |
| `handleAuthResponse(ws, event, url)` | Validates kind:22242 AUTH response                  |

### Class Relationship Diagram

```mermaid
classDiagram
    class MockPool {
        +Map~string, MockRelay~ relays
        +relay(url, options?) MockRelay
        +install() void
        +uninstall() void
        +reset() void
    }

    class MockRelay {
        +NostrEvent[] store
        +Set~MockWebSocket~ connections
        +Map subscriptions
        +AuthState authState
        +_handleMessage(ws, data) void
        +_injectEvent(event) void
        +broadcast(event) void
    }

    class MockWebSocket {
        +static _resolveRelay Function
        +send(data) void
        +_receiveMessage(data) void
        +_forceClose(code, reason) void
    }

    class AuthState {
        +sendChallenge(ws) void
        +handleAuthResponse(ws, event, url) boolean
        +isAuthenticated(ws) boolean
    }

    MockPool "1" --> "0..*" MockRelay : manages
    MockRelay "1" --> "0..*" MockWebSocket : connected
    MockRelay "1" --> "1" AuthState : owns
    MockWebSocket ..> MockRelay : routes to
```

---

## WebSocket Interception Mechanism

```mermaid
sequenceDiagram
    participant TC as Test Code
    participant MP as MockPool
    participant GWS as globalThis.WebSocket
    participant MWS as MockWebSocket
    participant MR as MockRelay

    TC->>MP: pool.install()
    MP->>GWS: globalThis.WebSocket = MockWebSocket
    Note over MP,GWS: MockWebSocket._resolveRelay = (url) => relays.get(url)<br>globalThis.fetch = NIP-11 interceptor

    TC->>MWS: new WebSocket("wss://...")
    MWS->>MR: _resolveRelay(url) → find MockRelay
    MWS->>MR: relay._registerConnection(this)
    Note over MWS: queueMicrotask → #scheduleOpen()

    MWS->>MWS: readyState = OPEN
    MWS-->>TC: open event / onopen callback
    MWS->>MR: relay._handleOpen(this)
    Note over MR: If requiresAuth: setTimeout(0) → send AUTH challenge

    TC->>MP: pool.uninstall()
    MP->>GWS: globalThis.WebSocket = original WebSocket
    Note over MP,GWS: globalThis.fetch = original fetch
```

### WebSocket readyState Transitions

```mermaid
stateDiagram-v2
    [*] --> CONNECTING : new WebSocket(url)
    CONNECTING --> OPEN : scheduleOpen() via queueMicrotask
    CONNECTING --> CLOSED : _resolveRelay() returns null
    OPEN --> CLOSING : ws.close() called
    OPEN --> CLOSED : _forceClose() by relay
    CLOSING --> CLOSED : close handshake complete
    CLOSED --> [*]

    note right of CONNECTING
        readyState = 0
        Relay lookup in progress
    end note
    note right of OPEN
        readyState = 1
        Messages can be sent/received
    end note
    note right of CLOSING
        readyState = 2
        Close in progress
    end note
    note right of CLOSED
        readyState = 3
        Connection terminated
    end note
```

---

## Message Flow

### Client → Relay (send)

```mermaid
sequenceDiagram
    participant C as Client
    participant MWS as MockWebSocket
    participant MR as MockRelay

    C->>MWS: ws.send('["REQ", "sub1", {...}]')

    alt readyState is not OPEN
        MWS-->>C: throw DOMException
    else readyState is OPEN
        MWS->>MR: relay._handleMessage(this, data)
        Note over MR: 1. JSON.parse<br>2. Basic structure validation<br>3. Log to received[]<br>4. Check disconnectRate<br>5. Check errorRate<br>6. Check AUTH if requiresAuth
        alt MESSAGE type
            MR->>MR: "EVENT" → #handleEvent()
            MR->>MR: "REQ" → #handleReq()
            MR->>MR: "CLOSE" → #handleClose()
            MR->>MR: "AUTH" → #handleAuth()
            MR->>MR: "COUNT" → #handleCount()
        end
        MR->>MWS: #sendWithLatency(ws, response)
    end
```

### Relay → Client (receive)

```mermaid
sequenceDiagram
    participant MR as MockRelay
    participant MWS as MockWebSocket
    participant C as Client

    MR->>MR: #sendWithLatency(ws, message)
    alt latency == 0
        Note over MR: queueMicrotask → immediate delivery
    else latency > 0
        Note over MR: setTimeout(latency) → delayed delivery
    end

    MR->>MWS: _receiveMessage(data)
    alt readyState is not OPEN
        Note over MWS: silently ignored
    else readyState is OPEN
        MWS->>MWS: create MessageEvent
        MWS-->>C: onmessage / "message" event
    end
```

### Error Simulation Decision Flow

```mermaid
flowchart TD
    MSG["Incoming Message"] --> DISC{"disconnectRate\ncheck"}
    DISC -->|"random hit"| FORCE["_forceClose()\nDisconnect client"]
    DISC -->|"no hit"| ERR{"errorRate\ncheck"}
    ERR -->|"random hit"| NOTICE["Send NOTICE error\n(continue connection)"]
    ERR -->|"no hit"| AUTH{"requiresAuth &&\nnot authenticated?"}
    AUTH -->|"yes"| AUTHNOTICE["Send NOTICE\nauthentication required"]
    AUTH -->|"no"| ROUTE["Route to handler\n(handleEvent / handleReq / ...)"]
    FORCE --> END["End processing"]
    NOTICE --> END
    AUTHNOTICE --> END
    ROUTE --> RESP["Send response\n#sendWithLatency()"]
    RESP --> END
```

---

## Data Flow

### Event Store

```mermaid
flowchart TD
    STORE["store(event)"] --> K5{"kind:5\n(Deletion)?"}
    K5 -->|yes| DEL["#handleDeletion()\nDelete referenced events\n+ add to store"]
    K5 -->|no| REG{"Regular Event?\n(not special kind)"}
    REG -->|yes| ADD["Add to store"]
    REG -->|no| REPL{"Replaceable?\n(kind 0, 3,\n10000–19999)"}
    REPL -->|yes| REPLACE["Replace old event\nwith same kind+pubkey"]
    REPL -->|no| ADDR{"Addressable?\n(kind 30000–39999)"}
    ADDR -->|yes| ADDRREPLACE["Replace old event\nwith same kind+pubkey+d-tag"]
    ADDR -->|no| EPH{"Ephemeral?\n(kind 20000–29999)"}
    EPH -->|yes| SKIP["Do not add to store"]
    EPH -->|no| ADD
```

### Event Kind Classification Flow

```mermaid
flowchart TD
    EV["NostrEvent (kind: N)"] --> K5CHECK{"kind === 5?"}
    K5CHECK -->|yes| DELETION["Deletion Event\nTriggers #handleDeletion()"]
    K5CHECK -->|no| REPL_CHECK{"kind === 0, 3\nor 10000–19999?"}
    REPL_CHECK -->|yes| REPLACEABLE["Replaceable Event\nReplace same kind+pubkey"]
    REPL_CHECK -->|no| ADDR_CHECK{"kind 30000–39999?"}
    ADDR_CHECK -->|yes| ADDRESSABLE["Addressable Event\nReplace same kind+pubkey+d-tag"]
    ADDR_CHECK -->|no| EPH_CHECK{"kind 20000–29999?"}
    EPH_CHECK -->|yes| EPHEMERAL["Ephemeral Event\nBroadcast only, not stored"]
    EPH_CHECK -->|no| REGULAR["Regular Event\nAdded to store as-is\n(kind 1–4999 / 5001–9999 etc.)"]
```

### REQ Processing and Subscription Management

```mermaid
sequenceDiagram
    participant C as Client
    participant MR as MockRelay
    participant S as Event Store
    participant H as Custom reqHandler

    C->>MR: send(["REQ", "sub1", filter1, filter2])
    MR->>MR: subscriptions[ws]["sub1"] = [filter1, filter2]

    alt custom reqHandler set
        MR->>H: reqHandler(subId, filters)
        H-->>MR: matching events
    else default behavior
        MR->>S: filterEvents(store, filters)
        S-->>MR: matching events
    end

    loop for each matching event
        MR->>C: send(["EVENT", "sub1", event])
    end
    MR->>C: send(["EOSE", "sub1"])

    Note over MR,C: Subsequent store() + broadcast()<br>delivers new events to active subscriptions
```

### Subscription Data Structure

```
#subscriptions: Map<MockWebSocket, Map<string, NostrFilter[]>>

  ConnectionA ──→ { "sub1": [filter1, filter2],
                    "sub2": [filter3] }
  ConnectionB ──→ { "sub1": [filter4] }
```

---

## NIP Processing Flows

### NIP-42 AUTH Flow

```mermaid
sequenceDiagram
    participant TC as Test Code
    participant MP as MockPool
    participant MR as MockRelay
    participant AS as AuthState
    participant C as Client

    TC->>MR: requireAuth(validator) or requiresAuth: true
    TC->>MP: pool.install()
    C->>MR: new WebSocket(url) → connection established
    MR->>AS: sendChallenge(ws) via setTimeout(0)
    AS-->>C: send(["AUTH", challenge])

    C->>MR: send(["AUTH", kind22242Event])
    MR->>AS: handleAuthResponse(ws, authEvent, url)
    AS->>AS: 1. Verify challenge tag matches
    AS->>AS: 2. Check kind:22242
    AS->>AS: 3. Run validator(authEvent) or verify relay tag
    alt authentication succeeded
        AS->>AS: authenticated.add(ws)
        MR-->>C: send(["OK", eventId, true, ""])
    else authentication failed
        MR-->>C: send(["OK", eventId, false, "auth-required: ..."])
    end
```

### NIP-09 Deletion Processing

```mermaid
flowchart TD
    CLIENT["Client sends kind:5 event"] --> HE["MockRelay#handleEvent()"]
    HE --> HD["#handleDeletion(event)"]
    HD --> ETAG{"e tags present?"}
    ETAG -->|yes| DELID["Delete events by ID from store\nRecord in deletedIds"]
    ETAG -->|no| ATAG{"a tags present?"}
    DELID --> ATAG
    ATAG -->|yes| DELADR["Delete Replaceable/Addressable\nevents from store"]
    ATAG -->|no| ADDST["Add kind:5 event to store"]
    DELADR --> ADDST
    ADDST --> OK["Send OK response to client"]
    OK --> BLOCK["Future re-publish of deleted IDs\nreturns: blocked: event was deleted"]
```

### NIP-11 Relay Information Flow

```mermaid
sequenceDiagram
    participant TC as Test Code
    participant MR as MockRelay
    participant MP as MockPool
    participant C as Client

    TC->>MR: relay.setInfo({ name: "...", description: "..." })
    C->>MP: fetch("https://relay.example.com", { headers: { Accept: "application/nostr+json" } })
    MP->>MP: isNip11Request() → true
    MP->>MP: Convert HTTP/HTTPS URL to WS/WSS
    MP->>MR: relay lookup by WS URL
    MR-->>MP: relay.getInfo()
    MP-->>C: Response(JSON.stringify(info), { "Content-Type": "application/nostr+json" })
```

### Event Injection and Real-time Stream

```mermaid
flowchart TD
    INJECT["relay.store(event) + relay.broadcast(event)\nUsed by streamEvents etc. in testing/"]
    INJECT --> CLASSIFY["store(event)\nSave to store"]
    CLASSIFY --> BROADCAST["broadcast(event)"]
    BROADCAST --> MATCH["Match against all active\nsubscription filters"]
    MATCH --> SEND{"Matched?"}
    SEND -->|yes| EVMSG["Send EVENT message\nto matched connections/subscriptions"]
    SEND -->|no| SKIP["Skip"]
    EVMSG --> RECEIVE["MockWebSocket#_receiveMessage()\n→ client onmessage"]
```

---

## Test Lifecycle

```typescript
// 1. Initialize
const pool = new MockPool();
const relay = pool.relay("wss://relay.example.com");

// 2. Pre-load data and configuration
relay.store(event); // Pre-register events
relay.onREQ((subId, filters) =>
  // Custom handler
  customEvents
);

// 3. Replace WebSocket
pool.install();

try {
  // 4. Run test (call client code as-is)
  const ws = new WebSocket("wss://relay.example.com");
  // ...

  // 5. Assertions
  relay.hasEvent("abc123"); // Verify event was received
  relay.countREQs(); // Verify REQ count
} finally {
  // 6. Always restore (prevents interference between tests)
  pool.uninstall();
}
```

---

## Test Helper Overview

```mermaid
flowchart LR
    subgraph TESTING ["@ikuradon/tsunagiya/testing"]
        EB["EventBuilder\nCreate test events\n(NIP templates, bulk, timeline)"]
        FB["FilterBuilder\nCommon filter patterns\n(NIP-17/18/23/25/51/52/65)"]
        AS["Assertion Helpers\nassertReceivedREQ\nassertEventPublished etc."]
        ST["Stream Functions\nstreamEvents / startStream\nReal-time simulation"]
        SN["Snapshot\nrelay.snapshot()\nrelay.restore()"]
    end

    subgraph CORE ["@ikuradon/tsunagiya (core)"]
        MR["MockRelay"]
    end

    EB -->|"build events for"| MR
    FB -->|"build filters for"| MR
    AS -->|"assert against"| MR
    ST -->|"_injectEvent() into"| MR
    SN -->|"capture/restore state of"| MR
```

---

## Notes

- **Test interference**: Since replacing `globalThis.WebSocket` is a global
  operation, always call `pool.uninstall()` in the `finally` block of each test.
- **No signature verification**: As a testing library, event signatures are
  treated as plain strings (actual cryptographic processing is not implemented
  to avoid adding dependencies). If you need signature verification, implement
  it yourself in an `onEVENT` handler.
- **Async delivery**: Even with latency 0, responses are delivered
  asynchronously via `queueMicrotask` (returning responses synchronously inside
  `send()` would cause some clients to malfunction).
- **Single instance**: Only one `MockPool` instance can be `install`ed at a
  time.
