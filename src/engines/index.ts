import type { Config } from '../config.js';
import { acceptedEngines } from '../config.js';
import { AppError, type Engine, type EngineId, type VoiceSettings } from '../types.js';
import { Http } from './http.js';
import { SaydiEngine } from './saydi.js';
import { VoicevoxEngine } from './voicevox.js';
import { ElevenLabsEngine } from './elevenlabs.js';
import { FishEngine } from './fish.js';
export class Engines {
  readonly items: Map<EngineId,Engine>;
  constructor(readonly config: Config, engines?: Engine[]) {
    const http=new Http(config.API_TIMEOUT_MS,config.MAX_AUDIO_BYTES);
    this.items=new Map((engines??[
      new SaydiEngine(config.SAYDI_API_KEY,http),new VoicevoxEngine(config.VOICEVOX_URL,http),
      new ElevenLabsEngine(config.ELEVENLABS_API_KEY,http,config.ELEVENLABS_MODEL),
      new FishEngine(config.FISH_API_KEY,http,config.FISH_MODEL),
    ]).map(e=>[e.id,e]));
  }
  get(id: EngineId): Engine {
    const engine=this.items.get(id);if(!engine)throw new AppError('ENGINE_UNKNOWN','音声エンジンが見つかりません。');return engine;
  }
  requireAvailable(id: EngineId): Engine {
    const engine=this.get(id);
    if(!engine.configured)throw new AppError('AUTH_PENDING',`${id}は認証待ちです。APIキーを安全に設定してください。`);
    if(!acceptedEngines(this.config).has(id))throw new AppError('TERMS_PENDING',`${id}は利用条件確認待ちです。運用者の年齢・プラン・音声利用条件を確認してください。`);
    return engine;
  }
  validate(settings: VoiceSettings): void {
    const {capabilities}=this.requireAvailable(settings.engine);
    if(settings.pitch!==0&&!capabilities.pitch)throw new AppError('PITCH_UNSUPPORTED','このエンジンは音声の高さ調整に対応していません。');
    if(!capabilities.speed&&settings.speed!==1)throw new AppError('SPEED_UNSUPPORTED','このモデルは速度調整に対応していません。速度1で使用してください。');
    if(capabilities.speed&&(settings.speed<capabilities.speed[0]||settings.speed>capabilities.speed[1]))
      throw new AppError('SPEED_RANGE',`このエンジンの速度範囲は${capabilities.speed.join('〜')}です。`);
  }
  states(): string[] {return [...this.items.values()].map(e=>`${e.id}: ${!e.configured?'認証待ち':!acceptedEngines(this.config).has(e.id)?'利用条件確認待ち':'設定済み（実接続は /voice sync で確認）'}`);}
}
