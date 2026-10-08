import { describe, expect, it } from 'vitest';
import { normalize } from '../normalize';

describe('normalize', () => {
  it('lowercases and trims', () => {
    expect(normalize('  Hello World  ')).toBe('hello world');
  });
  it('strips punctuation and symbols', () => {
    expect(normalize('A shrewd, unprincipled person; especially (a) politician!')).toBe(
      'shrewd unprincipled person especially a politician',
    );
    expect(normalize('$100 & more…')).toBe('100 more');
  });
  it('collapses whitespace including newlines and tabs', () => {
    expect(normalize('to\n\tconfuse   or fluster')).toBe('confuse or fluster');
  });
  it('removes leading articles a / an / the / to', () => {
    expect(normalize('A dog')).toBe('dog');
    expect(normalize('An apple')).toBe('apple');
    expect(normalize('The end')).toBe('end');
    expect(normalize('To run away')).toBe('run away');
  });
  it('removes stacked leading articles but never the last word', () => {
    expect(normalize('To the moon')).toBe('moon');
    expect(normalize('the')).toBe('the');
    expect(normalize('A')).toBe('a');
  });
  it('keeps articles that are not leading', () => {
    expect(normalize('run to the hills')).toBe('run to the hills');
  });
  it('returns empty for punctuation-only input', () => {
    expect(normalize('...!!!')).toBe('');
    expect(normalize('')).toBe('');
  });
  it('treats equivalent definitions as equal', () => {
    expect(normalize('To confuse or fluster.')).toBe(normalize('confuse, or fluster'));
  });
});
