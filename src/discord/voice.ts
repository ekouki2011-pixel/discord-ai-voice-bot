import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  AudioPlayerStatus, NoSubscriberBehavior, StreamType, VoiceConnectionStatus, VoiceConnectionDisconnectReason,
  createAudioPlayer, createAudioResource, entersState, joinVoiceChannel,
  type AudioPlayer, type VoiceConnection,
} from '@discordjs/voice';
import { ChannelType, PermissionFlagsBits, type Client, type VoiceChannel } from 'discord.js';
import type { Config } from '../config.js';
import { AppError, type Audio } from '../types.js';
import type { Player } from '../queue.js';
import { logError } from '../log.js';

interface Session {connection: VoiceConnection; player: AudioPlayer; channelId:string; emptySince?:number; recovering?:boolean;}
export class DiscordVoice implements Player {
  readonly sessions=new Map<string,Session>();
  constructor(private client: Client, private config: Config, private unavailable: (guildId:string)=>void){}
  channel(guildId:string): VoiceChannel | undefined {
    const session=this.sessions.get(guildId);const channel=this.client.channels.cache.get(session?.channelId??'');
    return channel?.type===ChannelType.GuildVoice?channel:undefined;
  }
  ready(guildId:string): boolean {return this.sessions.get(guildId)?.connection.state.status===VoiceConnectionStatus.Ready;}
  async join(channel: VoiceChannel): Promise<void> {
    const existing=this.sessions.get(channel.guild.id);
    if(existing&&existing.channelId!==channel.id)throw new AppError('VC_BUSY','Botは別のVCに参加中です。同じVCから操作するか、管理者が /leave してください。');
    const me=channel.guild.members.me;
    if(!me||!channel.permissionsFor(me).has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect,PermissionFlagsBits.Speak]))
      throw new AppError('VC_PERMISSIONS','BotにこのVCの「チャンネルを見る・接続・発言」権限が必要です。');
    if(channel.full&&!existing)throw new AppError('VC_FULL','VCの参加人数が上限に達しています。');
    if(existing){await entersState(existing.connection,VoiceConnectionStatus.Ready,20000);return;}
    const connection=joinVoiceChannel({channelId:channel.id,guildId:channel.guild.id,adapterCreator:channel.guild.voiceAdapterCreator,selfDeaf:true,selfMute:false,daveEncryption:true});
    const player=createAudioPlayer({behaviors:{noSubscriber:NoSubscriberBehavior.Pause}});
    const session:Session={connection,player,channelId:channel.id};this.sessions.set(channel.guild.id,session);
    player.on('error',error=>logError('audio_player',error));
    connection.on('error',error=>logError('voice_connection',error));
    connection.subscribe(player);
    connection.on('stateChange',(_old,next)=>{
      if(next.status===VoiceConnectionStatus.Destroyed){
        if(this.sessions.get(channel.guild.id)===session){this.sessions.delete(channel.guild.id);this.unavailable(channel.guild.id);}
      }
      if(next.status===VoiceConnectionStatus.Disconnected&&!session.recovering){
        session.recovering=true;
        const kicked=next.reason===VoiceConnectionDisconnectReason.WebSocketClose&&next.closeCode===4014;
        void this.recover(channel.guild.id,session,kicked).finally(()=>{session.recovering=false;});
      }
    });
    try{await entersState(connection,VoiceConnectionStatus.Ready,20000);}
    catch{this.leave(channel.guild.id);throw new AppError('VC_CONNECT','VCへの接続に失敗しました。権限、UDP通信、DAVE対応環境を確認してください。');}
  }
  private async recover(guildId:string,session:Session,kicked:boolean):Promise<void>{
    try{
      // A server-side kick must not trigger repeated attempts to bypass removal.
      if(kicked){await entersState(session.connection,VoiceConnectionStatus.Connecting,5000);await entersState(session.connection,VoiceConnectionStatus.Ready,15000);return;}
      for(let attempt=0;attempt<3;attempt++){
        if(this.sessions.get(guildId)!==session||session.connection.state.status===VoiceConnectionStatus.Destroyed)return;
        session.connection.rejoin();
        try{await entersState(session.connection,VoiceConnectionStatus.Ready,10000);return;}catch{/* bounded retry of a transient disconnect */}
      }
    }catch(error){logError('voice_recovery',error);}
    if(this.sessions.get(guildId)===session)this.leave(guildId);
  }
  leave(guildId:string): void {
    const session=this.sessions.get(guildId);if(!session)return;
    this.sessions.delete(guildId);this.unavailable(guildId);session.player.stop(true);
    if(session.connection.state.status!==VoiceConnectionStatus.Destroyed)session.connection.destroy();
  }
  async play(guildId:string,audio:Audio,volume:number,signal:AbortSignal):Promise<void>{
    const session=this.sessions.get(guildId);if(!session)throw new AppError('VC_NOT_JOINED','先に /join でBotをVCに参加させてください。');
    signal.throwIfAborted();
    await entersState(session.connection,VoiceConnectionStatus.Ready,signal);
    signal.throwIfAborted();
    await mkdir(this.config.TEMP_DIR,{recursive:true,mode:0o700});
    const dir=await mkdtemp(join(this.config.TEMP_DIR,'audio-'));
    let ffmpeg: ReturnType<typeof spawn>|undefined;
    try{
      const path=join(dir,`speech.${audio.extension}`);await writeFile(path,audio.bytes,{mode:0o600});
      signal.throwIfAborted();
      ffmpeg=spawn(this.config.FFMPEG_PATH,['-hide_banner','-loglevel','error','-nostdin','-i',path,'-vn','-f','s16le','-ar','48000','-ac','2','pipe:1'],{stdio:['ignore','pipe','ignore']});
      const process=ffmpeg;
      const resource=createAudioResource(process.stdout!,{inputType:StreamType.Raw,inlineVolume:true});
      resource.volume?.setVolume(volume);
      await new Promise<void>((resolve,reject)=>{
        let began=false;let settled=false;
        const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);session.player.off('stateChange',change);session.player.off('error',error);process.off('error',error);process.off('close',close);};
        const done=(failure?:unknown)=>{if(settled)return;settled=true;cleanup();if(failure)reject(failure);else resolve();};
        const abort=()=>{done(signal.reason??new Error('aborted'));session.player.stop(true);};
        const error=()=>{done(new AppError('AUDIO_PLAYBACK','音声の変換または再生に失敗しました。'));session.player.stop(true);};
        const change=(_old:unknown,next:{status:AudioPlayerStatus})=>{if(next.status===AudioPlayerStatus.Playing)began=true;if(next.status===AudioPlayerStatus.Idle)done(began?undefined:new AppError('EMPTY_AUDIO','再生可能な音声がありません。'));};
        const close=(code:number|null)=>{if(code!==0&&code!==null)error();};
        const timer=setTimeout(()=>{done(new AppError('PLAY_TIMEOUT','音声再生の制限時間を超えました。'));session.player.stop(true);},600000);
        session.player.on('stateChange',change);session.player.once('error',error);process.once('error',error);process.once('close',close);signal.addEventListener('abort',abort,{once:true});
        session.player.play(resource);if(signal.aborted)abort();
      });
    }finally{ffmpeg?.kill('SIGKILL');session.player.stop(true);await rm(dir,{recursive:true,force:true});}
  }
  tick(idleSeconds:(id:string)=>number,now=Date.now()):void{
    for(const [id,session]of this.sessions){
      const channel=this.channel(id);
      if(!channel){this.leave(id);continue;}
      if(channel.members.some(m=>!m.user.bot)){session.emptySince=undefined;continue;}
      this.unavailable(id);session.emptySince??=now;
      if(now-session.emptySince>=idleSeconds(id)*1000)this.leave(id);
    }
  }
  close():void{for(const id of this.sessions.keys())this.leave(id);}
}
