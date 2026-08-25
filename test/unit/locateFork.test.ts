import * as assert from 'node:assert/strict';

import { locateFork } from '../../src/core/fork/locateFork';

suite('locateFork', () => {
  test('PATH 中找得到 fork 時回傳 ready', async () => {
    const result = await locateFork({
      platform: 'darwin',
      env: { PATH: '/opt/bin:/usr/local/bin' },
      isExecutable: async (target) => target === '/usr/local/bin/fork',
      exists: async () => true,
    });

    assert.deepEqual(result, { kind: 'ready', cliPath: '/usr/local/bin/fork' });
  });

  test('只有 App 沒有 CLI 時回傳 appOnly', async () => {
    const result = await locateFork({
      platform: 'darwin',
      env: { PATH: '/usr/local/bin' },
      isExecutable: async () => false,
      exists: async (target) => target === '/Applications/Fork.app',
    });

    assert.deepEqual(result, { kind: 'appOnly', appPath: '/Applications/Fork.app' });
  });

  test('也會找使用者目錄下的 Fork.app', async () => {
    const result = await locateFork({
      platform: 'darwin',
      env: { PATH: '' },
      homeDir: '/Users/someone',
      isExecutable: async () => false,
      exists: async (target) => target === '/Users/someone/Applications/Fork.app',
    });

    assert.deepEqual(result, { kind: 'appOnly', appPath: '/Users/someone/Applications/Fork.app' });
  });

  test('都找不到時回傳 missing', async () => {
    const result = await locateFork({
      platform: 'darwin',
      env: { PATH: '/usr/local/bin' },
      isExecutable: async () => false,
      exists: async () => false,
    });

    assert.deepEqual(result, { kind: 'missing' });
  });

  test('Windows 用分號切 PATH 並找 fork.exe', async () => {
    const result = await locateFork({
      platform: 'win32',
      env: { PATH: 'C:\\tools;C:\\Program Files\\Fork' },
      isExecutable: async (target) => target === 'C:\\tools\\fork.exe',
      exists: async () => false,
    });

    assert.deepEqual(result, { kind: 'ready', cliPath: 'C:\\tools\\fork.exe' });
  });

  test('Linux 直接判定為不支援，不做任何檔案檢查', async () => {
    const result = await locateFork({
      platform: 'linux',
      env: { PATH: '/usr/bin' },
      isExecutable: async () => assert.fail('不該檢查檔案'),
      exists: async () => assert.fail('不該檢查檔案'),
    });

    assert.deepEqual(result, { kind: 'unsupportedPlatform', platform: 'linux' });
  });
});
