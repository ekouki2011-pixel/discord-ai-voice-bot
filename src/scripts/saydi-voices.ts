import { readConfig } from '../config.js';
import { Engines } from '../engines/index.js';
import { SaydiEngine } from '../engines/saydi.js';
import { publicError } from '../types.js';
const config=readConfig();const engines=new Engines(config);
try{
  const provider=engines.requireAvailable('saydi') as SaydiEngine;
  const voices=await provider.listVoices();
  console.table(voices.map(v=>({name:v.name,id:v.id,status:v.status})));
  const voice=await provider.findMyVoice('私の声1');
  console.log(`既存「私の声1」のVoice ID: ${voice.id}\n状態: ${voice.status}\n生成・再生テストは実行していません。`);
}catch(error){console.error(publicError(error));process.exitCode=1;}
