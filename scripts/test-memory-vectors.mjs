import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createMemoryStore} from '../src/memory-store.js';
import {splitMemoryText,fuseMemoryRanks} from '../src/memory-vectors.js';
const key='private:vector-fixture';const modelPath=path.resolve('state/models/bge-small-zh-v1.5');
async function waitReady(s){for(let i=0;i<100;i++){const x=await s.stats(key);if(x.vectorStatus==='ready')return x;if(x.vectorStatus==='error')throw Error(x.vectorError);await new Promise(r=>setTimeout(r,100));}throw Error('index timeout');}
test('chunking preserves long-text coverage; rank fusion keeps exact and semantic evidence',()=>{
 const text='鲸鱼🐳'.repeat(300);const chunks=splitMemoryText(text);assert.equal(chunks[0].offset,0);assert.ok(chunks.length>1);assert.equal(chunks.at(-1).offset+chunks.at(-1).text.length,text.length);
 assert.ok(chunks.every(c=>text.slice(c.offset,c.offset+c.text.length)===c.text));
 const merged=fuseMemoryRanks([{id:'exact'}],[{id:'related',semanticScore:.8},{id:'exact',semanticScore:.7}],2);assert.equal(merged[0].id,'exact');assert.equal(merged[1].id,'related');
});
test('missing local model falls back to keyword search without breaking archives',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'qq-vector-fallback-'));const s=createMemoryStore({file:path.join(dir,'m.db'),ownerKey:key,vector:{enabled:true,modelPath:path.join(dir,'missing')}});
 try{await s.archive({id:'ok',key,kind:'incoming',text:'空间故障排查'});for(let i=0;i<50;i++){if((await s.stats(key)).vectorStatus==='error')break;await new Promise(r=>setTimeout(r,50));}const r=await s.search({key,query:'空间'});assert.equal(r.results[0].id,'ok');assert.equal(r.vectorEnabled,false);assert.equal((await s.stats(key)).vectorStatus,'error');}finally{await s.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('real BGE q8 retrieves Chinese paraphrases, isolates users, and indexes new facts',{skip:!fs.existsSync(path.join(modelPath,'onnx/model_quantized.onnx')) && 'optional local BGE model is not installed'},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'qq-vector-real-'));let s=createMemoryStore({file:path.join(dir,'m.db'),ownerKey:key,vector:{enabled:true,modelPath}});
 try{
  const items=[['food','吃饭时别放辣椒，我一点辣都受不了。'],['dog','我养了一只金毛犬，它的名字叫豆包。'],['reuse','帮我改程序时尽量利用原来已有的功能，不要另外起一个项目。'],['sport','周末去足球场踢球，喜欢看英超。']];
  await s.batch(items.map(([id,text],i)=>({id,text,key,seq:i+1,kind:'incoming',time:100+i})));
  await s.archive({id:'other',key:'private:other',kind:'incoming',text:'我养的狗名字是秘密'});
  await waitReady(s);
  const queries=[['他养的宠物叫什么名字？','dog'],['用户在饮食上有什么忌口？','food'],['软件开发时应该采用什么改造方式？','reuse']];
  for(const [query,id]of queries){const r=await s.search({key,query,limit:3});console.log(JSON.stringify({query,expected:id,hits:r.results.map(x=>({id:x.id,score:x.semanticScore}))}));assert.equal(r.mode,'hybrid');assert.ok(r.results.some(x=>x.id===id));assert.ok(!r.results.some(x=>x.id==='other'));}
  await s.fact({key,label:'饮食偏好',text:'不能吃辣',sourceId:'food'});await waitReady(s);
  const f=await s.search({key,query:'点菜时要避开什么口味？'});assert.ok(f.facts.some(x=>x.label==='饮食偏好'));
  const before=await s.stats(key);assert.ok(before.indexedChunks>=5);
  await s.close();s=createMemoryStore({file:path.join(dir,'m.db'),ownerKey:key,vector:{enabled:true,modelPath}});const after=await waitReady(s);assert.equal(after.indexedChunks,before.indexedChunks);
 }finally{await s.close();fs.rmSync(dir,{recursive:true,force:true});}
});
