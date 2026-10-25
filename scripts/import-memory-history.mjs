// One-off backfill into the same integrated store. Reads QQ history, never sends messages.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createMemoryStore,sanitizeMemoryText,sanitizeMemoryValue} from '../src/memory-store.js';
const root=fileURLToPath(new URL('..',import.meta.url));
const c=JSON.parse(fs.readFileSync(path.join(root,'config.json')));
const key=`private:${c.ownerQQ}`;
if (!c.ownerQQ) throw Error('请先在 config.json 设置 ownerQQ');
const secrets=[c.snowluma?.accessToken,c.dsh?.authToken,c.consoleToken];
const state=JSON.parse(fs.readFileSync(path.join(root,'state/social-v2.json')));
for(const v of Object.values(state.conversations||{}))secrets.push(v.agentToken);
const safe=v=>sanitizeMemoryValue(v,secrets);
const store=createMemoryStore({file:path.join(root,'state/memory.db'),ownerKey:key,coreFile:path.join(root,'workspace/MEMORY.md')});
async function action(name,body){const r=await fetch(c.snowluma.httpUrl+'/'+name,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+c.snowluma.accessToken},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});const x=await r.json();if(!r.ok||x.status!=='ok'||x.retcode!==0)throw Error(`${name}: ${x.wording||r.status}`);return x.data;}
let historyInserted=0,toolInserted=0,pages=0,complete=false;
try{
 const self=String((await action('get_login_info',{})).user_id);let anchor=0;const seen=new Set();
 for(let page=0;page<20;page++){
  const data=await action('get_friend_msg_history',{user_id:Number(c.ownerQQ),message_id:anchor,count:100,reverse_order:true});
  const list=data.messages||[];pages++;
  const events=[];
  for(const m of list){
   const id=String(m.message_id??m.message_seq??'');if(!id||seen.has(id))continue;seen.add(id);
   const sender=String(m.sender?.user_id??m.user_id??'');const outgoing=sender===self;
   const text=String(m.raw_message||m.message?.map(x=>x.type==='text'?x.data?.text||'':`[${x.type}]`).join('')||'');
   events.push({id:`qq-${outgoing?'out':'in'}:${key}:${id}`,key,time:Number(m.time)*1000,kind:outgoing?'outgoing':'incoming',text:sanitizeMemoryText(text,secrets),source:'qq-history',metadata:safe({messageId:id,sender,segments:m.message,history:true})});
  }
  if(!events.length){complete=true;break;}
  historyInserted+=(await store.batch(events)).inserted;
  const oldest=[...list].sort((a,b)=>Number(a.time)-Number(b.time))[0];const next=Number(oldest?.message_id??oldest?.message_seq??0);
  if(!next||next===anchor){complete=true;break;}anchor=next;
  if(list.length<100){complete=true;break;}
 }
 // Reuse existing DSH execution logs, retaining source session and event seq.
 // Optional directory explicitly selected by the operator; never scan unrelated sessions.
 const sessionRoot=process.env.QQ_BRIDGE_IMPORT_SESSION_DIR;
 const decompress=promisify(execFile);
 for(const dir of sessionRoot ? fs.readdirSync(sessionRoot) : []){
  if(!dir.startsWith('session-'))continue;
  const file=path.join(sessionRoot,dir,'session.v4.jsonl.zstd');if(!fs.existsSync(file))continue;
  let raw;
  try{raw=(await decompress('zstd',['-dc',file],{maxBuffer:100*1024*1024})).stdout;}catch(error){throw Error(`无法读取 DSH 日志（需在 PATH 安装 zstd）：${error.message}`);}
  const events=[];
  for(const line of raw.split('\n')){
   if(!line)continue;let event;try{event=JSON.parse(line);}catch{continue;}
   if(!['tool/call','tool/result'].includes(event.type))continue;
   // Tool arguments are JSON strings; decode before redaction where possible.
   const d=structuredClone(event.data||{});
   if(typeof d.arguments==='string'){try{d.arguments=JSON.parse(d.arguments);}catch{}}
   events.push({id:`dsh:${dir}:${event.seq}`,key,time:event.time,kind:event.type,text:JSON.stringify(safe(d)),source:dir,metadata:{eventSeq:event.seq,history:true}});
  }
  for(let i=0;i<events.length;i+=50)toolInserted+=(await store.batch(events.slice(i,i+50))).inserted;
 }
 const st=state.conversations[key];
 if(!(await store.profile(key)).count)for(const [label,v]of Object.entries(st?.memberImpressions||{}))await store.fact({key,label,text:(v.traits||[]).join('；'),source:'legacy-import'});
 const result={time:new Date().toISOString(),historyInserted,toolInserted,pages,historyExhausted:complete,...await store.stats(key)};
 fs.writeFileSync(path.join(root,'state/memory-import-report.json'),JSON.stringify(result,null,2),{mode:0o600});
 fs.writeFileSync(path.join(root,'state/memory-migrated'),'legacy preferences imported\n',{mode:0o600});
 console.log(JSON.stringify(result));
}finally{await store.close();}
