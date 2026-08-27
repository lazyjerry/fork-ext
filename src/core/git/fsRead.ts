import { promises as fs } from 'node:fs';

// 讀檔一律「讀不到就回 null」：面板寧可少一張卡片，也不要因為一份檔案不存在就整個掛掉。

export async function readTextFile(target: string): Promise<string | null> {
  try {
    return await fs.readFile(target, 'utf8');
  } catch {
    return null;
  }
}

export interface FileTail {
  text: string;
  /** 檔案比 maxBytes 大，讀到的只是尾段。 */
  truncated: boolean;
}

export async function readFileTail(target: string, maxBytes: number): Promise<FileTail | null> {
  let handle;
  try {
    handle = await fs.open(target, 'r');
  } catch {
    return null;
  }

  try {
    const stat = await handle.stat();
    const length = Math.min(stat.size, maxBytes);
    if (length === 0) {
      return { text: '', truncated: false };
    }
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, stat.size - length);
    return { text: buffer.toString('utf8'), truncated: stat.size > maxBytes };
  } catch {
    return null;
  } finally {
    await handle.close();
  }
}

/** 目錄項目；讀不到目錄回空陣列。 */
export async function listDirectory(target: string): Promise<Array<{ name: string; isDirectory: boolean }>> {
  try {
    const entries = await fs.readdir(target, { withFileTypes: true });
    return entries.map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() }));
  } catch {
    return [];
  }
}

export async function fileSize(target: string): Promise<number> {
  try {
    return (await fs.stat(target)).size;
  } catch {
    return 0;
  }
}

export async function modifiedAt(target: string): Promise<number | null> {
  try {
    return (await fs.stat(target)).mtimeMs;
  } catch {
    return null;
  }
}
