import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createAudioPlayer, AudioPlayerStatus, NoSubscriberBehavior, VoiceConnectionStatus, type VoiceConnection } from '@discordjs/voice';
import type { Client } from 'discord.js';
import { describe,it,expect } from 'vitest';
import { DiscordVoice } from '../src/discord/voice.js';
import { readConfig } from '../src/config.js';

const tone=(duration:number)=>{
  const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i',`sine=frequency=440:duration=${duration}`,'-f','wav','pipe:1']);
  if(result.status!==0)throw new Error('fixture audio generation failed');return result.stdout;
};
async function setup(ffmpeg='ffmpeg'){
  const dir=await mkdtemp(join(tmpdir(),'tts-playback-'));
  const config=readConfig({TEMP_DIR:dir,FFMPEG_PATH:ffmpeg});const voice=new DiscordVoice({} as Client,config,()=>{});
  // Real audio player, FFmpeg and Opus pipeline; transport is a ready fixture, not Discord.
  const player=createAudioPlayer({behaviors:{noSubscriber:NoSubscriberBehavior.Play}});
  voice.sessions.set('g',{connection:{state:{status:VoiceConnectionStatus.Ready}} as VoiceConnection,player,channelId:'vc'});
  return {dir,voice,player,cleanup:async()=>{player.stop(true);await rm(dir,{recursive:true,force:true});}};
}
describe('production audio playback pipeline with a local transport fixture',()=>{
  it('plays decoded audio to completion and deletes temporary audio',async()=>{
    const s=await setup();try{await s.voice.play('g',{bytes:tone(0.1),extension:'wav'},0.5,new AbortController().signal);expect(await readdir(s.dir)).toEqual([]);}finally{await s.cleanup();}
  });
  it('aborts current playback and removes its file before returning',async()=>{
    const s=await setup();try{
      const controller=new AbortController();const began=once(s.player,AudioPlayerStatus.Playing);
      const pending=s.voice.play('g',{bytes:tone(5),extension:'wav'},0.5,controller.signal);const rejected=expect(pending).rejects.toThrow();
      await began;controller.abort();await rejected;expect(await readdir(s.dir)).toEqual([]);expect(s.player.state.status).toBe(AudioPlayerStatus.Idle);
    }finally{await s.cleanup();}
  });
  it('cleans up and reports failure when FFmpeg cannot start',async()=>{
    const s=await setup('/path/to/missing-ffmpeg');try{await expect(s.voice.play('g',{bytes:tone(0.1),extension:'wav'},0.5,new AbortController().signal)).rejects.toMatchObject({code:'AUDIO_PLAYBACK'});expect(await readdir(s.dir)).toEqual([]);}finally{await s.cleanup();}
  });
});
