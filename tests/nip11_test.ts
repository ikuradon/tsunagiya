import { assertEquals } from "@std/assert";
import { MockPool } from "../src/mod.ts";
import type { RelayInformation } from "../src/types.ts";

// ===== MockRelay setInfo/getInfo ユニットテスト =====

Deno.test("NIP-11 info - returns empty object by default", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");
  assertEquals(relay.getInfo(), {});
});

Deno.test("NIP-11 info - stores and retrieves basic info", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.setInfo({
    name: "Test Relay",
    supported_nips: [1, 11, 42],
  });

  const info = relay.getInfo();
  assertEquals(info.name, "Test Relay");
  assertEquals(info.supported_nips, [1, 11, 42]);
});

Deno.test("NIP-11 info - merges fields across setInfo calls", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.setInfo({ name: "Relay A" });
  relay.setInfo({ description: "A test relay" });

  const info = relay.getInfo();
  assertEquals(info.name, "Relay A");
  assertEquals(info.description, "A test relay");
});

Deno.test("NIP-11 info - overwrites same field on setInfo", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.setInfo({ name: "First" });
  relay.setInfo({ name: "Second" });

  assertEquals(relay.getInfo().name, "Second");
});

Deno.test("NIP-11 info - stores limitation fields", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.setInfo({
    limitation: {
      max_message_length: 16384,
      max_subscriptions: 20,
      auth_required: true,
    },
  });

  const info = relay.getInfo();
  assertEquals(info.limitation?.max_message_length, 16384);
  assertEquals(info.limitation?.max_subscriptions, 20);
  assertEquals(info.limitation?.auth_required, true);
});

Deno.test("NIP-11 info - returns a defensive copy from getInfo", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.setInfo({ name: "Original" });

  const copy = relay.getInfo();
  copy.name = "Modified";

  assertEquals(relay.getInfo().name, "Original");
});

Deno.test("NIP-11 info - includes info in snapshot", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.setInfo({
    name: "Snapshot Relay",
    supported_nips: [1, 11],
  });

  const snap = relay.snapshot();
  assertEquals(snap.info?.name, "Snapshot Relay");
  assertEquals(snap.info?.supported_nips, [1, 11]);
});

Deno.test("NIP-11 info - recovers info on restore", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.setInfo({ name: "Before" });
  const snap = relay.snapshot();

  relay.setInfo({ name: "After" });
  assertEquals(relay.getInfo().name, "After");

  relay.restore(snap);
  assertEquals(relay.getInfo().name, "Before");
});

Deno.test("NIP-11 info - handles restore of legacy snapshot without info", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.setInfo({ name: "Will be cleared" });

  // info フィールドを持たない旧形式スナップショット
  const legacySnap = {
    timestamp: Date.now(),
    store: [],
    received: [],
  };

  relay.restore(legacySnap);
  assertEquals(relay.getInfo(), {});
});

Deno.test("NIP-11 info - clears info on reset", () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");

  relay.setInfo({ name: "To be reset", supported_nips: [1] });
  relay.reset();

  assertEquals(relay.getInfo(), {});
});

// ===== fetch インターセプト テスト =====

Deno.test("NIP-11 fetch - returns relay information with nostr+json Accept header", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://relay.example.com");
  relay.setInfo({
    name: "Fetch Test Relay",
    supported_nips: [1, 11, 42],
    software: "https://example.com",
    version: "1.0.0",
  });

  pool.install();
  try {
    const response = await fetch("https://relay.example.com", {
      headers: { "Accept": "application/nostr+json" },
    });

    assertEquals(response.status, 200);

    const info: RelayInformation = await response.json();
    assertEquals(info.name, "Fetch Test Relay");
    assertEquals(info.supported_nips, [1, 11, 42]);
    assertEquals(info.software, "https://example.com");
    assertEquals(info.version, "1.0.0");
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-11 fetch - normalizes trailing slash in URL", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.example.com").setInfo({ name: "Slash Test" });

  pool.install();
  try {
    const response = await fetch("https://relay.example.com/", {
      headers: { "Accept": "application/nostr+json" },
    });
    const info: RelayInformation = await response.json();
    assertEquals(info.name, "Slash Test");
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-11 fetch - converts http to ws scheme", async () => {
  const pool = new MockPool();
  pool.relay("ws://localhost:8080").setInfo({ name: "Local Relay" });

  pool.install();
  try {
    const response = await fetch("http://localhost:8080", {
      headers: { "Accept": "application/nostr+json" },
    });
    const info: RelayInformation = await response.json();
    assertEquals(info.name, "Local Relay");
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-11 fetch - returns independent info for different relays", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay1.example.com").setInfo({ name: "Relay One" });
  pool.relay("wss://relay2.example.com").setInfo({ name: "Relay Two" });

  pool.install();
  try {
    const res1 = await fetch("https://relay1.example.com", {
      headers: { "Accept": "application/nostr+json" },
    });
    const res2 = await fetch("https://relay2.example.com", {
      headers: { "Accept": "application/nostr+json" },
    });

    assertEquals((await res1.json()).name, "Relay One");
    assertEquals((await res2.json()).name, "Relay Two");
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-11 fetch - falls back to original fetch for unregistered relay", async () => {
  const realFetch = globalThis.fetch;
  let fallbackCalled = false;
  globalThis.fetch = (
    _input: string | URL | Request,
    _init?: RequestInit,
  ) => {
    fallbackCalled = true;
    return Promise.resolve(new Response("fallback", { status: 200 }));
  };

  const pool = new MockPool();
  pool.relay("wss://registered.example.com");

  pool.install();
  try {
    const response = await fetch("https://unknown.example.com", {
      headers: { "Accept": "application/nostr+json" },
    });
    assertEquals(fallbackCalled, true);
    assertEquals(await response.text(), "fallback");
  } finally {
    pool.uninstall();
    globalThis.fetch = realFetch;
  }
});

Deno.test("NIP-11 fetch - falls back when Accept header is not nostr+json", async () => {
  const realFetch = globalThis.fetch;
  let fallbackCalled = false;
  globalThis.fetch = (
    _input: string | URL | Request,
    _init?: RequestInit,
  ) => {
    fallbackCalled = true;
    return Promise.resolve(new Response("not nostr", { status: 200 }));
  };

  const pool = new MockPool();
  pool.relay("wss://relay.example.com").setInfo({ name: "Test" });

  pool.install();
  try {
    const response = await fetch("https://relay.example.com");
    assertEquals(fallbackCalled, true);
    assertEquals(await response.text(), "not nostr");
  } finally {
    pool.uninstall();
    globalThis.fetch = realFetch;
  }
});

Deno.test("NIP-11 - fetch returns empty object when setInfo not called", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.example.com");

  pool.install();
  try {
    const response = await fetch("https://relay.example.com", {
      headers: { "Accept": "application/nostr+json" },
    });
    const info = await response.json();
    assertEquals(info, {});
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-11 - uninstall restores original fetch", () => {
  const pool = new MockPool();
  pool.relay("wss://relay.example.com");

  const originalFetch = globalThis.fetch;

  pool.install();
  pool.uninstall();

  assertEquals(globalThis.fetch, originalFetch);
});

// ===== 回帰テスト: Issue 4 - Accept ヘッダー case sensitivity =====

Deno.test("NIP-11 - fetch with lowercase accept header", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.example.com").setInfo({ name: "Lowercase Test" });

  pool.install();
  try {
    const response = await fetch("https://relay.example.com", {
      headers: { "accept": "application/nostr+json" },
    });
    const info: RelayInformation = await response.json();
    assertEquals(info.name, "Lowercase Test");
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-11 - fetch with array format headers", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.example.com").setInfo({ name: "Array Headers" });

  pool.install();
  try {
    const response = await fetch("https://relay.example.com", {
      headers: [["Accept", "application/nostr+json"]],
    });
    const info: RelayInformation = await response.json();
    assertEquals(info.name, "Array Headers");
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-11 - fetch with Request + init headers override", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.example.com").setInfo({ name: "Override Test" });

  pool.install();
  try {
    // Request has no Accept header, but init.headers overrides
    const request = new Request("https://relay.example.com");
    const response = await fetch(request, {
      headers: { "Accept": "application/nostr+json" },
    });
    const info: RelayInformation = await response.json();
    assertEquals(info.name, "Override Test");
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-11 - fetch with Headers object", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.example.com").setInfo({ name: "Headers Object" });

  pool.install();
  try {
    const headers = new Headers();
    headers.set("accept", "application/nostr+json");
    const response = await fetch("https://relay.example.com", { headers });
    const info: RelayInformation = await response.json();
    assertEquals(info.name, "Headers Object");
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-11 fetch with Request object - Request itself carries Accept header", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://req-object.example.com");
  relay.setInfo({
    name: "Request Object Relay",
    supported_nips: [1, 11],
  });

  pool.install();
  try {
    const request = new Request("https://req-object.example.com", {
      headers: { "Accept": "application/nostr+json" },
    });
    const response = await fetch(request);

    assertEquals(response.status, 200);
    assertEquals(
      response.headers.get("Content-Type"),
      "application/nostr+json",
    );

    const info: RelayInformation = await response.json();
    assertEquals(info.name, "Request Object Relay");
    assertEquals(info.supported_nips, [1, 11]);
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-11 fetch with URL object - URL as first argument", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://url-object.example.com");
  relay.setInfo({
    name: "URL Object Relay",
    supported_nips: [1, 11, 42],
  });

  pool.install();
  try {
    const url = new URL("https://url-object.example.com");
    const response = await fetch(url, {
      headers: { "Accept": "application/nostr+json" },
    });

    assertEquals(response.status, 200);
    assertEquals(
      response.headers.get("Content-Type"),
      "application/nostr+json",
    );

    const info: RelayInformation = await response.json();
    assertEquals(info.name, "URL Object Relay");
    assertEquals(info.supported_nips, [1, 11, 42]);
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-11 fetch with Record format headers", async () => {
  const pool = new MockPool();
  const relay = pool.relay("wss://record-headers.example.com");
  relay.setInfo({
    name: "Record Headers Relay",
    supported_nips: [1, 11],
    software: "https://example.com/relay",
    version: "2.0.0",
  });

  pool.install();
  try {
    const response = await fetch("https://record-headers.example.com", {
      headers: { "Accept": "application/nostr+json" },
    });

    assertEquals(response.status, 200);
    assertEquals(
      response.headers.get("Content-Type"),
      "application/nostr+json",
    );

    const info: RelayInformation = await response.json();
    assertEquals(info.name, "Record Headers Relay");
    assertEquals(info.software, "https://example.com/relay");
    assertEquals(info.version, "2.0.0");
  } finally {
    pool.uninstall();
  }
});

// ===== NIP-11 Accept ヘッダー case-insensitive =====

Deno.test("NIP-11 fetch - intercepts with uppercase Accept header", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.example.com").setInfo({ name: "Case Test Relay" });

  pool.install();
  try {
    const response = await fetch("https://relay.example.com", {
      headers: { "Accept": "APPLICATION/NOSTR+JSON" },
    });

    assertEquals(response.status, 200);
    const info: RelayInformation = await response.json();
    assertEquals(info.name, "Case Test Relay");
  } finally {
    pool.uninstall();
  }
});

Deno.test("NIP-11 fetch - intercepts with mixed-case Accept header", async () => {
  const pool = new MockPool();
  pool.relay("wss://relay.example.com").setInfo({ name: "Mixed Case Relay" });

  pool.install();
  try {
    const response = await fetch("https://relay.example.com", {
      headers: { "Accept": "Application/Nostr+Json" },
    });

    assertEquals(response.status, 200);
    const info: RelayInformation = await response.json();
    assertEquals(info.name, "Mixed Case Relay");
  } finally {
    pool.uninstall();
  }
});
