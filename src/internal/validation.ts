/**
 * Shared runtime validation helpers.
 *
 * @module
 */

/** unknown 値が object record かどうか */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** REQ/COUNT filter の最小 shape を満たすか */
export function isFilterShape(
  value: unknown,
): value is Record<string, unknown> {
  return isRecord(value);
}

/** EVENT/AUTH 用 event object の最小 shape を満たすか */
export function isEventShape(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.id === "string" &&
    typeof value.pubkey === "string" &&
    typeof value.created_at === "number" &&
    typeof value.kind === "number" &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) =>
      Array.isArray(tag) && tag.every((entry) => typeof entry === "string")
    ) &&
    typeof value.content === "string" &&
    typeof value.sig === "string";
}
