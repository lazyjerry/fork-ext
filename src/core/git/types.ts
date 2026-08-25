// 面板顯示所需的 git 資訊型別。全部來自直接讀 .git 底下的檔案，不呼叫 git 指令。

/** .git 的位置。gitDir 可能不等於 repoRoot/.git（worktree 與 submodule 會指到別處）。 */
export interface RepoLocation {
  repoRoot: string;
  gitDir: string;
}

/** git config 的一筆設定。section 與 key 正規化為小寫，subsection 保留原樣（git 對它大小寫敏感）。 */
export interface GitConfigEntry {
  section: string;
  subsection?: string;
  key: string;
  value: string;
}

export interface RemoteInfo {
  name: string;
  url?: string;
  pushUrl?: string;
}

/** 目前分支的上游追蹤設定，取自 config 的 [branch "x"]。 */
export interface UpstreamInfo {
  remote: string;
  /** 從 refs/heads/<name> 取出的分支名；非此格式時退回原字串。 */
  branch: string;
}

/** 面板「其他設定」區塊的一組卡片。 */
export interface ConfigGroup {
  /** 顯示用標題，例如 core、user、submodule "docs"。 */
  title: string;
  entries: Array<{ key: string; value: string }>;
  /** 這組含 include.path / includeIf.*，內容未展開，需在 UI 標示。 */
  hasInclude: boolean;
}

export interface RepoInfo {
  repoRoot: string;
  gitDir: string;
  /** detached HEAD 時為 null。 */
  branch: string | null;
  detached: boolean;
  headSha: string | null;
  /** 由 reflog 取得的最近切換過的分支，最新在前，已去重且排除目前分支。 */
  recentBranches: string[];
  remotes: RemoteInfo[];
  upstream: UpstreamInfo | null;
  stashCount: number;
  configGroups: ConfigGroup[];
  /** 讀取過程中的降級訊息；有值不代表整體失敗。 */
  warnings: string[];
}
