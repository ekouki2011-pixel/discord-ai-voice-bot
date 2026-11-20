import { describe,it,expect,vi } from 'vitest';
import { Queues, Semaphore, type Job } from '../src/queue.js';
import { audio,deferred,settings,tick } from './fixtures.js';
const job=(text:string,guildId='g'):Omit<Job,'id'>=>({guildId,userId:'u',channelId:'c',text,settings,source:'say'});
describe('FIFO generation and playback',()=>{
  it('preserves arrival order through a slow first generation and never overlaps playback',async()=>{
    const first=deferred<typeof audio>();const playing=deferred<void>();const events:string[]=[];
    const synth=vi.fn(async(j:Job)=>{events.push(`synth:${j.text}`);return j.text==='1'?first.promise:audio;});
    const player={play:vi.fn(async()=>{events.push('play');if(player.play.mock.calls.length===1)await playing.promise;events.push('end');})};
    const q=new Queues(synth,player,vi.fn());q.add(job('1'),10);q.add(job('2'),10);
    expect(synth).toHaveBeenCalledTimes(1);first.resolve(audio);await tick();expect(events).toEqual(['synth:1','play']);
    playing.resolve();await q.drained('g');expect(events).toEqual(['synth:1','play','end','synth:2','play','end']);
  });
  it('skip cancels synthesis and never plays a late response',async()=>{
    const gate=deferred<typeof audio>();const player={play:vi.fn(async()=>{})};
    const q=new Queues(async j=>j.text==='1'?gate.promise:audio,player,vi.fn());q.add(job('1'),10);q.add(job('2'),10);
    expect(q.skip('g')).toBe(true);gate.resolve(audio);await q.drained('g');expect(player.play).toHaveBeenCalledTimes(1);
  });
  it('stop aborts current playback, clears pending work and accepts new work',async()=>{
    const texts:string[]=[];let calls=0;
    const player={play:vi.fn(async(_g,_a,_v,signal:AbortSignal)=>{if(++calls===1)await new Promise<void>((_res,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));})};
    const q=new Queues(async j=>{texts.push(j.text);return audio;},player,vi.fn());
    q.add(job('a'),10);q.add(job('b'),10);await tick();expect(q.stop('g')).toBe(2);q.add(job('c'),10);await q.drained('g');expect(texts).toEqual(['a','c']);
  });
  it('recovers after an engine failure and a failed notification',async()=>{
    const player={play:vi.fn(async()=>{})};const failed=vi.fn(async()=>{throw new Error('no send permission');});
    const q=new Queues(async j=>{if(j.text==='bad')throw new Error('upstream');return audio;},player,failed);
    q.add(job('bad'),10);q.add(job('good'),10);await q.drained('g');expect(failed).toHaveBeenCalledTimes(1);expect(player.play).toHaveBeenCalledTimes(1);
  });
  it('includes generating and playing jobs in queue limit and omits text from inspection',async()=>{
    const gate=deferred<typeof audio>();const q=new Queues(async()=>gate.promise,{play:async()=>{}},async()=>{});
    q.add(job('secret text'),1);expect(()=>q.add(job('too many'),1)).toThrow('QUEUE_FULL');
    expect(JSON.stringify(q.snapshot('g'))).not.toContain('secret text');q.stop('g');gate.resolve(audio);await q.drained('g');
  });
  it('isolates guild queues',async()=>{
    const gate=deferred<typeof audio>();const player={play:vi.fn(async()=>{})};
    const q=new Queues(async j=>j.guildId==='slow'?gate.promise:audio,player,async()=>{});
    q.add(job('1','slow'),10);q.add(job('2','fast'),10);await q.drained('fast');expect(player.play).toHaveBeenCalledTimes(1);q.stop('slow');gate.resolve(audio);await q.drained('slow');
  });
});
describe('global synthesis concurrency',()=>{
  it('limits concurrency and releases an aborted waiter without leaking a slot',async()=>{
    const s=new Semaphore(1);const gate=deferred<void>();const active=new AbortController();const waiting=new AbortController();
    const first=s.use(active.signal,async()=>gate.promise);const second=s.use(waiting.signal,async()=>1);waiting.abort();
    await expect(second).rejects.toThrow();const third=s.use(active.signal,async()=>3);gate.resolve();await first;expect(await third).toBe(3);
  });
});
