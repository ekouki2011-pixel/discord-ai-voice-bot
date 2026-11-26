import 'dotenv/config';
import { z } from 'zod';
import { engineId } from './types.js';

const booleanEnv = z.enum(['true', 'false']).default('false').transform(x => x === 'true');
const schema = z.object({
  DISCORD_TOKEN: z.string().default(''), DISCORD_CLIENT_ID: z.string().default(''),
  DISCORD_GUILD_ID: z.string().default(''), MESSAGE_CONTENT_ENABLED: booleanEnv,
  DATABASE_PATH: z.string().default('data/bot.sqlite'),
  TEMP_DIR: z.string().default('tmp'), FFMPEG_PATH: z.string().default('ffmpeg'),
  HEALTH_HOST: z.string().default('127.0.0.1'), HEALTH_PORT: z.coerce.number().int().min(0).max(65535).default(8080),
  GPT_SOVITS_URL: z.string().default('https://pope-polymer-restructuring-sizes.trycloudflare.com'),
  GPT_SOVITS_REF_AUDIO_PATH: z.string().trim().min(1).default('/content/GPT-SoVITS/ref.wav'),
  GPT_SOVITS_PROMPT_TEXT: z.string().trim().default(''),
  VOICEVOX_URL: z.url().default('http://127.0.0.1:50021'),
  SAYDI_API_KEY: z.string().default(''),
  ELEVENLABS_API_KEY: z.string().default(''), ELEVENLABS_MODEL: z.string().default('eleven_multilingual_v2'),
  FISH_API_KEY: z.string().default(''), FISH_MODEL: z.string().default('s2.1-pro-free'),
  ENGINE_TERMS_ACCEPTED: z.string().default(''),
  GLOBAL_DAILY_CLOUD_CHARS: z.coerce.number().int().min(0).default(20000),
  API_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600000).default(180000),
  MAX_AUDIO_BYTES: z.coerce.number().int().min(1024).max(100000000).default(20000000),
  MAX_SYNTH_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(2),
  LOG_LEVEL: z.enum(['debug','info','warn','error','silent']).default('info'),
});
export type Config = z.infer<typeof schema>;
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = schema.safeParse({ ...env, HEALTH_PORT: env.PORT ?? env.HEALTH_PORT });
  if (!result.success) throw new Error('環境変数の形式が不正です: ' + result.error.issues.map(x => x.path.join('.')).join(', '));
  for (const value of result.data.ENGINE_TERMS_ACCEPTED.split(',').filter(Boolean)) engineId.parse(value.trim());
  return result.data;
}
export function acceptedEngines(config: Config): Set<string> {
  return new Set(config.ENGINE_TERMS_ACCEPTED.split(',').map(x => x.trim()).filter(Boolean));
}
