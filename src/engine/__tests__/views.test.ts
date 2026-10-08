import { describe, expect, it } from 'vitest';
import { toHostView, toPlayerView, toPublicSnapshot, letterFor } from '../views';
import type { GameState, Phase } from '../types';
import {
  HOST,
  T0,
  asPlayer,
  ctx,
  lobby3,
  ok,
  optionOf,
  realOption,
  submitAll,
  writing3,
} from './helpers';
import { LIMITS } from '../types';

/** One representative state per phase, with secrets present wherever they can be. */
function statesByPhase(): Record<Phase, GameState> {
  const lobby = lobby3();
  let writing = writing3();
  writing = ok(writing, { type: 'SUBMIT', text: 'A secret fake' }, asPlayer('p1'));
  const review = submitAll(writing, {
    p2: 'Another secret fake',
    p3: 'A shrewd, unprincipled person, especially a politician.', // matches real -> marked
  });
  const voting = ok(review, { type: 'OPEN_VOTING' }, HOST);
  let reveal = ok(voting, { type: 'VOTE', optionId: optionOf(voting, 'p2').id }, asPlayer('p1'));
  reveal = ok(reveal, { type: 'VOTE', optionId: realOption(reveal).id }, asPlayer('p2'));
  const scoreboard = ok(reveal, { type: 'SHOW_SCOREBOARD' }, HOST);
  const finished = ok(scoreboard, { type: 'END_GAME' }, HOST);
  expect(review.phase).toBe('REVIEW');
  expect(reveal.phase).toBe('REVEAL');
  return {
    LOBBY: lobby,
    WRITING: writing,
    REVIEW: review,
    VOTING: voting,
    REVEAL: reveal,
    SCOREBOARD: scoreboard,
    FINISHED: finished,
  };
}

const PHASES: Phase[] = [
  'LOBBY',
  'WRITING',
  'REVIEW',
  'VOTING',
  'REVEAL',
  'SCOREBOARD',
  'FINISHED',
];

describe('redaction: public snapshot', () => {
  const states = statesByPhase();

  it.each(PHASES)('%s: contains no definition text except shown options', (phase) => {
    const s = states[phase];
    const json = JSON.stringify(toPublicSnapshot(s, { now: T0 }));
    const shown = new Set(
      phase === 'VOTING' || phase === 'REVEAL' ? (s.round?.options.map((o) => o.text) ?? []) : [],
    );
    for (const w of s.words) {
      if (!shown.has(w.definition)) expect(json).not.toContain(w.definition);
    }
    expect(json).not.toContain('"definition"');
    expect(json).not.toContain('"words"');
  });

  it.each(PHASES)('%s: contains no authorId or source before REVEAL', (phase) => {
    const json = JSON.stringify(toPublicSnapshot(states[phase], { now: T0 }));
    expect(json).not.toContain('"source"');
    if (phase !== 'REVEAL') {
      expect(json).not.toContain('authorId');
      expect(json).not.toContain('"authors"');
    }
  });

  it.each(PHASES)('%s: contains no submission text before VOTING', (phase) => {
    const s = states[phase];
    const json = JSON.stringify(toPublicSnapshot(s, { now: T0 }));
    expect(json).not.toContain('"submissions"');
    if (phase === 'WRITING' || phase === 'REVIEW') {
      for (const text of Object.values(s.round?.submissions ?? {})) {
        expect(json).not.toContain(text);
      }
    }
  });

  it('exposes exactly the right fields per phase', () => {
    const snap = (p: Phase) => toPublicSnapshot(states[p], { now: T0 });
    expect(snap('LOBBY')).toMatchObject({
      phase: 'LOBBY',
      roundIndex: null,
      totalRounds: 3,
      word: null,
      options: null,
      reveal: null,
      gained: null,
      markedIds: null,
      version: 0,
      code: 'KQWZ',
    });
    expect(snap('WRITING')).toMatchObject({ word: 'Snollygoster', roundIndex: 0, options: null });
    expect(snap('REVIEW')).toMatchObject({ word: 'Snollygoster', options: null, markedIds: null });

    const v = snap('VOTING');
    expect(v.options).toHaveLength(3); // real + p1 + p2 (p3 marked)
    expect(v.options?.map((o) => o.letter)).toEqual(['A', 'B', 'C']);
    expect(v.markedIds).toEqual(['p3']);
    expect(v.reveal).toBeNull();
    expect(v.gained).toBeNull();

    const r = snap('REVEAL');
    expect(r.options).toHaveLength(3);
    expect(r.markedIds).toBeNull();
    expect(r.reveal?.realOptionId).toBe(realOption(states.REVEAL).id);
    expect(Object.values(r.reveal?.authors ?? {}).sort()).toEqual(['p1', 'p2']);
    expect(r.reveal?.marked).toEqual(['p3']);
    expect(r.reveal?.votes).toEqual(states.REVEAL.round?.votes);
    expect(r.gained).toEqual({ p2: 3, p3: 3 }); // p1 fooled nobody and guessed wrong

    const sb = snap('SCOREBOARD');
    expect(sb.options).toBeNull();
    expect(sb.reveal).toBeNull();
    expect(sb.gained).toEqual(r.gained);

    expect(snap('FINISHED')).toMatchObject({
      word: null,
      roundIndex: null,
      options: null,
      gained: null,
    });
  });

  it('player status and active flags', () => {
    const w = toPublicSnapshot(states.WRITING, { now: T0 });
    expect(w.players.map((p) => p.status)).toEqual(['submitted', 'idle', 'idle']);
    expect(w.players.every((p) => p.active)).toBe(true);
    const stale = toPublicSnapshot(states.WRITING, { now: T0 + LIMITS.activeMs });
    expect(stale.players.every((p) => !p.active)).toBe(true);

    const v = toPublicSnapshot(states.VOTING, { now: T0 });
    expect(v.players.map((p) => p.status)).toEqual(['idle', 'idle', 'knew_it']);
    const r = toPublicSnapshot(states.REVEAL, { now: T0 });
    expect(r.players.map((p) => p.status)).toEqual(['voted', 'voted', 'knew_it']);
    expect(toPublicSnapshot(states.LOBBY, { now: T0 }).players.map((p) => p.status)).toEqual([
      'idle',
      'idle',
      'idle',
    ]);
  });

  it('omits kicked players', () => {
    const s = ok(states.VOTING, { type: 'KICK', playerId: 'p1' }, HOST);
    const snap = toPublicSnapshot(s, { now: T0 });
    expect(snap.players.map((p) => p.id)).toEqual(['p2', 'p3']);
    expect(snap.options).toHaveLength(2);
  });

  it('letterFor falls back past Z', () => {
    expect(letterFor(0)).toBe('A');
    expect(letterFor(25)).toBe('Z');
    expect(letterFor(26)).toBe('#27');
  });
});

describe('toPlayerView', () => {
  const states = statesByPhase();
  it('returns null for unknown players', () => {
    expect(toPlayerView(states.LOBBY, 'nope')).toBeNull();
  });
  it('returns own submission, vote and option id only when relevant', () => {
    expect(toPlayerView(states.LOBBY, 'p1')).toEqual({
      playerId: 'p1',
      name: 'Ann',
      kicked: false,
      mySubmission: null,
      myVote: null,
      myOptionId: null,
    });
    expect(toPlayerView(states.WRITING, 'p1')?.mySubmission).toBe('A secret fake');
    expect(toPlayerView(states.WRITING, 'p2')?.mySubmission).toBeNull();
    const v = toPlayerView(states.VOTING, 'p1');
    expect(v?.myOptionId).toBe(optionOf(states.VOTING, 'p1').id);
    expect(v?.myVote).toBeNull();
    expect(toPlayerView(states.VOTING, 'p3')?.myOptionId).toBeNull(); // marked: no card
    const r = toPlayerView(states.REVEAL, 'p1');
    expect(r?.myVote).toBe(optionOf(states.REVEAL, 'p2').id);
    expect(r?.myOptionId).toBeNull(); // VOTING only
    const kicked = ok(states.LOBBY, { type: 'KICK', playerId: 'p2' }, HOST);
    expect(toPlayerView(kicked, 'p2')?.kicked).toBe(true);
  });
});

describe('toHostView', () => {
  const states = statesByPhase();
  it('includes words, the current definition and annotated submissions', () => {
    const h = toHostView(states.REVIEW, { now: T0 });
    expect(h.words).toEqual(states.REVIEW.words);
    expect(h.currentDefinition).toBe(states.REVIEW.words[0]?.definition);
    expect(h.submissions).toEqual([
      { playerId: 'p1', text: 'A secret fake', matchesReal: false },
      { playerId: 'p2', text: 'Another secret fake', matchesReal: false },
      {
        playerId: 'p3',
        text: 'A shrewd, unprincipled person, especially a politician.',
        matchesReal: true,
      },
    ]);
    expect(h.phase).toBe('REVIEW');
    expect(h.marked).toEqual(['p3']);
    expect(toHostView(states.LOBBY, { now: T0 }).marked).toEqual([]);
  });
  it('flags duplicates (by normalized text) against the first submitter', () => {
    let s = writing3();
    s = submitAll(s, { p1: 'A small boat.', p2: 'the small boat', p3: 'other' });
    const h = toHostView(s, { now: T0 });
    expect(h.submissions.find((x) => x.playerId === 'p2')?.duplicateOf).toBe('p1');
    expect(h.submissions.find((x) => x.playerId === 'p1')?.duplicateOf).toBeUndefined();
    // Both still become options.
    const v = ok(s, { type: 'OPEN_VOTING' }, HOST);
    expect(v.round?.options).toHaveLength(4);
  });
  it('has no round data in LOBBY and FINISHED, and hides kicked submissions', () => {
    expect(toHostView(states.LOBBY, { now: T0 })).toMatchObject({
      currentDefinition: null,
      submissions: [],
    });
    expect(toHostView(states.FINISHED, { now: T0 }).currentDefinition).toBeNull();
    const k = ok(states.REVIEW, { type: 'KICK', playerId: 'p1' }, HOST);
    expect(toHostView(k, { now: T0 }).submissions.map((x) => x.playerId)).toEqual(['p2', 'p3']);
  });
  it('ctx works with any now', () => {
    expect(toHostView(states.WRITING, ctx(T0 + 1)).players[0]?.active).toBe(true);
  });
});
