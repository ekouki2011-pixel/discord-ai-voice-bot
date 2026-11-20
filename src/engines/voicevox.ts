import { z } from 'zod';
import { AppError, type Engine, type SpeechRequest, type Voice } from '../types.js';
import { Http, audioResult } from './http.js';
const speakers=z.array(z.object({name:z.string(),speaker_uuid:z.string(),styles:z.array(z.object({id:z.number().int(),name:z.string(),type:z.string().optional()}))}));
export class VoicevoxEngine implements Engine {
  readonly id='voicevox' as const; readonly configured=true;
  readonly capabilities={speed:[0.5,2] as [number,number],pitch:true};
  constructor(private base: string, private http: Http) { this.base=base.replace(/\/$/,''); }
  async listVoices(signal?: AbortSignal): Promise<Voice[]> {
    const result=speakers.safeParse(await this.http.json(`${this.base}/speakers`,{signal}));
    if (!result.success) throw new AppError('VOICEVOX_SCHEMA','VOICEVOXの話者一覧形式を確認できませんでした。');
    return result.data.flatMap(s=>s.styles.filter(t=>!t.type || t.type==='talk' || t.type==='streaming_talk').map(t=>({
      engine:this.id,id:String(t.id),name:`${s.name}（${t.name}）`,status:'ready',
      credit:`VOICEVOX:${s.name}`,licenseUrl:'https://voicevox.hiroshiba.jp/term/',
    })));
  }
  async synthesize({text,settings,signal}: SpeechRequest) {
    if (!/^\d+$/.test(settings.voiceId)) throw new AppError('VOICEVOX_STYLE','VOICEVOXのスタイルIDが不正です。');
    const queryUrl=new URL(`${this.base}/audio_query`);
    queryUrl.searchParams.set('text',text); queryUrl.searchParams.set('speaker',settings.voiceId);
    const parsed=z.record(z.string(),z.unknown()).safeParse(await this.http.json(queryUrl,{method:'POST',signal}));
    if (!parsed.success) throw new AppError('VOICEVOX_QUERY','VOICEVOXの音声クエリが不正です。');
    const result=await this.http.request(`${this.base}/synthesis?speaker=${settings.voiceId}`,{
      method:'POST',headers:{'Content-Type':'application/json'},signal,
      body:JSON.stringify({...parsed.data,speedScale:settings.speed,pitchScale:settings.pitch,
        volumeScale:1,outputSamplingRate:48000,outputStereo:true}),
    });
    // Volume is applied once by the Discord player, consistently across all engines.
    return audioResult(result,'wav');
  }
}
