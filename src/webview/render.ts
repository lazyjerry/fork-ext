import type { ConfigGroup, RemoteInfo, RepoInfo } from '../core/git/types';

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
  onGitAutoPush(): void;
  onCopy(text: string, label: string): void;
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
  content.append(renderRemotes(repo));
  content.append(renderConfig(repo.configGroups));

  return content;
}

function renderHead(repo: RepoInfo, handlers: RenderHandlers): HTMLElement {
  const card = section('HEAD');
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
  const card = section('遠端');

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
  const card = section('其他設定', 'wide');

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
    list.append(el('dt', '', entry.key));
    const value = el('dd', '');
    if (entry.value === 'true' || entry.value === 'false') {
      value.append(el('span', `badge bool ${entry.value}`, entry.value));
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

function section(title: string, extraClass = ''): HTMLElement {
  const card = el('section', extraClass ? `card ${extraClass}` : 'card');
  card.append(el('div', 'card-title', title));
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

type IconName = 'refresh' | 'push' | 'fork';

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

/** 路徑用中間省略，頭尾都比中段重要。 */
function middleEllipsis(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${value.slice(0, head)}…${value.slice(value.length - tail)}`;
}
