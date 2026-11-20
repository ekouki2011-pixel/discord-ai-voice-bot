import { mkdtempSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe,it,expect } from 'vitest';
import { Store } from '../src/db.js';
import { voiceSettings } from '../src/types.js';
describe('real SQLite persistence and limits',()=>{
  it('preserves per-guild user settings, defaults and approvals after close/reopen',()=>{
    const dir=mkdtempSync(join(tmpdir(),'tts-db-'));const path=join(dir,'settings.sqlite');let db=new Store(path);
    try{
      const guild=db.guild('a');guild.autoEnabled=true;guild.readChannelId='read';guild.defaults.voiceId='1';db.saveGuild('a',guild);
      db.saveUser('a','same',voiceSettings.parse({engine:'saydi',voiceId:'vc_1',speed:1.2,volume:0.5}));
      db.syncVoices('saydi',[{engine:'saydi',id:'vc_1',name:'私の声1',status:'ready'}]);db.approve('a','saydi','vc_1','owner');db.close();db=new Store(path);
      expect(db.guild('a').autoEnabled).toBe(true);expect(db.guild('b').autoEnabled).toBe(false);
      expect(db.effective('a','same').engine).toBe('saydi');expect(db.effective('b','same').engine).toBe('voicevox');
      expect(db.effective('a','new').voiceId).toBe('1');expect(db.approved('a','saydi','vc_1')).toBe(true);expect(db.approved('b','saydi','vc_1')).toBe(false);
      const row=db.db.prepare('SELECT updated_at FROM users').get();expect(row?.updated_at).toEqual(expect.any(String));
    }finally{db.close();rmSync(dir,{recursive:true,force:true});}
  });
  it('rolls back all budgets when a user/global budget fails',()=>{
    const db=new Store(':memory:');try{
      expect(()=>db.consume([{scope:'g',chars:10,limit:100},{scope:'cloud:all',chars:10,limit:5}])).toThrow('DAILY_LIMIT');expect(db.usage('g')).toBe(0);
      db.consume([{scope:'g',chars:10,limit:10}]);expect(()=>db.consume([{scope:'g',chars:1,limit:10}])).toThrow('DAILY_LIMIT');expect(db.usage('g')).toBe(10);
    }finally{db.close();}
  });
  it('rejects approvals for processing voices and removes missing voices from the cache',()=>{
    const db=new Store(':memory:');try{db.syncVoices('saydi',[{engine:'saydi',id:'x',name:'x',status:'processing'}]);expect(()=>db.approve('g','saydi','x','u')).toThrow('VOICE_NOT_READY');db.syncVoices('saydi',[]);expect(db.voices('saydi')).toEqual([]);}finally{db.close();}
  });
  it('backs up a live WAL database and restores identical configuration and budget',async()=>{
    const dir=mkdtempSync(join(tmpdir(),'tts-backup-'));const db=new Store(join(dir,'live.sqlite'));let restored:Store|undefined;
    try{const g=db.guild('g');g.maxChars=123;db.saveGuild('g',g);db.consume([{scope:'test',chars:99,limit:100}]);await db.backup(join(dir,'backup.sqlite'));restored=new Store(join(dir,'backup.sqlite'));expect(restored.guild('g')).toEqual(db.guild('g'));expect(restored.usage('test')).toBe(99);}finally{restored?.close();db.close();rmSync(dir,{recursive:true,force:true});}
  });
});
