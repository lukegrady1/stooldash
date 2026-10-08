import type { Action, Actor, EngineCtx } from '../actions';
import { applyAction, createGame } from '../engine';
import type { GameState, Option, WordEntry } from '../types';

export const T0 = 1_700_000_000_000;

export const HOST: Actor = { role: 'host' };
export const asPlayer = (playerId: string): Actor => ({ role: 'player', playerId });

/**
 * Deterministic RNG. With `values` it cycles through them (useful for pinning a
 * shuffle); without, it is a seeded mulberry32 stream so ids never repeat.
 */
export function scriptedRng(values?: number[], seed = 0xc0ffee): () => number {
  if (values) {
    let i = 0;
    return () => {
      const v = values[i % values.length] as number;
      i++;
      return v;
    };
  }
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function ctx(now = T0, rng = scriptedRng()): EngineCtx {
  return { now, rng };
}

export const WORDS: WordEntry[] = [
  { word: 'Snollygoster', definition: 'A shrewd, unprincipled person, especially a politician.' },
  { word: 'Bumfuzzle', definition: 'To confuse or fluster.' },
  {
    word: 'Gongoozler',
    definition: 'A person who enjoys idly watching boats and activity on canals.',
  },
];

export function newGame(words: WordEntry[] = WORDS, settings?: Partial<GameState['settings']>) {
  return createGame({ id: 'g1', code: 'kqwz', words, settings }, { now: T0 });
}

/** Apply and assert success, returning the new state. */
export function ok(s: GameState, a: Action, actor: Actor, c: EngineCtx = ctx()): GameState {
  const r = applyAction(s, a, actor, c);
  if (!r.ok) throw new Error(`expected ok, got ${r.error} for ${a.type}`);
  return r.state;
}

/** Apply and return the error code (throws if it succeeded). */
export function err(s: GameState, a: Action, actor: Actor, c: EngineCtx = ctx()): string {
  const r = applyAction(s, a, actor, c);
  if (r.ok) throw new Error(`expected error for ${a.type}, got ok (phase ${r.state.phase})`);
  return r.error;
}

export function join(s: GameState, names: string[], now = T0): GameState {
  let out = s;
  names.forEach((name, i) => {
    out = ok(out, { type: 'JOIN', name, playerId: `p${i + 1}` }, HOST, ctx(now));
  });
  return out;
}

/** Lobby with three players p1..p3 (Ann, Bob, Cy). */
export function lobby3(): GameState {
  return join(newGame(), ['Ann', 'Bob', 'Cy']);
}

/** Started game in WRITING with three players. */
export function writing3(): GameState {
  return ok(lobby3(), { type: 'START' }, HOST);
}

/** Submit for the given players (default all three). Returns the state (may auto-advance). */
export function submitAll(s: GameState, texts: Record<string, string>, now = T0): GameState {
  let out = s;
  for (const [pid, text] of Object.entries(texts)) {
    out = ok(out, { type: 'SUBMIT', text }, asPlayer(pid), ctx(now));
  }
  return out;
}

export function optionBy(s: GameState, pred: (o: Option) => boolean): Option {
  const o = s.round?.options.find(pred);
  if (!o) throw new Error('option not found');
  return o;
}

export function realOption(s: GameState) {
  return optionBy(s, (o) => o.source === 'REAL');
}

export function optionOf(s: GameState, authorId: string) {
  return optionBy(s, (o) => o.authorId === authorId);
}

/** Drive a game to VOTING with 3 players, all submitting distinct fakes. */
export function voting3(): GameState {
  let s = writing3();
  s = submitAll(s, { p1: 'A kind of hat.', p2: 'A small boat.', p3: 'A loud sneeze.' });
  // auto-advanced to REVIEW
  s = ok(s, { type: 'OPEN_VOTING' }, HOST);
  return s;
}
