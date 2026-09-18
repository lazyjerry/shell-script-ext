// 資料夾解析與初始化：展開 ~/、建立目錄、寫入格式版本標記。
// 純 Node，不 import vscode。

import * as fs from 'node:fs';
import * as path from 'node:path';
import { expandHome } from '../core/paths/homePath';

export const FORMAT_VERSION = 1;
export const SCRIPTS_FILE_NAME = 'scripts.json';

export interface DataFolderLayout {
  root: string;
  scriptsFile: string;
  /** true = 使用者未設定 dataFolder，落在延伸模組專屬儲存空間 */
  isFallback: boolean;
}

export function resolveDataFolder(configValue: string, fallbackDir: string): DataFolderLayout {
  const trimmed = configValue.trim();
  const isFallback = trimmed === '';
  const root = isFallback ? fallbackDir : path.resolve(expandHome(trimmed));
  fs.mkdirSync(root, { recursive: true });
  const markerPath = path.join(root, '.shell-scripts.json');
  if (!fs.existsSync(markerPath)) {
    fs.writeFileSync(markerPath, JSON.stringify({ formatVersion: FORMAT_VERSION }, null, 2) + '\n');
  }
  return { root, scriptsFile: path.join(root, SCRIPTS_FILE_NAME), isFallback };
}

/** 目標資料夾是否已有清單檔（chooseDataFolder 的載入提醒用）。 */
export function hasScriptsFile(root: string): boolean {
  return fs.existsSync(path.join(root, SCRIPTS_FILE_NAME));
}

/**
 * 「顯示保存資料夾」要交給 revealFileInOS 的目標：有清單檔就選取它，Finder 會停在資料夾內；
 * 沒有才退回資料夾本身（停在上一層並選取該資料夾）。
 * 不用 openExternal 開資料夾，是因為資料夾名若是 *.app 等 bundle，macOS 會直接啟動它。
 */
export function revealTarget(root: string): string {
  const scriptsFile = path.join(root, SCRIPTS_FILE_NAME);
  return fs.existsSync(scriptsFile) ? scriptsFile : root;
}

/** Dropbox 衝突副本偵測（"scripts (使用者的衝突的複本 2024-01-01).json" 等）。 */
export function findConflictedCopies(root: string): string[] {
  try {
    return fs.readdirSync(root).filter((f) => /conflicted copy|衝突的複本/i.test(f));
  } catch {
    return [];
  }
}
