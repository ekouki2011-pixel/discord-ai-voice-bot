import { createServer } from 'node:http';
import { once } from 'node:events';
import { describe,it,expect,vi } from 'vitest';
import { Http,audioResult,retryAfterMs } from '../src/engines/http.js';
import { SaydiEngine } from '../src/engines/saydi.js';
import { VoicevoxEngine } from '../src/engines/voicevox.js';
import { ElevenLabsEngine } from '../src/engines/elevenlabs.js';
import { FishEngine } from '../src/engines/fish.js';
import { json,mockHttp,settings,sound,wav } from './fixtures.js';
const request={text:'こんにちは',settings,signal:new AbortController().signal};
describe('bounded and safe HTTP handling',()=>{
  it('honors Retry-After before retrying a 429',async()=>{
    const {http,fetcher,sleep}=mockHttp([json({error:{code:'rate_limit_exceeded'}},429,{'Retry-After':'3'}),sound()]);
    await http.request('https://api.test',{method:'POST'});expect(fetcher).toHaveBeenCalledTimes(2);expect(sleep.mock.calls[0]?.[0]).toBe(3000);
  });
  it('handles HTTP-date Retry-After and never retries before an excessive delay',async()=>{
    expect(retryAfterMs('Wed, 21 Oct 2015 07:28:00 GMT',Date.parse('Wed, 21 Oct 2015 07:27:57 GMT'))).toBe(3000);
    const {http,sleep}=mockHttp([json({},429,{'Retry-After':'99999'})]);await expect(http.request('https://api.test')).rejects.toMatchObject({status:429});expect(sleep).not.toHaveBeenCalled();
  });
  it.each([401,403,402,422])('does not retry an HTTP %s or expose echoed text',async status=>{
    const {http,fetcher}=mockHttp([json({detail:'secret text and api key'},status)]);await expect(http.request('https://api.test')).rejects.not.toThrow('secret');expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not repeatedly send exhausted quota or unknown paid POST failures',async()=>{
    const a=mockHttp([json({error:{code:'insufficient_quota'}},429)]);await expect(a.http.request('https://api.test',{method:'POST'})).rejects.toMatchObject({code:'API_QUOTA'});expect(a.fetcher).toHaveBeenCalledTimes(1);
    const b=mockHttp([json({},503)]);await expect(b.http.request('https://api.test',{method:'POST'})).rejects.toMatchObject({status:503});expect(b.fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects JSON/HTML masquerading as audio and bounded streaming overflow',async()=>{
    expect(()=>audioResult({bytes:Buffer.from('{"error":1}'),headers:new Headers({'Content-Type':'audio/mpeg'}),status:200},'mp3')).toThrow('INVALID_AUDIO');
    expect(()=>audioResult({bytes:Buffer.from('<html>fail'),headers:new Headers({'Content-Type':'audio/mpeg'}),status:200},'mp3')).toThrow('INVALID_AUDIO');
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response(Buffer.alloc(101)));
    await expect(new Http(1000,100,fetcher).request('https://api.test')).rejects.toMatchObject({code:'AUDIO_TOO_LARGE'});
  });
  it('can cancel a request during Retry-After',async()=>{
    const abort=new AbortController();const fetcher=vi.fn<typeof fetch>().mockResolvedValue(json({},429,{'Retry-After':'10'}));
    const pending=new Http(20000,1024,fetcher).request('https://api.test',{signal:abort.signal});abort.abort();await expect(pending).rejects.toThrow();expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
describe('provider contracts (mock responses, not account integration)',()=>{
  it('finds the existing 私の声1 ID and checks ready using GET only',async()=>{
    const data={id:'vc_saved',name:'私の声1',status:'ready'};const {http,fetcher}=mockHttp([json({voices:[data]}),json(data)]);
    expect((await new SaydiEngine('test-key',http).findMyVoice()).id).toBe('vc_saved');
    expect(fetcher.mock.calls.every(([,init])=>!init?.method||init.method==='GET')).toBe(true);
    expect(String(fetcher.mock.calls[0]?.[0])).toBe('https://voice.saydi.ai/api/v1/voices');
  });
  it.each(['processing','failed'])('does not report a %s voice as usable',async status=>{
    const data={id:'vc_saved',name:'私の声1',status};const {http}=mockHttp([json({voices:[data]}),json(data)]);await expect(new SaydiEngine('test',http).findMyVoice()).rejects.toMatchObject({code:'SAYDI_VOICE_NOT_READY'});
  });
  it('rejects ambiguous duplicate names and missing keys',async()=>{
    const v={id:'a',name:'私の声1',status:'ready'};const {http,fetcher}=mockHttp([json({data:[v,{...v,id:'b'}]})]);await expect(new SaydiEngine('test',http).findMyVoice()).rejects.toMatchObject({code:'SAYDI_VOICE_AMBIGUOUS'});
    await expect(new SaydiEngine('',http).listVoices()).rejects.toMatchObject({code:'AUTH_PENDING'});expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('sends Saydi speech fields and rejects silent voice substitution',async()=>{
    const a=mockHttp([sound({'x-ov-voice':'1'})]);await new SaydiEngine('test',a.http).synthesize(request);
    const init=a.fetcher.mock.calls[0]?.[1];expect(JSON.parse(String(init?.body))).toMatchObject({model:'tts-1',voice:'1',input:'こんにちは',speed:1});
    const b=mockHttp([sound({'x-ov-voice':'vi-adam'})]);await expect(new SaydiEngine('test',b.http).synthesize(request)).rejects.toMatchObject({code:'SAYDI_VOICE_MISMATCH'});
  });
  it('VOICEVOX uses style ID, speaker credit, native pitch/speed and single playback volume',async()=>{
    const {http,fetcher}=mockHttp([json([{name:'テスト話者',speaker_uuid:'uuid',styles:[{id:1,name:'ノーマル',type:'talk'},{id:2,name:'歌',type:'sing'}]}]),json({accent_phrases:[]}),sound()]);
    const vv=new VoicevoxEngine('http://voicevox:50021',http);const list=await vv.listVoices();expect(list).toHaveLength(1);expect(list[0]?.credit).toBe('VOICEVOX:テスト話者');
    await vv.synthesize({...request,settings:{...settings,speed:1.5,pitch:0.1,volume:0.2}});
    expect(String(fetcher.mock.calls[1]?.[0])).toContain('speaker=1');expect(JSON.parse(String(fetcher.mock.calls[2]?.[1]?.body))).toMatchObject({speedScale:1.5,pitchScale:0.1,volumeScale:1});
  });
  it('includes VOICEVOX 0.26 streaming_talk styles in speech selection',async()=>{
    const {http}=mockHttp([json([{name:'ずんだもん',speaker_uuid:'uuid',styles:[{id:3,name:'ノーマル',type:'streaming_talk'}]}])]);
    const voices=await new VoicevoxEngine('http://voicevox:50021',http).listVoices();expect(voices[0]?.id).toBe('3');
  });
  it('paginates ElevenLabs v2 voices and gets usage without changing billing',async()=>{
    const {http,fetcher}=mockHttp([json({voices:[{voice_id:'a',name:'A'}],has_more:true,next_page_token:'next'}),json({voices:[{voice_id:'b',name:'B'}],has_more:false}),json({tier:'free',character_count:10,character_limit:100})]);
    const eleven=new ElevenLabsEngine('test',http);expect(await eleven.listVoices()).toHaveLength(2);expect(String(fetcher.mock.calls[1]?.[0])).toContain('next_page_token=next');expect((await eleven.usage()).used).toBe(10);
    expect(new ElevenLabsEngine('test',http,'eleven_v4').capabilities.speed).toBeNull();
  });
  it('generates ElevenLabs Japanese with an explicit compatible model',async()=>{
    const {http,fetcher}=mockHttp([sound()]);await new ElevenLabsEngine('test',http).synthesize(request);expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({text:'こんにちは',model_id:'eleven_multilingual_v2',voice_settings:{speed:1}});
  });
  it('Fish uses workspace-owned models, existing reference_id and JSON TTS',async()=>{
    const {http,fetcher}=mockHttp([json({items:[{_id:'saved',title:'保存音声',state:'trained'}],total:1}),sound()]);const fish=new FishEngine('test',http);
    expect((await fish.listVoices())[0]?.id).toBe('saved');await fish.synthesize({...request,settings:{...settings,voiceId:'saved'}});
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('self=true');expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toMatchObject({reference_id:'saved',text:'こんにちは'});
  });
});
describe('local HTTP transport integration (fixture server)',()=>{
  it('sends authenticated JSON and receives bounded binary audio over real HTTP',async()=>{
    let received='';const server=createServer((req,res)=>{req.on('data',chunk=>{received+=chunk.toString();});req.on('end',()=>{expect(req.headers.authorization).toBe('Bearer test');res.writeHead(200,{'Content-Type':'audio/wav'});res.end(wav);});});
    server.listen(0,'127.0.0.1');await once(server,'listening');
    try{const addr=server.address();if(!addr||typeof addr==='string')throw new Error('address');
      const result=await new Http(3000).request(`http://127.0.0.1:${addr.port}/speech`,{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({input:'こんにちは'})});expect(result.bytes).toEqual(wav);expect(JSON.parse(received)).toEqual({input:'こんにちは'});
    }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
  });
});
