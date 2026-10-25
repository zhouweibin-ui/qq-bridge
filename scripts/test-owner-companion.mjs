import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import yaml from 'js-yaml';
const source=fs.readFileSync(new URL('../src/bridge.js',import.meta.url),'utf8');
const body=source.slice(source.indexOf('  function modePreset('),source.indexOf('  /** 判断一个会话 key'));
const choose=new Function('resolvePresetName','closedAgentPreset','log',`${body}; return modePreset;`)(n=>n,'standard',()=>{});
const cfg={ownerQQ:'123',agentPreset:'qq-chat',socialV2:{ownerCommandAccess:true,agentPreset:'qq-chat-v2'}};
test('only authenticated owner private chat selects command-capable companion',()=>{
 assert.equal(choose('private:123','reserved2',cfg),'qq-owner-v2');
 assert.equal(choose('private:456','reserved2',cfg),'qq-chat-v2');
 assert.equal(choose('group:123','reserved2',cfg),'qq-chat-v2');
 assert.equal(choose('private:123','reserved2',{...cfg,socialV2:{...cfg.socialV2,ownerCommandAccess:false}}),'qq-chat-v2');
 assert.equal(choose('private:456','reserved2',{...cfg,socialV2:{agentPreset:'qq-owner-v2'}}),undefined);
 assert.equal(choose('group:123','reserved2',{...cfg,socialV2:{agentPreset:'qq-owner-v2'}}),undefined);
 assert.equal(choose('private:123','closed-agent',cfg),'standard');
});
test('original companion guard stays intact; owner preset retains wake protocol and adds local tools',()=>{
 const read=n=>yaml.load(fs.readFileSync(new URL(`../dsh/agent-presets/${n}/agent.cordis.yml`,import.meta.url),'utf8'));
 const normal=read('qq-chat-v2'),owner=read('qq-owner-v2');
 assert.ok(normal.some(x=>x.id==='qq-tool-restrict'));
 assert.ok(!normal.some(x=>x.id==='tool-bash'));
 assert.ok(owner.some(x=>x.id==='tool-bash'));
 assert.ok(owner.some(x=>x.id==='tool-fs'));
 assert.ok(!owner.some(x=>x.id==='qq-tool-restrict'));
 assert.match(owner.find(x=>x.id==='persona').config.prefix,/qq_set_wake_config/);
 assert.match(owner.find(x=>x.id==='persona').config.prefix,/没有主人任务时不要自行执行命令/);
});
