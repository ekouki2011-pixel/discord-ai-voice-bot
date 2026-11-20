import { chmod } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readConfig } from '../config.js';
import { Store } from '../db.js';
const config=readConfig();process.umask(0o077);
const target=process.argv[2]??`backups/bot-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`;
if(resolve(target)===resolve(config.DATABASE_PATH))throw new Error('バックアップ先は稼働DBと別のパスを指定してください。');
const store=new Store(config.DATABASE_PATH);
try{await store.backup(target);await chmod(target,0o600);console.log(`バックアップ成功: ${target}`);}finally{store.close();}
