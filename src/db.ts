import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { AppError, guildSettings, voiceSettings, type EngineId, type GuildSettings, type Voice, type VoiceSettings } from './types.js';

export class Store {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), {recursive: true, mode: 0o700});
    this.db = new DatabaseSync(path);
    const version=Number(this.db.prepare('PRAGMA user_version').get()?.user_version??0);
    if(version>1){this.db.close();throw new AppError('DB_VERSION_UNSUPPORTED','このDBは新しいBot用です。対応版へ更新するか、バックアップの復元手順を確認してください。');}
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS guilds (id TEXT PRIMARY KEY, settings TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS users (guild TEXT NOT NULL, id TEXT NOT NULL, settings TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(guild,id));
      CREATE TABLE IF NOT EXISTS voices (engine TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, synced_at TEXT NOT NULL, PRIMARY KEY(engine,id));
      CREATE TABLE IF NOT EXISTS approvals (guild TEXT NOT NULL, engine TEXT NOT NULL, voice TEXT NOT NULL, approved_by TEXT NOT NULL, approved_at TEXT NOT NULL, PRIMARY KEY(guild,engine,voice));
      CREATE TABLE IF NOT EXISTS usage (day TEXT NOT NULL, scope TEXT NOT NULL, chars INTEGER NOT NULL, PRIMARY KEY(day,scope));
      PRAGMA user_version=1;`);
  }
  guild(id: string): GuildSettings {
    const row = this.db.prepare('SELECT settings FROM guilds WHERE id=?').get(id);
    return guildSettings.parse(row ? JSON.parse(String(row.settings)) : {});
  }
  saveGuild(id: string, value: GuildSettings): void {
    const data = guildSettings.parse(value);
    this.db.prepare('INSERT INTO guilds VALUES (?,?) ON CONFLICT(id) DO UPDATE SET settings=excluded.settings').run(id, JSON.stringify(data));
  }
  user(guild: string, id: string): VoiceSettings | null {
    const row = this.db.prepare('SELECT settings FROM users WHERE guild=? AND id=?').get(guild,id);
    return row ? voiceSettings.parse(JSON.parse(String(row.settings))) : null;
  }
  effective(guild: string, id: string): VoiceSettings { return this.user(guild,id) ?? this.guild(guild).defaults; }
  saveUser(guild: string, id: string, value: VoiceSettings): void {
    this.db.prepare('INSERT INTO users VALUES (?,?,?,?) ON CONFLICT(guild,id) DO UPDATE SET settings=excluded.settings, updated_at=excluded.updated_at')
      .run(guild,id,JSON.stringify(voiceSettings.parse(value)),new Date().toISOString());
  }
  resetUser(guild: string, id: string): void { this.db.prepare('DELETE FROM users WHERE guild=? AND id=?').run(guild,id); }
  syncVoices(engine: EngineId, voices: Voice[]): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      // Deleting the cache does not touch the remote service or approvals.
      this.db.prepare('DELETE FROM voices WHERE engine=?').run(engine);
      const stmt = this.db.prepare('INSERT INTO voices VALUES (?,?,?,?)');
      for (const v of voices) stmt.run(engine,v.id,JSON.stringify(v),new Date().toISOString());
      this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  voices(engine?: EngineId): Voice[] {
    const rows = engine ? this.db.prepare('SELECT data FROM voices WHERE engine=? ORDER BY id').all(engine)
      : this.db.prepare('SELECT data FROM voices ORDER BY engine,id').all();
    return rows.map(x => JSON.parse(String(x.data)) as Voice);
  }
  voice(engine: EngineId, id: string): Voice | undefined { return this.voices(engine).find(v => v.id === id); }
  approve(guild: string, engine: EngineId, voice: string, by: string): void {
    const record = this.voice(engine,voice);
    if (!record || record.status !== 'ready') throw new AppError('VOICE_NOT_READY','音声が未同期、処理中、または利用不可です。まず /voice sync を実行してください。');
    this.db.prepare('INSERT INTO approvals VALUES (?,?,?,?,?) ON CONFLICT(guild,engine,voice) DO UPDATE SET approved_by=excluded.approved_by, approved_at=excluded.approved_at')
      .run(guild,engine,voice,by,new Date().toISOString());
  }
  revoke(guild: string, engine: EngineId, voice: string): void {
    this.db.prepare('DELETE FROM approvals WHERE guild=? AND engine=? AND voice=?').run(guild,engine,voice);
  }
  approved(guild: string, engine: EngineId, voice: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM approvals WHERE guild=? AND engine=? AND voice=?').get(guild,engine,voice);
  }
  consume(limits: {scope: string; chars: number; limit: number}[], day = new Date().toISOString().slice(0,10)): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const {scope,chars,limit} of limits) {
        const used = Number(this.db.prepare('SELECT chars FROM usage WHERE day=? AND scope=?').get(day,scope)?.chars ?? 0);
        if (used + chars > limit) throw new AppError('DAILY_LIMIT','本日の文字数上限に達しました。上限はUTC 0時（日本時間9時）に更新されます。');
        this.db.prepare('INSERT INTO usage VALUES (?,?,?) ON CONFLICT(day,scope) DO UPDATE SET chars=usage.chars+excluded.chars').run(day,scope,chars);
      }
      this.db.prepare('DELETE FROM usage WHERE day < ?').run(new Date(Date.now()-35*86400000).toISOString().slice(0,10));
      this.db.exec('COMMIT');
    } catch(e) { this.db.exec('ROLLBACK'); throw e; }
  }
  usage(scope: string): number {
    return Number(this.db.prepare('SELECT chars FROM usage WHERE day=? AND scope=?').get(new Date().toISOString().slice(0,10),scope)?.chars ?? 0);
  }
  async backup(path: string): Promise<void> { mkdirSync(dirname(path),{recursive:true,mode:0o700}); await backup(this.db,path); }
  close(): void { this.db.close(); }
}
