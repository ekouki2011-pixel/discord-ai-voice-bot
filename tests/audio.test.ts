import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { describe,it,expect } from 'vitest';
import { createAudioResource, generateDependencyReport, StreamType } from '@discordjs/voice';
describe('real local audio codec dependencies (no Discord connection)',()=>{
  it('loads the installed DAVE native dependency',()=>{expect(generateDependencyReport()).toMatch(/@snazzah\/davey: \d+\./);});
  it('converts FFmpeg PCM into Opus frames through the Discord audio resource',async()=>{
    const ffmpeg=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=440:duration=0.1','-f','s16le','-ar','48000','-ac','2','pipe:1']);
    expect(ffmpeg.status).toBe(0);expect(ffmpeg.stdout.length).toBeGreaterThan(0);
    const resource=createAudioResource(Readable.from([ffmpeg.stdout]),{inputType:StreamType.Raw,inlineVolume:true});resource.volume?.setVolume(0.5);
    const packets:Buffer[]=[];for await(const packet of resource.playStream)packets.push(packet as Buffer);
    expect(packets.length).toBeGreaterThanOrEqual(5);expect(packets.every(b=>b.length>0)).toBe(true);
  });
});
