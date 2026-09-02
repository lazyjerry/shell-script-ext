// TreeView 資料層：頂層固定「共用／私有」兩個來源區段，各自展開自己的樹。
// 兩個來源都是空清單時回傳空陣列，讓 viewsWelcome 的引導頁顯示。

import * as vscode from 'vscode';
import type { ScriptSource, TreeNode } from '../core/model/types';
import { expandHome } from '../core/paths/homePath';
import { validationMessage } from '../core/validate/validateScript';
import type { DualScriptStore } from '../storage/dualStore';
import type { DataFolderLayout } from '../storage/dataFolder';
import { contractHome } from '../core/paths/homePath';

export type TreeElement =
  | { type: 'source'; source: ScriptSource }
  | { type: 'node'; source: ScriptSource; node: TreeNode };

export const SOURCE_LABELS: Record<ScriptSource, string> = { shared: '共用', private: '私有' };

export class ScriptTreeProvider implements vscode.TreeDataProvider<TreeElement> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changeEmitter.event;

  constructor(
    private readonly getStore: () => DualScriptStore,
    private readonly getLayout: (source: ScriptSource) => DataFolderLayout,
  ) {}

  refresh(): void {
    this.changeEmitter.fire();
  }

  getChildren(element?: TreeElement): TreeElement[] {
    const store = this.getStore();
    if (!element) {
      const empty =
        store.stateOf('shared').roots.length === 0 && store.stateOf('private').roots.length === 0;
      if (empty) {
        return [];
      }
      return (['shared', 'private'] as const).map((source) => ({ type: 'source', source }));
    }
    if (element.type === 'source') {
      return store.stateOf(element.source).roots.map((node) => ({
        type: 'node',
        source: element.source,
        node,
      }));
    }
    if (element.node.kind === 'folder') {
      return element.node.children.map((node) => ({
        type: 'node',
        source: element.source,
        node,
      }));
    }
    return [];
  }

  getTreeItem(element: TreeElement): vscode.TreeItem {
    if (element.type === 'source') {
      return this.sourceItem(element.source);
    }
    return element.node.kind === 'folder'
      ? this.folderItem(element)
      : this.scriptItem(element);
  }

  private sourceItem(source: ScriptSource): vscode.TreeItem {
    const layout = this.getLayout(source);
    const item = new vscode.TreeItem(SOURCE_LABELS[source], vscode.TreeItemCollapsibleState.Expanded);
    item.id = `source-${source}`;
    item.contextValue = `source-${source}`;
    item.iconPath = new vscode.ThemeIcon(source === 'shared' ? 'globe' : 'lock');
    item.description = layout.isFallback ? '未設定同步資料夾' : contractHome(layout.root);
    item.tooltip = `${SOURCE_LABELS[source]}清單保存位置：${contractHome(layout.root)}`;
    return item;
  }

  private folderItem(element: TreeElement & { type: 'node' }): vscode.TreeItem {
    const folder = element.node as Extract<TreeNode, { kind: 'folder' }>;
    const item = new vscode.TreeItem(folder.name, vscode.TreeItemCollapsibleState.Collapsed);
    item.id = folder.id;
    item.contextValue = 'folder';
    item.iconPath = vscode.ThemeIcon.Folder;
    return item;
  }

  private scriptItem(element: TreeElement & { type: 'node' }): vscode.TreeItem {
    const script = element.node as Extract<TreeNode, { kind: 'script' }>;
    const item = new vscode.TreeItem(script.label, vscode.TreeItemCollapsibleState.None);
    item.id = script.id;
    item.contextValue = 'script';
    item.description = script.note;
    const validation = this.getStore().getValidation(script.id);
    const problem = validation ? validationMessage(validation) : undefined;
    if (problem) {
      item.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'));
      item.tooltip = `${script.path}\n⚠ ${problem}`;
    } else {
      item.iconPath = new vscode.ThemeIcon('terminal-bash');
      item.tooltip = script.path;
      // 與檔案總管一致：點擊開啟檔案內容（驗證失敗的項目不開，避免對不存在的檔案報錯）
      item.command = {
        command: 'vscode.open',
        title: '開啟 Script',
        arguments: [vscode.Uri.file(expandHome(script.path))],
      };
    }
    return item;
  }
}
