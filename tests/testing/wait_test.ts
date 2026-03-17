import { assertEquals, assertRejects } from "@std/assert";
import { waitFor } from "../../src/testing/wait.ts";

Deno.test("waitFor - resolves immediately when condition is true", async () => {
  await waitFor(() => true);
});

Deno.test("waitFor - waits until condition becomes true", async () => {
  let value = false;
  setTimeout(() => {
    value = true;
  }, 50);

  await waitFor(() => value);
  assertEquals(value, true);
});

Deno.test("waitFor - rejects on timeout", async () => {
  await assertRejects(
    () => waitFor(() => false, { timeout: 50 }),
    Error,
    "waitFor timed out after 50ms",
  );
});

Deno.test("waitFor - uses custom interval", async () => {
  let checks = 0;
  const original = () => {
    checks++;
    return checks >= 3;
  };

  await waitFor(original, { interval: 5 });
  assertEquals(checks >= 3, true);
});

Deno.test("waitFor - counter-based condition", async () => {
  const items: number[] = [];
  const timer = setInterval(() => items.push(items.length), 10);

  await waitFor(() => items.length >= 5, { timeout: 2000 });
  clearInterval(timer);

  assertEquals(items.length >= 5, true);
});
