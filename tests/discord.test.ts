import { describe,it,expect,vi } from 'vitest';
import { PermissionFlagsBits, PermissionsBitField, type ChatInputCommandInteraction } from 'discord.js';
import { commandJSON } from '../src/discord/commands.js';
import { autoEligible, Handlers, isManager, requireManager } from '../src/discord/handlers.js';
import { normalizeText,SlidingLimit } from '../src/text.js';
import { Store } from '../src/db.js';
import { readConfig } from '../src/config.js';
import { Engines } from '../src/engines/index.js';
import { SpeechService } from '../src/service.js';
import type { Client } from 'discord.js';
import type { DiscordVoice } from '../src/discord/voice.js';
describe('Discord commands and permissions',()=>{
  it('serializes required slash commands with guild-only contexts and constrained names',()=>{
    const commands=commandJSON();const names=commands.map(c=>c.name);
    for(const name of ['join','leave','say','voice','engine','speed','pitch','volume','auto','channel','skip','stop','queue','settings','help'])expect(names).toContain(name);
    for(const command of commands){expect(command.name).toMatch(/^[a-z0-9_-]{1,32}$/);expect(command.contexts).toEqual([0]);expect(command.integration_types).toEqual([0]);expect(JSON.stringify(command).length).toBeLessThan(8000);}
    expect(commands.find(c=>c.name==='admin')?.default_member_permissions).toBe(String(PermissionFlagsBits.ManageGuild));
  });
  it('does not treat ordinary members as server managers',()=>{
    expect(isManager(new PermissionsBitField(PermissionFlagsBits.SendMessages))).toBe(false);expect(()=>requireManager(false)).toThrow('FORBIDDEN');
    expect(isManager(new PermissionsBitField(PermissionFlagsBits.ManageGuild))).toBe(true);
  });
  it.each(['admin','auto','channel','voice'])('enforces manager restrictions inside /%s before any write/API call',async name=>{
    const config=readConfig({});const db=new Store(':memory:');const engines=new Engines(config,[]);const speech=new SpeechService(db,engines,config,{play:async()=>{}},async()=>{},async()=>{},()=>true);
    const edit=vi.fn(async(_value:unknown)=>{});const i={inGuild:()=>true,guildId:'g',user:{id:'u'},memberPermissions:new PermissionsBitField(),commandName:name,
      options:{getSubcommand:()=>name==='voice'?'sync':'on'},deferReply:async()=>{},deferred:true,editReply:edit} as unknown as ChatInputCommandInteraction;
    try{await new Handlers({} as Client,db,engines,speech,{} as DiscordVoice,config).command(i);expect(edit.mock.calls[0]?.[0]).toMatchObject({content:expect.stringContaining('サーバー管理')});expect(db.voices()).toEqual([]);expect(db.guild('g').autoEnabled).toBe(false);}finally{db.close();}
  });
  it('rejects personal commands attempting to overwrite the server default',async()=>{
    const config=readConfig({ENGINE_TERMS_ACCEPTED:'voicevox'});const db=new Store(':memory:');
    const engines=new Engines(config);const speech=new SpeechService(db,engines,config,{play:async()=>{}},async()=>{},async()=>{},()=>true);
    const edit=vi.fn(async(_value:unknown)=>{});
    const i={inGuild:()=>true,guildId:'g',user:{id:'u'},memberPermissions:new PermissionsBitField(),commandName:'volume',
      options:{getSubcommand:()=>null,getString:(key:string)=>key==='scope'?'server':null,getNumber:()=>100},deferReply:async()=>{},deferred:true,editReply:edit} as unknown as ChatInputCommandInteraction;
    try{await new Handlers({} as Client,db,engines,speech,{} as DiscordVoice,config).command(i);expect(edit.mock.calls[0]?.[0]).toMatchObject({content:expect.stringContaining('サーバー管理')});expect(db.guild('g').defaults.volume).toBe(0.7);}finally{db.close();}
  });
});
describe('automatic reading scope and safe text',()=>{
  const eligible={enabled:true,configuredChannel:'read',channelId:'read',bot:false,webhook:false,system:false,sameVC:true,visible:true,content:'こんにちは'};
  it('reads only opted-in channel posts from human participants with access to the same VC',()=>{
    expect(autoEligible(eligible)).toBe(true);
    for(const patch of [{enabled:false},{channelId:'other'},{bot:true},{webhook:true},{system:true},{sameVC:false},{visible:false},{content:''}])expect(autoEligible({...eligible,...patch})).toBe(false);
  });
  it('handles mentions, URLs, custom emoji and spoilers without reading protected content',()=>{
    const text=normalizeText('こんにちは <@123> <@&456> <#789> @everyone https://example.com/private <:smile:123> ||秘密|| ```secret code``` 😀',500);
    expect(text).toContain('こんにちは');expect(text).not.toContain('123');expect(text).not.toContain('private');expect(text).not.toContain('秘密');expect(text).not.toContain('secret code');expect(text).not.toContain('@everyone');
  });
  it('uses Unicode codepoints for Japanese limits and bounds the unnormalized content',()=>{
    expect(normalizeText('𠮷𠮷',2)).toBe('𠮷𠮷');expect(()=>normalizeText('あいう',2)).toThrow('TEXT_TOO_LONG');expect(()=>normalizeText('https://example.com/12345',5)).toThrow('TEXT_TOO_LONG');
  });
  it('applies user/guild rolling limits atomically and recovers after the window',()=>{
    let at=0;const rate=new SlidingLimit(()=>at);rate.take([{key:'guild',limit:2},{key:'u',limit:1}]);expect(()=>rate.take([{key:'guild',limit:2},{key:'u',limit:1}])).toThrow('RATE_LIMIT');
    rate.take([{key:'guild',limit:2},{key:'v',limit:1}]);expect(()=>rate.take([{key:'guild',limit:2}])).toThrow('RATE_LIMIT');at=60001;expect(()=>rate.take([{key:'guild',limit:2},{key:'u',limit:1}])).not.toThrow();
  });
});
