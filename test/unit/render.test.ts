import * as assert from 'node:assert/strict';

import type { RepoInfo } from '../../src/core/git/types';
import type { RenderHandlers, ViewState } from '../../src/webview/render';
import { render } from '../../src/webview/render';
import { createRoot, findAll, findButton, findOne, installDom, type StubElement } from './domStub';

const SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

suite('webview render', () => {
  let restoreDom: () => void;
  let calls: string[];
  let handlers: RenderHandlers;

  setup(() => {
    restoreDom = installDom();
    calls = [];
    handlers = {
      onRefresh: () => calls.push('refresh'),
      onOpenInFork: () => calls.push('open'),
      onGitAutoPush: () => calls.push('autoPush'),
      onCopy: (text, label) => calls.push(`copy:${label}:${text}`),
    };
  });

  teardown(() => {
    restoreDom();
  });

  function draw(state: Partial<ViewState>): StubElement {
    const root = createRoot();
    render(root as unknown as HTMLElement, { repo: null, targetPath: null, readAt: null, loading: false, ...state }, handlers);
    return root;
  }

  test('沒有 repo 時顯示提示與起點路徑，按鈕仍在', () => {
    const root = draw({ targetPath: '/tmp/plain' });

    assert.equal(findOne(root, 'empty-title')?.textContent, '這裡不是 git 儲存庫');
    assert.equal(findOne(root, 'empty-path')?.textContent, '/tmp/plain');
    assert.ok(findButton(root, '刷新'));
    assert.ok(findButton(root, 'Auto Push'));
    assert.ok(findButton(root, '在 Fork 中開啟'));
  });

  test('連資料夾都沒開時講的是另一句話', () => {
    assert.equal(findOne(draw({}), 'empty-title')?.textContent, '尚未開啟任何資料夾');
  });

  test('一般分支畫出分支名、短 SHA、stash 與最近切換', () => {
    const root = draw({ repo: repo(), readAt: Date.parse('2026-08-25T14:32:07') });

    assert.equal(findOne(root, 'branch')?.textContent, 'main');
    assert.equal(findOne(root, 'sha')?.textContent, 'a1b2c3d');
    assert.equal(findOne(root, 'stash')?.textContent, 'stash 2');
    assert.deepEqual(
      findAll(root, 'ref').map((element) => element.textContent),
      ['feat/a', 'feat/b'],
    );
    assert.match(findOne(root, 'read-at')?.textContent ?? '', /^最後讀取 14:32:07$/);
  });

  test('stash 為 0 與沒有切換紀錄時，對應元素整個不出現', () => {
    const root = draw({ repo: repo({ stashCount: 0, recentBranches: [] }) });

    assert.equal(findOne(root, 'stash'), undefined);
    assert.equal(findOne(root, 'recent'), undefined);
  });

  test('detached HEAD 改標 badge，不顯示分支名', () => {
    const root = draw({ repo: repo({ detached: true, branch: null }) });

    assert.equal(findOne(root, 'detached')?.textContent, 'detached HEAD');
    assert.equal(findOne(root, 'branch'), undefined);
  });

  test('遠端顯示 URL、push URL 與上游追蹤', () => {
    const root = draw({ repo: repo() });
    const subs = findAll(root, 'sub').map((element) => element.textContent);

    assert.equal(findOne(root, 'url')?.textContent, 'https://example.com/a.git');
    assert.deepEqual(subs, ['push: git@example.com:a.git', '↳ 追蹤 main']);
  });

  test('設定依 section 分組，布林值走 badge，include 標示未展開', () => {
    const root = draw({ repo: repo() });

    assert.deepEqual(
      findAll(root, 'group-title').map((element) => element.textContent),
      ['core', 'include'],
    );
    assert.equal(findOne(root, 'bool')?.textContent, 'false');
    assert.equal(findOne(root, 'hint')?.textContent, '此設定引入了外部檔案，內容未展開');
  });

  test('warnings 畫在內容最上方', () => {
    const root = draw({ repo: repo({ warnings: ['讀不到 .git/config'] }) });
    assert.equal(findOne(root, 'warning')?.textContent, '讀不到 .git/config');
  });

  test('按鈕接得上處理函式，SHA 複製的是完整值', () => {
    const root = draw({ repo: repo() });

    findButton(root, '刷新')?.click();
    findButton(root, '在 Fork 中開啟')?.click();
    findButton(root, 'Auto Push')?.click();
    findOne(root, 'sha')?.click();

    assert.deepEqual(calls, ['refresh', 'open', 'autoPush', `copy:完整 SHA:${SHA}`]);
  });

  test('工具列按鈕只放圖示，名稱走 aria-label 與 title', () => {
    const root = draw({ repo: repo() });

    for (const label of ['刷新', 'Auto Push', '在 Fork 中開啟']) {
      const element = findButton(root, label);
      assert.equal(element?.textContent, '', `${label} 不該有文字`);
      assert.equal(element?.children[0]?.tagName, 'svg', `${label} 應該有圖示`);
      assert.ok((element?.title.length ?? 0) > 0, `${label} 應該有 tooltip`);
    }
  });

  test('設定卡片橫跨整列，其餘卡片留在兩欄格線裡', () => {
    const root = draw({ repo: repo() });
    const wide = findAll(root, 'wide');

    assert.equal(wide.length, 1);
    assert.ok(wide[0].textContent.startsWith('其他設定'));
  });

  test('過長的路徑中間省略，完整值留在 title', () => {
    const long = `/Users/someone/very/deep/${'segment/'.repeat(12)}project`;
    const label = findOne(draw({ targetPath: long }), 'repo-path');

    assert.ok((label?.textContent.length ?? 0) < long.length);
    assert.ok(label?.textContent.includes('…'));
    assert.equal(label?.title, long);
  });

  test('讀取中顯示的是讀取中，不是舊時間', () => {
    const root = draw({ repo: repo(), readAt: Date.now(), loading: true });
    assert.equal(findOne(root, 'read-at')?.textContent, '讀取中…');
  });
});

function repo(overrides: Partial<RepoInfo> = {}): RepoInfo {
  return {
    repoRoot: '/tmp/demo',
    gitDir: '/tmp/demo/.git',
    branch: 'main',
    detached: false,
    headSha: SHA,
    recentBranches: ['feat/a', 'feat/b'],
    remotes: [{ name: 'origin', url: 'https://example.com/a.git', pushUrl: 'git@example.com:a.git' }],
    upstream: { remote: 'origin', branch: 'main' },
    stashCount: 2,
    configGroups: [
      { title: 'core', entries: [{ key: 'bare', value: 'false' }], hasInclude: false },
      { title: 'include', entries: [{ key: 'path', value: '../shared' }], hasInclude: true },
    ],
    warnings: [],
    ...overrides,
  };
}
