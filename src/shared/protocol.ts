import type { RepoInfo } from '../core/git/types';

// extension ⇄ webview 訊息協定（tagged union，兩端共用型別）。
// webview → extension 用祈使動詞，extension → webview 用完成事件。

export type ClientMessage =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'openInFork' }
  | { type: 'openFolder' }
  | { type: 'openRemote' }
  | { type: 'openFile'; path: string }
  | { type: 'gitAutoPush' }
  | { type: 'setSkipWorktree'; path: string; ignore: boolean }
  | { type: 'copyText'; text: string; label: string };

export type HostMessage =
  | {
      type: 'repoLoaded';
      repo: RepoInfo | null;
      /** 這次據以尋找 repo 的起點路徑；沒有開啟資料夾時為 null。 */
      targetPath: string | null;
      /** epoch 毫秒，由 webview 端格式化成本地時間。 */
      readAt: number;
    }
  | { type: 'notice'; level: 'info' | 'warn' | 'error'; message: string };

/** webview 送來的東西不可信：type 要是已知的，帶欄位的訊息連欄位型別一起檢查。 */
export function isClientMessage(value: unknown): value is ClientMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const message = value as Record<string, unknown>;
  switch (message.type) {
    case 'ready':
    case 'refresh':
    case 'openInFork':
    case 'openFolder':
    case 'openRemote':
    case 'gitAutoPush':
      return true;
    case 'openFile':
      return typeof message.path === 'string';
    case 'setSkipWorktree':
      return typeof message.path === 'string' && typeof message.ignore === 'boolean';
    case 'copyText':
      return typeof message.text === 'string' && typeof message.label === 'string';
    default:
      return false;
  }
}
