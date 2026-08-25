import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 專案路徑很長，暫存目錄一律放到短路徑底下，避免 socket / 路徑長度問題。
const TEMPORARY_ROOT = process.platform === 'darwin' ? '/private/tmp' : os.tmpdir();

export async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(TEMPORARY_ROOT, 'fork-ext-'));
}

export async function removeTempDir(target: string): Promise<void> {
  await fs.rm(target, { recursive: true, force: true });
}

/** 寫入檔案並自動建立所需目錄。 */
export async function writeFile(root: string, relativePath: string, content: string): Promise<void> {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}
