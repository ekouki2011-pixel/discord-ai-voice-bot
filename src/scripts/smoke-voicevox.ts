import { spawn } from 'node:child_process';
import { readConfig } from '../config.js';
import { Engines } from '../engines/index.js';
import { voiceSettings, publicError } from '../types.js';
const config=readConfig();const engines=new Engines(config);
try{
  const engine=engines.requireAvailable('voicevox');const voices=await engine.listVoices();
  const id=process.env.VOICEVOX_TEST_STYLE_ID;
  if(!id)throw new Error('VOICEVOX_TEST_STYLE_IDに、利用条件を確認したスタイルIDを指定してください。');
  const voice=voices.find(v=>v.id===id);if(!voice)throw new Error('指定スタイルが見つかりません。');
  const audio=await engine.synthesize({text:'こんにちは。日本語の音声読み上げテストです。',settings:voiceSettings.parse({voiceId:id}),signal:AbortSignal.timeout(config.API_TIMEOUT_MS)});
  await new Promise<void>((resolve,reject)=>{
    const proc=spawn(config.FFMPEG_PATH,['-hide_banner','-loglevel','error','-i','pipe:0','-f','null','-'],{stdio:['pipe','ignore','ignore']});
    proc.once('error',reject);proc.once('close',code=>code===0?resolve():reject(new Error('FFmpeg decode failed')));proc.stdin.on('error',()=>{});proc.stdin.end(audio.bytes);
  });
  console.log(`${voice.credit}\nVOICEVOX実音声合成: 成功 ${audio.bytes.length} bytes\nFFmpegデコード: 成功\nDiscord VC再生・iPhone操作: 未検証`);
}catch(error){console.error(error instanceof Error&&!(error.name==='AppError')?error.message:publicError(error));process.exitCode=1;}
