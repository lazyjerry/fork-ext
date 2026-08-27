import type { ConfigGroup, RemoteInfo, RepoInfo } from '../core/git/types';
import { configLabel } from './configLabels';

// 零框架：狀態變了就整段重畫。面板內容量很小，重畫比維護 diff 便宜。
// 所有文字一律走 textContent，git config 的值可能含任何字元，不能拼進 innerHTML。

export interface ViewState {
  repo: RepoInfo | null;
  targetPath: string | null;
  readAt: number | null;
  loading: boolean;
}

export interface RenderHandlers {
  onRefresh(): void;
  onOpenInFork(): void;
  onOpenFolder(): void;
  onGitAutoPush(): void;
  onCopy(text: string, label: string): void;
  onOpenFile(target: string): void;
}

const PATH_MAX_LENGTH = 64;

export function render(root: HTMLElement, state: ViewState, handlers: RenderHandlers): void {
  root.textContent = '';
  root.append(renderToolbar(state, handlers));

  if (state.repo) {
    root.append(renderContent(state.repo, handlers));
    return;
  }
  root.append(renderEmpty(state));
}

function renderToolbar(state: ViewState, handlers: RenderHandlers): HTMLElement {
  const bar = el('div', 'toolbar');
  const info = el('div', 'toolbar-info');

  const target = state.repo?.repoRoot ?? state.targetPath;
  const pathLabel = el('span', 'repo-path', target ? middleEllipsis(target, PATH_MAX_LENGTH) : '尚未開啟任何資料夾');
  if (target) {
    pathLabel.title = target;
  }
  info.append(pathLabel);

  const readAt = el('span', 'read-at', state.loading ? '讀取中…' : formatReadAt(state.readAt));
  info.append(readAt);
  bar.append(info);

  const actions = el('div', 'toolbar-actions');
  actions.append(iconButton('刷新', 'refresh', 'solid', handlers.onRefresh, '刷新'));
  actions.append(
    iconButton('Auto Push', 'push', 'solid', handlers.onGitAutoPush, 'Auto Push：在終端機執行 git-auto-push -a'),
  );
  actions.append(
    iconButton('開啟資料夾', 'folder', 'solid', handlers.onOpenFolder, '開啟資料夾：在檔案管理員開啟儲存庫根目錄'),
  );
  actions.append(iconButton('在 Fork 中開啟', 'fork', 'primary', handlers.onOpenInFork, '在 Fork 中開啟'));
  bar.append(actions);

  return bar;
}

function renderEmpty(state: ViewState): HTMLElement {
  const box = el('div', 'empty');
  box.append(el('div', 'empty-title', state.targetPath ? '這裡不是 git 儲存庫' : '尚未開啟任何資料夾'));
  if (state.targetPath) {
    box.append(el('div', 'empty-path', state.targetPath));
  }
  box.append(el('div', 'empty-hint', '開啟儲存庫裡的檔案後按「刷新」。'));
  return box;
}

function renderContent(repo: RepoInfo, handlers: RenderHandlers): HTMLElement {
  const content = el('div', 'content');

  for (const warning of repo.warnings) {
    content.append(el('div', 'warning', warning));
  }
  content.append(renderHead(repo, handlers));
  content.append(renderProject(repo));
  content.append(renderActivity(repo));
  if (repo.readme) {
    content.append(renderReadme(repo.readme, handlers));
  }
  content.append(renderRemotes(repo));
  const environment = renderEnvironment(repo);
  if (environment) {
    content.append(environment);
  }
  content.append(renderConfig(repo.configGroups));

  return content;
}

function renderHead(repo: RepoInfo, handlers: RenderHandlers): HTMLElement {
  const card = section('HEAD', '目前狀態');
  const main = el('div', 'head-main');

  if (repo.detached) {
    main.append(el('span', 'badge detached', 'detached HEAD'));
  } else if (repo.branch) {
    main.append(el('span', 'branch', repo.branch));
  } else {
    main.append(el('span', 'branch unknown', '無法判斷分支'));
  }

  if (repo.headSha) {
    const sha = repo.headSha;
    const shaButton = button(sha.slice(0, 7), 'sha', () => handlers.onCopy(sha, '完整 SHA'));
    shaButton.title = `${sha}\n點擊複製完整 SHA`;
    main.append(shaButton);
  }

  if (repo.stashCount > 0) {
    main.append(el('span', 'badge stash', `stash ${repo.stashCount}`));
  }
  card.append(main);

  if (repo.recentBranches.length > 0) {
    const recent = el('div', 'recent');
    recent.append(el('span', 'recent-label', '最近切換：'));
    repo.recentBranches.forEach((name, index) => {
      if (index > 0) {
        recent.append(el('span', 'separator', '·'));
      }
      recent.append(el('span', 'ref', name));
    });
    card.append(recent);
  }

  return card;
}

function renderRemotes(repo: RepoInfo): HTMLElement {
  const card = section('遠端', 'Remotes');

  if (repo.remotes.length === 0) {
    card.append(el('div', 'muted', '未設定遠端'));
    return card;
  }

  const list = el('ul', 'remotes');
  for (const remote of repo.remotes) {
    list.append(renderRemote(remote, repo));
  }
  card.append(list);
  return card;
}

function renderRemote(remote: RemoteInfo, repo: RepoInfo): HTMLElement {
  const item = el('li', 'remote');

  const headline = el('div', 'remote-headline');
  headline.append(el('span', 'badge name', remote.name));
  headline.append(el('span', 'url', remote.url ?? '（未設定 url）'));
  item.append(headline);

  if (remote.pushUrl && remote.pushUrl !== remote.url) {
    item.append(el('div', 'sub', `push: ${remote.pushUrl}`));
  }
  if (repo.upstream && repo.upstream.remote === remote.name) {
    item.append(el('div', 'sub upstream', `↳ 追蹤 ${repo.upstream.branch}`));
  }

  return item;
}

function renderConfig(groups: ConfigGroup[]): HTMLElement {
  const card = section('其他設定', 'Config', 'wide');

  if (groups.length === 0) {
    card.append(el('div', 'muted', '沒有其他設定'));
    return card;
  }

  const wrapper = el('div', 'config-groups');
  for (const group of groups) {
    wrapper.append(renderConfigGroup(group));
  }
  card.append(wrapper);
  return card;
}

function renderConfigGroup(group: ConfigGroup): HTMLElement {
  const box = el('div', 'group');
  box.append(el('div', 'group-title', group.title));

  const list = el('dl', 'entries');
  for (const entry of group.entries) {
    const key = el('dt', '');
    key.append(el('span', 'key-main', entry.key));
    const label = configLabel(group.title, entry.key);
    if (label) {
      key.append(el('span', 'key-sub', label));
    }
    list.append(key);

    const value = el('dd', '');
    if (entry.value === 'true' || entry.value === 'false') {
      value.append(el('span', `bool ${entry.value}`, entry.value));
    } else {
      value.textContent = entry.value;
    }
    list.append(value);
  }
  box.append(list);

  if (group.hasInclude) {
    box.append(el('div', 'hint', '此設定引入了外部檔案，內容未展開'));
  }
  return box;
}

/** 卡片標題一律中英並列，掃標題就知道這張在講什麼、對應到 git 的哪個名詞。 */
function section(title: string, subtitle: string, extraClass = ''): HTMLElement {
  const card = el('section', extraClass ? `card ${extraClass}` : 'card');
  const heading = el('div', 'card-title');
  heading.append(el('span', 'title-main', title));
  heading.append(el('span', 'title-sub', subtitle));
  card.append(heading);
  return card;
}

/** 中英對照的欄位清單，沿用「其他設定」那組斑馬紋樣式。 */
function statList(rows: Array<{ label: string; sub: string; value: string | HTMLElement }>): HTMLElement {
  const list = el('dl', 'entries');
  for (const row of rows) {
    const key = el('dt', '');
    key.append(el('span', 'key-main', row.label));
    key.append(el('span', 'key-sub', row.sub));
    list.append(key);

    const value = el('dd', '');
    if (typeof row.value === 'string') {
      value.textContent = row.value;
    } else {
      value.append(row.value);
    }
    list.append(value);
  }
  return list;
}

function renderProject(repo: RepoInfo): HTMLElement {
  const card = section('專案', 'Project');
  const { project, scale } = repo;

  if (project?.name) {
    const headline = el('div', 'project-name', project.version ? `${project.name} ${project.version}` : project.name);
    headline.title = `來源：${project.source}`;
    card.append(headline);
  }
  if (project?.description) {
    card.append(el('div', 'project-description', project.description));
  }

  const rows: Array<{ label: string; sub: string; value: string }> = [];
  if (project?.license) {
    rows.push({ label: '授權', sub: 'License', value: project.license });
  }
  rows.push({ label: '分支數', sub: 'Branches', value: String(scale.branchCount) });
  rows.push({ label: '標籤數', sub: 'Tags', value: String(scale.tagCount) });
  rows.push({
    label: '物件庫',
    sub: 'Objects',
    value: `${formatBytes(scale.packBytes)}（鬆散物件 ${scale.looseObjectCount}）`,
  });
  rows.push({
    label: '上次操作',
    sub: 'Last git activity',
    value: scale.lastGitOperationAt === null ? '未知' : formatMoment(scale.lastGitOperationAt),
  });
  card.append(statList(rows));

  if (!project) {
    card.append(el('div', 'hint', '沒有找到 package.json 之類的專案宣告檔'));
  }
  return card;
}

function renderActivity(repo: RepoInfo): HTMLElement {
  const card = section('最近提交', 'Recent commits');
  const { activity } = repo;

  if (activity.recentCommits.length === 0) {
    card.append(el('div', 'muted', 'reflog 裡沒有這台機器上的提交紀錄'));
  } else {
    const list = el('ul', 'commits');
    for (const commit of activity.recentCommits) {
      const item = el('li', 'commit');
      item.append(el('div', 'commit-message', commit.message || '（無訊息）'));
      const meta = el('div', 'commit-meta');
      meta.append(el('span', 'commit-author', commit.author));
      meta.append(el('span', 'separator', '·'));
      meta.append(el('span', 'commit-time', formatMoment(commit.at)));
      meta.append(el('span', 'separator', '·'));
      meta.append(el('span', 'commit-sha', commit.sha.slice(0, 7)));
      item.append(meta);
      list.append(item);
    }
    card.append(list);
  }

  card.append(
    statList([
      { label: '近 7 天', sub: 'Last 7 days', value: `${activity.commitsLast7Days} 次提交` },
      { label: '近 30 天', sub: 'Last 30 days', value: `${activity.commitsLast30Days} 次提交` },
      {
        label: '最後活動',
        sub: 'Last activity',
        value: activity.lastActivityAt === null ? '未知' : formatMoment(activity.lastActivityAt),
      },
      { label: '作者', sub: 'Authors', value: activity.authors.length > 0 ? activity.authors.join('、') : '未知' },
    ]),
  );

  card.append(
    el(
      'div',
      'hint',
      activity.truncated
        ? 'reflog 太長只讀了檔尾，統計僅涵蓋最近一段；且 reflog 只記這台機器上的操作。'
        : 'reflog 只記這台機器上的操作，不含別人推上遠端的提交。',
    ),
  );
  return card;
}

function renderReadme(readme: NonNullable<RepoInfo['readme']>, handlers: RenderHandlers): HTMLElement {
  const card = section('README', '專案說明');

  if (readme.title) {
    card.append(el('div', 'readme-title', readme.title));
  }
  if (readme.body) {
    card.append(el('div', 'readme-body', readme.body));
  } else {
    card.append(el('div', 'muted', '找不到可摘要的段落'));
  }

  const open = button(`開啟 ${readme.fileName}`, 'link', () => handlers.onOpenFile(readme.path));
  open.title = readme.path;
  card.append(open);
  return card;
}

function renderEnvironment(repo: RepoInfo): HTMLElement | null {
  const { submodules, worktrees, hooks, lfs, workflows } = repo.environment;
  const rows: Array<{ label: string; sub: string; value: string }> = [];

  if (submodules.length > 0) {
    rows.push({ label: '子模組', sub: 'Submodules', value: submodules.join('、') });
  }
  if (worktrees.length > 0) {
    rows.push({ label: '連結工作樹', sub: 'Worktrees', value: worktrees.join('、') });
  }
  if (hooks.length > 0) {
    rows.push({ label: '已安裝 hook', sub: 'Hooks', value: hooks.join('、') });
  }
  if (lfs) {
    rows.push({ label: 'Git LFS', sub: 'Large File Storage', value: '已啟用' });
  }
  if (workflows.length > 0) {
    rows.push({ label: 'CI 流程', sub: 'Workflows', value: workflows.join('、') });
  }
  if (rows.length === 0) {
    return null;
  }

  const card = section('環境', 'Environment');
  card.append(statList(rows));
  return card;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.className = className;
  element.textContent = label;
  element.addEventListener('click', onClick);
  return element;
}

/** 只有圖示的按鈕：label 走 aria-label，讀螢幕與測試都還找得到它。 */
function iconButton(
  label: string,
  icon: IconName,
  className: string,
  onClick: () => void,
  tooltip: string,
): HTMLButtonElement {
  const element = document.createElement('button');
  element.className = `icon-button ${className}`;
  element.setAttribute('aria-label', label);
  element.title = tooltip;
  element.append(iconElement(icon));
  element.addEventListener('click', onClick);
  return element;
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

type IconName = 'refresh' | 'push' | 'folder' | 'fork';

interface IconShape {
  tag: 'path' | 'circle';
  attributes: Record<string, string>;
}

// 線條圖示，一律 24x24、stroke 走 currentColor，跟著按鈕文字色與主題走。
const ICONS: Record<IconName, IconShape[]> = {
  refresh: [
    { tag: 'path', attributes: { d: 'M20.5 8.5A8.5 8.5 0 0 0 4.2 10.7' } },
    { tag: 'path', attributes: { d: 'M3.5 15.5a8.5 8.5 0 0 0 16.3-2.2' } },
    { tag: 'path', attributes: { d: 'M20.5 3.5v5h-5' } },
    { tag: 'path', attributes: { d: 'M3.5 20.5v-5h5' } },
  ],
  push: [
    { tag: 'path', attributes: { d: 'M12 20V5' } },
    { tag: 'path', attributes: { d: 'M6 11l6-6 6 6' } },
    { tag: 'path', attributes: { d: 'M4 3.5h16' } },
  ],
  folder: [
    { tag: 'path', attributes: { d: 'M3.5 18.4V6.6c0-.9.7-1.6 1.6-1.6h3.6l2.2 2.6h7.6c.9 0 1.6.7 1.6 1.6v9.2c0 .9-.7 1.6-1.6 1.6H5.1c-.9 0-1.6-.7-1.6-1.6z' } },
  ],
  // 與 Panel 分頁圖示同一組線條，兩處看起來是同一個東西。
  fork: [
    { tag: 'circle', attributes: { cx: '6', cy: '19', r: '2.4' } },
    { tag: 'circle', attributes: { cx: '6', cy: '5', r: '2.4' } },
    { tag: 'circle', attributes: { cx: '18', cy: '8', r: '2.4' } },
    { tag: 'path', attributes: { d: 'M6 7.4v9.2' } },
    { tag: 'path', attributes: { d: 'M18 10.4c0 3.2-2.6 4.6-6 5.2' } },
  ],
};

function iconElement(name: IconName): SVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg') as SVGElement;
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.9');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  for (const shape of ICONS[name]) {
    const node = document.createElementNS(SVG_NAMESPACE, shape.tag) as SVGElement;
    for (const [key, value] of Object.entries(shape.attributes)) {
      node.setAttribute(key, value);
    }
    svg.append(node);
  }
  return svg;
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function formatReadAt(readAt: number | null): string {
  if (readAt === null) {
    return '尚未讀取';
  }
  return `最後讀取 ${new Date(readAt).toLocaleTimeString(undefined, { hour12: false })}`;
}

/** 一天內講「幾小時前」，再久就直接給日期——面板是掃一眼的地方。 */
function formatMoment(at: number): string {
  const diff = Date.now() - at;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < 0) {
    return new Date(at).toLocaleDateString();
  }
  if (diff < minute) {
    return '剛剛';
  }
  if (diff < hour) {
    return `${Math.floor(diff / minute)} 分鐘前`;
  }
  if (diff < day) {
    return `${Math.floor(diff / hour)} 小時前`;
  }
  if (diff < 30 * day) {
    return `${Math.floor(diff / day)} 天前`;
  }
  return new Date(at).toLocaleDateString();
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** index;
  return `${index === 0 ? value : value.toFixed(1)} ${units[index]}`;
}

/** 路徑用中間省略，頭尾都比中段重要。 */
function middleEllipsis(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${value.slice(0, head)}…${value.slice(value.length - tail)}`;
}
