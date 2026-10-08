import { describe, expect, it } from 'vitest';
import { charLength, cleanText, collapseWhitespace, stripControl } from '@/lib/text';

describe('text helpers', () => {
  it('strips control and zero-width characters but keeps emoji', () => {
    expect(stripControl('a\u0000b​c‍d﻿e‮f⁠g­h')).toBe('abcdefgh');
    expect(stripControl('ok 👍🏽 fine')).toBe('ok 👍🏽 fine');
    expect(stripControl('tab\tand\nnewline stay')).toBe('tab\tand\nnewline stay');
  });
  it('collapses whitespace', () => {
    expect(collapseWhitespace('  a \n\t b   c ')).toBe('a b c');
  });
  it('cleanText does both', () => {
    expect(cleanText(' ​ hi \u0007 there \n ')).toBe('hi there');
  });
  it('charLength counts code points', () => {
    expect(charLength('abc')).toBe(3);
    expect(charLength('👍')).toBe(1);
    expect(charLength('')).toBe(0);
  });
});
