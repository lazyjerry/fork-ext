import type { ClientMessage, HostMessage } from '../shared/protocol';
import type { RenderHandlers, ViewState } from './render';
import { render } from './render';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

const api = acquireVsCodeApi();
const root = document.getElementById('app');

const state: ViewState = {
  repo: null,
  targetPath: null,
  readAt: null,
  loading: true,
};

const handlers: RenderHandlers = {
  onRefresh() {
    state.loading = true;
    draw();
    post({ type: 'refresh' });
  },
  onOpenInFork() {
    post({ type: 'openInFork' });
  },
  onGitAutoPush() {
    post({ type: 'gitAutoPush' });
  },
  onCopy(text, label) {
    post({ type: 'copyText', text, label });
  },
};

window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
  const message = event.data;
  if (message.type !== 'repoLoaded') {
    return;
  }
  state.repo = message.repo;
  state.targetPath = message.targetPath;
  state.readAt = message.readAt;
  state.loading = false;
  draw();
});

function draw(): void {
  if (root) {
    render(root, state, handlers);
  }
}

function post(message: ClientMessage): void {
  api.postMessage(message);
}

draw();
post({ type: 'ready' });
