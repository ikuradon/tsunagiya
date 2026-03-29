/**
 * Runtime access guard moved to `scripts/guard_runtime_access.ts` and runs via
 * `deno task check` so it can read the source tree without per-test permission
 * escalation.
 */
export {};
