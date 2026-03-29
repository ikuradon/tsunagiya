/**
 * url.ts のユニットテスト
 */

import { assertEquals } from "@std/assert";
import {
  getHeaderValue,
  getRequestUrl,
  httpToWsUrl,
  isNip11Request,
  normalizeUrl,
} from "../../src/internal/url.ts";

// --- normalizeUrl ---

Deno.test("normalizeUrl: 末尾スラッシュを除去する", () => {
  assertEquals(
    normalizeUrl("wss://relay.example.com/"),
    "wss://relay.example.com",
  );
});

Deno.test("normalizeUrl: 複数の末尾スラッシュを除去する", () => {
  assertEquals(
    normalizeUrl("wss://relay.example.com///"),
    "wss://relay.example.com",
  );
});

Deno.test("normalizeUrl: 末尾スラッシュなしはそのまま", () => {
  assertEquals(
    normalizeUrl("wss://relay.example.com"),
    "wss://relay.example.com",
  );
});

Deno.test("normalizeUrl: パスを含むURLの末尾スラッシュを除去する", () => {
  assertEquals(
    normalizeUrl("wss://relay.example.com/path/"),
    "wss://relay.example.com/path",
  );
});

Deno.test("normalizeUrl: 空文字列はそのまま", () => {
  assertEquals(normalizeUrl(""), "");
});

// --- httpToWsUrl ---

Deno.test("httpToWsUrl: https を wss に変換する", () => {
  assertEquals(
    httpToWsUrl("https://relay.example.com"),
    "wss://relay.example.com",
  );
});

Deno.test("httpToWsUrl: http を ws に変換する", () => {
  assertEquals(
    httpToWsUrl("http://relay.example.com"),
    "ws://relay.example.com",
  );
});

Deno.test("httpToWsUrl: wss はそのまま", () => {
  assertEquals(
    httpToWsUrl("wss://relay.example.com"),
    "wss://relay.example.com",
  );
});

Deno.test("httpToWsUrl: ws はそのまま", () => {
  assertEquals(httpToWsUrl("ws://relay.example.com"), "ws://relay.example.com");
});

Deno.test("httpToWsUrl: パスを含む https URL を変換する", () => {
  assertEquals(
    httpToWsUrl("https://relay.example.com/path?q=1"),
    "wss://relay.example.com/path?q=1",
  );
});

// --- getRequestUrl ---

Deno.test("getRequestUrl: 文字列をそのまま返す", () => {
  assertEquals(
    getRequestUrl("https://relay.example.com"),
    "https://relay.example.com",
  );
});

Deno.test("getRequestUrl: URL オブジェクトから文字列を返す", () => {
  const url = new URL("https://relay.example.com/path");
  assertEquals(getRequestUrl(url), "https://relay.example.com/path");
});

Deno.test("getRequestUrl: Request オブジェクトから URL を返す", () => {
  const req = new Request("https://relay.example.com/nip11");
  assertEquals(getRequestUrl(req), "https://relay.example.com/nip11");
});

// --- getHeaderValue ---

Deno.test("getHeaderValue: Headers オブジェクトから取得する", () => {
  const headers = new Headers({ Accept: "application/nostr+json" });
  assertEquals(getHeaderValue(headers, "accept"), "application/nostr+json");
});

Deno.test("getHeaderValue: Headers オブジェクト - 存在しないキーは null", () => {
  const headers = new Headers({ Accept: "application/json" });
  assertEquals(getHeaderValue(headers, "x-custom"), null);
});

Deno.test("getHeaderValue: タプル配列から取得する", () => {
  const headers: [string, string][] = [["Accept", "application/nostr+json"]];
  assertEquals(getHeaderValue(headers, "accept"), "application/nostr+json");
});

Deno.test("getHeaderValue: タプル配列 - case-insensitive で取得できる", () => {
  const headers: [string, string][] = [["ACCEPT", "application/nostr+json"]];
  assertEquals(getHeaderValue(headers, "accept"), "application/nostr+json");
});

Deno.test("getHeaderValue: タプル配列 - 存在しないキーは null", () => {
  const headers: [string, string][] = [["Content-Type", "text/plain"]];
  assertEquals(getHeaderValue(headers, "accept"), null);
});

Deno.test("getHeaderValue: プレーンオブジェクトから取得する", () => {
  const headers: Record<string, string> = { Accept: "application/nostr+json" };
  assertEquals(getHeaderValue(headers, "accept"), "application/nostr+json");
});

Deno.test("getHeaderValue: プレーンオブジェクト - case-insensitive で取得できる", () => {
  const headers: Record<string, string> = { ACCEPT: "application/nostr+json" };
  assertEquals(getHeaderValue(headers, "accept"), "application/nostr+json");
});

Deno.test("getHeaderValue: プレーンオブジェクト - 存在しないキーは null", () => {
  const headers: Record<string, string> = { "Content-Type": "text/plain" };
  assertEquals(getHeaderValue(headers, "accept"), null);
});

Deno.test("getHeaderValue: undefined を渡すと null を返す", () => {
  assertEquals(getHeaderValue(undefined, "accept"), null);
});

// --- isNip11Request ---

Deno.test("isNip11Request: init.headers に nostr+json があれば true", () => {
  const result = isNip11Request("https://relay.example.com", {
    headers: { Accept: "application/nostr+json" },
  });
  assertEquals(result, true);
});

Deno.test("isNip11Request: init.headers に nostr+json がなければ false", () => {
  const result = isNip11Request("https://relay.example.com", {
    headers: { Accept: "application/json" },
  });
  assertEquals(result, false);
});

Deno.test("isNip11Request: Request オブジェクトに nostr+json ヘッダーがあれば true", () => {
  const req = new Request("https://relay.example.com", {
    headers: { Accept: "application/nostr+json" },
  });
  assertEquals(isNip11Request(req), true);
});

Deno.test("isNip11Request: Request オブジェクトに nostr+json がなければ false", () => {
  const req = new Request("https://relay.example.com", {
    headers: { Accept: "application/json" },
  });
  assertEquals(isNip11Request(req), false);
});

Deno.test("isNip11Request: 文字列 URL のみでは false", () => {
  assertEquals(isNip11Request("https://relay.example.com"), false);
});

Deno.test("isNip11Request: URL オブジェクトのみでは false", () => {
  assertEquals(isNip11Request(new URL("https://relay.example.com")), false);
});

Deno.test("isNip11Request: init が優先される（Request に nostr+json あっても init になければ false）", () => {
  const req = new Request("https://relay.example.com", {
    headers: { Accept: "application/nostr+json" },
  });
  const result = isNip11Request(req, {
    headers: { Accept: "application/json" },
  });
  assertEquals(result, false);
});
