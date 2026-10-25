import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {NodeApiClient} from '../src/dsh-client.js';
test('Desktop port changes invalidate cookies; non-loopback beacons are ignored',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'qq-desktop-'));
 try {
  const file=path.join(dir,'endpoint.json');
  const api=new NodeApiClient('http://127.0.0.1:3080',undefined,{desktopEndpointFile:file});
  fs.writeFileSync(file,JSON.stringify({baseUrl:'http://127.0.0.1:52464',pid:process.pid}));
  assert.equal(api.resolveBase(),'http://127.0.0.1:52464');
  api.cookie='old-cookie';const epoch=api._authEpoch;
  fs.writeFileSync(file,JSON.stringify({baseUrl:'http://127.0.0.1:52465',pid:process.pid}));
  assert.equal(api.resolveBase(),'http://127.0.0.1:52465');assert.equal(api.cookie,null);assert.equal(api._authEpoch,epoch+1);
  fs.writeFileSync(file,JSON.stringify({baseUrl:'https://example.com',pid:process.pid}));
  assert.equal(api.resolveBase(),'http://127.0.0.1:52465');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
