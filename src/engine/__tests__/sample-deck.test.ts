import { describe, expect, it } from 'vitest';
import { SAMPLE_DECK } from '../sample-deck';
import { LIMITS } from '../types';
import { charLength } from '@/lib/text';

describe('SAMPLE_DECK', () => {
  it('has 10 entries within the word and definition limits', () => {
    expect(SAMPLE_DECK).toHaveLength(10);
    for (const { word, definition } of SAMPLE_DECK) {
      expect(charLength(word)).toBeGreaterThanOrEqual(LIMITS.word.min);
      expect(charLength(word)).toBeLessThanOrEqual(LIMITS.word.max);
      expect(charLength(definition)).toBeGreaterThanOrEqual(LIMITS.definition.min);
      expect(charLength(definition)).toBeLessThanOrEqual(LIMITS.definition.max);
    }
    expect(new Set(SAMPLE_DECK.map((e) => e.word.toLowerCase())).size).toBe(10);
  });
});
