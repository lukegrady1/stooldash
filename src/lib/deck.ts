import type { WordEntry } from '@/engine/types';
import { LIMITS } from '@/engine/types';
import { charLength, cleanText } from './text';

export interface DeckRow {
  id: string;
  word: string;
  definition: string;
}

/**
 * Parse "one entry per line" text. The separator is whichever of these appears first
 * in the line: `=`, `|`, tab, ` - `, ` – `, ` — `, ` : `.
 */
const SEPARATORS = ['=', '|', '\t', ' - ', ' – ', ' — ', ' : '];

export function parsePastedList(text: string): WordEntry[] {
  const out: WordEntry[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    let best: { index: number; sep: string } | null = null;
    for (const sep of SEPARATORS) {
      const i = line.indexOf(sep);
      if (i > 0 && (best === null || i < best.index)) best = { index: i, sep };
    }
    if (!best) continue;
    const word = cleanText(line.slice(0, best.index));
    const definition = cleanText(line.slice(best.index + best.sep.length));
    if (word && definition) out.push({ word, definition });
  }
  return out;
}

export function rowError(row: Pick<DeckRow, 'word' | 'definition'>): string | null {
  const w = charLength(cleanText(row.word));
  const d = charLength(cleanText(row.definition));
  if (w === 0 && d === 0) return null; // empty row, ignored
  if (w < LIMITS.word.min || w > LIMITS.word.max)
    return `Word must be ${LIMITS.word.min}–${LIMITS.word.max} characters`;
  if (d < LIMITS.definition.min || d > LIMITS.definition.max) {
    return `Definition must be ${LIMITS.definition.min}–${LIMITS.definition.max} characters`;
  }
  return null;
}

/** Rows that are complete and valid, cleaned for the API. */
export function validEntries(rows: DeckRow[]): WordEntry[] {
  return rows
    .filter((r) => cleanText(r.word) || cleanText(r.definition))
    .filter((r) => rowError(r) === null)
    .map((r) => ({ word: cleanText(r.word), definition: cleanText(r.definition) }));
}

export function newRowId(): string {
  return `r_${Math.random().toString(36).slice(2, 8)}`;
}
