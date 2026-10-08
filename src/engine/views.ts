/**
 * Redacted views of the game state. The public snapshot is broadcast to everyone,
 * so it must never contain `words[].definition`, `authorId` before REVEAL, or
 * submission text before VOTING.
 */
import { isActive } from './engine';
import { normalize } from './normalize';
import type {
  GameState,
  HostSubmission,
  HostView,
  PlayerPrivate,
  PlayerStatus,
  PublicOption,
  PublicSnapshot,
} from './types';

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function letterFor(index: number): string {
  return LETTERS[index] ?? `#${index + 1}`;
}

function statusFor(s: GameState, playerId: string): PlayerStatus {
  const round = s.round;
  if (!round) return 'idle';
  switch (s.phase) {
    case 'WRITING':
    case 'REVIEW':
      return round.submissions[playerId] !== undefined ? 'submitted' : 'idle';
    case 'VOTING':
    case 'REVEAL':
    case 'SCOREBOARD':
      if (round.marked.includes(playerId)) return 'knew_it';
      return round.votes[playerId] !== undefined ? 'voted' : 'idle';
    default:
      return 'idle';
  }
}

export function toPublicSnapshot(s: GameState, ctx: { now: number }): PublicSnapshot {
  const round = s.round;
  const showOptions = s.phase === 'VOTING' || s.phase === 'REVEAL';
  const showGained = s.phase === 'REVEAL' || s.phase === 'SCOREBOARD';
  const word = round ? (s.words[round.index]?.word ?? null) : null;

  const options: PublicOption[] | null =
    showOptions && round
      ? round.options.map((o, i) => ({ id: o.id, letter: letterFor(i), text: o.text }))
      : null;

  let reveal: PublicSnapshot['reveal'] = null;
  if (s.phase === 'REVEAL' && round) {
    const real = round.options.find((o) => o.source === 'REAL');
    const authors: Record<string, string> = {};
    for (const o of round.options) {
      if (o.source === 'PLAYER' && o.authorId) authors[o.id] = o.authorId;
    }
    reveal = {
      realOptionId: real?.id ?? '',
      authors,
      votes: { ...round.votes },
      marked: [...round.marked],
    };
  }

  return {
    code: s.code,
    version: 0,
    phase: s.phase,
    roundIndex: round ? round.index : null,
    totalRounds: s.words.length,
    word,
    settings: { ...s.settings },
    players: s.players
      .filter((p) => !p.kicked)
      .map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        active: isActive(p, ctx.now),
        status: statusFor(s, p.id),
      })),
    options,
    reveal,
    gained: showGained && round ? { ...round.gained } : null,
    markedIds: s.phase === 'VOTING' && round ? [...round.marked] : null,
  };
}

export function toPlayerView(s: GameState, playerId: string): PlayerPrivate | null {
  const p = s.players.find((x) => x.id === playerId);
  if (!p) return null;
  const round = s.round;
  const myOption =
    s.phase === 'VOTING' && round ? round.options.find((o) => o.authorId === playerId) : undefined;
  return {
    playerId: p.id,
    name: p.name,
    kicked: p.kicked,
    mySubmission: round?.submissions[playerId] ?? null,
    myVote: round?.votes[playerId] ?? null,
    myOptionId: myOption?.id ?? null,
  };
}

export function toHostView(s: GameState, ctx: { now: number }): HostView {
  const snapshot = toPublicSnapshot(s, ctx);
  const round = s.round;
  const word = round ? s.words[round.index] : undefined;
  const real = word ? normalize(word.definition) : null;

  const submissions: HostSubmission[] = [];
  if (round) {
    const seen = new Map<string, string>(); // normalized -> first playerId
    const live = new Set(s.players.filter((p) => !p.kicked).map((p) => p.id));
    for (const [playerId, text] of Object.entries(round.submissions)) {
      if (!live.has(playerId)) continue;
      const n = normalize(text);
      const first = seen.get(n);
      const entry: HostSubmission = { playerId, text, matchesReal: n === real };
      if (first !== undefined) entry.duplicateOf = first;
      else seen.set(n, playerId);
      submissions.push(entry);
    }
  }

  return {
    ...snapshot,
    words: s.words.map((w) => ({ ...w })),
    currentDefinition: word?.definition ?? null,
    submissions,
  };
}
