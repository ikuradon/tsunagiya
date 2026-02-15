import { assertEquals } from "@std/assert";
import {
  classifyEvent,
  getParameterizedId,
  isEphemeral,
  isParameterizedReplaceable,
  isReplaceable,
} from "../src/event_kind.ts";
import { EventBuilder } from "../src/testing/event_builder.ts";

// ===== classifyEvent =====

Deno.test("classifyEvent - replaceable for kind:0 (NIP-01 metadata)", () => {
  assertEquals(classifyEvent(0), "replaceable");
});

Deno.test("classifyEvent - regular for kind:1", () => {
  assertEquals(classifyEvent(1), "regular");
});

Deno.test("classifyEvent - replaceable for kind:3 (NIP-01 contacts)", () => {
  assertEquals(classifyEvent(3), "replaceable");
});

Deno.test("classifyEvent - regular for kind:9999", () => {
  assertEquals(classifyEvent(9999), "regular");
});

Deno.test("classifyEvent - replaceable for kind:10000", () => {
  assertEquals(classifyEvent(10000), "replaceable");
});

Deno.test("classifyEvent - replaceable for kind:19999", () => {
  assertEquals(classifyEvent(19999), "replaceable");
});

Deno.test("classifyEvent - ephemeral for kind:20000", () => {
  assertEquals(classifyEvent(20000), "ephemeral");
});

Deno.test("classifyEvent - ephemeral for kind:29999", () => {
  assertEquals(classifyEvent(29999), "ephemeral");
});

Deno.test("classifyEvent - parameterized_replaceable for kind:30000", () => {
  assertEquals(classifyEvent(30000), "parameterized_replaceable");
});

Deno.test("classifyEvent - parameterized_replaceable for kind:39999", () => {
  assertEquals(classifyEvent(39999), "parameterized_replaceable");
});

Deno.test("classifyEvent - regular for kind:40000", () => {
  assertEquals(classifyEvent(40000), "regular");
});

// ===== isReplaceable =====

Deno.test("isReplaceable - true for kind:0 (NIP-01 metadata)", () => {
  assertEquals(isReplaceable(0), true);
});

Deno.test("isReplaceable - true for kind:3 (NIP-01 contacts)", () => {
  assertEquals(isReplaceable(3), true);
});

Deno.test("isReplaceable - true for kind:10000", () => {
  assertEquals(isReplaceable(10000), true);
});

Deno.test("isReplaceable - false for kind:1", () => {
  assertEquals(isReplaceable(1), false);
});

Deno.test("isReplaceable - false for kind:20000", () => {
  assertEquals(isReplaceable(20000), false);
});

// ===== isEphemeral =====

Deno.test("isEphemeral - true for kind:20000", () => {
  assertEquals(isEphemeral(20000), true);
});

Deno.test("isEphemeral - false for kind:10000", () => {
  assertEquals(isEphemeral(10000), false);
});

// ===== isParameterizedReplaceable =====

Deno.test("isParameterizedReplaceable - true for kind:30000", () => {
  assertEquals(isParameterizedReplaceable(30000), true);
});

Deno.test("isParameterizedReplaceable - false for kind:1", () => {
  assertEquals(isParameterizedReplaceable(1), false);
});

// ===== getParameterizedId =====

Deno.test("getParameterizedId - returns id for kind:30000 with d-tag", () => {
  const event = EventBuilder.kind(30000)
    .pubkey("aabb")
    .tag("d", "my-identifier")
    .build();
  assertEquals(getParameterizedId(event), "30000:aabb:my-identifier");
});

Deno.test("getParameterizedId - uses empty string when no d-tag", () => {
  const event = EventBuilder.kind(30000)
    .pubkey("aabb")
    .build();
  assertEquals(getParameterizedId(event), "30000:aabb:");
});

Deno.test("getParameterizedId - returns null for non-parameterized kind", () => {
  const event = EventBuilder.kind1().build();
  assertEquals(getParameterizedId(event), null);
});
