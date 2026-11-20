import { spawnSync } from 'node:child_process';
import { generateDependencyReport } from '@discordjs/voice';
import { readConfig } from '../config.js';
import { Engines } from '../engines/index.js';
import { Store } from '../db.js';
import { publicError } from '../types.js';
const config=readConfig();const engines=new Engines(config);let failures=0;
console.log(`Node.js: ${process.version}`);console.log(generateDependencyReport());
const ffmpeg=spawnSync(config.FFMPEG_PATH,['-version'],{encoding:'utf8'});
console.log('FFmpeg: '+(ffmpeg.status===0?'利用可能':'見つかりません'));if(ffmpeg.status!==0)failures++;
console.log('Discord token: '+(config.DISCORD_TOKEN?'設定済み（認証未確認）':'認証待ち'));if(!config.DISCORD_TOKEN)failures++;
console.log('Message Content Intent: '+(config.MESSAGE_CONTENT_ENABLED?'要求予定（Portalでの許可確認が必要）':'無効（/sayは利用可能）'));
for(const state of engines.states())console.log(state);
const store=new Store(config.DATABASE_PATH);console.log('SQLite: 接続成功');store.close();
try{const voices=await engines.get('voicevox').listVoices();console.log(`VOICEVOX実接続: 成功、${voices.length}スタイル（生成未確認）`);}catch(e){console.log('VOICEVOX実接続: '+publicError(e));failures++;}
if(failures)process.exitCode=1;
