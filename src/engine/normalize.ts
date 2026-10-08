/**
 * normalize(s): lowercase, strip punctuation, collapse whitespace, trim,
 * remove leading articles ("a", "an", "the", "to"). Used for pre-ticking
 * "basically nailed it" suggestions and for duplicate detection. Pure.
 */

const ARTICLES = new Set(['a', 'an', 'the', 'to']);

export function normalize(s: string): string {
  const lowered = s.toLowerCase();
  // Strip punctuation and symbols; keep letters, numbers, marks and whitespace.
  const stripped = lowered.replace(/[\p{P}\p{S}]+/gu, ' ');
  const words = stripped.split(/\s+/).filter((w) => w.length > 0);
  // DECISION: strip *every* leading article ("to the moon" -> "moon"). The spec says
  // "remove leading articles" (plural), and a looser match only affects suggestions,
  // which the host confirms anyway.
  while (words.length > 1 && ARTICLES.has(words[0] as string)) {
    words.shift();
  }
  return words.join(' ');
}
