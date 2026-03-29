/**
 * Search text normalization helpers for NIP-50 matching.
 *
 * @module
 */

const SEARCH_SEPARATOR_PATTERN = /[^\p{Letter}\p{Number}\p{Mark}]+/gu;
const SEARCH_SPACE_PATTERN = /\s+/g;

export function normalizeSearchText(text: string): string {
  return text.normalize("NFKC")
    .toLowerCase()
    .replace(SEARCH_SEPARATOR_PATTERN, " ")
    .trim()
    .replace(SEARCH_SPACE_PATTERN, " ");
}

export function tokenizeSearchText(text: string): string[] {
  const normalized = normalizeSearchText(text);
  if (normalized === "") {
    return [];
  }

  return [...new Set(normalized.split(" "))];
}
