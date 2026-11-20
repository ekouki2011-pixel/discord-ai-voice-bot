import type { Config } from './config.js';
import { Store } from './db.js';
import { Engines } from './engines/index.js';
import { Queues, Semaphore, type Job, type Player } from './queue.js';
import { normalizeText, SlidingLimit } from './text.js';
import { AppError, type VoiceSettings } from './types.js';

export class SpeechService {
  readonly queues: Queues;
  readonly rate=new SlidingLimit();
  private slots: Semaphore;
  constructor(readonly store: Store, readonly engines: Engines, readonly config: Config, player: Player,
    private notify: (channelId: string, message: string)=>Promise<void>,
    failed: (job: Job,error: unknown)=>Promise<void>, private canDeliver: (job: Job)=>boolean) {
    this.slots=new Semaphore(config.MAX_SYNTH_CONCURRENCY);
    const protectedPlayer:Player={play:async(guildId,audio,volume,signal)=>{
      const current=this.queues.snapshot(guildId).current;
      if(!current)throw new AppError('JOB_CANCELLED','読み上げは中止されました。');
      // Permissions and attendance can change while an external API is generating audio.
      const job={...current,text:''};
      this.validateDelivery(job);
      return player.play(guildId,audio,volume,signal);
    }};
    this.queues=new Queues((job,signal)=>this.slots.use(signal,()=>this.synthesize(job,signal)),protectedPlayer,failed);
  }
  private validateDelivery(job:Job):void{
    const guild=this.store.guild(job.guildId);
    if(guild.paused)throw new AppError('PAUSED','読み上げは一時停止中です。');
    if(job.source==='auto'&&(!guild.autoEnabled||guild.readChannelId!==job.channelId))throw new AppError('AUTO_DISABLED','自動読み上げ設定が変更されたため、この投稿を中止しました。');
    if(!this.canDeliver(job))throw new AppError('VC_ACCESS_CHANGED','VC参加者またはチャンネルの権限が変わったため再生を中止しました。');
    this.validate(job.guildId,job.settings);
  }
  validate(guildId: string, settings: VoiceSettings): void {
    const guild=this.store.guild(guildId);
    if(!guild.allowedEngines.includes(settings.engine))throw new AppError('ENGINE_DISABLED','このサーバーでは、その音声エンジンは許可されていません。');
    if(!settings.voiceId||!this.store.approved(guildId,settings.engine,settings.voiceId))
      throw new AppError('VOICE_UNAPPROVED','管理者が使用を許可した音声を /voice set で選んでください。');
    if(this.store.voice(settings.engine,settings.voiceId)?.status!=='ready')throw new AppError('VOICE_NOT_READY','音声は未同期、処理中、または利用不可です。');
    this.engines.validate(settings);
  }
  enqueue(input: {guildId: string; userId: string; channelId: string; text: string; source:'say'|'auto'}): string {
    const guild=this.store.guild(input.guildId);
    if(guild.paused)throw new AppError('PAUSED','管理者が読み上げを一時停止しています。');
    const text=normalizeText(input.text,guild.maxChars);
    const settings=this.store.effective(input.guildId,input.userId);
    this.validate(input.guildId,settings);
    if(this.queues.size(input.guildId)>=guild.maxQueue)throw new AppError('QUEUE_FULL','待機列が満杯です。');
    this.rate.take([{key:`u:${input.guildId}:${input.userId}`,limit:guild.perUserPerMinute},{key:`g:${input.guildId}`,limit:guild.perGuildPerMinute}]);
    return this.queues.add({...input,text,settings:structuredClone(settings)},guild.maxQueue);
  }
  private async synthesize(job: Job, signal: AbortSignal) {
    signal.throwIfAborted();
    const guild=this.store.guild(job.guildId);
    this.validateDelivery(job);
    const chars=[...job.text].length;
    const limits=[{scope:`guild:${job.guildId}`,chars,limit:guild.dailyChars},{scope:`user:${job.guildId}:${job.userId}`,chars,limit:guild.userDailyChars}];
    if(job.settings.engine!=='voicevox')limits.push({scope:'cloud:all',chars,limit:this.config.GLOBAL_DAILY_CLOUD_CHARS});
    this.store.consume(limits);
    try{return await this.engines.get(job.settings.engine).synthesize({text:job.text,settings:job.settings,signal});}
    catch(error){
      if(signal.aborted||!job.settings.allowFallback||job.settings.engine==='voicevox'||!guild.fallbackVoiceId)throw error;
      // Do not substitute for authentication, permission, quota, or invalid request failures.
      if(!(error instanceof AppError)||!['API_NETWORK','API_TIMEOUT','API_HTTP_429','API_HTTP_500','API_HTTP_502','API_HTTP_503','API_HTTP_504'].includes(error.code))throw error;
      const fallback={...job.settings,engine:'voicevox' as const,voiceId:guild.fallbackVoiceId,pitch:0,speed:Math.min(2,Math.max(0.5,job.settings.speed))};
      this.validate(job.guildId,fallback);
      await this.notify(job.channelId,'選択した音声サービスの障害により、許可済みのVOICEVOX代替音声へ切り替えます。');
      signal.throwIfAborted();
      return this.engines.get('voicevox').synthesize({text:job.text,settings:fallback,signal});
    }
  }
}
