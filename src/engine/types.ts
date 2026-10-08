export type Phase =
  'LOBBY' | 'WRITING' | 'REVIEW' | 'VOTING' | 'REVEAL' | 'SCOREBOARD' | 'FINISHED';

export interface WordEntry {
  word: string;
  definition: string;
}

export interface Player {
  id: string; // short random id, e.g. 'p_7h2k9x'
  name: string; // 1–16 chars, unique per game (case-insensitive)
  score: number;
  joinedAt: number; // epoch ms
  lastSeenAt: number; // epoch ms, updated by heartbeat
  kicked: boolean;
}

export interface Option {
  id: string; // random, not guessable ordering, e.g. 'o_x3f'
  text: string;
  source: 'REAL' | 'PLAYER';
  authorId?: string; // present when source === 'PLAYER'
}

export interface RoundState {
  index: number; // 0-based
  submissions: Record<string, string>; // playerId -> text
  marked: string[]; // playerIds
  options: Option[]; // in display order (already shuffled)
  votes: Record<string, string>; // voterId -> optionId
  gained: Record<string, number>; // playerId -> points this round
}

export type CorrectGuessPoints = 1 | 2 | 3;

export interface Settings {
  correctGuessPoints: CorrectGuessPoints;
  maxPlayers: number;
}

export interface GameState {
  id: string;
  code: string;
  phase: Phase;
  words: WordEntry[]; // SECRET (definitions)
  settings: Settings;
  players: Player[]; // join order
  round: RoundState | null; // null in LOBBY and FINISHED
  history: Array<Pick<RoundState, 'index' | 'gained'>>;
  createdAt: number;
  updatedAt: number;
}

export type PlayerStatus = 'idle' | 'submitted' | 'voted' | 'knew_it';

export interface PublicPlayer {
  id: string;
  name: string;
  score: number;
  active: boolean;
  status: PlayerStatus;
}

export interface PublicOption {
  id: string;
  letter: string;
  text: string;
}

export interface RevealInfo {
  realOptionId: string;
  authors: Record<string, string>; // optionId -> playerId (fakes only)
  votes: Record<string, string>; // voterId -> optionId
  marked: string[];
}

export interface PublicSnapshot {
  code: string;
  version: number; // filled in by the API layer from games.version
  phase: Phase;
  roundIndex: number | null;
  totalRounds: number;
  word: string | null; // ONLY the word, never the definition (null in LOBBY/FINISHED)
  settings: Settings;
  players: PublicPlayer[];
  options: PublicOption[] | null; // VOTING & REVEAL only, NO author/source
  reveal: RevealInfo | null; // REVEAL only
  gained: Record<string, number> | null; // REVEAL & SCOREBOARD
  markedIds: string[] | null; // VOTING only (so marked players know to sit out)
}

export interface PlayerPrivate {
  playerId: string;
  name: string;
  // DECISION: `kicked` is not in the spec's PlayerPrivate but the player client needs
  // it to show "The host removed you" (kicked players are redacted from `players`).
  kicked: boolean;
  mySubmission: string | null; // current round
  myVote: string | null;
  myOptionId: string | null; // VOTING only, so the UI can disable own card reliably
}

export interface HostSubmission {
  playerId: string;
  text: string;
  duplicateOf?: string; // playerId of an earlier submission that normalizes identically
  matchesReal: boolean;
}

export interface HostView extends PublicSnapshot {
  words: WordEntry[];
  currentDefinition: string | null;
  submissions: HostSubmission[];
}

/** Limits shared by the engine and the API validators. */
export const LIMITS = {
  word: { min: 1, max: 40 },
  definition: { min: 1, max: 200 },
  submission: { min: 1, max: 160 },
  name: { min: 1, max: 16 },
  words: { min: 1, max: 20 },
  maxPlayersDefault: 12,
  maxPlayersCap: 16,
  minPlayersToStart: 2,
  /** A player is active when `now - lastSeenAt < ACTIVE_MS` and not kicked. */
  activeMs: 45_000,
  heartbeatMs: 15_000,
} as const;
