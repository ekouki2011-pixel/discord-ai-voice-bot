import { z } from 'zod';

export const engineId = z.enum(['saydi', 'voicevox', 'elevenlabs', 'fish']);
export type EngineId = z.infer<typeof engineId>;
export const voiceSettings = z.object({
  engine: engineId.default('voicevox'), voiceId: z.string().max(200).default(''),
  speed: z.number().min(0.25).max(4).default(1),
  pitch: z.number().min(-0.15).max(0.15).default(0),
  volume: z.number().min(0).max(1).default(0.7),
  allowFallback: z.boolean().default(false),
});
export type VoiceSettings = z.infer<typeof voiceSettings>;
export const guildSettings = z.object({
  defaults: voiceSettings.default(() => voiceSettings.parse({})),
  allowedEngines: z.array(engineId).min(1).default(['voicevox']),
  readChannelId: z.string().nullable().default(null),
  autoEnabled: z.boolean().default(false), paused: z.boolean().default(false),
  maxChars: z.number().int().min(1).max(2000).default(500),
  perUserPerMinute: z.number().int().min(1).max(30).default(6),
  perGuildPerMinute: z.number().int().min(1).max(120).default(30),
  maxQueue: z.number().int().min(1).max(100).default(30),
  idleSeconds: z.number().int().min(15).max(3600).default(60),
  dailyChars: z.number().int().min(100).max(1000000).default(20000),
  userDailyChars: z.number().int().min(100).max(100000).default(5000),
  fallbackVoiceId: z.string().max(200).default(''),
});
export type GuildSettings = z.infer<typeof guildSettings>;
export interface Voice {
  engine: EngineId; id: string; name: string; status: string;
  credit?: string; licenseUrl?: string;
}
export interface Audio { bytes: Buffer; extension: 'mp3' | 'wav'; }
export interface SpeechRequest { text: string; settings: VoiceSettings; signal: AbortSignal; }
export interface Engine {
  id: EngineId;
  configured: boolean;
  capabilities: {speed: [number, number] | null; pitch: boolean};
  listVoices(signal?: AbortSignal): Promise<Voice[]>;
  synthesize(request: SpeechRequest): Promise<Audio>;
  usage?(signal?: AbortSignal): Promise<Record<string, string | number | null>>;
}
export class AppError extends Error {
  constructor(public code: string, public userMessage: string, public status?: number) {
    super(code); this.name = 'AppError';
  }
}
export function publicError(error: unknown): string {
  return error instanceof AppError ? error.userMessage : '処理に失敗しました。管理者はログのエラーコードを確認してください。';
}
export function errorCode(error: unknown): string {
  if (error instanceof AppError) return error.code;
  if (error instanceof Error && error.name === 'AbortError') return 'ABORTED';
  return 'INTERNAL_ERROR';
}
