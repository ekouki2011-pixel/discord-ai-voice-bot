import { describe,it,expect,vi } from 'vitest';
import { Store } from '../src/db.js';
import { readConfig } from '../src/config.js';
import { Engines } from '../src/engines/index.js';
import { SpeechService } from '../src/service.js';
import { AppError } from '../src/types.js';
import { audio,deferred,engine,tick } from './fixtures.js';
function setup(){
  const config=readConfig({ENGINE_TERMS_ACCEPTED:'voicevox,saydi',GLOBAL_DAILY_CLOUD_CHARS:'20'});const db=new Store(':memory:');
  const vv=engine();const saydi=engine('saydi');const providers=new Engines(config,[vv,saydi]);
  for(const id of ['voicevox','saydi'] as const){db.syncVoices(id,[{engine:id,id:'1',name:'test',status:'ready'}]);db.approve('g',id,'1','owner');}
  const g=db.guild('g');g.defaults.voiceId='1';g.allowedEngines=['voicevox','saydi'];db.saveGuild('g',g);
  const play=vi.fn(async()=>{});const notify=vi.fn(async()=>{});const failed=vi.fn(async()=>{});const canDeliver=vi.fn(()=>true);
  const service=new SpeechService(db,providers,config,{play},notify,failed,canDeliver);
  const send=(text='こんにちは',userId='u',source:'say'|'auto'='say')=>service.enqueue({guildId:'g',userId,channelId:'c',text,source});
  return {db,g,vv,saydi,service,play,notify,failed,send,canDeliver};
}
describe('speech admission, policy and fallback',()=>{
  it('uses each author’s settings and the guild default for unconfigured users',async()=>{
    const s=setup();try{
      const seen:string[]=[];s.vv.synthesize=async()=>{seen.push('voicevox');return audio;};s.saydi.synthesize=async()=>{seen.push('saydi');return audio;};
      s.db.saveUser('g','A',{...s.g.defaults,engine:'saydi'});s.send('一','A');s.send('二','B');await s.service.queues.drained('g');expect(seen).toEqual(['saydi','voicevox']);
    }finally{s.db.close();}
  });
  it('never silently falls back when the user did not permit a different voice',async()=>{
    const s=setup();try{s.g.fallbackVoiceId='1';s.db.saveGuild('g',s.g);s.db.saveUser('g','u',{...s.g.defaults,engine:'saydi'});s.saydi.synthesize=async()=>{throw new AppError('API_HTTP_503','offline',503);};const fallback=vi.fn(async()=>audio);s.vv.synthesize=fallback;s.send();await s.service.queues.drained('g');expect(fallback).not.toHaveBeenCalled();expect(s.failed).toHaveBeenCalledTimes(1);}finally{s.db.close();}
  });
  it('uses only an approved fallback with individual consent and notifies before the new voice',async()=>{
    const s=setup();try{s.g.fallbackVoiceId='1';s.db.saveGuild('g',s.g);s.db.saveUser('g','u',{...s.g.defaults,engine:'saydi',allowFallback:true});s.saydi.synthesize=async()=>{throw new AppError('API_HTTP_503','offline',503);};const events:string[]=[];s.notify.mockImplementation(async()=>{events.push('notice');});s.vv.synthesize=async()=>{events.push('fallback');return audio;};s.send();await s.service.queues.drained('g');expect(events).toEqual(['notice','fallback']);expect(s.play).toHaveBeenCalledTimes(1);}finally{s.db.close();}
  });
  it('rejects unapproved voices, disabled engines, and paused servers before spending',()=>{
    const s=setup();try{s.db.revoke('g','voicevox','1');expect(()=>s.send()).toThrow('VOICE_UNAPPROVED');expect(s.db.usage('guild:g')).toBe(0);s.g.paused=true;s.db.saveGuild('g',s.g);expect(()=>s.send()).toThrow('PAUSED');}finally{s.db.close();}
  });
  it('rechecks pending work after automatic reading is disabled',async()=>{
    const s=setup();try{
      const gate=deferred<typeof audio>();s.vv.synthesize=async()=>gate.promise;s.g.autoEnabled=true;s.g.readChannelId='c';s.db.saveGuild('g',s.g);
      s.send('first');s.send('second','u','auto');await tick();s.g.autoEnabled=false;s.db.saveGuild('g',s.g);gate.resolve(audio);await s.service.queues.drained('g');expect(s.play).toHaveBeenCalledTimes(1);expect(s.failed).toHaveBeenCalledTimes(1);
    }finally{s.db.close();}
  });
  it('does not call a paid service when the global daily character budget is exhausted',async()=>{
    const s=setup();try{s.db.saveUser('g','u',{...s.g.defaults,engine:'saydi'});s.db.consume([{scope:'cloud:all',chars:20,limit:20}]);const synth=vi.fn(async()=>audio);s.saydi.synthesize=synth;s.send();await s.service.queues.drained('g');expect(synth).not.toHaveBeenCalled();expect(s.failed).toHaveBeenCalledTimes(1);expect(s.db.usage('guild:g')).toBe(0);}finally{s.db.close();}
  });
  it('discards work when the author no longer has access to the VC',async()=>{
    const s=setup();try{s.canDeliver.mockReturnValue(false);const synth=vi.fn(async()=>audio);s.vv.synthesize=synth;s.send();await s.service.queues.drained('g');expect(synth).not.toHaveBeenCalled();expect(s.play).not.toHaveBeenCalled();}finally{s.db.close();}
  });
  it('rechecks VC permission after a slow synthesis before playing the result',async()=>{
    const s=setup();try{const gate=deferred<typeof audio>();s.vv.synthesize=async()=>gate.promise;s.send();await tick();s.canDeliver.mockReturnValue(false);gate.resolve(audio);await s.service.queues.drained('g');expect(s.play).not.toHaveBeenCalled();expect(s.failed).toHaveBeenCalledTimes(1);}finally{s.db.close();}
  });
});
