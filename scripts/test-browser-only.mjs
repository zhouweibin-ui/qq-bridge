import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {browserGuard} from '../plugins/qq-agent-presets/qq-browser-only.mjs';
const name = n => `mcp__doubao-browser__${n}`;
const root = path.resolve('state/doubao-jobs');
test('image executor only permits dedicated browser tools, Doubao navigation and job output', () => {
  const check = (tool, args = {}) => browserGuard({name: name(tool), arguments: args}, root);
  assert.equal(check('navigate_page', {url: 'https://www.doubao.com/chat/'}), undefined);
  assert.equal(check('get_network_request', {responseFilePath: path.join(root, 'image.png')}), undefined);
  assert.equal(typeof browserGuard({name: 'bash', arguments: {}}), 'string');
  for (const url of ['https://example.com', 'file:///etc/passwd', 'https://doubao.com.example.com', 'invalid']) {
    assert.equal(typeof check('navigate_page', {url}), 'string');
  }
  assert.equal(typeof check('get_network_request', {requestFilePath: path.join(root, 'request.txt')}), 'string');
  assert.equal(typeof check('get_network_request', {responseFilePath: path.join(root, '..', 'secret')}), 'string');
  assert.equal(typeof check('take_screenshot', {filePath: root + '-other/image.png'}), 'string');
});
