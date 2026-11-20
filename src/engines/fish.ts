import { z } from 'zod';
import { AppError, type Engine, type SpeechRequest, type Voice } from '../types.js';
import { Http, audioResult, requireKey } from './http.js';
const pageSchema=z.object({items:z.array(z.object({_id:z.string(),title:z.string(),state:z.string().optional()})),total:z.number(),has_more:z.boolean().nullable().optional()});
export class FishEngine implements Engine {
  readonly id='fish' as const;
  get configured(){return !!this.key;}
  readonly capabilities={speed:[0.5,2] as [number,number],pitch:false};
  constructor(private key: string, private http: Http, private model='s2.1-pro-free', private base='https://api.fish.audio'){}
  private headers(){requireKey(this.key,'Fish Audio');return {Authorization:`Bearer ${this.key}`};}
  async listVoices(signal?: AbortSignal): Promise<Voice[]> {
    const voices: Voice[]=[];
    for(let page=1;page<=100;page++){
      // Only fetch the active workspace's models, not arbitrary community clones.
      const data=pageSchema.safeParse(await this.http.json(`${this.base}/model?self=true&page_size=100&page_number=${page}`,{headers:this.headers(),signal}));
      if(!data.success)throw new AppError('FISH_SCHEMA','Fish Audioのモデル一覧形式を確認できませんでした。');
      voices.push(...data.data.items.map(v=>({engine:this.id,id:v._id,name:v.title,
        status:!v.state||['created','trained','ready'].includes(v.state)?'ready':v.state})));
      if(data.data.has_more===false||voices.length>=data.data.total||!data.data.items.length)return voices;
    }
    throw new AppError('VOICE_LIST_LIMIT','モデルが多すぎるため同期できませんでした。');
  }
  async synthesize({text,settings,signal}: SpeechRequest) {
    return audioResult(await this.http.request(`${this.base}/v1/tts`,{
      method:'POST',headers:{...this.headers(),'Content-Type':'application/json',model:this.model},signal,
      body:JSON.stringify({text,reference_id:settings.voiceId,format:'mp3',language:'ja',prosody:{speed:settings.speed,volume:0}}),
    }),'mp3');
  }
}
