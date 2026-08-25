import * as assert from 'node:assert/strict';

import * as vscode from 'vscode';

suite('fooook 延伸模組', () => {
  test('可啟動並註冊面板檢視與指令', async () => {
    const extension = vscode.extensions.getExtension('workjerry.fork-ext');
    assert.ok(extension);

    await extension.activate();

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('fork.refresh'));
    assert.ok(commands.includes('fork.openInFork'));

    const contributions = extension.packageJSON.contributes as {
      views?: Record<string, Array<{ id: string }>>;
      viewsContainers?: { panel?: Array<{ id: string; title: string }> };
    };
    assert.equal(contributions.viewsContainers?.panel?.[0]?.id, 'fork');
    assert.equal(contributions.viewsContainers?.panel?.[0]?.title, 'fooook');
    assert.equal(contributions.views?.fork?.[0]?.id, 'fork.info');
  });
});
