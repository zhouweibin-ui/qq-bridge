import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {bridgeHarness} from './audit-bridge-harness.mjs';

test('Qzone uses owner token and respects mode, tool switch, pause and daily limit', async () => {
  const h = await bridgeHarness({config: {socialV2: {enabled: true, qzone: {enabled: true, maxPerDay: 1}}}});
  const server = h.startConsoleServer();
  if (!server.listening) await new Promise(r => server.once('listening', r));
  const request = (key, options = {}) => new Promise((resolve, reject) => {
    const req = http.request({host: '127.0.0.1', port: server.address().port,
      path: options.list ? `/api/socialV2/qzone-list?key=${key}` : '/api/socialV2/send-qzone',
      method: options.list ? 'GET' : 'POST', headers: {'content-type': 'application/json',
        'x-console-token': 'fixture-console-token', 'x-agent-token': options.token ?? h.getSocialV2State(key).agentToken}}, res => {
      let raw = ''; res.on('data', c => raw += c); res.on('end', () => resolve({status: res.statusCode, data: JSON.parse(raw)}));
    });
    req.on('error', reject);
    req.end(options.list ? undefined : JSON.stringify({key, content: 'fixture post', ugcRight: 64}));
  });
  try {
    h.setMode('reserved2');
    assert.equal((await request('group:456')).status, 403);
    assert.equal((await request('private:123', {token: 'bad'})).status, 403);
    h.cfg.socialV2.qzone.enabled = false;
    assert.equal((await request('private:123')).status, 403);
    assert.equal((await request('private:123', {list: true})).status, 403);
    h.cfg.socialV2.qzone.enabled = true;
    h.socialV2.paused = true;
    assert.equal((await request('private:123')).status, 403);
    h.socialV2.paused = false;
    h.cfg.socialV2.tools.sendQzone = false;
    assert.equal((await request('private:123')).status, 403);
    h.cfg.socialV2.tools.sendQzone = true;
    h.setMode('chat');
    assert.equal((await request('private:123')).status, 403);
    h.setMode('reserved2');
    assert.equal((await request('private:123')).status, 200);
    assert.equal((await request('private:123')).status, 429);
    assert.equal(h.calls.http.filter(c => c.url.endsWith('/send_qzone_msg')).length, 1);
  } finally { await new Promise(r => server.close(r)); await h.close(); }
});
