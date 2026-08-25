import { promises as fs } from 'node:fs';
import path from 'node:path';

import { parseGitConfig } from './parseConfig';
import type { ConfigGroup, GitConfigEntry, RemoteInfo, RepoInfo, RepoLocation, UpstreamInfo } from './types';

/** reflog 可能很大，只讀檔尾這麼多位元組就足以取得最近幾次切換。 */
const REFLOG_TAIL_BYTES = 64 * 1024;
const RECENT_BRANCH_LIMIT = 5;
const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const CHECKOUT_LINE = /checkout: moving from (\S+) to (\S+)/;

/** remote.* 與 branch.* 已在專屬區塊呈現，不重複列進「其他設定」。 */
const CONSUMED_SECTIONS = new Set(['remote', 'branch']);

/**
 * 讀出面板要顯示的全部欄位。任何一份檔案讀不到都只降級成 warning，不拋例外，
 * 讓面板至少能顯示拿得到的部分。
 */
export async function readRepoInfo(location: RepoLocation): Promise<RepoInfo> {
  const warnings: string[] = [];
  const commonDir = await resolveCommonDir(location.gitDir);

  const head = await readHead(location.gitDir, warnings);
  const headSha = head.sha ?? (head.ref ? await resolveRef(location.gitDir, commonDir, head.ref) : null);
  const entries = await readConfigEntries(commonDir, warnings);

  return {
    repoRoot: location.repoRoot,
    gitDir: location.gitDir,
    branch: head.branch,
    detached: head.detached,
    headSha,
    recentBranches: await readRecentBranches(location.gitDir, head.branch),
    remotes: collectRemotes(entries),
    upstream: collectUpstream(entries, head.branch),
    stashCount: await readStashCount(commonDir),
    configGroups: groupConfig(entries),
    warnings,
  };
}

/**
 * linked worktree 的 gitDir 是 .git/worktrees/<name>，只有 HEAD 與自己的 reflog 在裡面；
 * config、packed-refs、stash 都在 commondir 指的主 git 目錄。
 */
async function resolveCommonDir(gitDir: string): Promise<string> {
  const raw = await readTextFile(path.join(gitDir, 'commondir'));
  if (!raw) {
    return gitDir;
  }
  const target = raw.trim();
  return target ? path.resolve(gitDir, target) : gitDir;
}

interface HeadState {
  branch: string | null;
  detached: boolean;
  /** HEAD 指向的 ref 全名，例如 refs/heads/main。 */
  ref: string | null;
  /** detached 時 HEAD 直接寫 SHA。 */
  sha: string | null;
}

async function readHead(gitDir: string, warnings: string[]): Promise<HeadState> {
  const raw = await readTextFile(path.join(gitDir, 'HEAD'));
  if (raw === null) {
    warnings.push('讀不到 .git/HEAD，無法判斷目前分支');
    return { branch: null, detached: false, ref: null, sha: null };
  }

  const line = raw.trim();
  if (line.startsWith('ref:')) {
    const ref = line.slice('ref:'.length).trim();
    return { branch: shortenRef(ref), detached: false, ref, sha: null };
  }
  if (SHA_PATTERN.test(line)) {
    return { branch: null, detached: true, ref: null, sha: line.toLowerCase() };
  }

  warnings.push('.git/HEAD 格式無法辨識');
  return { branch: null, detached: false, ref: null, sha: null };
}

/** 先找鬆散的 ref 檔，沒有再掃 packed-refs。 */
async function resolveRef(gitDir: string, commonDir: string, ref: string): Promise<string | null> {
  for (const base of new Set([gitDir, commonDir])) {
    const loose = await readTextFile(path.join(base, ...ref.split('/')));
    if (loose && SHA_PATTERN.test(loose.trim())) {
      return loose.trim().toLowerCase();
    }
  }

  const packed = await readTextFile(path.join(commonDir, 'packed-refs'));
  if (!packed) {
    return null;
  }

  for (const rawLine of packed.split(/\r?\n/)) {
    // ^ 開頭的行是 annotated tag 的解參考目標，不是 ref 本身。
    if (!rawLine || rawLine.startsWith('#') || rawLine.startsWith('^')) {
      continue;
    }
    const space = rawLine.indexOf(' ');
    if (space === -1) {
      continue;
    }
    if (rawLine.slice(space + 1).trim() === ref) {
      return rawLine.slice(0, space).toLowerCase();
    }
  }
  return null;
}

async function readConfigEntries(commonDir: string, warnings: string[]): Promise<GitConfigEntry[]> {
  const raw = await readTextFile(path.join(commonDir, 'config'));
  if (raw === null) {
    warnings.push('讀不到 .git/config，遠端與設定資訊從缺');
    return [];
  }
  return parseGitConfig(raw);
}

function collectRemotes(entries: GitConfigEntry[]): RemoteInfo[] {
  const byName = new Map<string, RemoteInfo>();

  for (const entry of entries) {
    if (entry.section !== 'remote' || !entry.subsection) {
      continue;
    }
    const remote = byName.get(entry.subsection) ?? { name: entry.subsection };
    if (entry.key === 'url') {
      remote.url = entry.value;
    } else if (entry.key === 'pushurl') {
      remote.pushUrl = entry.value;
    }
    byName.set(entry.subsection, remote);
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function collectUpstream(entries: GitConfigEntry[], branch: string | null): UpstreamInfo | null {
  if (!branch) {
    return null;
  }

  let remote: string | undefined;
  let merge: string | undefined;
  for (const entry of entries) {
    if (entry.section !== 'branch' || entry.subsection !== branch) {
      continue;
    }
    if (entry.key === 'remote') {
      remote = entry.value;
    } else if (entry.key === 'merge') {
      merge = entry.value;
    }
  }

  if (!remote || !merge) {
    return null;
  }
  return { remote, branch: shortenRef(merge) };
}

function groupConfig(entries: GitConfigEntry[]): ConfigGroup[] {
  const groups = new Map<string, ConfigGroup>();

  for (const entry of entries) {
    if (CONSUMED_SECTIONS.has(entry.section)) {
      continue;
    }
    const title = entry.subsection ? `${entry.section} "${entry.subsection}"` : entry.section;
    const group = groups.get(title) ?? { title, entries: [], hasInclude: false };
    group.entries.push({ key: entry.key, value: entry.value });
    if ((entry.section === 'include' || entry.section === 'includeif') && entry.key === 'path') {
      group.hasInclude = true;
    }
    groups.set(title, group);
  }

  return [...groups.values()].sort((a, b) => a.title.localeCompare(b.title));
}

/** 由 reflog 尾端往前找 checkout 紀錄，取出離開過的分支名。 */
async function readRecentBranches(gitDir: string, currentBranch: string | null): Promise<string[]> {
  const tail = await readFileTail(path.join(gitDir, 'logs', 'HEAD'), REFLOG_TAIL_BYTES);
  if (!tail) {
    return [];
  }

  const lines = tail.text.split('\n');
  // 從檔案中段截斷時，第一行多半只有半截，直接丟掉。
  if (tail.truncated) {
    lines.shift();
  }

  const found: string[] = [];
  for (let i = lines.length - 1; i >= 0 && found.length < RECENT_BRANCH_LIMIT; i -= 1) {
    const tab = lines[i].indexOf('\t');
    if (tab === -1) {
      continue;
    }
    const match = CHECKOUT_LINE.exec(lines[i].slice(tab + 1));
    if (!match) {
      continue;
    }
    const from = match[1];
    // detached 時 from 是 SHA，對「跳回某條分支」沒有幫助。
    if (SHA_PATTERN.test(from) || from === currentBranch || found.includes(from)) {
      continue;
    }
    found.push(from);
  }

  return found;
}

async function readStashCount(commonDir: string): Promise<number> {
  const raw = await readTextFile(path.join(commonDir, 'logs', 'refs', 'stash'));
  if (!raw) {
    return 0;
  }
  return raw.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}

function shortenRef(ref: string): string {
  if (ref.startsWith('refs/heads/')) {
    return ref.slice('refs/heads/'.length);
  }
  return ref.startsWith('refs/') ? ref.slice('refs/'.length) : ref;
}

async function readTextFile(target: string): Promise<string | null> {
  try {
    return await fs.readFile(target, 'utf8');
  } catch {
    return null;
  }
}

async function readFileTail(
  target: string,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean } | null> {
  let handle;
  try {
    handle = await fs.open(target, 'r');
  } catch {
    return null;
  }

  try {
    const stat = await handle.stat();
    const length = Math.min(stat.size, maxBytes);
    if (length === 0) {
      return { text: '', truncated: false };
    }
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, stat.size - length);
    return { text: buffer.toString('utf8'), truncated: stat.size > maxBytes };
  } catch {
    return null;
  } finally {
    await handle.close();
  }
}
