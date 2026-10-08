/**
 * The pure game engine. No I/O, no Date.now(), no Math.random(): `now` and `rng`
 * arrive through EngineCtx. Every call returns a new state and never mutates its input.
 */
import type { Action, Actor, EngineCtx, EngineError, EngineResult } from './actions';
import { normalize } from './normalize';
import { computeGained } from './scoring';
import type { GameState, Option, Player, RoundState, Settings, WordEntry } from './types';
import { LIMITS } from './types';
import { charLength, cleanText } from '@/lib/text';

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export interface CreateGameInput {
  id: string;
  code: string;
  words: WordEntry[];
  settings?: Partial<Settings>;
}

export function createGame(input: CreateGameInput, ctx: Pick<EngineCtx, 'now'>): GameState {
  return {
    id: input.id,
    code: input.code.toUpperCase(),
    phase: 'LOBBY',
    words: input.words.map((w) => ({ word: w.word, definition: w.definition })),
    settings: {
      correctGuessPoints: input.settings?.correctGuessPoints ?? 2,
      maxPlayers: Math.min(
        input.settings?.maxPlayers ?? LIMITS.maxPlayersDefault,
        LIMITS.maxPlayersCap,
      ),
    },
    players: [],
    round: null,
    history: [],
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fail = (error: EngineError): EngineResult => ({ ok: false, error });

export function isActive(p: Player, now: number): boolean {
  return !p.kicked && now - p.lastSeenAt < LIMITS.activeMs;
}

export function livePlayers(s: GameState): Player[] {
  return s.players.filter((p) => !p.kicked);
}

export function activePlayers(s: GameState, now: number): Player[] {
  return s.players.filter((p) => isActive(p, now));
}

/** Players who may vote this round: live, not marked. Submission is not required. */
export function eligibleVoters(s: GameState, round: RoundState): Player[] {
  return livePlayers(s).filter((p) => !round.marked.includes(p.id));
}

export function currentWord(s: GameState): WordEntry | null {
  if (!s.round) return null;
  return s.words[s.round.index] ?? null;
}

/** Validate and clean a player name. Returns null when invalid. */
export function cleanName(raw: string): string | null {
  const name = cleanText(raw);
  const len = charLength(name);
  if (len < LIMITS.name.min || len > LIMITS.name.max) return null;
  return name;
}

/** Validate and clean a submission. Returns null when invalid. */
export function cleanSubmission(raw: string): string | null {
  const text = cleanText(raw);
  const len = charLength(text);
  if (len < LIMITS.submission.min || len > LIMITS.submission.max) return null;
  return text;
}

function nameTaken(s: GameState, name: string, exceptId?: string): boolean {
  const target = name.toLowerCase();
  return s.players.some((p) => !p.kicked && p.id !== exceptId && p.name.toLowerCase() === target);
}

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function randomId(prefix: string, length: number, rng: () => number): string {
  let out = prefix;
  for (let i = 0; i < length; i++) {
    out += ID_ALPHABET[Math.floor(rng() * ID_ALPHABET.length) % ID_ALPHABET.length];
  }
  return out;
}

/** Fisher–Yates with the injected RNG. Returns a new array. */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)) % (i + 1);
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

function newRound(index: number): RoundState {
  return { index, submissions: {}, marked: [], options: [], votes: {}, gained: {} };
}

/** Suggest "knew it" players: submissions that normalize to the real definition. */
function suggestMarked(s: GameState, round: RoundState): string[] {
  const word = s.words[round.index];
  if (!word) return [];
  const real = normalize(word.definition);
  return Object.entries(round.submissions)
    .filter(([, text]) => normalize(text) === real)
    .map(([playerId]) => playerId);
}

// ---------------------------------------------------------------------------
// Phase transitions (mutate the already-cloned state)
// ---------------------------------------------------------------------------

function enterReview(s: GameState): void {
  const round = s.round as RoundState;
  s.phase = 'REVIEW';
  round.marked = suggestMarked(s, round);
}

function enterVoting(s: GameState, ctx: EngineCtx): void {
  const round = s.round as RoundState;
  const word = s.words[round.index] as WordEntry;
  const live = new Set(livePlayers(s).map((p) => p.id));
  const raw: Omit<Option, 'id'>[] = [{ text: word.definition, source: 'REAL' }];
  for (const [playerId, text] of Object.entries(round.submissions)) {
    if (!live.has(playerId) || round.marked.includes(playerId)) continue;
    raw.push({ text, source: 'PLAYER', authorId: playerId });
  }
  const used = new Set<string>();
  const withIds: Option[] = raw.map((o) => {
    let id = randomId('o_', 4, ctx.rng);
    // A degenerate RNG must never hang the server: grow the id after a few collisions.
    for (let attempt = 1; used.has(id); attempt++) {
      id = randomId('o_', 4 + Math.floor(attempt / 4), ctx.rng);
    }
    used.add(id);
    return { ...o, id };
  });
  round.options = shuffle(withIds, ctx.rng);
  round.votes = {};
  s.phase = 'VOTING';
}

function enterReveal(s: GameState): void {
  const round = s.round as RoundState;
  round.gained = computeGained(round, s.settings);
  for (const p of s.players) {
    const g = round.gained[p.id];
    if (g) p.score += g;
  }
  s.history.push({ index: round.index, gained: { ...round.gained } });
  s.phase = 'REVEAL';
}

function startRound(s: GameState, index: number): void {
  s.round = newRound(index);
  s.phase = 'WRITING';
}

function finish(s: GameState): void {
  s.phase = 'FINISHED';
  s.round = null;
}

// ---------------------------------------------------------------------------
// Auto-advance (spec §5.4)
// ---------------------------------------------------------------------------

/**
 * WRITING -> REVIEW when every active player has submitted (≥1 active).
 * VOTING  -> REVEAL when every active eligible voter has voted (≥1 eligible).
 * Mutates the (already cloned) state in place.
 */
export function autoAdvance(s: GameState, ctx: EngineCtx): void {
  const round = s.round;
  if (!round) return;
  if (s.phase === 'WRITING') {
    const active = activePlayers(s, ctx.now);
    if (active.length >= 1 && active.every((p) => round.submissions[p.id] !== undefined)) {
      enterReview(s);
    }
    return;
  }
  if (s.phase === 'VOTING') {
    const voters = eligibleVoters(s, round).filter((p) => isActive(p, ctx.now));
    if (voters.length >= 1 && voters.every((p) => round.votes[p.id] !== undefined)) {
      enterReveal(s);
    }
  }
}

// ---------------------------------------------------------------------------
// applyAction
// ---------------------------------------------------------------------------

export function applyAction(
  input: GameState,
  action: Action,
  actor: Actor,
  ctx: EngineCtx,
): EngineResult {
  const s = structuredClone(input);

  // Resolve the acting player (if any) up front, and touch lastSeenAt.
  let me: Player | null = null;
  if (actor.role === 'player') {
    me = s.players.find((p) => p.id === actor.playerId) ?? null;
    if (!me) return fail('UNKNOWN_PLAYER');
    if (me.kicked) return fail('KICKED');
    me.lastSeenAt = ctx.now;
  }

  const requireHost = (): EngineResult | null => (actor.role === 'host' ? null : fail('NOT_HOST'));
  const requirePlayer = (): EngineResult | null => (me ? null : fail('NOT_PLAYER'));
  const requirePhase = (...phases: GameState['phase'][]): EngineResult | null =>
    phases.includes(s.phase) ? null : fail('WRONG_PHASE');

  switch (action.type) {
    case 'JOIN': {
      if (s.phase === 'FINISHED') return fail('WRONG_PHASE');
      const name = cleanName(action.name);
      if (!name) return fail('NAME_INVALID');
      if (nameTaken(s, name)) return fail('NAME_TAKEN');
      if (livePlayers(s).length >= s.settings.maxPlayers) return fail('GAME_FULL');
      if (s.players.some((p) => p.id === action.playerId)) return fail('UNKNOWN_PLAYER');
      s.players.push({
        id: action.playerId,
        name,
        score: 0,
        joinedAt: ctx.now,
        lastSeenAt: ctx.now,
        kicked: false,
      });
      break;
    }

    case 'HEARTBEAT': {
      // lastSeenAt already touched for players; the host heartbeat is a pure tick.
      break;
    }

    case 'RENAME': {
      const err = requirePlayer() ?? requirePhase('LOBBY');
      if (err) return err;
      const name = cleanName(action.name);
      if (!name) return fail('NAME_INVALID');
      if (nameTaken(s, name, (me as Player).id)) return fail('NAME_TAKEN');
      (me as Player).name = name;
      break;
    }

    case 'START': {
      const err = requireHost() ?? requirePhase('LOBBY');
      if (err) return err;
      if (livePlayers(s).length < LIMITS.minPlayersToStart) return fail('NOT_ENOUGH_PLAYERS');
      startRound(s, 0);
      break;
    }

    case 'SUBMIT': {
      const err = requirePlayer() ?? requirePhase('WRITING');
      if (err) return err;
      const text = cleanSubmission(action.text);
      if (!text) return fail('TEXT_INVALID');
      (s.round as RoundState).submissions[(me as Player).id] = text;
      break;
    }

    case 'STOP_WAITING': {
      const err = requireHost() ?? requirePhase('WRITING');
      if (err) return err;
      enterReview(s);
      break;
    }

    case 'SET_MARKED': {
      const err = requireHost() ?? requirePhase('REVIEW');
      if (err) return err;
      const round = s.round as RoundState;
      const unique = [...new Set(action.playerIds)];
      for (const id of unique) {
        const p = s.players.find((x) => x.id === id);
        // Only live players who actually submitted can be marked.
        if (!p || p.kicked || round.submissions[id] === undefined) return fail('UNKNOWN_PLAYER');
      }
      round.marked = unique;
      break;
    }

    case 'OPEN_VOTING': {
      const err = requireHost() ?? requirePhase('REVIEW');
      if (err) return err;
      enterVoting(s, ctx);
      break;
    }

    case 'VOTE': {
      const err = requirePlayer() ?? requirePhase('VOTING');
      if (err) return err;
      const round = s.round as RoundState;
      const voter = me as Player;
      if (round.marked.includes(voter.id)) return fail('NOT_ELIGIBLE');
      const option = round.options.find((o) => o.id === action.optionId);
      if (!option) return fail('UNKNOWN_OPTION');
      if (option.source === 'PLAYER' && option.authorId === voter.id) return fail('OWN_OPTION');
      round.votes[voter.id] = option.id;
      break;
    }

    case 'REVEAL_NOW': {
      const err = requireHost() ?? requirePhase('VOTING');
      if (err) return err;
      enterReveal(s);
      break;
    }

    case 'SHOW_SCOREBOARD': {
      const err = requireHost() ?? requirePhase('REVEAL');
      if (err) return err;
      s.phase = 'SCOREBOARD';
      break;
    }

    case 'NEXT_ROUND': {
      const err = requireHost() ?? requirePhase('SCOREBOARD');
      if (err) return err;
      const next = (s.round as RoundState).index + 1;
      if (next >= s.words.length) finish(s);
      else startRound(s, next);
      break;
    }

    case 'KICK': {
      const err = requireHost();
      if (err) return err;
      const target = s.players.find((p) => p.id === action.playerId);
      if (!target) return fail('UNKNOWN_PLAYER');
      if (target.kicked) return fail('KICKED');
      target.kicked = true;
      const round = s.round;
      if (round) {
        delete round.submissions[target.id];
        delete round.votes[target.id];
        round.marked = round.marked.filter((id) => id !== target.id);
        const removed = round.options.filter((o) => o.authorId === target.id).map((o) => o.id);
        if (removed.length > 0) {
          round.options = round.options.filter((o) => !removed.includes(o.id));
          for (const [voter, optionId] of Object.entries(round.votes)) {
            if (removed.includes(optionId)) delete round.votes[voter];
          }
        }
      }
      break;
    }

    case 'END_GAME': {
      const err = requireHost();
      if (err) return err;
      if (s.phase === 'FINISHED') return fail('WRONG_PHASE');
      finish(s);
      break;
    }
  }

  autoAdvance(s, ctx);
  s.updatedAt = ctx.now;
  return { ok: true, state: s };
}
