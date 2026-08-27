import { execFile } from 'node:child_process';
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
import type { RepoLocation } from '../core/git/types';
import type { ClientMessage, HostMessage } from '../shared/protocol';
import { isClientMessage } from '../shared/protocol';

const execFileAsync = promisify(execFile);

/** 開 Fork 卡住時不要無限等待；Fork 啟動再慢也不該超過這個時間。 */
const FORK_LAUNCH_TIMEOUT_MS = 10_000;

export class ForkViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewType = 'fork.info';

  private view: vscode.WebviewView | undefined;
  /** 面板目前顯示的那份資料對應的 repo；按鈕操作以它為準，跟畫面所見一致。 */
  private current: { location: RepoLocation | null; targetPath: string | null } | null = null;
  /**
   * 焦點移到 webview 時 activeTextEditor 會變成 undefined，
   * 所以另外記住最後一個真正的檔案編輯器，否則按下面板上的「刷新」就跟不到編輯器了。
   */
  private lastFileEditorDirectory: string | null = null;
  /** 上一次跑 git-auto-push 的終端機；每次執行都開新的，舊的順手關掉，避免堆一排。 */
  private autoPushTerminal: vscode.Terminal | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly extensionUri: vscode.Uri) {
    this.lastFileEditorDirectory = directoryOfEditor(vscode.window.activeTextEditor);
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        const directory = directoryOfEditor(editor);
        if (directory) {
          this.lastFileEditorDirectory = directory;
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
    const targetPath = this.resolveTargetPath();
    const location = targetPath ? await discoverRepo(targetPath) : null;
    const repo = location ? await readRepoInfo(location) : null;

    this.current = { location, targetPath };
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

    await vscode.env.openExternal(vscode.Uri.file(location.repoRoot));
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
      case 'gitAutoPush':
        await this.gitAutoPush();
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

  private resolveTargetPath(): string | null {
    return (
      directoryOfEditor(vscode.window.activeTextEditor) ??
      this.lastFileEditorDirectory ??
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ??
      null
    );
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

function directoryOfEditor(editor: vscode.TextEditor | undefined): string | null {
  const uri = editor?.document.uri;
  if (!uri || uri.scheme !== 'file') {
    return null;
  }
  return path.dirname(uri.fsPath);
}

function createNonce(): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let index = 0; index < 32; index += 1) {
    nonce += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return nonce;
}
