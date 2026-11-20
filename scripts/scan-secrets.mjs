import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const suspicious=[];
const patterns=[/sv_live_[A-Za-z0-9_-]{16,}/,/sk_[A-Za-z0-9]{24,}/,/mfa\.[A-Za-z0-9_-]{30,}/,/[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6,8}\.[A-Za-z0-9_-]{25,}/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
for(const path of files){
  if(path==='.env'||path.startsWith('.env.')&&path!=='.env.example'||/\.(sqlite|db)(-|$)/.test(path))suspicious.push(path);
  const text=readFileSync(path,'utf8');
  if(patterns.some(p=>p.test(text)))suspicious.push(path);
}
if(suspicious.length){console.error('秘密情報の疑いがあるファイル（値は表示しません）:',[...new Set(suspicious)].join(', '));process.exitCode=1;}
else console.log(`追跡対象${files.length}ファイル：一般的な秘密情報パターンは検出されませんでした。`);
