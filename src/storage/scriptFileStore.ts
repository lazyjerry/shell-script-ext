// 單一資料夾的 scripts.json 讀寫。
// debounce 寫入 → 序列化寫入佇列 → tmp+rename 原子寫 → 自寫守衛；
// 外部變更（Dropbox 回寫）不輪詢：由 checkDisk() 在面板變可見或手動刷新時比對 mtime。

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ScriptTreeState } from '../core/model/types';
import { emptyState } from '../core/model/types';
import { normalizeState } from '../core/model/treeOps';

const WRITE_DEBOUNCE_MS = 500;

export interface Disposable {
  dispose(): void;
}

export class ScriptFileStore implements Disposable {
  private state: ScriptTreeState = emptyState();
  private pending = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private writeInProgress = false;
  private lastWrittenMtimeMs = 0;
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly changeListeners = new Set<() => void>();
  private readonly errorListeners = new Set<(message: string) => void>();

  constructor(private readonly filePath: string) {}

  onDidChange(listener: () => void): Disposable {
    this.changeListeners.add(listener);
    return { dispose: () => this.changeListeners.delete(listener) };
  }

  onError(listener: (message: string) => void): Disposable {
    this.errorListeners.add(listener);
    return { dispose: () => this.errorListeners.delete(listener) };
  }

  getState(): ScriptTreeState {
    return this.state;
  }

  /** 從磁碟載入（啟動與 store 重建用）。檔案不存在 = 空清單。 */
  load(): void {
    this.state = this.readFromDisk();
    this.lastWrittenMtimeMs = this.statMtime();
  }

  private readFromDisk(): ScriptTreeState {
    let text: string;
    try {
      text = fs.readFileSync(this.filePath, 'utf8');
    } catch {
      return emptyState();
    }
    try {
      return normalizeState(JSON.parse(text));
    } catch {
      // 解析失敗：把壞檔改名保留（避免之後的寫入蓋掉使用者資料），從空清單重新開始
      const backupPath = `${this.filePath}.corrupt-${Date.now()}`;
      try {
        fs.renameSync(this.filePath, backupPath);
        this.emitError(`無法解析 ${path.basename(this.filePath)}，已改名為 ${path.basename(backupPath)} 保留`);
      } catch {
        this.emitError(`無法解析 ${path.basename(this.filePath)}`);
      }
      return emptyState();
    }
  }

  /** 修改樹：mutator 回傳 false 表示 no-op（不排程寫入、不發事件）。 */
  update(mutator: (state: ScriptTreeState) => boolean): boolean {
    if (!mutator(this.state)) {
      return false;
    }
    this.scheduleWrite();
    this.emitChange();
    return true;
  }

  private scheduleWrite(): void {
    this.pending = true;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (this.pending) {
        this.pending = false;
        this.enqueueWrite();
      }
    }, WRITE_DEBOUNCE_MS);
  }

  /** 主動比對磁碟：外部改動就重載並發 onDidChange。 */
  checkDisk(): void {
    // 自寫守衛：pending 或寫入中時忽略（rename 後 mtime 由 enqueueWrite 記錄）
    if (this.writeInProgress || this.pending || this.timer) {
      return;
    }
    const mtime = this.statMtime();
    if (Math.abs(mtime - this.lastWrittenMtimeMs) < 1) {
      return;
    }
    this.lastWrittenMtimeMs = mtime;
    this.state = this.readFromDisk();
    this.emitChange();
  }

  /** 確保所有 pending 寫入完成（deactivate 用）。 */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.pending) {
      this.pending = false;
      this.enqueueWrite();
    }
    await this.writeQueue;
  }

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
  }

  private statMtime(): number {
    try {
      return fs.statSync(this.filePath).mtimeMs;
    } catch {
      return 0;
    }
  }

  private enqueueWrite(): void {
    const snapshot = JSON.stringify(this.state, null, 2) + '\n';
    this.writeInProgress = true;
    this.writeQueue = this.writeQueue
      .then(async () => {
        const tmpPath = `${this.filePath}.tmp`;
        await fs.promises.writeFile(tmpPath, snapshot, 'utf8');
        await fs.promises.rename(tmpPath, this.filePath);
        this.lastWrittenMtimeMs = this.statMtime();
      })
      .catch((err: unknown) => {
        this.emitError(
          `寫入失敗（${path.basename(this.filePath)}）：${err instanceof Error ? err.message : String(err)}`,
        );
      })
      .finally(() => {
        this.writeInProgress = false;
      });
  }

  private emitChange(): void {
    for (const l of this.changeListeners) {
      l();
    }
  }

  private emitError(message: string): void {
    for (const l of this.errorListeners) {
      l(message);
    }
  }
}
