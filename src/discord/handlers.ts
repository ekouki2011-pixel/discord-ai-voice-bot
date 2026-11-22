import { ChannelType, MessageFlags, PermissionFlagsBits, type AutocompleteInteraction, type ChatInputCommandInteraction, type Client, type GuildMember, type Message } from 'discord.js';
import type { Config } from '../config.js';
import { Store } from '../db.js';
import { Engines } from '../engines/index.js';
import { SaydiEngine } from '../engines/saydi.js';
import { SpeechService } from '../service.js';
import { Http, audioResult } from '../engines/http.js';
import { normalizeText, SlidingLimit } from '../text.js';
import { AppError, engineId, publicError, type VoiceSettings } from '../types.js';
import { logError } from '../log.js';
import { DiscordVoice } from './voice.js';

export const isManager=(permissions:{has:(bit:bigint)=>boolean}|null)=>!!permissions?.has(PermissionFlagsBits.ManageGuild);
export function requireManager(allowed:boolean):void {if(!allowed)throw new AppError('FORBIDDEN','この操作には「サーバー管理」権限が必要です。');}
export function autoEligible(input:{enabled:boolean;configuredChannel:string|null;channelId:string;bot:boolean;webhook:boolean;system:boolean;sameVC:boolean;visible:boolean;content:string}):boolean{
  return input.enabled&&input.configuredChannel===input.channelId&&!input.bot&&!input.webhook&&!input.system&&input.sameVC&&input.visible&&!!input.content.trim();
}
const HELP=`このBotはAI合成音声を使用します。VCの音声受信・録音は行いません。
/wav text:こんにちは でチャットにGPT-SoVITSのWAVを添付します。
1. VCに入り /join
2. 初回は管理者が /voice sync engine:voicevox → /voice approve engine:voicevox id:音声ID rights:true
3. /voice set で音声を選び /say text:こんにちは！
自動読み上げ：管理者が /channel set → /auto on。投稿者もBotと同じVCに参加してください。
/engine /speed /pitch /volume は自分の設定。scope:server は管理者専用。
/skip は現在の生成・再生をスキップ、/stop は待機列も削除、/leave で退出。
/voice list と /settings に音声クレジットを表示します。クラウド利用時は本文を選択サービスへ送信します。
無人VCでは読み上げを中止し、設定時間後に退出します。再起動後は /join を再実行してください。`;

export class Handlers {
  private controlRate=new SlidingLimit();private notificationRate=new SlidingLimit();
  constructor(private client:Client, private store:Store, private engines:Engines, private speech:SpeechService, private voice:DiscordVoice, private config:Config){}
  private async member(i:ChatInputCommandInteraction):Promise<GuildMember>{
    if(!i.guild)throw new AppError('GUILD_ONLY','サーバー内で実行してください。');
    return i.guild.members.fetch(i.user.id);
  }
  private async sameVC(i:ChatInputCommandInteraction,managerBypass=false):Promise<GuildMember>{
    const member=await this.member(i); const active=this.voice.channel(i.guildId!);
    if(!active)throw new AppError('VC_NOT_JOINED','先に /join でBotをVCに参加させてください。');
    if(managerBypass&&isManager(i.memberPermissions))return member;
    if(member.voice.channelId!==active.id)throw new AppError('SAME_VC_REQUIRED','Botと同じVCに参加してから操作してください。');
    return member;
  }
  private saveProfile(i:ChatInputCommandInteraction,settings:VoiceSettings):void{
    if(i.options.getString('scope')==='server'){requireManager(isManager(i.memberPermissions));const guild=this.store.guild(i.guildId!);guild.defaults=settings;this.store.saveGuild(i.guildId!,guild);}
    else this.store.saveUser(i.guildId!,i.user.id,settings);
  }
  private profile(i:ChatInputCommandInteraction):VoiceSettings{
    if(i.options.getString('scope')==='server'){requireManager(isManager(i.memberPermissions));return this.store.guild(i.guildId!).defaults;}
    return this.store.effective(i.guildId!,i.user.id);
  }
  async command(i:ChatInputCommandInteraction):Promise<void>{
    if(!i.inGuild()||!i.guildId)return;
    try{
      await i.deferReply(i.commandName==='wav'?{}:{flags:MessageFlags.Ephemeral});
      const guildId=i.guildId;const manager=isManager(i.memberPermissions);const guild=this.store.guild(guildId);
      const name=i.commandName;const sub=i.options.getSubcommand(false);
      if(['auto','channel','admin'].includes(name)||name==='voice'&&['sync','approve','revoke'].includes(sub??''))requireManager(manager);
      // Protect synchronization and REST-backed commands without throttling emergency stop/leave.
      if(!['stop','skip','leave'].includes(name))this.controlRate.take([{key:`cmd:${guildId}:${i.user.id}`,limit:30}]);
      let message='設定を保存しました。';
      if(name==='wav'){
        if(guild.paused)throw new AppError('PAUSED','読み上げは一時停止中です。');
        if(!i.appPermissions?.has(PermissionFlagsBits.AttachFiles))throw new AppError('ATTACH_FILES','Botにファイル添付権限が必要です。');
        const prompt=this.config.GPT_SOVITS_PROMPT_TEXT;
        if(!prompt)throw new AppError('PROMPT_MISSING','管理者が参照音声の正確なセリフを GPT_SOVITS_PROMPT_TEXT に設定してください。');
        const text=normalizeText(i.options.getString('text',true),guild.maxChars);
        const url=new URL('/tts',this.config.GPT_SOVITS_URL);
        url.search=new URLSearchParams({text,text_lang:'ja',ref_audio_path:'/content/GPT-SoVITS/ref.wav',prompt_text:prompt,prompt_lang:'ja',media_type:'wav'}).toString();
        this.speech.rate.take([{key:`u:${guildId}:${i.user.id}`,limit:guild.perUserPerMinute},{key:`g:${guildId}`,limit:guild.perGuildPerMinute}]);
        const chars=[...text].length;
        this.store.consume([{scope:`guild:${guildId}`,chars,limit:guild.dailyChars},{scope:`user:${guildId}:${i.user.id}`,chars,limit:guild.userDailyChars},{scope:'cloud:all',chars,limit:this.config.GLOBAL_DAILY_CLOUD_CHARS}]);
        const http=new Http(this.config.API_TIMEOUT_MS,Math.min(this.config.MAX_AUDIO_BYTES,i.attachmentSizeLimit));
        const audio=audioResult(await http.request(url,{method:'GET'}),'wav').bytes;
        if(audio.length<44||audio.toString('ascii',0,4)!=='RIFF'||audio.toString('ascii',8,12)!=='WAVE')
          throw new AppError('INVALID_WAV','GPT-SoVITSからWAVファイルを取得できませんでした。');
        await i.editReply({content:'GPT-SoVITSによるAI合成音声',files:[{attachment:audio,name:'speech.wav'}]});
        return;
      }
      if(name==='join'){
        const member=await this.member(i);const channel=member.voice.channel;
        if(!channel||channel.type!==ChannelType.GuildVoice)throw new AppError('JOIN_VC','通常のボイスチャンネルに参加してから /join してください。');
        const botMember=i.guild!.members.me;
        if(!botMember||!i.channel?.permissionsFor(botMember).has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages]))throw new AppError('TEXT_PERMISSIONS','Botにこの操作チャンネルの閲覧・送信権限が必要です。');
        await this.voice.join(channel);
        await this.notice(i.channelId,'AI合成音声の読み上げBotがVCに参加しました。クラウド音声では投稿本文を選択したサービスへ送信します。/help で使い方と音声クレジットを確認できます。');
        message='VCに参加しました。/voice set → /say で読み上げます。';
      }else if(name==='leave'){
        await this.sameVC(i,true);this.voice.leave(guildId);message='待機列を削除してVCから退出しました。';
      }else if(name==='say'){
        await this.sameVC(i);
        this.speech.enqueue({guildId,userId:i.user.id,channelId:i.channelId,text:i.options.getString('text',true),source:'say'});
        message='読み上げ待機列に追加しました。';
      }else if(name==='skip'||name==='stop'){
        await this.sameVC(i,true);
        message=name==='skip'?(this.speech.queues.skip(guildId)?'現在の生成・再生をスキップしました。':'再生中の音声はありません。'):`${this.speech.queues.stop(guildId)}件を停止・削除しました。`;
      }else if(name==='queue'){
        await this.sameVC(i);
        const queue=this.speech.queues.snapshot(guildId);
        message=[`処理中：${queue.current?`<@${queue.current.userId}> (${queue.current.settings.engine})`:'なし'}`,`待機：${queue.pending.length}件`,...queue.pending.slice(0,15).map((j,n)=>`${n+1}. <@${j.userId}> (${j.settings.engine})`)].join('\n');
      }else if(name==='voice'){
        const engine=engineId.parse(i.options.getString('engine')??(sub==='set'?this.profile(i).engine:this.store.effective(guildId,i.user.id).engine));
        if(sub==='sync'){
          this.controlRate.take([{key:`sync:${guildId}`,limit:4}]);
          const provider=this.engines.requireAvailable(engine);const voices=await provider.listVoices();this.store.syncVoices(engine,voices);
          message=`${engine}の音声${voices.length}件を同期しました。音声生成・VC再生はまだ確認していません。`;
          if(provider instanceof SaydiEngine){
            const matches=voices.filter(v=>v.name==='私の声1');
            if(matches.length===1){const found=await provider.getVoice(matches[0]!.id);message+=`\n「私の声1」のID：${found.id}\n状態：${found.status}`;}
            else message+=matches.length>1?'\n「私の声1」が複数あるためIDで選択してください。':'\n「私の声1」は一覧にありません。同じアカウントのAPIキーか確認してください。';
          }
        }else if(sub==='list'){
          const voices=this.store.voices(engine).filter(v=>manager||this.store.approved(guildId,engine,v.id));
          const page=i.options.getInteger('page')??1;
          message=`${engine} 音声一覧（${page}ページ）\n`+voices.slice((page-1)*8,page*8).map(v=>`${v.name} / ID: ${v.id} / ${v.status}${this.store.approved(guildId,engine,v.id)?' / 許可済み':''}${v.credit?`\n${v.credit}`:''}`).join('\n');
          if(!voices.length)message='音声がありません。管理者が /voice sync と /voice approve を実行してください。';
        }else if(sub==='approve'){
          if(!i.options.getBoolean('rights',true))throw new AppError('RIGHTS_REQUIRED','使用許諾と音声ライセンス条件を確認した音声だけ許可できます。');
          this.engines.requireAvailable(engine);
          const id=i.options.getString('id',true);this.store.approve(guildId,engine,id,i.user.id);
          message=`音声ID ${id} のBot内利用を許可しました。${this.store.voice(engine,id)?.credit??''}`;
        }else if(sub==='revoke'){
          this.store.revoke(guildId,engine,i.options.getString('id',true));this.speech.queues.stop(guildId);message='Bot内の音声利用許可を解除しました。外部サービスの音声は保持されています。';
        }else if(sub==='set'){
          const settings={...this.profile(i),engine,voiceId:i.options.getString('id',true)};
          if(this.profile(i).engine!==engine){settings.speed=1;settings.pitch=0;}
          this.speech.validate(guildId,settings);this.saveProfile(i,settings);
          message=`音声を ${this.store.voice(engine,settings.voiceId)?.name??settings.voiceId} に変更しました。${this.store.voice(engine,settings.voiceId)?.credit??''}`;
        }
      }else if(name==='engine'){
        const engine=engineId.parse(i.options.getString('engine',true));this.engines.requireAvailable(engine);
        if(!guild.allowedEngines.includes(engine))throw new AppError('ENGINE_DISABLED','管理者が /admin engine で許可する必要があります。');
        const previous=this.profile(i);const defaults=guild.defaults;
        this.saveProfile(i,{...previous,engine,voiceId:previous.engine===engine?previous.voiceId:defaults.engine===engine?defaults.voiceId:'',speed:1,pitch:0});
        message=`エンジンを${engine}へ変更しました。/voice set で音声を選択してください。`;
      }else if(['speed','pitch','volume'].includes(name)){
        const settings=this.profile(i);const value=i.options.getNumber('value',true);const caps=this.engines.get(settings.engine).capabilities;
        if(name==='pitch'&&!caps.pitch)message='このエンジンは高さ調整に対応していません。設定は保持しました。';
        else if(name==='speed'&&!caps.speed)message='このモデルは速度調整に対応していません。設定は保持しました。';
        else{if(name==='speed')settings.speed=value;else if(name==='pitch')settings.pitch=value;else settings.volume=value/100;
          this.engines.validate(settings);this.saveProfile(i,settings);}
      }else if(name==='auto'){
        if(sub==='on'){
          if(!this.config.MESSAGE_CONTENT_ENABLED)throw new AppError('INTENT_DISABLED','自動読み上げは未有効です。所有者がDeveloper PortalでMessage Content Intentを許可し、MESSAGE_CONTENT_ENABLED=trueで再起動してください。');
          if(!guild.readChannelId)throw new AppError('CHANNEL_UNSET','先に /channel set で読み上げチャンネルを指定してください。');
          const channel=await i.guild!.channels.fetch(guild.readChannelId);const me=i.guild!.members.me;
          if(!channel||channel.type!==ChannelType.GuildText||!me||!channel.permissionsFor(me).has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages]))throw new AppError('CHANNEL_PERMISSIONS','指定チャンネルの閲覧・送信権限を確認してください。');
          await this.sameVC(i);guild.autoEnabled=true;message='自動読み上げを有効にしました。同じVCの参加者の投稿を順番に読み上げます。';
          await this.notice(guild.readChannelId,'このチャンネルの自動読み上げを有効にしました。Botと同じVCの参加者の本文をAI音声で読み上げます。クラウド音声では本文を外部サービスへ送信します。');
        }else{guild.autoEnabled=false;this.speech.queues.stop(guildId);message='自動読み上げを無効にして待機列を削除しました。';}
        this.store.saveGuild(guildId,guild);
      }else if(name==='channel'){
        if(sub==='set'){
          const channel=await i.guild!.channels.fetch(i.options.getChannel('channel',true).id);const me=i.guild!.members.me;
          if(!channel||channel.type!==ChannelType.GuildText||!me||!channel.permissionsFor(me).has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages]))throw new AppError('CHANNEL_PERMISSIONS','Botが閲覧・投稿できる通常のテキストチャンネルを選択してください。');
          guild.readChannelId=channel.id;guild.autoEnabled=false;this.speech.queues.stop(guildId);this.store.saveGuild(guildId,guild);message='読み上げチャンネルを保存しました。/auto on で有効にしてください。';
        }else message=`読み上げチャンネル：${guild.readChannelId?`<#${guild.readChannelId}>`:'未設定'} / 自動：${guild.autoEnabled?'ON':'OFF'}`;
      }else if(name==='profile'){
        if(sub==='reset')this.store.resetUser(guildId,i.user.id);
        else this.store.saveUser(guildId,i.user.id,{...this.store.effective(guildId,i.user.id),allowFallback:i.options.getBoolean('enabled',true)});
      }else if(name==='admin'){
        if(sub==='limits'){
          const fields={max_chars:'maxChars',user_per_minute:'perUserPerMinute',guild_per_minute:'perGuildPerMinute',queue_size:'maxQueue',idle_seconds:'idleSeconds',daily_chars:'dailyChars',user_daily_chars:'userDailyChars'} as const;
          for(const [option,key]of Object.entries(fields)){const v=i.options.getInteger(option);if(v!==null)guild[key]=v;}
        }else if(sub==='engine'){
          const engine=engineId.parse(i.options.getString('engine',true));const enabled=i.options.getBoolean('enabled',true);
          if(enabled){this.engines.requireAvailable(engine);guild.allowedEngines=[...new Set([...guild.allowedEngines,engine])];}
          else{if(guild.allowedEngines.length===1&&guild.allowedEngines.includes(engine))throw new AppError('LAST_ENGINE','少なくとも1つの音声エンジンを残してください。');guild.allowedEngines=guild.allowedEngines.filter(e=>e!==engine);this.speech.queues.stop(guildId);}
        }else if(sub==='pause'){guild.paused=i.options.getBoolean('enabled',true);if(guild.paused)this.speech.queues.stop(guildId);}
        else if(sub==='fallback'){
          const id=i.options.getString('id')??'';
          if(id&&!this.store.approved(guildId,'voicevox',id))throw new AppError('FALLBACK_UNAPPROVED','許可済みVOICEVOX音声を指定してください。');guild.fallbackVoiceId=id;
        }else if(sub==='usage'){
          const id=engineId.parse(i.options.getString('engine')??'voicevox');const engine=this.engines.requireAvailable(id);
          message=`本日のサーバー使用量：${this.store.usage(`guild:${guildId}`)} / ${guild.dailyChars}文字\n全サーバーのクラウド合計：${this.store.usage('cloud:all')} / ${this.config.GLOBAL_DAILY_CLOUD_CHARS}文字\n失敗・スキップ済みの送信も保守的に計上します。料金は各サービスの管理画面で確認してください。`;
          if(engine.usage)message+='\n'+JSON.stringify(await engine.usage());
        }
        this.store.saveGuild(guildId,guild);
      }else if(name==='settings'){
        const effective=this.store.effective(guildId,i.user.id);const credit=this.store.voice(effective.engine,effective.voiceId)?.credit;
        message=`AI合成音声 / ${this.store.user(guildId,i.user.id)?'個人設定':'サーバー既定'}\n`+JSON.stringify(effective,null,2)+`\n${credit??''}\n自動：${guild.autoEnabled?'ON':'OFF'} / 一時停止：${guild.paused?'ON':'OFF'}\n対象：${guild.readChannelId?`<#${guild.readChannelId}>`:'未設定'}\n許可エンジン：${guild.allowedEngines.join(', ')}\n`+this.engines.states().join('\n');
        if(manager)message+='\n'+JSON.stringify({maxChars:guild.maxChars,maxQueue:guild.maxQueue,idleSeconds:guild.idleSeconds,perUserPerMinute:guild.perUserPerMinute,perGuildPerMinute:guild.perGuildPerMinute,dailyChars:guild.dailyChars,userDailyChars:guild.userDailyChars});
      }else if(name==='help'){
        const credits=[...new Set(this.store.voices('voicevox').filter(v=>this.store.approved(guildId,'voicevox',v.id)).map(v=>v.credit).filter(Boolean))];
        message=HELP+'\n音声クレジット：'+(credits.length?credits.join('、'):'VOICEVOX（話者は /voice list で確認）');
      }
      await i.editReply({content:message.slice(0,1950),allowedMentions:{parse:[]}});
    }catch(error){logError('slash_command',error);const content=publicError(error);try{if(i.deferred||i.replied)await i.editReply({content,allowedMentions:{parse:[]}});else await i.reply({content,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});}catch(e){logError('interaction_reply',e);}}
  }
  async autocomplete(i:AutocompleteInteraction):Promise<void>{
    try{
      if(!i.guildId){await i.respond([]);return;}
      const engine=engineId.parse(i.options.getString('engine')??this.store.effective(i.guildId,i.user.id).engine);
      const manager=isManager(i.memberPermissions);const query=String(i.options.getFocused()).toLocaleLowerCase();
      const choices=this.store.voices(engine).filter(v=>(manager||this.store.approved(i.guildId!,engine,v.id))&&(v.name.toLocaleLowerCase().includes(query)||v.id.toLowerCase().includes(query)))
        .filter(v=>v.id.length<=100).slice(0,25).map(v=>({name:`${v.name} (${v.status})`.slice(0,100),value:v.id}));
      await i.respond(choices);
    }catch{try{await i.respond([]);}catch{/* interaction expired */}}
  }
  async message(m:Message):Promise<void>{
    if(!m.guildId||!m.guild||!m.inGuild()||m.channel.type!==ChannelType.GuildText)return;
    const guild=this.store.guild(m.guildId);const active=this.voice.channel(m.guildId);const me=m.guild.members.me;
    const visible=!!me&&!!m.member&&m.channel.permissionsFor(me).has(PermissionFlagsBits.ViewChannel)&&!!active?.permissionsFor(m.member).has(PermissionFlagsBits.ViewChannel);
    if(!autoEligible({enabled:guild.autoEnabled,configuredChannel:guild.readChannelId,channelId:m.channelId,bot:m.author.bot,webhook:!!m.webhookId,system:m.system,sameVC:!!active&&m.member?.voice.channelId===active.id,visible,content:m.content}))return;
    try{this.speech.enqueue({guildId:m.guildId,userId:m.author.id,channelId:m.channelId,text:m.content,source:'auto'});}
    catch(error){
      logError('auto_message',error);
      try{this.notificationRate.take([{key:m.guildId,limit:4}]);await this.notice(m.channelId,publicError(error));}catch{/* suppress repeated error notifications */}
    }
  }
  async notice(channelId:string,content:string):Promise<void>{
    const channel=await this.client.channels.fetch(channelId);
    if(channel?.type!==ChannelType.GuildText)return;
    const me=channel.guild.members.me;
    if(!me||!channel.permissionsFor(me).has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages]))return;
    await channel.send({content:content.slice(0,1900),allowedMentions:{parse:[]}});
  }
}
