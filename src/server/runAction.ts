/**
 * The one path every mutation takes (spec §8.2):
 *   load -> applyAction -> compare-and-set update (retry on version conflict) -> broadcast.
 */
import type { Action, Actor } from '@/engine/actions';
import { applyAction } from '@/engine/engine';
import type { GameState, PublicSnapshot } from '@/engine/types';
import { toPublicSnapshot } from '@/engine/views';
import { cryptoRng } from '@/lib/rng';
import { broadcastSnapshot } from './broadcast';
import { ApiError, engineError } from './http';
import { getStore, type GameRow } from './store';

const MAX_ATTEMPTS = 5;

export interface RunResult {
  state: GameState;
  version: number;
  snapshot: PublicSnapshot;
}

export async function loadGame(code: string): Promise<GameRow> {
  const row = await getStore().getGameByCode(code);
  if (!row || row.expiresAt <= Date.now()) {
    throw new ApiError(404, 'NOT_FOUND', 'No game with that code. Check with your host.');
  }
  return row;
}

export function snapshotOf(state: GameState, version: number, now = Date.now()): PublicSnapshot {
  return { ...toPublicSnapshot(state, { now }), version };
}

/** Strip the version so two snapshots can be compared for "did anything visible change?". */
function sameSnapshot(a: PublicSnapshot, b: PublicSnapshot): boolean {
  return JSON.stringify({ ...a, version: 0 }) === JSON.stringify({ ...b, version: 0 });
}

export async function runAction(
  code: string,
  action: Action,
  actor: Actor,
  initialRow?: GameRow,
): Promise<RunResult> {
  const store = getStore();
  let row = initialRow ?? (await loadGame(code));

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const now = Date.now();
    const result = applyAction(row.state, action, actor, { now, rng: cryptoRng });
    if (!result.ok) throw engineError(result.error);

    const newVersion = await store.updateGame(row.id, row.version, result.state, now);
    if (newVersion === null) {
      row = await loadGame(code);
      continue;
    }

    const snapshot = snapshotOf(result.state, newVersion, now);
    // DECISION: heartbeats that change nothing visible (no phase/status/active flip) are
    // not broadcast. They still persist lastSeenAt. This keeps the channel quiet with
    // 16 players pinging every 15s.
    const before = snapshotOf(row.state, row.version, now);
    if (action.type !== 'HEARTBEAT' || !sameSnapshot(before, snapshot)) {
      await broadcastSnapshot(snapshot);
    }
    return { state: result.state, version: newVersion, snapshot };
  }
  throw new ApiError(503, 'CONFLICT', 'The game is busy. Try again.');
}
