/**
 * URL / Header helpers used by platform-facing modules.
 *
 * @module
 */

/** URLを正規化する（末尾スラッシュを除去） */
export function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

/** HTTP/HTTPS URLをWS/WSSに変換する */
export function httpToWsUrl(httpUrl: string): string {
  return httpUrl.replace(/^https:\/\//, "wss://").replace(
    /^http:\/\//,
    "ws://",
  );
}

/** fetch 引数から URL 文字列を抽出する */
export function getRequestUrl(request: RequestInfo | URL): string {
  if (request instanceof Request) {
    return request.url;
  }
  if (request instanceof URL) {
    return request.toString();
  }
  return request;
}

/** ヘッダー値を case-insensitive で取得する */
export function getHeaderValue(
  headers: HeadersInit | undefined,
  name: string,
): string | null {
  if (!headers) return null;

  if (headers instanceof Headers) {
    return headers.get(name);
  }

  if (Array.isArray(headers)) {
    for (const entry of headers) {
      if (
        Array.isArray(entry) && entry.length >= 2 &&
        typeof entry[0] === "string" && typeof entry[1] === "string" &&
        entry[0].toLowerCase() === name.toLowerCase()
      ) {
        return entry[1];
      }
    }
    return null;
  }

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name.toLowerCase()) {
      return value;
    }
  }

  return null;
}

/** NIP-11リクエストかどうか判定する（Accept: application/nostr+json） */
export function isNip11Request(
  request: RequestInfo | URL,
  init?: RequestInit,
): boolean {
  // init.headers があればそちらを優先（fetch の仕様: init が request をオーバーライド）
  if (init?.headers) {
    const accept = getHeaderValue(init.headers, "accept") ?? "";
    return accept.toLowerCase().includes("application/nostr+json");
  }

  if (request instanceof Request) {
    const accept = request.headers.get("Accept") ?? "";
    return accept.toLowerCase().includes("application/nostr+json");
  }

  return false;
}
