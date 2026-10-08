import type { Option, RoundState, Settings } from './types';

/**
 * Compute points gained this round (spec §5.3). Pure.
 *
 *   for each (voter, optionId) in votes:
 *     if option is REAL:                gained[voter]  += correctGuessPoints
 *     else if option.authorId != voter: gained[author] += 1
 *   for each marked player:             gained[marked] += 3
 */
export function computeGained(round: RoundState, settings: Settings): Record<string, number> {
  const gained: Record<string, number> = {};
  const byId = new Map<string, Option>(round.options.map((o) => [o.id, o]));
  const add = (id: string, n: number) => {
    gained[id] = (gained[id] ?? 0) + n;
  };

  for (const [voter, optionId] of Object.entries(round.votes)) {
    const option = byId.get(optionId);
    if (!option) continue; // defensive: a vote for a removed option
    if (option.source === 'REAL') {
      add(voter, settings.correctGuessPoints);
    } else if (option.authorId !== undefined && option.authorId !== voter) {
      add(option.authorId, 1);
    }
  }
  for (const playerId of round.marked) {
    add(playerId, 3);
  }
  return gained;
}

export interface RankedPlayer {
  id: string;
  name: string;
  score: number;
  rank: number; // 1-based, ties share a rank
  gained: number;
}

/** Rank players by score descending; ties share a rank (1,1,3 style). */
export function rankPlayers(
  players: Array<{ id: string; name: string; score: number }>,
  gained: Record<string, number> | null,
): RankedPlayer[] {
  const sorted = [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const out: RankedPlayer[] = [];
  let rank = 0;
  let prevScore: number | null = null;
  sorted.forEach((p, i) => {
    if (prevScore === null || p.score !== prevScore) rank = i + 1;
    prevScore = p.score;
    out.push({ id: p.id, name: p.name, score: p.score, rank, gained: gained?.[p.id] ?? 0 });
  });
  return out;
}

/** Everyone sharing the top score. Empty when there are no players. */
export function winners<T extends { score: number }>(players: T[]): T[] {
  if (players.length === 0) return [];
  const top = Math.max(...players.map((p) => p.score));
  return players.filter((p) => p.score === top);
}
