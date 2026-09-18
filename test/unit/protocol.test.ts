import * as assert from 'node:assert/strict';

import { isClientMessage } from '../../src/shared/protocol';

suite('isClientMessage', () => {
  test('webview 實際送出的訊息都接受', () => {
    for (const type of ['ready', 'refresh', 'openInFork', 'openFolder', 'openRemote', 'gitAutoPush']) {
      assert.equal(isClientMessage({ type }), true, type);
    }
    assert.equal(isClientMessage({ type: 'openFile', path: '/repo/README.md' }), true);
    assert.equal(isClientMessage({ type: 'setSkipWorktree', path: 'a.txt', ignore: true }), true);
    assert.equal(isClientMessage({ type: 'setSkipWorktree', path: 'a.txt', ignore: false }), true);
    assert.equal(isClientMessage({ type: 'copyText', text: 'x', label: '路徑' }), true);
  });

  test('不是物件或 type 未知時拒絕', () => {
    assert.equal(isClientMessage(null), false);
    assert.equal(isClientMessage('refresh'), false);
    assert.equal(isClientMessage({}), false);
    assert.equal(isClientMessage({ type: 'runShell' }), false);
    assert.equal(isClientMessage({ type: 42 }), false);
  });

  test('欄位型別不對時拒絕', () => {
    assert.equal(isClientMessage({ type: 'openFile' }), false);
    assert.equal(isClientMessage({ type: 'openFile', path: 1 }), false);
    assert.equal(isClientMessage({ type: 'setSkipWorktree', path: 'a.txt' }), false);
    assert.equal(isClientMessage({ type: 'setSkipWorktree', path: ['a.txt'], ignore: true }), false);
    assert.equal(isClientMessage({ type: 'setSkipWorktree', path: 'a.txt', ignore: 'true' }), false);
    assert.equal(isClientMessage({ type: 'copyText', text: { toString: () => 'x' }, label: 'x' }), false);
    assert.equal(isClientMessage({ type: 'copyText', text: 'x' }), false);
  });
});
