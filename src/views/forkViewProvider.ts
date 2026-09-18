import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import * as vscode from 'vscode';

import { buildCliInstallHint } from '../core/fork/installHint';
import { FORK_DOWNLOAD_URL, locateFork } from '../core/fork/locateFork';
import { discoverRepo } from '../core/git/discoverRepo';
import {
  GIT_AUTO_PUSH_INSTALL_COMMAND,
  GIT_AUTO_PUSH_REPO_URL,
  locateGitAutoPush,
} from '../core/gitAutoPush/locateGitAutoPush';
import { readRepoInfo } from '../core/git/readRepoInfo';
import { pickPrimaryRemote, toRemoteWebUrl } from '../core/git/remoteWebUrl';
import { runGit } from '../core/git/runGit';
import type { RepoInfo, RepoLocation } from '../core/git/types';
import { isMacBundlePath } from '../core/os/macBundle';
import { decideGitGate } from '../core/workspace/workspaceGate';
import type { ClientMessage, HostMessage } from '../shared/protocol';
import { isClientMessage } from '../shared/protocol';

const execFileAsync = promisify(execFile);

/** 開 Fork 卡住時不要無限等待；Fork 啟動再慢也不該超過這個時間。 */
const FORK_LAUNCH_TIMEOUT_MS = 10_000;
/** update-index 只改本機 index，正常是毫秒級；等這麼久還沒完就是卡住了。 */
const GIT_COMMAND_TIMEOUT_MS = 10_000;

export class ForkViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewType = 'fork.info';

  private view: vscode.WebviewView | undefined;
  /** 面板目前顯示的那份資料對應的 repo；按鈕操作以它為準，跟畫面所見一致。 */
  private current: { location: RepoLocation | null; targetPath: string | null; repo: RepoInfo | null } | null = null;
  /**
   * 焦點移到 webview 時 activeTextEditor 會變成 undefined，
   * 所以另外記住最後一個真正的檔案編輯器，否則按下面板上的「刷新」就跟不到編輯器了。
   */
  private lastFilePath: string | null = null;
  /** 上一次跑 git-auto-push 的終端機；每次執行都開新的，舊的順手關掉，避免堆一排。 */
  private autoPushTerminal: vscode.Terminal | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly extensionUri: vscode.Uri) {
    this.lastFilePath = filePathOfEditor(vscode.window.activeTextEditor);
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        const filePath = filePathOfEditor(editor);
        if (filePath) {
          this.lastFilePath = filePath;
        }
      }),
    );
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    const mediaUri = vscode.Uri.joinPath(this.extensionUri, 'media');

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [mediaUri],
    };
    webviewView.webview.html = this.getHtml(webviewView.webview, mediaUri);

    webviewView.webview.onDidReceiveMessage((message: unknown) => {
      if (!isClientMessage(message)) {
        return;
      }
      void this.handleMessage(message);
    });

    webviewView.onDidDispose(() => {
      if (this.view === webviewView) {
        this.view = undefined;
      }
    });
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
    this.autoPushTerminal?.dispose();
    this.autoPushTerminal = undefined;
  }

  /** 以「當下的作用中編輯器」重新定位 repo 並重讀。只在使用者要求時發生。 */
  async refresh(): Promise<void> {
    const activeFile = this.resolveActiveFile();
    const targetPath = this.resolveTargetPath(activeFile);
    const location = targetPath ? await discoverRepo(targetPath) : null;
    const repo = location ? await readRepoInfo(location, { activeFile }) : null;

    this.current = { location, targetPath, repo };
    await this.post({ type: 'repoLoaded', repo, targetPath, readAt: Date.now() });
  }

  async openInFork(): Promise<void> {
    if (!this.current) {
      await this.refresh();
    }

    const location = this.current?.location ?? null;
    if (!location) {
      const where = this.current?.targetPath ?? '尚未開啟任何資料夾';
      void vscode.window.showWarningMessage(`forrrk：這裡不是 git 儲存庫（${where}）`);
      return;
    }

    const availability = await locateFork({ homeDir: os.homedir() });
    switch (availability.kind) {
      case 'ready':
        await this.launchFork(availability.cliPath, location.repoRoot);
        return;
      case 'appOnly':
        await this.promptCliInstall(availability.appPath);
        return;
      case 'missing':
        await this.promptDownload();
        return;
      case 'unsupportedPlatform':
        void vscode.window.showWarningMessage(
          `forrrk：Fork 只提供 macOS 與 Windows 版本，目前平台是 ${availability.platform}。`,
        );
        return;
    }
  }

  /** 在編輯器開啟面板列出的檔案（目前只有 README）。 */
  private async openFile(target: string): Promise<void> {
    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(target));
      await vscode.window.showTextDocument(document, { preview: true });
    } catch {
      void vscode.window.showWarningMessage(`forrrk：開不了 ${target}`);
    }
  }

  /**
   * 切換「忽略變更」：標記或清除 .git/index 上的 skip-worktree／assume-unchanged。
   *
   * 這是整個延伸模組唯一會**寫入** git 狀態、也是唯一呼叫 git 指令的地方——旗標在 index 的二進位裡，
   * 自己改等於重寫整份 index，風險遠高於呼叫 git。讀取端仍然完全不依賴 git 指令。
   */
  private async setSkipWorktree(relativePath: string, ignore: boolean): Promise<void> {
    const location = this.current?.location ?? null;
    if (!location) {
      const where = this.current?.targetPath ?? '尚未開啟任何資料夾';
      void vscode.window.showWarningMessage(`forrrk：這裡不是 git 儲存庫（${where}）`);
      return;
    }

    const action = ignore ? '取消追蹤變更' : '恢復追蹤變更';
    // 面板讀取不跑 git，照常顯示；只有這個寫入動作要跑 git，所以只擋這裡。
    const gate = await decideGitGate(path.join(location.repoRoot, relativePath), {
      trusted: vscode.workspace.isTrusted,
      folders: (vscode.workspace.workspaceFolders ?? []).filter((folder) => folder.uri.scheme === 'file').map((folder) => folder.uri.fsPath),
    });
    if (gate !== 'allowed') {
      const why = gate === 'untrusted-workspace' ? '工作區未受信任' : '檔案不在工作區內';
      void vscode.window.showWarningMessage(`forrrk：${why}，未執行 git，無法${action}。`);
      return;
    }

    const picked = await vscode.window.showWarningMessage(
      `forrrk：要對 ${relativePath} ${action}嗎？`,
      { modal: true, detail: confirmDetail(relativePath, ignore) },
      action,
    );
    if (picked !== action) {
      return;
    }

    // 一次呼叫只有一個 mark 旗標會生效（git 的 update-index 是 else-if 分派，assume-unchanged 優先），
    // 所以「恢復」要分兩次跑，合成一行會有一半沒清掉。
    const flagSets = ignore ? [['--skip-worktree']] : [['--no-skip-worktree'], ['--no-assume-unchanged']];
    for (const flags of flagSets) {
      try {
        await runGit(['-C', location.repoRoot, 'update-index', ...flags, '--', relativePath], {
          timeout: GIT_COMMAND_TIMEOUT_MS,
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`forrrk：${action}失敗（${detail}）`);
        return;
      }
    }

    await this.refresh();
    void vscode.window.setStatusBarMessage(`forrrk：已${action} ${relativePath}`, 2000);
  }

  /** 用作業系統的檔案管理員開啟儲存庫根目錄。 */
  async openFolder(): Promise<void> {
    if (!this.current) {
      await this.refresh();
    }

    const location = this.current?.location ?? null;
    if (!location) {
      const where = this.current?.targetPath ?? '尚未開啟任何資料夾';
      void vscode.window.showWarningMessage(`forrrk：這裡不是 git 儲存庫（${where}）`);
      return;
    }

    const folderUri = vscode.Uri.file(location.repoRoot);
    // 名為 *.app 這類 bundle 的資料夾交給 openExternal 會被 macOS 直接啟動，改成在 Finder 中選取它。
    if (process.platform === 'darwin' && isMacBundlePath(location.repoRoot)) {
      await vscode.commands.executeCommand('revealFileInOS', folderUri);
      return;
    }
    await vscode.env.openExternal(folderUri);
  }

  /** 用預設瀏覽器開啟遠端網址對應的網頁。 */
  async openRemote(): Promise<void> {
    if (!this.current) {
      await this.refresh();
    }

    const repo = this.current?.repo ?? null;
    if (!repo) {
      const where = this.current?.targetPath ?? '尚未開啟任何資料夾';
      void vscode.window.showWarningMessage(`forrrk：這裡不是 git 儲存庫（${where}）`);
      return;
    }

    const remote = pickPrimaryRemote(repo);
    const webUrl = toRemoteWebUrl(remote?.url);
    if (!remote || !webUrl) {
      void vscode.window.showWarningMessage(
        repo.remotes.length === 0
          ? 'forrrk：這個儲存庫沒有設定遠端。'
          : 'forrrk：遠端網址不是網頁位址（本機路徑或 file://），沒有可開啟的網頁。',
      );
      return;
    }

    await vscode.env.openExternal(vscode.Uri.parse(webUrl));
  }

  /**
   * 在整合終端機執行 `git-auto-push -a`。
   * 這是互動式 bash 腳本（選單、AI 產生 commit 訊息、彩色輸出），
   * 不能像開 Fork 那樣藏在背景 execFile，否則一提問就卡死。
   */
  async gitAutoPush(): Promise<void> {
    if (!this.current) {
      await this.refresh();
    }

    const location = this.current?.location ?? null;
    if (!location) {
      const where = this.current?.targetPath ?? '尚未開啟任何資料夾';
      void vscode.window.showWarningMessage(`forrrk：這裡不是 git 儲存庫（${where}）`);
      return;
    }

    const availability = await locateGitAutoPush({ homeDir: os.homedir() });
    switch (availability.kind) {
      case 'ready':
        this.runInTerminal(availability.cliPath, location.repoRoot);
        return;
      case 'missing':
        await this.promptGitAutoPushInstall();
        return;
      case 'unsupportedPlatform':
        void vscode.window.showWarningMessage(
          `forrrk：git-auto-push 是 bash 腳本，不支援 ${availability.platform} 原生終端機。`,
        );
        return;
    }
  }

  private async handleMessage(message: ClientMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
      case 'refresh':
        await this.refresh();
        return;
      case 'openInFork':
        await this.openInFork();
        return;
      case 'openFolder':
        await this.openFolder();
        return;
      case 'openRemote':
        await this.openRemote();
        return;
      case 'openFile':
        await this.openFile(message.path);
        return;
      case 'gitAutoPush':
        await this.gitAutoPush();
        return;
      case 'setSkipWorktree':
        await this.setSkipWorktree(message.path, message.ignore);
        return;
      case 'copyText':
        await vscode.env.clipboard.writeText(message.text);
        void vscode.window.setStatusBarMessage(`forrrk：已複製${message.label}`, 2000);
        return;
    }
  }

  private async launchFork(cliPath: string, repoRoot: string): Promise<void> {
    try {
      await execFileAsync(cliPath, ['-C', repoRoot, 'open'], { timeout: FORK_LAUNCH_TIMEOUT_MS });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`forrrk：執行 fork 指令失敗（${detail}）`);
    }
  }

  private runInTerminal(cliPath: string, repoRoot: string): void {
    this.autoPushTerminal?.dispose();
    const terminal = vscode.window.createTerminal({ name: 'git-auto-push', cwd: repoRoot });
    this.autoPushTerminal = terminal;
    terminal.show();
    // 用絕對路徑：~/.local/bin 常常不在終端機的 PATH 裡。單引號包住，路徑含空白也安全。
    terminal.sendText(`'${cliPath.replace(/'/g, `'\\''`)}' -a`);
  }

  private async promptGitAutoPushInstall(): Promise<void> {
    const picked = await vscode.window.showWarningMessage(
      'forrrk：找不到 git-auto-push 指令。',
      {
        modal: true,
        detail: [
          '1. 在終端機執行下面的安裝指令（預設裝到 ~/.local/bin）。',
          '2. 裝好之後再按一次「Auto Push」。',
          '',
          GIT_AUTO_PUSH_INSTALL_COMMAND,
        ].join('\n'),
      },
      '複製安裝指令',
      '前往 GitHub',
    );
    if (picked === '複製安裝指令') {
      await vscode.env.clipboard.writeText(GIT_AUTO_PUSH_INSTALL_COMMAND);
      void vscode.window.showInformationMessage('forrrk：安裝指令已複製，貼到終端機執行即可。');
      return;
    }
    if (picked === '前往 GitHub') {
      await vscode.env.openExternal(vscode.Uri.parse(GIT_AUTO_PUSH_REPO_URL));
    }
  }

  private async promptCliInstall(appPath: string): Promise<void> {
    const hint = buildCliInstallHint(appPath, process.platform);
    const actions = hint.copyCommand ? ['複製安裝指令', '開啟 Fork'] : ['開啟 Fork'];
    const detail = hint.steps.map((step, index) => `${index + 1}. ${step}`).join('\n');

    const picked = await vscode.window.showWarningMessage(hint.message, { modal: true, detail }, ...actions);
    if (picked === '複製安裝指令' && hint.copyCommand) {
      await vscode.env.clipboard.writeText(hint.copyCommand);
      void vscode.window.showInformationMessage('forrrk：安裝指令已複製，貼到終端機執行即可。');
      return;
    }
    if (picked === '開啟 Fork') {
      await vscode.env.openExternal(vscode.Uri.file(appPath));
    }
  }

  private async promptDownload(): Promise<void> {
    const picked = await vscode.window.showWarningMessage(
      'forrrk：找不到 Fork 應用程式。',
      {
        modal: true,
        detail: '需要先安裝 Fork 才能開啟儲存庫。安裝後回到本面板按「刷新」，再按一次「在 Fork 中開啟」。',
      },
      '前往下載',
    );
    if (picked === '前往下載') {
      await vscode.env.openExternal(vscode.Uri.parse(FORK_DOWNLOAD_URL));
    }
  }

  private resolveActiveFile(): string | null {
    return filePathOfEditor(vscode.window.activeTextEditor) ?? this.lastFilePath;
  }

  private resolveTargetPath(activeFile: string | null): string | null {
    if (activeFile) {
      return path.dirname(activeFile);
    }
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
  }

  private async post(message: HostMessage): Promise<void> {
    await this.view?.webview.postMessage(message);
  }

  private getHtml(webview: vscode.Webview, mediaUri: vscode.Uri): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'main.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'styles.css'));
    const nonce = createNonce();

    return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleUri}" rel="stylesheet">
  <title>forrrk</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

/** 確認對話框的內文。忽略變更的副作用不直覺，切換前一定要把後果講完。 */
function confirmDetail(relativePath: string, ignore: boolean): string {
  if (ignore) {
    return [
      `git update-index --skip-worktree -- ${relativePath}`,
      '',
      '之後這個檔案的本機修改不會出現在 git 狀態裡，也不會被 commit。',
      '注意：切換分支或 pull 時若這個檔案在對方有更新，git 會直接失敗，要先恢復追蹤。',
    ].join('\n');
  }
  return [
    `git update-index --no-skip-worktree -- ${relativePath}`,
    `git update-index --no-assume-unchanged -- ${relativePath}`,
    '',
    '之後這個檔案的本機修改會重新出現在 git 狀態裡。',
  ].join('\n');
}

function filePathOfEditor(editor: vscode.TextEditor | undefined): string | null {
  const uri = editor?.document.uri;
  if (!uri || uri.scheme !== 'file') {
    return null;
  }
  return uri.fsPath;
}

/** CSP nonce 要不可預測，用密碼學亂數；base64url 不含引號，可直接放進屬性值。 */
function createNonce(): string {
  return randomBytes(24).toString('base64url');
}
