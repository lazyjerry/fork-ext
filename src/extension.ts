import * as vscode from 'vscode';

import { ForkViewProvider } from './views/forkViewProvider';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new ForkViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ForkViewProvider.viewType, provider),
    vscode.commands.registerCommand('fork.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('fork.openInFork', () => provider.openInFork()),
    vscode.commands.registerCommand('fork.gitAutoPush', () => provider.gitAutoPush()),
    provider,
  );
}

export function deactivate(): void {
  // provider 的清理交給 context.subscriptions。
}
