import { describe, expect, it } from 'vitest';
import {
  applyAction,
  autoAdvance,
  cleanName,
  cleanSubmission,
  createGame,
  currentWord,
  eligibleVoters,
  shuffle,
} from '../engine';
import type { GameState, Phase } from '../types';
import { LIMITS } from '../types';
import {
  HOST,
  T0,
  WORDS,
  asPlayer,
  ctx,
  err,
  join,
  lobby3,
  newGame,
  ok,
  optionOf,
  realOption,
  scriptedRng,
  submitAll,
  voting3,
  writing3,
} from './helpers';

const LATER = T0 + LIMITS.activeMs + 1; // far enough that T0 players are inactive

describe('createGame', () => {
  it('uppercases the code, defaults settings and caps maxPlayers', () => {
    const s = createGame(
      { id: 'g', code: 'abcd', words: WORDS, settings: { maxPlayers: 99 } },
      { now: T0 },
    );
    expect(s.code).toBe('ABCD');
    expect(s.settings).toEqual({ correctGuessPoints: 2, maxPlayers: LIMITS.maxPlayersCap });
    expect(s.phase).toBe('LOBBY');
    expect(s.round).toBeNull();
    const s2 = createGame(
      { id: 'g', code: 'abcd', words: WORDS, settings: { correctGuessPoints: 3 } },
      { now: T0 },
    );
    expect(s2.settings).toEqual({ correctGuessPoints: 3, maxPlayers: 12 });
  });
});

describe('helpers', () => {
  it('shuffle is a permutation driven by rng', () => {
    const out = shuffle([1, 2, 3, 4], scriptedRng([0, 0, 0]));
    expect([...out].sort()).toEqual([1, 2, 3, 4]);
    expect(out).toEqual([2, 3, 4, 1]);
    expect(shuffle([], scriptedRng())).toEqual([]);
  });
  it('cleanName / cleanSubmission enforce limits', () => {
    expect(cleanName('  Ann  ')).toBe('Ann');
    expect(cleanName('')).toBeNull();
    expect(cleanName('​')).toBeNull();
    expect(cleanName('x'.repeat(17))).toBeNull();
    expect(cleanName('🙂'.repeat(16))).toBe('🙂'.repeat(16));
    expect(cleanSubmission('a'.repeat(161))).toBeNull();
    expect(cleanSubmission('  two   words ')).toBe('two words');
  });
  it('currentWord is null without a round', () => {
    expect(currentWord(newGame())).toBeNull();
    expect(currentWord(writing3())?.word).toBe('Snollygoster');
  });
  it('autoAdvance is a no-op without a round or in other phases', () => {
    const s = lobby3();
    autoAdvance(s, ctx());
    expect(s.phase).toBe('LOBBY');
    const v = voting3();
    v.phase = 'REVIEW';
    autoAdvance(v, ctx());
    expect(v.phase).toBe('REVIEW');
  });
});

describe('happy path: 3 players, 2 rounds, scripted RNG, exact scores', () => {
  it('plays a full game and ends FINISHED with exact scores', () => {
    const rng = scriptedRng([0.2, 0.9, 0.4, 0.6, 0.1, 0.8, 0.3, 0.7, 0.5]);
    const c = ctx(T0, rng);
    let s = createGame(
      { id: 'g', code: 'KQWZ', words: WORDS.slice(0, 2), settings: { correctGuessPoints: 2 } },
      { now: T0 },
    );
    s = join(s, ['Ann', 'Bob', 'Cy']);
    s = ok(s, { type: 'START' }, HOST, c);
    expect(s.phase).toBe('WRITING');
    expect(s.round?.index).toBe(0);

    // Round 1: everyone submits; the third submission auto-advances to REVIEW.
    s = ok(s, { type: 'SUBMIT', text: 'A hat.' }, asPlayer('p1'), c);
    s = ok(s, { type: 'SUBMIT', text: 'A boat.' }, asPlayer('p2'), c);
    expect(s.phase).toBe('WRITING');
    s = ok(s, { type: 'SUBMIT', text: 'A sneeze.' }, asPlayer('p3'), c);
    expect(s.phase).toBe('REVIEW');
    expect(s.round?.marked).toEqual([]);

    s = ok(s, { type: 'OPEN_VOTING' }, HOST, c);
    expect(s.phase).toBe('VOTING');
    expect(s.round?.options).toHaveLength(4);
    const ids = new Set(s.round?.options.map((o) => o.id));
    expect(ids.size).toBe(4);
    for (const id of ids) expect(id).toMatch(/^o_[a-z0-9]{4}$/);

    // Ann guesses right (+2). Bob picks Ann's fake (Ann +1). Cy picks Bob's fake (Bob +1).
    s = ok(s, { type: 'VOTE', optionId: realOption(s).id }, asPlayer('p1'), c);
    s = ok(s, { type: 'VOTE', optionId: optionOf(s, 'p1').id }, asPlayer('p2'), c);
    expect(s.phase).toBe('VOTING');
    s = ok(s, { type: 'VOTE', optionId: optionOf(s, 'p2').id }, asPlayer('p3'), c);
    expect(s.phase).toBe('REVEAL');
    expect(s.round?.gained).toEqual({ p1: 3, p2: 1 });
    expect(s.players.map((p) => p.score)).toEqual([3, 1, 0]);
    expect(s.history).toEqual([{ index: 0, gained: { p1: 3, p2: 1 } }]);

    s = ok(s, { type: 'SHOW_SCOREBOARD' }, HOST, c);
    expect(s.phase).toBe('SCOREBOARD');
    s = ok(s, { type: 'NEXT_ROUND' }, HOST, c);
    expect(s.phase).toBe('WRITING');
    expect(s.round?.index).toBe(1);
    expect(s.round?.submissions).toEqual({});

    // Round 2: Cy writes the real definition (pre-ticked), host stops waiting early.
    s = ok(s, { type: 'SUBMIT', text: 'to confuse, or fluster!' }, asPlayer('p3'), c);
    s = ok(s, { type: 'SUBMIT', text: 'A type of hat.' }, asPlayer('p1'), c);
    s = ok(s, { type: 'STOP_WAITING' }, HOST, c);
    expect(s.phase).toBe('REVIEW');
    expect(s.round?.marked).toEqual(['p3']);
    s = ok(s, { type: 'OPEN_VOTING' }, HOST, c);
    // Options: real + Ann's fake only (Cy marked, Bob didn't submit).
    expect(s.round?.options).toHaveLength(2);
    // Bob (no submission) can vote; Ann can vote; Cy may not.
    expect(err(s, { type: 'VOTE', optionId: realOption(s).id }, asPlayer('p3'), c)).toBe(
      'NOT_ELIGIBLE',
    );
    s = ok(s, { type: 'VOTE', optionId: optionOf(s, 'p1').id }, asPlayer('p2'), c); // fooled: Ann +1
    s = ok(s, { type: 'VOTE', optionId: realOption(s).id }, asPlayer('p1'), c); // Ann +2
    expect(s.phase).toBe('REVEAL');
    expect(s.round?.gained).toEqual({ p1: 3, p3: 3 });
    expect(s.players.map((p) => p.score)).toEqual([6, 1, 3]);

    s = ok(s, { type: 'SHOW_SCOREBOARD' }, HOST, c);
    s = ok(s, { type: 'NEXT_ROUND' }, HOST, c);
    expect(s.phase).toBe('FINISHED');
    expect(s.round).toBeNull();
    expect(s.players.map((p) => [p.name, p.score])).toEqual([
      ['Ann', 6],
      ['Bob', 1],
      ['Cy', 3],
    ]);
    expect(s.updatedAt).toBe(T0);
  });
});

describe('JOIN', () => {
  it('rejects invalid, taken (case-insensitive) and full', () => {
    let s = newGame(WORDS, { maxPlayers: 2 });
    expect(err(s, { type: 'JOIN', name: '   ', playerId: 'x' }, HOST)).toBe('NAME_INVALID');
    s = join(s, ['Ann']);
    expect(err(s, { type: 'JOIN', name: 'ann', playerId: 'x' }, HOST)).toBe('NAME_TAKEN');
    expect(err(s, { type: 'JOIN', name: 'Bob', playerId: 'p1' }, HOST)).toBe('UNKNOWN_PLAYER');
    s = ok(s, { type: 'JOIN', name: 'Bob', playerId: 'p2' }, HOST);
    expect(err(s, { type: 'JOIN', name: 'Cy', playerId: 'p3' }, HOST)).toBe('GAME_FULL');
  });
  it('a kicked player frees their name and their seat', () => {
    let s = join(newGame(WORDS, { maxPlayers: 2 }), ['Ann', 'Bob']);
    s = ok(s, { type: 'KICK', playerId: 'p2' }, HOST);
    s = ok(s, { type: 'JOIN', name: 'BOB', playerId: 'p3' }, HOST);
    expect(s.players.filter((p) => !p.kicked).map((p) => p.name)).toEqual(['Ann', 'BOB']);
  });
  it('is rejected once FINISHED', () => {
    let s = lobby3();
    s = ok(s, { type: 'END_GAME' }, HOST);
    expect(err(s, { type: 'JOIN', name: 'Dee', playerId: 'p4' }, HOST)).toBe('WRONG_PHASE');
  });
  it('late join in each phase starts at 0 and participates from the current phase', () => {
    // WRITING
    let s = writing3();
    s = ok(s, { type: 'JOIN', name: 'Dee', playerId: 'p4' }, HOST);
    expect(s.players[3]).toMatchObject({ name: 'Dee', score: 0, kicked: false });
    s = ok(s, { type: 'SUBMIT', text: 'late entry' }, asPlayer('p4'));
    expect(s.round?.submissions.p4).toBe('late entry');
    // Dee is active and hasn't been counted out: others still need to submit.
    expect(s.phase).toBe('WRITING');

    // REVIEW
    let r = submitAll(writing3(), { p1: 'a', p2: 'b', p3: 'c' });
    expect(r.phase).toBe('REVIEW');
    r = ok(r, { type: 'JOIN', name: 'Dee', playerId: 'p4' }, HOST);
    expect(r.phase).toBe('REVIEW');

    // VOTING: a late joiner can vote.
    let v = voting3();
    v = ok(v, { type: 'JOIN', name: 'Dee', playerId: 'p4' }, HOST);
    v = ok(v, { type: 'VOTE', optionId: realOption(v).id }, asPlayer('p4'));
    expect(v.round?.votes.p4).toBe(realOption(v).id);

    // REVEAL / SCOREBOARD
    let rv = voting3();
    rv = ok(rv, { type: 'REVEAL_NOW' }, HOST);
    rv = ok(rv, { type: 'JOIN', name: 'Dee', playerId: 'p4' }, HOST);
    expect(rv.phase).toBe('REVEAL');
    rv = ok(rv, { type: 'SHOW_SCOREBOARD' }, HOST);
    rv = ok(rv, { type: 'JOIN', name: 'Eve', playerId: 'p5' }, HOST);
    expect(rv.players).toHaveLength(5);
    expect(rv.phase).toBe('SCOREBOARD');
  });
});

describe('player plumbing', () => {
  it('rejects unknown and kicked players and touches lastSeenAt', () => {
    let s = lobby3();
    expect(err(s, { type: 'HEARTBEAT' }, asPlayer('nope'))).toBe('UNKNOWN_PLAYER');
    s = ok(s, { type: 'KICK', playerId: 'p2' }, HOST);
    expect(err(s, { type: 'HEARTBEAT' }, asPlayer('p2'))).toBe('KICKED');
    s = ok(s, { type: 'HEARTBEAT' }, asPlayer('p1'), ctx(T0 + 5000));
    expect(s.players[0]?.lastSeenAt).toBe(T0 + 5000);
    expect(s.updatedAt).toBe(T0 + 5000);
  });
  it('host heartbeat is a pure tick', () => {
    const s = ok(lobby3(), { type: 'HEARTBEAT' }, HOST, ctx(T0 + 1));
    expect(s.players.every((p) => p.lastSeenAt === T0)).toBe(true);
    expect(s.updatedAt).toBe(T0 + 1);
  });
});

describe('RENAME', () => {
  it('works in LOBBY only, validates and checks uniqueness (but allows own name)', () => {
    let s = lobby3();
    expect(err(s, { type: 'RENAME', name: 'bob' }, asPlayer('p1'))).toBe('NAME_TAKEN');
    expect(err(s, { type: 'RENAME', name: '' }, asPlayer('p1'))).toBe('NAME_INVALID');
    expect(err(s, { type: 'RENAME', name: 'Z' }, HOST)).toBe('NOT_PLAYER');
    s = ok(s, { type: 'RENAME', name: 'ANN' }, asPlayer('p1'));
    s = ok(s, { type: 'RENAME', name: 'Annie' }, asPlayer('p1'));
    expect(s.players[0]?.name).toBe('Annie');
    s = ok(s, { type: 'START' }, HOST);
    expect(err(s, { type: 'RENAME', name: 'Zed' }, asPlayer('p1'))).toBe('WRONG_PHASE');
  });
});

describe('START', () => {
  it('needs the host, LOBBY and 2+ live players', () => {
    const one = join(newGame(), ['Ann']);
    expect(err(one, { type: 'START' }, HOST)).toBe('NOT_ENOUGH_PLAYERS');
    const two = join(newGame(), ['Ann', 'Bob']);
    expect(err(two, { type: 'START' }, asPlayer('p1'))).toBe('NOT_HOST');
    const kicked = ok(two, { type: 'KICK', playerId: 'p2' }, HOST);
    expect(err(kicked, { type: 'START' }, HOST)).toBe('NOT_ENOUGH_PLAYERS');
    const started = ok(two, { type: 'START' }, HOST);
    expect(started.phase).toBe('WRITING');
    expect(err(started, { type: 'START' }, HOST)).toBe('WRONG_PHASE');
  });
});

describe('SUBMIT', () => {
  it('validates, overwrites, and is WRITING-only', () => {
    let s = writing3();
    expect(err(s, { type: 'SUBMIT', text: '   ' }, asPlayer('p1'))).toBe('TEXT_INVALID');
    expect(err(s, { type: 'SUBMIT', text: 'x'.repeat(161) }, asPlayer('p1'))).toBe('TEXT_INVALID');
    expect(err(s, { type: 'SUBMIT', text: 'hi' }, HOST)).toBe('NOT_PLAYER');
    s = ok(s, { type: 'SUBMIT', text: 'first  draft' }, asPlayer('p1'));
    expect(s.round?.submissions.p1).toBe('first draft');
    s = ok(s, { type: 'SUBMIT', text: 'second' }, asPlayer('p1'));
    expect(s.round?.submissions.p1).toBe('second');
    expect(err(lobby3(), { type: 'SUBMIT', text: 'hi' }, asPlayer('p1'))).toBe('WRONG_PHASE');
  });
});

describe('auto-advance WRITING -> REVIEW', () => {
  it('waits for inactive players only while they are active', () => {
    // p1 submits now; p2 and p3 are silent. All three were seen at T0.
    let s = writing3();
    s = ok(s, { type: 'SUBMIT', text: 'a' }, asPlayer('p1'), ctx(T0 + 1000));
    expect(s.phase).toBe('WRITING');
    // Later, only p1 is active (their lastSeenAt was bumped). A heartbeat re-evaluates.
    s = ok(s, { type: 'HEARTBEAT' }, asPlayer('p1'), ctx(LATER + 1000));
    expect(s.phase).toBe('REVIEW');
  });
  it('does not advance when nobody is active', () => {
    let s = writing3();
    s = ok(s, { type: 'SUBMIT', text: 'a' }, asPlayer('p1'));
    // Host heartbeat far in the future: nobody is active, so no advance.
    s = ok(s, { type: 'HEARTBEAT' }, HOST, ctx(LATER));
    expect(s.phase).toBe('WRITING');
  });
  it('pre-ticks players whose submission matches the real definition', () => {
    let s = writing3();
    s = submitAll(s, {
      p1: 'A shrewd unprincipled person, especially a politician',
      p2: 'nope',
      p3: 'The shrewd, unprincipled person; especially a politician.',
    });
    expect(s.phase).toBe('REVIEW');
    expect(s.round?.marked).toEqual(['p1', 'p3']);
  });
});

describe('STOP_WAITING / SET_MARKED / OPEN_VOTING', () => {
  it('STOP_WAITING forces REVIEW with partial submissions', () => {
    let s = writing3();
    s = ok(s, { type: 'SUBMIT', text: 'only me' }, asPlayer('p1'));
    expect(err(s, { type: 'STOP_WAITING' }, asPlayer('p1'))).toBe('NOT_HOST');
    s = ok(s, { type: 'STOP_WAITING' }, HOST);
    expect(s.phase).toBe('REVIEW');
    expect(err(s, { type: 'STOP_WAITING' }, HOST)).toBe('WRONG_PHASE');
  });
  it('SET_MARKED replaces the marked list, dedupes, and rejects bad ids', () => {
    let s = submitAll(writing3(), { p1: 'a', p2: 'b', p3: 'c' });
    expect(err(s, { type: 'SET_MARKED', playerIds: ['p9'] }, HOST)).toBe('UNKNOWN_PLAYER');
    expect(err(s, { type: 'SET_MARKED', playerIds: ['p1'] }, asPlayer('p1'))).toBe('NOT_HOST');
    s = ok(s, { type: 'SET_MARKED', playerIds: ['p2', 'p2', 'p3'] }, HOST);
    expect(s.round?.marked).toEqual(['p2', 'p3']);
    s = ok(s, { type: 'SET_MARKED', playerIds: [] }, HOST);
    expect(s.round?.marked).toEqual([]);
    expect(err(writing3(), { type: 'SET_MARKED', playerIds: [] }, HOST)).toBe('WRONG_PHASE');
  });
  it('SET_MARKED rejects players without a submission or kicked', () => {
    let s = writing3();
    s = ok(s, { type: 'SUBMIT', text: 'a' }, asPlayer('p1'));
    s = ok(s, { type: 'STOP_WAITING' }, HOST);
    expect(err(s, { type: 'SET_MARKED', playerIds: ['p2'] }, HOST)).toBe('UNKNOWN_PLAYER');
    s = ok(s, { type: 'KICK', playerId: 'p1' }, HOST);
    expect(err(s, { type: 'SET_MARKED', playerIds: ['p1'] }, HOST)).toBe('UNKNOWN_PLAYER');
  });
  it('OPEN_VOTING builds options from real + unmarked live submissions and shuffles', () => {
    let s = submitAll(writing3(), { p1: 'a', p2: 'b', p3: 'c' });
    s = ok(s, { type: 'SET_MARKED', playerIds: ['p2'] }, HOST);
    expect(err(s, { type: 'OPEN_VOTING' }, asPlayer('p1'))).toBe('NOT_HOST');
    const v = ok(s, { type: 'OPEN_VOTING' }, HOST);
    expect(v.phase).toBe('VOTING');
    expect(v.round?.options.map((o) => o.source).sort()).toEqual(['PLAYER', 'PLAYER', 'REAL']);
    expect(v.round?.options.find((o) => o.authorId === 'p2')).toBeUndefined();
    expect(v.round?.votes).toEqual({});
    expect(err(v, { type: 'OPEN_VOTING' }, HOST)).toBe('WRONG_PHASE');
    // Different RNG, different order, same set.
    const v2 = ok(s, { type: 'OPEN_VOTING' }, HOST, ctx(T0, scriptedRng([0.99, 0.01, 0.5])));
    expect(v2.round?.options.map((o) => o.text).sort()).toEqual(
      v.round?.options.map((o) => o.text).sort(),
    );
  });
  it('OPEN_VOTING retries option ids on collision', () => {
    const s = submitAll(writing3(), { p1: 'a', p2: 'b', p3: 'c' });
    // A constant RNG would produce the same id every time; the engine must still end up unique.
    const v = ok(
      s,
      { type: 'OPEN_VOTING' },
      HOST,
      ctx(T0, scriptedRng([0.3, 0.3, 0.3, 0.3, 0.31])),
    );
    const ids = v.round?.options.map((o) => o.id) ?? [];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('VOTE', () => {
  it('rejects own option, unknown option, marked voter, wrong phase, host', () => {
    const s = voting3();
    expect(err(s, { type: 'VOTE', optionId: optionOf(s, 'p1').id }, asPlayer('p1'))).toBe(
      'OWN_OPTION',
    );
    expect(err(s, { type: 'VOTE', optionId: 'o_zzzz' }, asPlayer('p1'))).toBe('UNKNOWN_OPTION');
    expect(err(s, { type: 'VOTE', optionId: realOption(s).id }, HOST)).toBe('NOT_PLAYER');
    expect(err(writing3(), { type: 'VOTE', optionId: 'x' }, asPlayer('p1'))).toBe('WRONG_PHASE');
  });
  it('lets a voter change their pick until the phase ends', () => {
    let s = voting3();
    s = ok(s, { type: 'VOTE', optionId: optionOf(s, 'p2').id }, asPlayer('p1'));
    s = ok(s, { type: 'VOTE', optionId: optionOf(s, 'p3').id }, asPlayer('p1'));
    expect(s.round?.votes.p1).toBe(optionOf(s, 'p3').id);
    expect(s.phase).toBe('VOTING');
  });
  it('a player who did not submit can still vote', () => {
    let s = writing3();
    s = ok(s, { type: 'SUBMIT', text: 'a' }, asPlayer('p1'));
    s = ok(s, { type: 'STOP_WAITING' }, HOST);
    s = ok(s, { type: 'OPEN_VOTING' }, HOST);
    s = ok(s, { type: 'VOTE', optionId: realOption(s).id }, asPlayer('p2'));
    expect(s.round?.votes.p2).toBeDefined();
  });
});

describe('auto-advance VOTING -> REVEAL', () => {
  it('ignores inactive eligible voters', () => {
    let s = voting3();
    // p1 and p2 are alive later; p3 was last seen at T0 and is now inactive.
    const later = ctx(LATER);
    s = ok(s, { type: 'HEARTBEAT' }, asPlayer('p2'), later);
    s = ok(s, { type: 'VOTE', optionId: realOption(s).id }, asPlayer('p1'), later);
    expect(s.phase).toBe('VOTING');
    s = ok(s, { type: 'VOTE', optionId: realOption(s).id }, asPlayer('p2'), later);
    expect(s.phase).toBe('REVEAL');
    expect(s.round?.gained).toEqual({ p1: 2, p2: 2 });
  });
  it('does not advance when there are no eligible voters (everyone marked)', () => {
    let s = submitAll(writing3(), { p1: 'a', p2: 'b', p3: 'c' });
    s = ok(s, { type: 'SET_MARKED', playerIds: ['p1', 'p2', 'p3'] }, HOST);
    s = ok(s, { type: 'OPEN_VOTING' }, HOST);
    expect(s.phase).toBe('VOTING');
    expect(s.round?.options).toHaveLength(1);
    expect(eligibleVoters(s, s.round!)).toEqual([]);
    s = ok(s, { type: 'HEARTBEAT' }, asPlayer('p1'));
    expect(s.phase).toBe('VOTING');
    s = ok(s, { type: 'REVEAL_NOW' }, HOST);
    expect(s.phase).toBe('REVEAL');
    expect(s.round?.gained).toEqual({ p1: 3, p2: 3, p3: 3 });
  });
  it('nobody submits: only the real card, everyone who votes scores', () => {
    let s = writing3();
    s = ok(s, { type: 'STOP_WAITING' }, HOST);
    s = ok(s, { type: 'OPEN_VOTING' }, HOST);
    expect(s.round?.options).toHaveLength(1);
    const real = realOption(s).id;
    s = ok(s, { type: 'VOTE', optionId: real }, asPlayer('p1'));
    s = ok(s, { type: 'VOTE', optionId: real }, asPlayer('p2'));
    s = ok(s, { type: 'VOTE', optionId: real }, asPlayer('p3'));
    expect(s.phase).toBe('REVEAL');
    expect(s.round?.gained).toEqual({ p1: 2, p2: 2, p3: 2 });
  });
});

describe('REVEAL_NOW / SHOW_SCOREBOARD / NEXT_ROUND / END_GAME guards', () => {
  const hostOnly: Array<{ type: 'REVEAL_NOW' | 'SHOW_SCOREBOARD' | 'NEXT_ROUND' | 'END_GAME' }> = [
    { type: 'REVEAL_NOW' },
    { type: 'SHOW_SCOREBOARD' },
    { type: 'NEXT_ROUND' },
    { type: 'END_GAME' },
  ];
  it.each(hostOnly)('$type from a player is NOT_HOST', (a) => {
    expect(err(voting3(), a, asPlayer('p1'))).toBe('NOT_HOST');
  });
  it('each transition rejects the wrong phase', () => {
    const v = voting3();
    const r = ok(v, { type: 'REVEAL_NOW' }, HOST);
    const sb = ok(r, { type: 'SHOW_SCOREBOARD' }, HOST);
    expect(err(v, { type: 'SHOW_SCOREBOARD' }, HOST)).toBe('WRONG_PHASE');
    expect(err(v, { type: 'NEXT_ROUND' }, HOST)).toBe('WRONG_PHASE');
    expect(err(r, { type: 'REVEAL_NOW' }, HOST)).toBe('WRONG_PHASE');
    expect(err(r, { type: 'NEXT_ROUND' }, HOST)).toBe('WRONG_PHASE');
    expect(err(sb, { type: 'SHOW_SCOREBOARD' }, HOST)).toBe('WRONG_PHASE');
    expect(err(lobby3(), { type: 'REVEAL_NOW' }, HOST)).toBe('WRONG_PHASE');
  });
  it('END_GAME finishes from any phase, once', () => {
    for (const s of [lobby3(), writing3(), voting3()]) {
      const f = ok(s, { type: 'END_GAME' }, HOST);
      expect(f.phase).toBe('FINISHED');
      expect(f.round).toBeNull();
      expect(err(f, { type: 'END_GAME' }, HOST)).toBe('WRONG_PHASE');
    }
  });
  it('every phase-gated action is WRONG_PHASE when FINISHED', () => {
    const f = ok(lobby3(), { type: 'END_GAME' }, HOST);
    expect(err(f, { type: 'START' }, HOST)).toBe('WRONG_PHASE');
    expect(err(f, { type: 'SUBMIT', text: 'x' }, asPlayer('p1'))).toBe('WRONG_PHASE');
    expect(err(f, { type: 'VOTE', optionId: 'x' }, asPlayer('p1'))).toBe('WRONG_PHASE');
    expect(err(f, { type: 'RENAME', name: 'x' }, asPlayer('p1'))).toBe('WRONG_PHASE');
    // Heartbeats still work after the game ends.
    expect(ok(f, { type: 'HEARTBEAT' }, asPlayer('p1')).phase).toBe('FINISHED');
  });
});

describe('KICK', () => {
  it('rejects unknown, already-kicked and non-host', () => {
    const s = lobby3();
    expect(err(s, { type: 'KICK', playerId: 'p9' }, HOST)).toBe('UNKNOWN_PLAYER');
    expect(err(s, { type: 'KICK', playerId: 'p2' }, asPlayer('p1'))).toBe('NOT_HOST');
    const k = ok(s, { type: 'KICK', playerId: 'p2' }, HOST);
    expect(err(k, { type: 'KICK', playerId: 'p2' }, HOST)).toBe('KICKED');
  });
  it('LOBBY: marks kicked and keeps join order', () => {
    const s = ok(lobby3(), { type: 'KICK', playerId: 'p2' }, HOST);
    expect(s.players.map((p) => p.kicked)).toEqual([false, true, false]);
  });
  it('WRITING: removes their submission and may auto-advance', () => {
    let s = writing3();
    s = ok(s, { type: 'SUBMIT', text: 'a' }, asPlayer('p1'));
    s = ok(s, { type: 'SUBMIT', text: 'b' }, asPlayer('p2'));
    expect(s.phase).toBe('WRITING');
    s = ok(s, { type: 'KICK', playerId: 'p3' }, HOST);
    expect(s.phase).toBe('REVIEW'); // p1 and p2 are the only active players and both submitted
    expect(s.round?.submissions.p3).toBeUndefined();
  });
  it('REVIEW: drops them from marked and from the host view', () => {
    let s = submitAll(writing3(), { p1: 'To confuse or fluster.', p2: 'b', p3: 'c' });
    s = ok(s, { type: 'SET_MARKED', playerIds: ['p1'] }, HOST);
    s = ok(s, { type: 'KICK', playerId: 'p1' }, HOST);
    expect(s.round?.marked).toEqual([]);
    expect(s.round?.submissions.p1).toBeUndefined();
    const v = ok(s, { type: 'OPEN_VOTING' }, HOST);
    expect(v.round?.options.find((o) => o.authorId === 'p1')).toBeUndefined();
  });
  it('VOTING: removes their option and the votes on it; those voters can vote again', () => {
    let s = voting3();
    s = ok(s, { type: 'VOTE', optionId: p3OptionIn(s) }, asPlayer('p1'));
    s = ok(s, { type: 'VOTE', optionId: optionOf(s, 'p1').id }, asPlayer('p2'));
    expect(s.phase).toBe('VOTING');
    s = ok(s, { type: 'KICK', playerId: 'p3' }, HOST);
    expect(s.phase).toBe('VOTING');
    expect(s.round?.options).toHaveLength(3);
    expect(s.round?.options.find((o) => o.authorId === 'p3')).toBeUndefined();
    expect(s.round?.votes.p1).toBeUndefined(); // p1's vote was on the removed card
    expect(s.round?.votes.p2).toBeDefined();
    expect(err(s, { type: 'VOTE', optionId: p3OptionIn(voting3()) }, asPlayer('p1'))).toBe(
      'UNKNOWN_OPTION',
    );
    s = ok(s, { type: 'VOTE', optionId: realOption(s).id }, asPlayer('p1'));
    expect(s.phase).toBe('REVEAL');
    expect(s.round?.gained).toEqual({ p1: 3 }); // +2 right, +1 fooled p2

    function p3OptionIn(state: GameState) {
      return optionOf(state, 'p3').id;
    }
  });
  it('VOTING: kicking the last remaining voter after others voted auto-reveals', () => {
    let s = voting3();
    s = ok(s, { type: 'VOTE', optionId: realOption(s).id }, asPlayer('p1'));
    s = ok(s, { type: 'VOTE', optionId: realOption(s).id }, asPlayer('p2'));
    s = ok(s, { type: 'KICK', playerId: 'p3' }, HOST);
    expect(s.phase).toBe('REVEAL');
  });
  it('REVEAL / SCOREBOARD / FINISHED: keeps points already applied', () => {
    let s = voting3();
    s = ok(s, { type: 'VOTE', optionId: realOption(s).id }, asPlayer('p1'));
    s = ok(s, { type: 'REVEAL_NOW' }, HOST);
    s = ok(s, { type: 'KICK', playerId: 'p1' }, HOST);
    expect(s.players[0]).toMatchObject({ kicked: true, score: 2 });
    s = ok(s, { type: 'SHOW_SCOREBOARD' }, HOST);
    s = ok(s, { type: 'KICK', playerId: 'p2' }, HOST);
    expect(s.phase).toBe('SCOREBOARD');
    s = ok(s, { type: 'END_GAME' }, HOST);
    s = ok(s, { type: 'KICK', playerId: 'p3' }, HOST);
    expect(s.players.every((p) => p.kicked)).toBe(true);
  });
});

describe('immutability', () => {
  it('never mutates the input state (success and failure)', () => {
    const s = voting3();
    const before = structuredClone(s);
    const good = applyAction(
      s,
      { type: 'VOTE', optionId: realOption(s).id },
      asPlayer('p1'),
      ctx(),
    );
    expect(good.ok).toBe(true);
    const bad = applyAction(s, { type: 'VOTE', optionId: 'nope' }, asPlayer('p1'), ctx());
    expect(bad.ok).toBe(false);
    const kick = applyAction(s, { type: 'KICK', playerId: 'p3' }, HOST, ctx());
    expect(kick.ok).toBe(true);
    expect(s).toEqual(before);
  });
});

describe('phase coverage', () => {
  it('visits every phase in order', () => {
    const seen: Phase[] = [];
    let s = lobby3();
    seen.push(s.phase);
    s = ok(s, { type: 'START' }, HOST);
    seen.push(s.phase);
    s = submitAll(s, { p1: 'a', p2: 'b', p3: 'c' });
    seen.push(s.phase);
    s = ok(s, { type: 'OPEN_VOTING' }, HOST);
    seen.push(s.phase);
    s = ok(s, { type: 'REVEAL_NOW' }, HOST);
    seen.push(s.phase);
    s = ok(s, { type: 'SHOW_SCOREBOARD' }, HOST);
    seen.push(s.phase);
    s = ok(s, { type: 'END_GAME' }, HOST);
    seen.push(s.phase);
    expect(seen).toEqual([
      'LOBBY',
      'WRITING',
      'REVIEW',
      'VOTING',
      'REVEAL',
      'SCOREBOARD',
      'FINISHED',
    ]);
  });
});
