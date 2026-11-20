import { z } from 'zod';
import { AppError, type Engine, type SpeechRequest, type Voice } from '../types.js';
import { Http, audioResult, requireKey } from './http.js';
const pageSchema=z.object({voices:z.array(z.object({voice_id:z.string(),name:z.string()})),has_more:z.boolean(),next_page_token:z.string().nullable().optional()});
export class ElevenLabsEngine implements Engine {
  readonly id='elevenlabs' as const;
  get configured() { return !!this.key; }
  get capabilities() { return {speed: ['eleven_multilingual_v2','eleven_turbo_v2_5','eleven_flash_v2_5'].includes(this.model) ? [0.7,1.2] as [number,number] : null,pitch:false}; }
  constructor(private key: string, private http: Http, private model='eleven_multilingual_v2', private base='https://api.elevenlabs.io') {}
  private headers() { requireKey(this.key,'ElevenLabs'); return {'xi-api-key':this.key}; }
  async listVoices(signal?: AbortSignal): Promise<Voice[]> {
    const voices: Voice[]=[]; let next=''; const seen=new Set<string>();
    for (let page=0;page<100;page++) {
      const url=new URL(`${this.base}/v2/voices`);url.searchParams.set('page_size','100');if(next)url.searchParams.set('next_page_token',next);
      const parsed=pageSchema.safeParse(await this.http.json(url,{headers:this.headers(),signal}));
      if(!parsed.success)throw new AppError('ELEVENLABS_SCHEMA','ElevenLabsの音声一覧形式を確認できませんでした。');
      voices.push(...parsed.data.voices.map(v=>({engine:this.id,id:v.voice_id,name:v.name,status:'ready'})));
      if(!parsed.data.has_more)return voices;
      const token=parsed.data.next_page_token;
      if(!token||seen.has(token))throw new AppError('PAGINATION','音声一覧のページ情報が不正です。');
      next=token;seen.add(token);
    }
    throw new AppError('VOICE_LIST_LIMIT','音声が多すぎるため一覧を同期できませんでした。');
  }
  async synthesize({text,settings,signal}: SpeechRequest) {
    const controls=this.capabilities.speed ? {speed:settings.speed} : undefined;
    return audioResult(await this.http.request(`${this.base}/v1/text-to-speech/${encodeURIComponent(settings.voiceId)}?output_format=mp3_44100_128`,{
      method:'POST',headers:{...this.headers(),'Content-Type':'application/json'},signal,
      body:JSON.stringify({text,model_id:this.model,voice_settings:controls}),
    }),'mp3');
  }
  async usage(signal?: AbortSignal) {
    const data=z.object({tier:z.string(),character_count:z.number(),character_limit:z.number(),currency:z.string().nullable().optional(),next_invoice:z.object({amount_due_cents:z.number()}).nullable().optional()})
      .safeParse(await this.http.json(`${this.base}/v1/user/subscription`,{headers:this.headers(),signal}));
    if(!data.success)throw new AppError('ELEVENLABS_USAGE','ElevenLabsの利用量を確認できませんでした。');
    return {plan:data.data.tier,used:data.data.character_count,limit:data.data.character_limit,
      nextInvoiceMinorUnits:data.data.next_invoice?.amount_due_cents??null,currency:data.data.currency??null};
  }
}
