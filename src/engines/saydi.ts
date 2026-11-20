import { z } from 'zod';
import { AppError, type Engine, type Voice, type SpeechRequest } from '../types.js';
import { Http, audioResult, parseJson, requireKey } from './http.js';

const row = z.object({id:z.string(),name:z.string(),status:z.string()});
export class SaydiEngine implements Engine {
  readonly id='saydi' as const;
  readonly capabilities={speed:[0.25,4] as [number,number],pitch:false};
  get configured() { return !!this.key; }
  constructor(private key: string, private http: Http, private base='https://voice.saydi.ai/api') {}
  private headers() { requireKey(this.key,'SaydiVoice'); return {Authorization:`Bearer ${this.key}`}; }
  async listVoices(signal?: AbortSignal): Promise<Voice[]> {
    const data=await this.http.json(`${this.base}/v1/voices`,{headers:this.headers(),signal});
    // Official native list has appeared as voices/data envelopes; accept a bare list too.
    const envelope=z.union([z.array(row),z.object({voices:z.array(row)}),z.object({data:z.array(row)})]).safeParse(data);
    if (!envelope.success) throw new AppError('SAYDI_SCHEMA','SaydiVoiceの音声一覧形式を確認できませんでした。');
    const value=envelope.data; const rows=Array.isArray(value)?value:'voices' in value?value.voices:value.data;
    return rows.map(v=>({engine:this.id,id:v.id,name:v.name,status:v.status}));
  }
  async getVoice(id: string, signal?: AbortSignal): Promise<Voice> {
    const value=row.safeParse(await this.http.json(`${this.base}/v1/voices/${encodeURIComponent(id)}`,{headers:this.headers(),signal}));
    if (!value.success) throw new AppError('SAYDI_SCHEMA','SaydiVoiceの音声状態を確認できませんでした。');
    return {engine:this.id,...value.data};
  }
  async findMyVoice(name='私の声1', signal?: AbortSignal): Promise<Voice> {
    const matches=(await this.listVoices(signal)).filter(v=>v.name===name);
    if (!matches.length) throw new AppError('SAYDI_VOICE_NOT_FOUND',`「${name}」がAPIの音声一覧にありません。同じアカウントのAPIキーか確認してください。`);
    if (matches.length!==1) throw new AppError('SAYDI_VOICE_AMBIGUOUS','同名の音声が複数あります。表示されたIDで選択してください。');
    const voice=await this.getVoice(matches[0]!.id,signal);
    if (voice.status!=='ready') throw new AppError('SAYDI_VOICE_NOT_READY','保存済み音声はまだ利用可能な状態ではありません。再作成せず、状態を確認してください。');
    return voice;
  }
  async synthesize({text,settings,signal}: SpeechRequest) {
    const result=await this.http.request(`${this.base}/v1/audio/speech`,{
      method:'POST',headers:{...this.headers(),'Content-Type':'application/json'},signal,
      body:JSON.stringify({model:'tts-1',voice:settings.voiceId,input:text,response_format:'mp3',speed:settings.speed}),
    },{retryServer:true});
    if (result.headers.get('content-type')?.includes('json')) { parseJson(result); throw new AppError('SAYDI_JSON_ERROR','SaydiVoiceが音声ではなくエラーJSONを返しました。'); }
    const actual=result.headers.get('x-ov-voice');
    if (actual && actual!==settings.voiceId || result.headers.get('x-ov-voice-source')==='openai-alias-default')
      throw new AppError('SAYDI_VOICE_MISMATCH','指定した声と異なる音声が返されたため、再生を中止しました。');
    return audioResult(result,'mp3');
  }
}
