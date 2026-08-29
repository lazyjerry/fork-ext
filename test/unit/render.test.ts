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
      onOpenFolder: () => calls.push('folder'),
      onOpenRemote: () => calls.push('remote'),
      onGitAutoPush: () => calls.push('autoPush'),
      onOpenFile: (target) => calls.push(`openFile:${target}`),
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
    assert.ok(findButton(root, '開啟資料夾'));
    assert.ok(findButton(root, '開啟遠端網頁'));
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

  test('遠端跟 HEAD 同一張卡，網址拆成網域與路徑', () => {
    const root = draw({ repo: repo() });
    const head = card(root, 'HEAD');

    assert.ok(head);
    assert.deepEqual(entryValues(head), ['example.com', 'a.git', 'git@example.com:a.git']);
    assert.equal(findOne(root, 'upstream')?.textContent, '↳ 追蹤 main');
  });

  test('scp 形式與本機路徑的遠端也拆得開', () => {
    const scp = draw({ repo: repo({ remotes: [{ name: 'origin', url: 'git@github.com:owner/repo.git' }] }) });
    assert.deepEqual(entryValues(card(scp, 'HEAD')!), ['github.com', 'owner/repo.git']);

    const local = draw({ repo: repo({ remotes: [{ name: 'origin', url: '/srv/git/repo.git' }] }) });
    assert.deepEqual(entryValues(card(local, 'HEAD')!), ['/srv/git/repo.git']);
  });

  test('設定依 section 分組，布林值走 badge，include 標示未展開', () => {
    const root = draw({ repo: repo() });

    assert.deepEqual(
      findAll(root, 'group-title').map((element) => element.textContent),
      ['core', 'include'],
    );
    assert.equal(findOne(root, 'bool')?.textContent, 'false');
    assert.ok(
      findAll(root, 'hint').some((element) => element.textContent === '此設定引入了外部檔案，內容未展開'),
    );
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
    findButton(root, '開啟資料夾')?.click();
    findButton(root, '開啟遠端網頁')?.click();
    findOne(root, 'sha')?.click();

    assert.deepEqual(calls, ['refresh', 'open', 'autoPush', 'folder', 'remote', `copy:完整 SHA:${SHA}`]);
  });

  test('工具列按鈕只放圖示，名稱走 aria-label 與 title', () => {
    const root = draw({ repo: repo() });

    for (const label of ['刷新', 'Auto Push', '開啟資料夾', '開啟遠端網頁', '在 Fork 中開啟']) {
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

  test('專案卡畫出名稱、版本與規模數字', () => {
    const root = draw({ repo: repo() });

    assert.equal(findOne(root, 'project-name')?.textContent, 'forrrk 0.1.3');
    assert.deepEqual(entryValues(card(root, '專案')!).slice(0, 3), ['Apache-2.0', '3', '2']);
  });

  test('最近提交列出訊息、作者與短 SHA', () => {
    const root = draw({ repo: repo() });

    assert.equal(findOne(root, 'commit-message')?.textContent, '修好刷新按鈕');
    assert.equal(findOne(root, 'commit-author')?.textContent, 'lazyjerry');
    assert.equal(findOne(root, 'commit-sha')?.textContent, 'a1b2c3d');
  });

  test('README 併進專案卡，開啟按鈕送出完整路徑', () => {
    const root = draw({ repo: repo() });
    const project = card(root, '專案');

    assert.ok(project?.textContent.includes('面板說明'));
    findButton(root, '開啟 README.md')?.click();
    assert.deepEqual(calls, ['openFile:/tmp/demo/README.md']);
  });

  test('README 標題跟專案名一樣就不重複標，不一樣才標', () => {
    assert.equal(findOne(draw({ repo: repo() }), 'readme-title'), undefined);

    const renamed = draw({ repo: repo({ readme: { path: '/tmp/demo/README.md', fileName: 'README.md', title: '另一個名字', body: '面板說明' } }) });
    assert.equal(findOne(renamed, 'readme-title')?.textContent, '另一個名字');
  });

  test('沒有 README 就不畫那一段', () => {
    const root = draw({ repo: repo({ readme: null }) });
    assert.equal(findButton(root, '開啟 README.md'), undefined);
  });

  test('環境資訊接在專案卡的欄位後面，全空時整段列都不出現', () => {
    const withEnvironment = draw({ repo: repo() });
    const withoutEnvironment = draw({
      repo: repo({ environment: { submodules: [], worktrees: [], hooks: [], lfs: false, workflows: [] } }),
    });

    assert.deepEqual(entryValues(card(withEnvironment, '專案')!).slice(-3), ['docs', 'pre-commit', 'ci.yml']);
    assert.equal(entryValues(card(withoutEnvironment, '專案')!).length, 5);
  });

  test('卡片固定四張：三張窄卡加一張滿版設定卡', () => {
    const titles = findAll(draw({ repo: repo() }), 'card').map(
      (element) => findOne(element, 'title-main')?.textContent,
    );
    assert.deepEqual(titles, ['HEAD', '專案', '最近提交', '其他設定']);
  });

  test('設定的鍵名旁邊掛中文說明，查得到的才標', () => {
    const root = draw({
      repo: repo({
        configGroups: [
          { title: 'core', entries: [{ key: 'bare', value: 'false' }, { key: 'zzz', value: '1' }], hasInclude: false },
        ],
      }),
    });

    assert.deepEqual(
      findAll(root, 'key-sub')
        .map((element) => element.textContent)
        .filter((text) => text === '裸儲存庫' || text === ''),
      ['裸儲存庫'],
    );
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

/** 卡片標題是卡片裡第一個 title-main（卡片內的小標題排在它後面）。 */
function card(root: StubElement, title: string): StubElement | undefined {
  return findAll(root, 'card').find((element) => findOne(element, 'title-main')?.textContent === title);
}

/** 一張卡裡所有欄位清單的值，依畫出來的順序。 */
function entryValues(scope: StubElement): string[] {
  return findAll(scope, 'entries').flatMap((list) =>
    list.children.filter((child) => child.tagName === 'dd').map((child) => child.textContent),
  );
}

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
    activity: {
      recentCommits: [{ sha: SHA, message: '修好刷新按鈕', author: 'lazyjerry', at: Date.now() - 3600_000 }],
      commitsLast7Days: 4,
      commitsLast30Days: 9,
      lastActivityAt: Date.now() - 600_000,
      authors: ['lazyjerry'],
      truncated: false,
    },
    scale: {
      branchCount: 3,
      tagCount: 2,
      packBytes: 2_500_000,
      looseObjectCount: 12,
      lastGitOperationAt: Date.now() - 900_000,
    },
    project: {
      name: 'forrrk',
      version: '0.1.3',
      description: '在 VS Code 底部面板檢視 git 資訊',
      source: 'package.json',
      license: 'Apache-2.0',
    },
    readme: { path: '/tmp/demo/README.md', fileName: 'README.md', title: 'forrrk', body: '面板說明' },
    environment: { submodules: ['docs'], worktrees: [], hooks: ['pre-commit'], lfs: false, workflows: ['ci.yml'] },
    warnings: [],
    ...overrides,
  };
}
