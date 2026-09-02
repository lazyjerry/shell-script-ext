// 共用／私有雙資料夾的路由層：兩個根目錄嚴格隔離，絕不合併讀寫。
// 驗證結果的記憶體快取也放這裡（不持久化，存了也會過期）。
// 純 Node，不 import vscode。

import type { ScriptNode, ScriptSource, ScriptTreeState, TreeNode } from '../core/model/types';
import { allScripts, findNode } from '../core/model/treeOps';
import type { ScriptValidation } from '../core/validate/validateScript';
import { validateScriptFile } from '../core/validate/validateScript';
import { expandHome } from '../core/paths/homePath';
import type { Disposable, ScriptFileStore } from './scriptFileStore';

export class DualScriptStore implements Disposable {
  private readonly validations = new Map<string, ScriptValidation>();

  constructor(
    private readonly shared: ScriptFileStore,
    private readonly priv: ScriptFileStore,
  ) {}

  storeFor(source: ScriptSource): ScriptFileStore {
    return source === 'private' ? this.priv : this.shared;
  }

  stateOf(source: ScriptSource): ScriptTreeState {
    return this.storeFor(source).getState();
  }

  loadAll(): void {
    this.shared.load();
    this.priv.load();
  }

  checkDisk(): void {
    this.shared.checkDisk();
    this.priv.checkDisk();
  }

  findNode(source: ScriptSource, id: string): TreeNode | undefined {
    return findNode(this.stateOf(source), id);
  }

  getValidation(id: string): ScriptValidation | undefined {
    return this.validations.get(id);
  }

  /** 驗證單一 script 並更新快取。 */
  async validate(script: ScriptNode): Promise<ScriptValidation> {
    const result = await validateScriptFile(expandHome(script.path));
    this.validations.set(script.id, result);
    return result;
  }

  /** 批次驗證兩個來源的所有 script（啟動與刷新用），並清掉已不存在節點的快取。 */
  async revalidateAll(): Promise<void> {
    const scripts = [...allScripts(this.stateOf('shared')), ...allScripts(this.stateOf('private'))];
    const alive = new Set(scripts.map((s) => s.id));
    for (const id of [...this.validations.keys()]) {
      if (!alive.has(id)) {
        this.validations.delete(id);
      }
    }
    await Promise.all(scripts.map((s) => this.validate(s)));
  }

  onDidChange(listener: () => void): Disposable {
    return combine(this.shared.onDidChange(listener), this.priv.onDidChange(listener));
  }

  onError(listener: (message: string) => void): Disposable {
    return combine(this.shared.onError(listener), this.priv.onError(listener));
  }

  async flush(): Promise<void> {
    await Promise.all([this.shared.flush(), this.priv.flush()]);
  }

  dispose(): void {
    this.shared.dispose();
    this.priv.dispose();
  }
}

function combine(...disposables: Disposable[]): Disposable {
  return {
    dispose: () => {
      for (const d of disposables) {
        d.dispose();
      }
    },
  };
}
