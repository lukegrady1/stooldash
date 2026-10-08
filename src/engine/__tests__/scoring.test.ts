import { describe, expect, it } from 'vitest';
import { computeGained, rankPlayers, winners } from '../scoring';
import type { RoundState, Settings } from '../types';

const settings = (correctGuessPoints: 1 | 2 | 3): Settings => ({
  correctGuessPoints,
  maxPlayers: 12,
});

function round(partial: Partial<RoundState>): RoundState {
  return {
    index: 0,
    submissions: {},
    marked: [],
    options: [
      { id: 'real', text: 'real', source: 'REAL' },
      { id: 'oA', text: 'a', source: 'PLAYER', authorId: 'p1' },
      { id: 'oB', text: 'b', source: 'PLAYER', authorId: 'p2' },
    ],
    votes: {},
    gained: {},
    ...partial,
  };
}

describe('computeGained', () => {
  it.each([1, 2, 3] as const)('awards %i points for a correct guess', (pts) => {
    const g = computeGained(round({ votes: { p1: 'real' } }), settings(pts));
    expect(g).toEqual({ p1: pts });
  });

  it('awards 1 point per fooled voter to the author', () => {
    const g = computeGained(round({ votes: { p2: 'oA', p3: 'oA', p1: 'oB' } }), settings(2));
    expect(g).toEqual({ p1: 2, p2: 1 });
  });

  it('awards 3 to each marked player', () => {
    const g = computeGained(round({ marked: ['p3', 'p1'] }), settings(2));
    expect(g).toEqual({ p3: 3, p1: 3 });
  });

  it('combines guesses, fools and marks', () => {
    const g = computeGained(
      round({ votes: { p2: 'real', p3: 'oA' }, marked: ['p4'] }),
      settings(3),
    );
    expect(g).toEqual({ p2: 3, p1: 1, p4: 3 });
  });

  it('returns empty when there are no votes and no marks', () => {
    expect(computeGained(round({}), settings(2))).toEqual({});
  });

  it('ignores a vote for a missing option and an (impossible) self-vote', () => {
    const g = computeGained(round({ votes: { p1: 'oA', p2: 'gone' } }), settings(2));
    expect(g).toEqual({});
  });
});

describe('rankPlayers', () => {
  it('ranks by score with shared ranks for ties, then by name', () => {
    const ranked = rankPlayers(
      [
        { id: 'a', name: 'Zed', score: 5 },
        { id: 'b', name: 'Amy', score: 5 },
        { id: 'c', name: 'Cy', score: 2 },
        { id: 'd', name: 'Dee', score: 0 },
      ],
      { a: 2, c: 1 },
    );
    expect(ranked.map((r) => [r.name, r.rank, r.gained])).toEqual([
      ['Amy', 1, 0],
      ['Zed', 1, 2],
      ['Cy', 3, 1],
      ['Dee', 4, 0],
    ]);
  });
  it('handles no gained map and empty input', () => {
    expect(rankPlayers([], null)).toEqual([]);
    expect(rankPlayers([{ id: 'a', name: 'A', score: 1 }], null)[0]?.gained).toBe(0);
  });
});

describe('winners', () => {
  it('returns all players sharing the top score', () => {
    const ps = [{ score: 3 }, { score: 5 }, { score: 5 }];
    expect(winners(ps)).toEqual([{ score: 5 }, { score: 5 }]);
  });
  it('returns empty for no players', () => {
    expect(winners([])).toEqual([]);
  });
});
