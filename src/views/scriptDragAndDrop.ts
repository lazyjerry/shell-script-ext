// 拖曳控制：drag 只傳 id（drop 時從 store 現況查，避免拖曳期間狀態被改造成幽靈節點）。
// 語意統一「插入式」：folder = 移入末尾、script = 同層插其後、空白區 = roots 末尾。
// 跨來源（共用 ↔ 私有）= 從 A 樹整批取出、插入 B 樹，兩個 store 各自落檔。

import * as vscode from 'vscode';
import type { ScriptSource } from '../core/model/types';
import type { DropTarget } from '../core/model/treeOps';
import { extractNodes, insertNodes, moveNodes } from '../core/model/treeOps';
import type { DualScriptStore } from '../storage/dualStore';
import type { ScriptTreeProvider, TreeElement } from './scriptTreeProvider';

const MIME_TYPE = 'application/vnd.code.tree.shellscripts.tree';

interface DragPayload {
  source: ScriptSource;
  ids: string[];
}

export class ScriptDragAndDropController implements vscode.TreeDragAndDropController<TreeElement> {
  readonly dragMimeTypes = [MIME_TYPE];
  readonly dropMimeTypes = [MIME_TYPE];

  constructor(
    private readonly getStore: () => DualScriptStore,
    private readonly provider: ScriptTreeProvider,
  ) {}

  handleDrag(elements: readonly TreeElement[], dataTransfer: vscode.DataTransfer): void {
    const nodes = elements.filter(
      (e): e is TreeElement & { type: 'node' } => e.type === 'node',
    );
    if (nodes.length === 0) {
      return;
    }
    // 多選跨來源時只搬第一個元素所屬來源的那批（單一 payload、單一語意）
    const source = nodes[0].source;
    const payload: DragPayload = {
      source,
      ids: nodes.filter((e) => e.source === source).map((e) => e.node.id),
    };
    dataTransfer.set(MIME_TYPE, new vscode.DataTransferItem(JSON.stringify(payload)));
  }

  async handleDrop(target: TreeElement | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
    const item = dataTransfer.get(MIME_TYPE);
    if (!item) {
      return;
    }
    let payload: DragPayload;
    try {
      payload = JSON.parse(await item.asString()) as DragPayload;
    } catch {
      return;
    }
    if (!Array.isArray(payload.ids) || payload.ids.length === 0) {
      return;
    }

    const toSource: ScriptSource = target ? target.source : payload.source;
    const dropTarget: DropTarget =
      !target || target.type === 'source'
        ? { type: 'root' }
        : target.node.kind === 'folder'
          ? { type: 'folder', id: target.node.id }
          : { type: 'after', id: target.node.id };

    const store = this.getStore();
    if (toSource === payload.source) {
      store.storeFor(payload.source).update((state) => moveNodes(state, payload.ids, dropTarget));
    } else {
      const fromStore = store.storeFor(payload.source);
      const toStore = store.storeFor(toSource);
      // 兩段 update：extract 空批時第一段回 false 不落檔；有取出就一定插入，節點不會蒸發
      let extracted: ReturnType<typeof extractNodes> = [];
      fromStore.update((state) => {
        extracted = extractNodes(state, payload.ids);
        return extracted.length > 0;
      });
      if (extracted.length > 0) {
        toStore.update((state) => {
          insertNodes(state, extracted, dropTarget);
          return true;
        });
      }
    }
    this.provider.refresh();
  }
}
