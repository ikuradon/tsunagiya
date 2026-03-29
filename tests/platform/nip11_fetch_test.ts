import { assertEquals } from "@std/assert";
import {
  createNip11FetchHandler,
  createNip11Response,
  type RelayInformationProvider,
} from "../../src/platform/nip11_fetch.ts";
import type { RelayInformation } from "../../src/types.ts";

const sampleInfo: RelayInformation = {
  name: "Test Relay",
  description: "A test relay",
  supported_nips: [1, 11],
};

// ===== createNip11Response =====

Deno.test("createNip11Response - returns 200 status", async () => {
  const response = createNip11Response(sampleInfo);
  assertEquals(response.status, 200);
});

Deno.test(
  "createNip11Response - returns correct content-type header",
  async () => {
    const response = createNip11Response(sampleInfo);
    assertEquals(
      response.headers.get("Content-Type"),
      "application/nostr+json",
    );
  },
);

Deno.test("createNip11Response - returns correct JSON body", async () => {
  const response = createNip11Response(sampleInfo);
  const body = await response.json() as RelayInformation;
  assertEquals(body.name, sampleInfo.name);
  assertEquals(body.description, sampleInfo.description);
  assertEquals(body.supported_nips, sampleInfo.supported_nips);
});

// ===== createNip11FetchHandler =====

function makeProvider(info: RelayInformation): RelayInformationProvider {
  return { getInfo: () => info };
}

Deno.test(
  "createNip11FetchHandler - intercepts NIP-11 request for known relay",
  async () => {
    const lookup = (url: string) => {
      if (url === "wss://relay.example.com") return makeProvider(sampleInfo);
      return undefined;
    };

    const fallback = () => Promise.resolve(new Response("fallback"));
    const handler = createNip11FetchHandler(lookup, fallback);

    const request = new Request("https://relay.example.com", {
      headers: { Accept: "application/nostr+json" },
    });

    const response = await handler(request, undefined);
    assertEquals(response.status, 200);
    assertEquals(
      response.headers.get("Content-Type"),
      "application/nostr+json",
    );
    const body = await response.json() as RelayInformation;
    assertEquals(body.name, sampleInfo.name);
  },
);

Deno.test(
  "createNip11FetchHandler - passes through non-NIP-11 requests to fallback",
  async () => {
    const lookup = (_url: string) => makeProvider(sampleInfo);
    let fallbackCalled = false;

    const fallback = () => {
      fallbackCalled = true;
      return Promise.resolve(new Response("fallback"));
    };

    const handler = createNip11FetchHandler(lookup, fallback);

    // Accept ヘッダーなし（NIP-11 でないリクエスト）
    const request = new Request("https://relay.example.com");
    const response = await handler(request, undefined);

    assertEquals(fallbackCalled, true);
    assertEquals(await response.text(), "fallback");
  },
);

Deno.test(
  "createNip11FetchHandler - passes through unknown relay URL to fallback",
  async () => {
    // 常に undefined を返す lookup（未登録リレー）
    const lookup = (_url: string) => undefined;
    let fallbackCalled = false;

    const fallback = () => {
      fallbackCalled = true;
      return Promise.resolve(new Response("fallback-unknown"));
    };

    const handler = createNip11FetchHandler(lookup, fallback);

    const request = new Request("https://unknown.relay.example.com", {
      headers: { Accept: "application/nostr+json" },
    });

    const response = await handler(request, undefined);

    assertEquals(fallbackCalled, true);
    assertEquals(await response.text(), "fallback-unknown");
  },
);

Deno.test(
  "createNip11FetchHandler - passes through NIP-11 request via init headers",
  async () => {
    const lookup = (url: string) => {
      if (url === "wss://relay.example.com") return makeProvider(sampleInfo);
      return undefined;
    };

    const fallback = () => Promise.resolve(new Response("fallback"));
    const handler = createNip11FetchHandler(lookup, fallback);

    // init.headers に Accept を渡す形式
    const response = await handler("https://relay.example.com", {
      headers: { Accept: "application/nostr+json" },
    });

    assertEquals(response.status, 200);
    const body = await response.json() as RelayInformation;
    assertEquals(body.name, sampleInfo.name);
  },
);
