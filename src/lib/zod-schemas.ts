import { z } from 'zod';
import { LIMITS } from '@/engine/types';
import { cleanText, charLength } from '@/lib/text';

const cleaned = (min: number, max: number, label: string) =>
  z
    .string()
    .max(max * 4, `${label} is too long`) // raw bound before cleaning (whitespace, controls)
    .transform(cleanText)
    .refine((s) => charLength(s) >= min && charLength(s) <= max, {
      message: `${label} must be ${min}–${max} characters`,
    });

export const wordEntrySchema = z.object({
  word: cleaned(LIMITS.word.min, LIMITS.word.max, 'Word'),
  definition: cleaned(LIMITS.definition.min, LIMITS.definition.max, 'Definition'),
});

export const settingsSchema = z.object({
  correctGuessPoints: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  maxPlayers: z
    .number()
    .int()
    .min(LIMITS.minPlayersToStart)
    .max(LIMITS.maxPlayersCap)
    .default(LIMITS.maxPlayersDefault),
});

export const createGameSchema = z.object({
  words: z.array(wordEntrySchema).min(LIMITS.words.min).max(LIMITS.words.max),
  settings: settingsSchema.default({ correctGuessPoints: 2, maxPlayers: LIMITS.maxPlayersDefault }),
});

export const joinSchema = z.object({
  name: cleaned(LIMITS.name.min, LIMITS.name.max, 'Name'),
});

export const codeSchema = z
  .string()
  .transform((s) => s.trim().toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{4}$/, 'Code must be 4 letters'));

const playerIdSchema = z.string().min(1).max(32);
const optionIdSchema = z.string().min(1).max(32);

/** Every client action except JOIN (which has its own endpoint). */
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('HEARTBEAT') }),
  z.object({ type: z.literal('START') }),
  z.object({ type: z.literal('SUBMIT'), text: z.string().max(LIMITS.submission.max * 4) }),
  z.object({ type: z.literal('STOP_WAITING') }),
  z.object({
    type: z.literal('SET_MARKED'),
    playerIds: z.array(playerIdSchema).max(LIMITS.maxPlayersCap),
  }),
  z.object({ type: z.literal('OPEN_VOTING') }),
  z.object({ type: z.literal('VOTE'), optionId: optionIdSchema }),
  z.object({ type: z.literal('REVEAL_NOW') }),
  z.object({ type: z.literal('SHOW_SCOREBOARD') }),
  z.object({ type: z.literal('NEXT_ROUND') }),
  z.object({ type: z.literal('KICK'), playerId: playerIdSchema }),
  z.object({ type: z.literal('RENAME'), name: z.string().max(LIMITS.name.max * 4) }),
  z.object({ type: z.literal('END_GAME') }),
]);

export type ClientAction = z.infer<typeof actionSchema>;
export type CreateGameInput = z.infer<typeof createGameSchema>;
