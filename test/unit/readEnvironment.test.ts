import * as assert from 'node:assert/strict';
import path from 'node:path';

import { readEnvironment } from '../../src/core/git/readEnvironment';
import { makeTempDir, removeTempDir, writeFile } from './helpers';

suite('readEnvironment', () => {
  let root: string;

  setup(async () => {
    root = await makeTempDir();
  });

  teardown(async () => {
    await removeTempDir(root);
  });

  test('讀出子模組、worktree、已安裝 hook、LFS 與 CI', async () => {
    await writeFile(root, '.gitmodules', '[submodule "docs"]\n\tpath = docs\n\turl = https://example.com/docs.git\n');
    await writeFile(root, path.join('.git', 'worktrees', 'feature', 'HEAD'), 'ref: refs/heads/feature\n');
    await writeFile(root, path.join('.git', 'hooks', 'pre-commit'), '#!/bin/sh\n');
    await writeFile(root, path.join('.git', 'hooks', 'pre-push.sample'), '#!/bin/sh\n');
    await writeFile(root, '.gitattributes', '*.psd filter=lfs diff=lfs merge=lfs -text\n');
    await writeFile(root, path.join('.github', 'workflows', 'ci.yml'), 'name: ci\n');
    await writeFile(root, path.join('.github', 'workflows', 'notes.md'), '不是 workflow\n');

    const environment = await readEnvironment(root, path.join(root, '.git'));

    assert.deepEqual(environment, {
      submodules: ['docs'],
      worktrees: ['feature'],
      hooks: ['pre-commit'],
      lfs: true,
      workflows: ['ci.yml'],
    });
  });

  test('什麼都沒有時每一項都是空的', async () => {
    const environment = await readEnvironment(root, path.join(root, '.git'));

    assert.deepEqual(environment, { submodules: [], worktrees: [], hooks: [], lfs: false, workflows: [] });
  });
});
