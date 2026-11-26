import { expect,it,vi } from 'vitest';
import { PermissionFlagsBits,PermissionsBitField,type ChatInputCommandInteraction,type Client } from 'discord.js';
import { Handlers } from '../src/discord/handlers.js';
import { Store } from '../src/db.js';
import { readConfig } from '../src/config.js';
import { Engines } from '../src/engines/index.js';
import { SlidingLimit } from '../src/text.js';
import type { SpeechService } from '../src/service.js';
import type { DiscordVoice } from '../src/discord/voice.js';

it.each([undefined,'C:/Voice Samples/ref.wav'])('sends Japanese GET parameters and publishes a WAV attachment without joining VC (%s)',async(path)=>{
  const audio=Buffer.alloc(46);audio.write('RIFF');audio.write('WAVE',8);
  const fetcher=vi.fn(async()=>new Response(audio,{headers:{'content-type':'audio/wav'}}));
  vi.stubGlobal('fetch',fetcher);
  const config=readConfig({GPT_SOVITS_REF_AUDIO_PATH:path,GPT_SOVITS_PROMPT_TEXT:'参照のセリフ。'});
  const store=new Store(':memory:');
  const editReply=vi.fn();
  try{
    const handlers=new Handlers({} as Client,store,new Engines(config,[]),{rate:new SlidingLimit()} as SpeechService,{} as DiscordVoice,config);
    await handlers.command({inGuild:()=>true,guildId:'g',user:{id:'u'},commandName:'wav',appPermissions:new PermissionsBitField(PermissionFlagsBits.AttachFiles),attachmentSizeLimit:1024,
      options:{getString:()=> 'こんにちは！',getSubcommand:()=>null},deferReply:vi.fn(),editReply} as unknown as ChatInputCommandInteraction);
    expect(fetcher).toHaveBeenCalledWith(expect.objectContaining({pathname:'/tts',searchParams:new URLSearchParams({text:'こんにちは！',text_lang:'ja',ref_audio_path:path ?? '/content/GPT-SoVITS/ref.wav',prompt_text:'参照のセリフ。',prompt_lang:'ja',media_type:'wav'})}),expect.objectContaining({method:'GET'}));
    expect(editReply).toHaveBeenCalledWith(expect.objectContaining({files:[{attachment:audio,name:'speech.wav'}]}));
  }finally{store.close();vi.unstubAllGlobals();}
});
