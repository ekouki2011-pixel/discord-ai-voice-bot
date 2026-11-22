import { createServer } from 'node:http';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { ActivityType, Client, Events, GatewayIntentBits, PermissionFlagsBits, ChannelType } from 'discord.js';
import { generateDependencyReport } from '@discordjs/voice';
import { readConfig } from './config.js';
import { Store } from './db.js';
import { Engines } from './engines/index.js';
import { Handlers } from './discord/handlers.js';
import { DiscordVoice } from './discord/voice.js';
import { SpeechService } from './service.js';
import { AppError, publicError } from './types.js';
import { logger, logError } from './log.js';

async function main(){
  process.umask(0o077);
  const config=readConfig();
  if(!config.DISCORD_TOKEN)throw new AppError('DISCORD_AUTH_PENDING','DISCORD_TOKENが未設定です。READMEの手順で安全に設定してください。');
  const report=generateDependencyReport();
  if(!/davey: (?!not found)/.test(report))throw new AppError('DAVE_MISSING','DAVEライブラリが見つかりません。npm ciを再実行してください。');
  // Remove only this application's stale audio directories after a process crash.
  await mkdir(config.TEMP_DIR,{recursive:true,mode:0o700});
  for(const entry of await readdir(config.TEMP_DIR,{withFileTypes:true}))if(entry.isDirectory()&&entry.name.startsWith('audio-'))await rm(join(config.TEMP_DIR,entry.name),{recursive:true,force:true});
  const intents=[GatewayIntentBits.Guilds,GatewayIntentBits.GuildVoiceStates];
  if(config.MESSAGE_CONTENT_ENABLED)intents.push(GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent);
  const client=new Client({intents,allowedMentions:{parse:[]}});const store=new Store(config.DATABASE_PATH);const engines=new Engines(config);
  const voice:DiscordVoice=new DiscordVoice(client,config,id=>speech?.queues.stop(id));
  const speech:SpeechService=new SpeechService(store,engines,config,voice,(channel,message)=>handlers.notice(channel,message),
    async(job,error)=>{logError('speech_job',error);await handlers.notice(job.channelId,publicError(error));},
    job=>{
      const guild=client.guilds.cache.get(job.guildId);const vc=voice.channel(job.guildId);const channel=guild?.channels.cache.get(job.channelId);const me=guild?.members.me;
      const member=guild?.voiceStates.cache.get(job.userId)?.member;
      return !!vc&&!!me&&!!member&&member.voice.channelId===vc.id&&vc.permissionsFor(me).has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect,PermissionFlagsBits.Speak])
        &&vc.permissionsFor(member).has(PermissionFlagsBits.ViewChannel)&&channel?.type===ChannelType.GuildText&&channel.permissionsFor(me).has(PermissionFlagsBits.ViewChannel)&&channel.permissionsFor(member).has(PermissionFlagsBits.ViewChannel);
    });
  const handlers:Handlers=new Handlers(client,store,engines,speech,voice,config);
  client.on(Events.InteractionCreate,i=>{if(i.isChatInputCommand())void handlers.command(i);else if(i.isAutocomplete())void handlers.autocomplete(i);});
  client.on(Events.MessageCreate,m=>{void handlers.message(m).catch(e=>logError('message_event',e));});
  client.on(Events.Error,error=>logError('discord_client',error));
  client.on(Events.ShardError,error=>logError('discord_shard',error));
  client.on(Events.GuildDelete,guild=>voice.leave(guild.id));
  client.on(Events.VoiceStateUpdate,(old,next)=>{
    if(next.id===client.user?.id&&old.channelId&&next.channelId!==old.channelId)voice.leave(next.guild.id);
    voice.tick(id=>store.guild(id).idleSeconds);
  });
  client.once(Events.ClientReady,ready=>{
    ready.user.setActivity('AI音声読み上げ /help',{type:ActivityType.Listening});
    logger.info({event:'discord_ready',guilds:ready.guilds.cache.size});
  });
  const timer=setInterval(()=>voice.tick(id=>store.guild(id).idleSeconds),5000);timer.unref();
  let shuttingDown=false;
  const server=createServer((req,res)=>{
    if(req.url==='/'){
      res.writeHead(shuttingDown?503:200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});
      res.end(shuttingDown?'Stopping':'OK');
      return;
    }
    if(req.url!=='/healthz'&&req.url!=='/readyz'){res.writeHead(404).end();return;}
    const ready=client.isReady()&&!shuttingDown;
    res.writeHead(req.url==='/readyz'&&!ready?503:200,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify({status:shuttingDown?'stopping':'alive',discord:ready?'ready':'disconnected',uptimeSeconds:Math.floor(process.uptime())}));
  });
  server.on('error',e=>{logError('health_server',e);void shutdown(1);});
  server.listen(config.HEALTH_PORT,config.HEALTH_HOST);
  async function shutdown(code=0){
    if(shuttingDown)return;shuttingDown=true;clearInterval(timer);speech.queues.stopAll();voice.close();client.destroy();server.close();
    const deadline=setTimeout(()=>process.exit(1),10000);deadline.unref();
    await speech.queues.drainAll();
    store.close();process.exitCode=code;
  }
  process.once('SIGTERM',()=>{void shutdown();});process.once('SIGINT',()=>{void shutdown();});
  process.once('uncaughtException',error=>{logError('uncaught_exception',error);void shutdown(1);});
  process.once('unhandledRejection',error=>{logError('unhandled_rejection',error);void shutdown(1);});
  logger.info({event:'startup',messageContent:config.MESSAGE_CONTENT_ENABLED,engines:engines.states()});
  try{await client.login(config.DISCORD_TOKEN);}catch(error){logError('discord_login',error);await shutdown(1);}
}
main().catch(error=>{logError('startup_failed',error);process.exitCode=1;});
