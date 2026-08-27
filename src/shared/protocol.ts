import type { RepoInfo } from '../core/git/types';

// extension ⇄ webview 訊息協定（tagged union，兩端共用型別）。
// webview → extension 用祈使動詞，extension → webview 用完成事件。

export type ClientMessage =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'openInFork' }
  | { type: 'gitAutoPush' }
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

export function isClientMessage(value: unknown): value is ClientMessage {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}
