import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bridgeHarness} from './audit-bridge-harness.mjs';
const event=(user,text)=>({user_id:Number(user),self_id:999,message_id:1,sender:{nickname:'fixture'},message:[{type:'text',data:{text}}]});
test('new owner message reaches busy companion as steer, preserving unread receipt',async()=>{
 const h=await bridgeHarness({config:{socialV2:{enabled:true,ownerCommandAccess:true}}});
 try {
  h.setMode('reserved2');h.setPresets(['standard','qq-chat-v2','qq-owner-v2']);
  const sid=await h.ensureSession('private:123');
  h.v2TurnStartAt.set(sid,Date.now());
  await h.handleIncoming('private','123',event('123','先停一下，回答新问题'),h.cfg);
  const p=h.calls.prompts.at(-1);
  assert.equal(p.mode,'steer'); assert.equal(p.sessionId,sid);
  assert.match(p.content[0].text,/先停一下，回答新问题/);
  const st=h.getSocialV2State('private:123');
  assert.equal(st.unread.length,1); assert.ok(st.modelSeenSeqs.has(st.unread[0].seq));
 }finally{await h.close();}
});
test('group messages retain normal wake queue rather than privileged steering',async()=>{
 const h=await bridgeHarness({config:{socialV2:{enabled:true,ownerCommandAccess:true}}});
 try{
  h.setMode('reserved2');const sid=await h.ensureSession('group:456');
  h.v2TurnStartAt.set(sid,Date.now());
  await h.handleIncoming('group','456',event('123','你好'),h.cfg);
  assert.ok(!h.calls.prompts.some(p=>p.mode==='steer'));
 }finally{await h.close();}
});
test('immediate sending removes artificial gaps and keeps normal defaults',()=>{
 const s=fs.readFileSync(new URL('../src/bridge.js',import.meta.url),'utf8');
 const code=s.slice(s.indexOf('  function clampGapV2('),s.indexOf('  function sendMessagesV2('));
 const compute=new Function('randInt',`${code};return computeGapsV2;`)((min)=>min);
 assert.deepEqual(compute(['a','b','c'],'fixed',1000,[],{immediate:true}),[0,0]);
 assert.deepEqual(compute(['a','b'],'fixed',1000,[],{}),[1000]);
});
