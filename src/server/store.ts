/**
 * Persistence. Supabase Postgres in production; an in-process memory store when the
 * Supabase env vars are missing so the app can run locally (and in CI) without a project.
 *
 * DECISION: the memory store is per-process and non-durable. It exists so the engine,
 * API and UI can be exercised before a Supabase project is configured (spec §16.6).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { GameState } from '@/engine/types';
import { supabaseEnv } from './env';

export const GAME_TTL_MS = 24 * 60 * 60 * 1000;

export interface GameRow {
  id: string;
  code: string;
  state: GameState;
  version: number;
  expiresAt: number; // epoch ms
}

export type SessionRole = 'host' | 'player';

export interface SessionRow {
  tokenHash: string;
  gameId: string;
  role: SessionRole;
  playerId: string | null;
}

export class CodeConflictError extends Error {
  constructor() {
    super('code conflict');
    this.name = 'CodeConflictError';
  }
}

export interface Store {
  readonly kind: 'supabase' | 'memory';
  createGame(state: GameState, now: number): Promise<GameRow>;
  getGameByCode(code: string): Promise<GameRow | null>;
  /** Compare-and-set. Returns the new version, or null when `expectedVersion` is stale. */
  updateGame(
    id: string,
    expectedVersion: number,
    state: GameState,
    now: number,
  ): Promise<number | null>;
  createSession(row: SessionRow): Promise<void>;
  getSession(tokenHash: string): Promise<SessionRow | null>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteExpiredGames(now: number): Promise<number>;
}

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

interface MemoryData {
  games: Map<string, GameRow>; // by id
  sessions: Map<string, SessionRow>;
}

export class MemoryStore implements Store {
  readonly kind = 'memory' as const;
  private data: MemoryData;

  constructor(data?: MemoryData) {
    this.data = data ?? { games: new Map(), sessions: new Map() };
  }

  async createGame(state: GameState, now: number): Promise<GameRow> {
    for (const g of this.data.games.values()) {
      if (g.code === state.code && g.expiresAt > now) throw new CodeConflictError();
    }
    const row: GameRow = {
      id: state.id,
      code: state.code,
      state: structuredClone(state),
      version: 1,
      expiresAt: now + GAME_TTL_MS,
    };
    this.data.games.set(row.id, row);
    return structuredClone(row);
  }

  async getGameByCode(code: string): Promise<GameRow | null> {
    for (const g of this.data.games.values()) {
      if (g.code === code) return structuredClone(g);
    }
    return null;
  }

  async updateGame(id: string, expectedVersion: number, state: GameState, now: number) {
    const row = this.data.games.get(id);
    if (!row || row.version !== expectedVersion) return null;
    row.state = structuredClone(state);
    row.version += 1;
    row.expiresAt = now + GAME_TTL_MS;
    return row.version;
  }

  async createSession(row: SessionRow): Promise<void> {
    this.data.sessions.set(row.tokenHash, { ...row });
  }

  async getSession(tokenHash: string): Promise<SessionRow | null> {
    const s = this.data.sessions.get(tokenHash);
    return s ? { ...s } : null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    this.data.sessions.delete(tokenHash);
  }

  async deleteExpiredGames(now: number): Promise<number> {
    let n = 0;
    for (const [id, g] of this.data.games) {
      if (g.expiresAt < now) {
        this.data.games.delete(id);
        for (const [h, s] of this.data.sessions) if (s.gameId === id) this.data.sessions.delete(h);
        n++;
      }
    }
    return n;
  }
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

interface GamesTableRow {
  id: string;
  code: string;
  state: GameState;
  version: number;
  expires_at: string;
}

export class SupabaseStore implements Store {
  readonly kind = 'supabase' as const;
  constructor(private readonly client: SupabaseClient) {}

  private static toRow(r: GamesTableRow): GameRow {
    return {
      id: r.id,
      code: r.code,
      state: r.state,
      version: r.version,
      expiresAt: Date.parse(r.expires_at),
    };
  }

  async createGame(state: GameState, now: number): Promise<GameRow> {
    const { data, error } = await this.client
      .from('games')
      .insert({
        id: state.id,
        code: state.code,
        state,
        version: 1,
        expires_at: new Date(now + GAME_TTL_MS).toISOString(),
      })
      .select('id, code, state, version, expires_at')
      .single();
    if (error) {
      if (error.code === '23505') throw new CodeConflictError(); // unique_violation
      throw new Error(`createGame: ${error.message}`);
    }
    return SupabaseStore.toRow(data as GamesTableRow);
  }

  async getGameByCode(code: string): Promise<GameRow | null> {
    const { data, error } = await this.client
      .from('games')
      .select('id, code, state, version, expires_at')
      .eq('code', code)
      .maybeSingle();
    if (error) throw new Error(`getGameByCode: ${error.message}`);
    return data ? SupabaseStore.toRow(data as GamesTableRow) : null;
  }

  async updateGame(id: string, expectedVersion: number, state: GameState, now: number) {
    const { data, error } = await this.client
      .from('games')
      .update({
        state,
        version: expectedVersion + 1,
        updated_at: new Date(now).toISOString(),
        expires_at: new Date(now + GAME_TTL_MS).toISOString(),
      })
      .eq('id', id)
      .eq('version', expectedVersion)
      .select('version');
    if (error) throw new Error(`updateGame: ${error.message}`);
    const row = (data as Array<{ version: number }> | null)?.[0];
    return row ? row.version : null;
  }

  async createSession(row: SessionRow): Promise<void> {
    const { error } = await this.client.from('sessions').insert({
      token_hash: row.tokenHash,
      game_id: row.gameId,
      role: row.role,
      player_id: row.playerId,
    });
    if (error) throw new Error(`createSession: ${error.message}`);
  }

  async getSession(tokenHash: string): Promise<SessionRow | null> {
    const { data, error } = await this.client
      .from('sessions')
      .select('token_hash, game_id, role, player_id')
      .eq('token_hash', tokenHash)
      .maybeSingle();
    if (error) throw new Error(`getSession: ${error.message}`);
    if (!data) return null;
    const d = data as {
      token_hash: string;
      game_id: string;
      role: SessionRole;
      player_id: string | null;
    };
    return { tokenHash: d.token_hash, gameId: d.game_id, role: d.role, playerId: d.player_id };
  }

  async deleteSession(tokenHash: string): Promise<void> {
    const { error } = await this.client.from('sessions').delete().eq('token_hash', tokenHash);
    if (error) throw new Error(`deleteSession: ${error.message}`);
  }

  async deleteExpiredGames(now: number): Promise<number> {
    const { data, error } = await this.client
      .from('games')
      .delete()
      .lt('expires_at', new Date(now).toISOString())
      .select('id');
    if (error) throw new Error(`deleteExpiredGames: ${error.message}`);
    return (data as unknown[] | null)?.length ?? 0;
  }
}

// ---------------------------------------------------------------------------
// Singleton (survives Next dev HMR via globalThis)
// ---------------------------------------------------------------------------

declare global {
  var __bdStore: Store | undefined;
}

export function getStore(): Store {
  if (globalThis.__bdStore) return globalThis.__bdStore;
  const env = supabaseEnv();
  const store: Store = env
    ? new SupabaseStore(
        createClient(env.url, env.serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        }),
      )
    : new MemoryStore();
  globalThis.__bdStore = store;
  return store;
}

/** Test hook. */
export function setStore(store: Store | undefined): void {
  globalThis.__bdStore = store;
}
