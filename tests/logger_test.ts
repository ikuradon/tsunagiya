import { assertEquals } from "@std/assert";
import { createLogger, Logger } from "../src/logger.ts";
import type { LogEntry } from "../src/types.ts";

Deno.test("Logger - logs entries at matching level", () => {
  const collected: LogEntry[] = [];
  const logger = new Logger("debug", (entry) => collected.push(entry));

  logger.log({
    timestamp: 1000,
    relay: "wss://relay.example.com",
    direction: "send",
    data: ["EVENT", "sub1", {}],
  });

  assertEquals(collected.length, 1);
  assertEquals(collected[0].direction, "send");
});

Deno.test("Logger - silent level suppresses all", () => {
  const collected: LogEntry[] = [];
  const logger = new Logger("silent", (entry) => collected.push(entry));

  logger.log({
    timestamp: 1000,
    relay: "wss://relay.example.com",
    direction: "send",
    data: "test",
  });

  assertEquals(collected.length, 0);
});

Deno.test("Logger - info level suppresses debug entries", () => {
  const collected: LogEntry[] = [];
  const logger = new Logger("info", (entry) => collected.push(entry));

  logger.log(
    {
      timestamp: 1000,
      relay: "wss://relay.example.com",
      direction: "send",
      data: "debug-msg",
    },
    "debug",
  );

  assertEquals(collected.length, 0);
});

Deno.test("Logger - info level allows error entries", () => {
  const collected: LogEntry[] = [];
  const logger = new Logger("info", (entry) => collected.push(entry));

  logger.log(
    {
      timestamp: 1000,
      relay: "wss://relay.example.com",
      direction: "send",
      data: "error-msg",
    },
    "error",
  );

  assertEquals(collected.length, 1);
});

Deno.test("Logger - error level allows error entries only", () => {
  const collected: LogEntry[] = [];
  const logger = new Logger("error", (entry) => collected.push(entry));

  logger.log(
    {
      timestamp: 1000,
      relay: "wss://relay.example.com",
      direction: "send",
      data: "info-msg",
    },
    "info",
  );

  logger.log(
    {
      timestamp: 1000,
      relay: "wss://relay.example.com",
      direction: "send",
      data: "error-msg",
    },
    "error",
  );

  assertEquals(collected.length, 1);
  assertEquals(collected[0].data, "error-msg");
});

Deno.test("Logger - entries accumulate", () => {
  const logger = new Logger("debug", () => {});

  logger.log({
    timestamp: 1000,
    relay: "wss://relay.example.com",
    direction: "send",
    data: "msg1",
  });
  logger.log({
    timestamp: 2000,
    relay: "wss://relay.example.com",
    direction: "receive",
    data: "msg2",
  });

  assertEquals(logger.entries.length, 2);
});

Deno.test("Logger - clear() removes entries", () => {
  const logger = new Logger("debug", () => {});

  logger.log({
    timestamp: 1000,
    relay: "wss://relay.example.com",
    direction: "send",
    data: "msg1",
  });
  logger.clear();

  assertEquals(logger.entries.length, 0);
});

Deno.test("Logger - setLevel() changes level", () => {
  const collected: LogEntry[] = [];
  const logger = new Logger("silent", (entry) => collected.push(entry));

  logger.log({
    timestamp: 1000,
    relay: "wss://relay.example.com",
    direction: "send",
    data: "before",
  });
  assertEquals(collected.length, 0);

  logger.setLevel("debug");
  logger.log({
    timestamp: 2000,
    relay: "wss://relay.example.com",
    direction: "send",
    data: "after",
  });
  assertEquals(collected.length, 1);
});

Deno.test("Logger - setHandler() changes handler", () => {
  const collected1: LogEntry[] = [];
  const collected2: LogEntry[] = [];
  const logger = new Logger("debug", (entry) => collected1.push(entry));

  logger.log({
    timestamp: 1000,
    relay: "wss://relay.example.com",
    direction: "send",
    data: "msg1",
  });

  logger.setHandler((entry) => collected2.push(entry));

  logger.log({
    timestamp: 2000,
    relay: "wss://relay.example.com",
    direction: "send",
    data: "msg2",
  });

  assertEquals(collected1.length, 1);
  assertEquals(collected2.length, 1);
});

Deno.test("createLogger - returns null for undefined", () => {
  const logger = createLogger(undefined);
  assertEquals(logger, null);
});

Deno.test("createLogger - returns null for false", () => {
  const logger = createLogger(false);
  assertEquals(logger, null);
});

Deno.test("createLogger - returns Logger for true", () => {
  const logger = createLogger(true);
  assertEquals(logger instanceof Logger, true);
});

Deno.test("createLogger - returns Logger with handler", () => {
  const collected: LogEntry[] = [];
  const logger = createLogger((entry) => collected.push(entry));
  assertEquals(logger instanceof Logger, true);

  logger!.log(
    {
      timestamp: 1000,
      relay: "wss://relay.example.com",
      direction: "send",
      data: "test",
    },
    "info",
  );
  assertEquals(collected.length, 1);
});

// ===== Logger.level getter =====

Deno.test("Logger.level getter - returns current log level", () => {
  const logger = new Logger("info", () => {});
  assertEquals(logger.level, "info");

  logger.setLevel("debug");
  assertEquals(logger.level, "debug");
});

// ===== console output path (no handler) =====

Deno.test("createLogger(true) - no handler uses console.log path without error", () => {
  const logger = createLogger(true);
  // handler なしの場合は console.log パスに到達する
  // エラーにならないことを確認する
  logger!.log(
    {
      timestamp: 1000,
      relay: "wss://relay.example.com",
      direction: "send",
      data: "console-output-test",
    },
    "info",
  );
  // エントリが蓄積されていることを確認
  assertEquals(logger!.entries.length, 1);
});

// ===== console output direction recv =====

Deno.test("Logger - direction: receive outputs without error", () => {
  const logger = createLogger(true);
  // direction "receive" のエントリでもコンソール出力パスがエラーにならないことを確認
  logger!.log(
    {
      timestamp: 2000,
      relay: "wss://relay.example.com",
      direction: "receive",
      data: ["EVENT", "sub1", {}],
    },
    "info",
  );
  assertEquals(logger!.entries.length, 1);
  assertEquals(logger!.entries[0].direction, "receive");
});
