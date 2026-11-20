import { randomUUID } from 'node:crypto';
import { AppError, type Audio, type VoiceSettings } from './types.js';
export interface Job {
  id: string; guildId: string; userId: string; channelId: string;
  text: string; settings: VoiceSettings; source: 'say' | 'auto';
}
export interface Player { play(guildId: string, audio: Audio, volume: number, signal: AbortSignal): Promise<void>; }
export type Synthesizer = (job: Job, signal: AbortSignal) => Promise<Audio>;
interface State {pending: Job[]; current?: Job; abort?: AbortController; running: boolean; idle: (()=>void)[];}
export class Queues {
  private states=new Map<string,State>();
  constructor(private synthesize: Synthesizer, private player: Player, private failed: (job: Job, error: unknown)=>Promise<void>){}
  private state(id: string): State {
    let s=this.states.get(id);if(!s){s={pending:[],running:false,idle:[]};this.states.set(id,s);}return s;
  }
  size(id: string): number {const s=this.state(id);return s.pending.length+(s.current?1:0);}
  snapshot(id: string): {current?: Omit<Job,'text'>; pending: Omit<Job,'text'>[]} {
    const s=this.state(id); const safe=({text:_text,...job}:Job)=>job;
    return {current:s.current?safe(s.current):undefined,pending:s.pending.map(safe)};
  }
  add(job: Omit<Job,'id'>, limit: number): string {
    const state=this.state(job.guildId);
    if(this.size(job.guildId)>=limit)throw new AppError('QUEUE_FULL','待機列が満杯です。再生が進むまで待ってください。');
    const id=randomUUID();state.pending.push({...job,id});
    if(!state.running)void this.run(job.guildId,state);
    return id;
  }
  skip(id: string): boolean {const state=this.state(id);if(!state.current)return false;state.abort?.abort();return true;}
  stop(id: string): number {const state=this.state(id);const count=this.size(id);state.pending=[];state.abort?.abort();return count;}
  stopAll(): void {for(const id of this.states.keys())this.stop(id);}
  async drainAll():Promise<void>{await Promise.all([...this.states.keys()].map(id=>this.drained(id)));}
  async drained(id: string): Promise<void> {const s=this.state(id);if(!s.running)return;await new Promise<void>(resolve=>s.idle.push(resolve));}
  private async run(guildId: string, state: State): Promise<void> {
    state.running=true;
    try {
      while(state.pending.length){
        const job=state.pending.shift()!;const abort=new AbortController();state.current=job;state.abort=abort;
        try {
          const audio=await this.synthesize(job,abort.signal);
          abort.signal.throwIfAborted();
          await this.player.play(guildId,audio,job.settings.volume,abort.signal);
        }catch(error){if(!abort.signal.aborted){try{await this.failed(job,error);}catch{/* notification failures never poison the worker */}}}
        finally{state.current=undefined;state.abort=undefined;}
      }
    }finally{state.running=false;for(const done of state.idle.splice(0))done();}
  }
}
export class Semaphore {
  private active=0;
  private waiters: {resolve:()=>void; reject:(e:unknown)=>void; signal:AbortSignal; abort:()=>void}[]=[];
  constructor(private max: number){}
  async use<T>(signal: AbortSignal, work:()=>Promise<T>): Promise<T> {
    signal.throwIfAborted();
    if(this.active>=this.max)await new Promise<void>((resolve,reject)=>{
      const waiter={resolve,reject,signal,abort:()=>{this.waiters=this.waiters.filter(w=>w!==waiter);reject(signal.reason);}};
      this.waiters.push(waiter);signal.addEventListener('abort',waiter.abort,{once:true});
    });
    else this.active++;
    try{signal.throwIfAborted();return await work();}
    finally{
      const next=this.waiters.shift();
      if(next){next.signal.removeEventListener('abort',next.abort);next.resolve();}else this.active--;
    }
  }
}
