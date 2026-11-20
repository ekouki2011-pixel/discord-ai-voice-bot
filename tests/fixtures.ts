import { voiceSettings, type Audio, type Engine, type EngineId, type SpeechRequest } from '../src/types.js';
import { Http } from '../src/engines/http.js';
import { vi } from 'vitest';
export const wav=Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WAVEfmt '),Buffer.alloc(40)]);
export const audio:Audio={bytes:wav,extension:'wav'};
export const settings=voiceSettings.parse({voiceId:'1'});
export const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
export function deferred<T>(){let resolve!:(value:T)=>void;let reject!:(value:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
export function engine(id:EngineId='voicevox',synthesize: (r:SpeechRequest)=>Promise<Audio>=async()=>audio):Engine{
  return {id,configured:true,capabilities:{speed:[0.5,2],pitch:id==='voicevox'},listVoices:async()=>[{engine:id,id:'1',name:'許可されたテスト音声',status:'ready'}],synthesize};
}
export function mockHttp(responses:Response[]){
  const fetcher=vi.fn<typeof fetch>();for(const response of responses)fetcher.mockResolvedValueOnce(response);
  const sleep=vi.fn(async(_ms:number,_signal?:AbortSignal)=>{});return {http:new Http(20000,20000000,fetcher,sleep),fetcher,sleep};
}
export function json(value:unknown,status=200,headers:Record<string,string>={}){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json',...headers}});}
export function sound(headers:Record<string,string>={}){return new Response(wav,{headers:{'Content-Type':'audio/wav',...headers}});}
