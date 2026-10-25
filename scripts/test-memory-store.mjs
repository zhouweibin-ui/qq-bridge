import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createMemoryStore,sanitizeMemoryText,sanitizeMemoryValue} from '../src/memory-store.js';
import {bridgeHarness} from './audit-bridge-harness.mjs';
const key='private:123';
async function fixture(run){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'qq-memory-test-'));
 const options={file:path.join(dir,'memory.db'),ownerKey:key,coreFile:path.join(dir,'MEMORY.md')};
 let store=createMemoryStore(options);
 try{await run(store,options,async()=>{await store.close();store=createMemoryStore(options);return store;});}
 finally{await store.close().catch(()=>{});fs.rmSync(dir,{recursive:true,force:true});}
}
test('archive persists long Chinese text, deduplicates, supports FTS and two-character fallback',()=>fixture(async(s)=>{
 const text='开始'.repeat(15000)+'之前约定工具优先复用，不另起程序。';
 await s.archive({id:'a',key,seq:1,kind:'incoming',text,time:100});
 assert.equal((await s.archive({id:'a',key,text})).inserted,0);
 assert.equal((await s.search({key,query:'优先复用'})).results[0].id,'a');
 assert.equal((await s.search({key,query:'复用'})).results[0].id,'a');
 let reconstructed='',offset=0;
 do{const part=await s.get({key,id:'a',offset});reconstructed+=part.text;offset=part.nextOffset;}while(offset!==null);
 assert.equal(reconstructed,text);assert.equal((await s.stats(key)).events,1);
}));
test('conversation isolation applies to search, get, neighbors, and fact sources',()=>fixture(async(s)=>{
 await s.archive({id:'secret',key:'private:999',kind:'incoming',text:'私密偏好',seq:1});
 await s.archive({id:'own',key,kind:'incoming',text:'主人的普通消息',seq:1});
 assert.equal((await s.search({key,query:'私密'})).results.length,0);
 assert.equal((await s.get({key,id:'secret'})).found,false);
 assert.ok((await s.get({key,id:'own',neighbors:3})).neighbors.every(x=>x.id!=='secret'));
 await assert.rejects(s.fact({key,label:'偏好',text:'错误来源',sourceId:'secret'}),/来源未找到/);
}));
test('facts keep earlier versions, resolve source, survive restart, and export bounded core',()=>fixture(async(s,options,reopen)=>{
 await s.archive({id:'msg1',key,kind:'incoming',seq:1,text:'回复简短'});
 await s.fact({key,label:'回复风格',text:'简短',sourceSeq:1});
 await s.archive({id:'msg2',key,kind:'incoming',seq:2,text:'技术问题讲清楚'});
 await s.fact({key,label:'回复风格',text:'技术问题讲清楚',sourceSeq:2});
 let p=await s.profile(key);assert.equal(p.count,1);assert.equal(p.facts[0].sourceId,'msg2');
 const history=await s.get({key,id:`fact:${p.facts[0].id}`});assert.equal(history.history.length,2);assert.equal(history.history[1].active,0);
 s=await reopen();p=await s.profile(key);assert.match(p.text,/技术问题讲清楚/);
 for(let i=0;i<30;i++)await s.fact({key,label:`事项${i}`,text:'保留有效事实'.repeat(35)});
 p=await s.profile(key);assert.ok(p.text.length<5500);assert.equal(p.count,31);
 assert.ok((await s.search({key,query:'保留有效事实',limit:20})).facts.length>0);
 assert.ok(fs.readFileSync(options.coreFile,'utf8').includes('自动生成'));
 await s.remove({key,label:'回复风格'});assert.ok(!(await s.profile(key)).text.includes('回复风格'));
}));
test('default retrieval excludes tool noise and time filtering is exact',()=>fixture(async(s)=>{
 await s.archive({id:'chat',key,kind:'incoming',text:'空间问题',time:100});
 await s.archive({id:'tool',key,kind:'tool/result',text:'空间网络诊断'.repeat(1000),time:200});
 assert.deepEqual((await s.search({key,query:'空间'})).results.map(r=>r.id),['chat']);
 assert.equal((await s.search({key,query:'空间',includeTools:true})).results.length,2);
 assert.equal((await s.search({key,query:'空间',after:150})).results.length,0);
}));
test('credential redaction keeps non-secret prose and media structure',()=>{
 const v=sanitizeMemoryValue({token:'private-token',text:'请复用旧程序 secret-123',media:[{url:'https://example.test/a.png'}]},['secret-123']);
 assert.equal(v.token,'[凭据已隐藏]');assert.match(v.text,/请复用旧程序/);assert.ok(!v.text.includes('secret-123'));assert.equal(v.media[0].url,'https://example.test/a.png');
 assert.ok(!sanitizeMemoryText('Bearer abcdef password="oops"').includes('oops'));
});
function request(port,url,{method='GET',headers={},body}={}){return new Promise((resolve,reject)=>{
 const req=http.request({host:'127.0.0.1',port,path:url,method,headers:{'x-console-token':'fixture-console-token','content-type':'application/json',...headers}},res=>{
 let text='';res.on('data',x=>text+=x);res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(text)}));});req.on('error',reject);req.end(body?JSON.stringify(body):undefined);
});}
test('live bridge route archives full input and enforces token/scope/feature switch',async()=>{
 const h=await bridgeHarness({config:{memory:{enabled:true},socialV2:{enabled:true,ownerCommandAccess:true}}});
 const server=h.startConsoleServer();if(!server.listening)await new Promise(r=>server.once('listening',r));
 try{
  h.setMode('reserved2');h.socialV2.paused=true;
  const input='你好'.repeat(300)+'自动记忆测试原文末尾';
  await h.handleIncoming('private','123',{user_id:123,message_id:12,message:[{type:'text',data:{text:input}}]},h.cfg);
  const token=h.getSocialV2State(key).agentToken;const headers={'x-agent-token':token};const port=server.address().port;
  let r=await request(port,'/api/socialV2/memory-stats?key='+key);assert.equal(r.data.events,1);
  h.socialV2.paused=false;
  r=await request(port,'/api/socialV2/memory-search?key='+key+'&query='+encodeURIComponent('测试原文末尾'),{headers});assert.equal(r.data.results[0].id,'qq-in:private:123:12');
  r=await request(port,'/api/socialV2/memory-get?key='+key+'&id=qq-in:private:123:12',{headers});assert.equal(r.data.text,input);
  r=await request(port,'/api/socialV2/memory-get?key='+key+'&id=qq-in:private:123:12',{headers:{'x-agent-token':'bad'}});assert.equal(r.status,403);
  r=await request(port,'/api/socialV2/memory-search?key=private:999',{headers});assert.equal(r.status,403);
  r=await request(port,'/api/socialV2/memory-append',{method:'POST',headers,body:{key,category:'memberImpression',content:'没有来源',extra:{target:'偏好'}}});assert.equal(r.status,400);
  r=await request(port,'/api/socialV2/memory-append',{method:'POST',headers,body:{key,category:'memberImpression',content:'原文对应的测试偏好',extra:{target:'偏好',sourceSeq:1}}});assert.equal(r.status,200);
  assert.match(h.durableMemory.core(key),/qq-in:private:123:12/);
  h.cfg.socialV2.tools={memory:false};
  r=await request(port,'/api/socialV2/memory-search?key='+key,{headers});assert.equal(r.status,403);
 }finally{await new Promise(r=>server.close(r));await h.close();}
});
test('an unavailable memory database leaves incoming chat usable',async()=>{
 const h=await bridgeHarness({config:{memory:{enabled:true},socialV2:{enabled:true}},files:{'state/memory.db':'invalid sqlite fixture'}});
 try{
  h.setMode('reserved2');h.socialV2.paused=true;
  await assert.doesNotReject(h.handleIncoming('private','123',{user_id:123,message_id:1,message:[{type:'text',data:{text:'记忆故障也要继续聊天'}}]},h.cfg));
  assert.equal(h.getSocialV2State(key).unread.length,1);
 }finally{await h.close().catch(()=>{});}
});
