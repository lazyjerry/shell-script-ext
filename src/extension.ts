// 進入點：初始化雙 store、掛 TreeView 與拖曳、註冊指令。
// 保存位置設定（shellScripts.dataFolder / privateDataFolder）改變時整組重建，
// 指令只寫 settings，重建一律由 onDidChangeConfiguration 觸發。

import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ScriptSource } from './core/model/types';
import { expandHome } from './core/paths/homePath';
import type { DataFolderLayout } from './storage/dataFolder';
import { findConflictedCopies, resolveDataFolder } from './storage/dataFolder';
import { ScriptFileStore } from './storage/scriptFileStore';
import { DualScriptStore } from './storage/dualStore';
import { ScriptTreeProvider } from './views/scriptTreeProvider';
import { ScriptDragAndDropController } from './views/scriptDragAndDrop';
import { ScriptRunner } from './run/scriptRunner';
import { registerCommands } from './commands/registerCommands';

let activeStore: DualScriptStore | undefined;

/** 整合測試用：headless 下無法操作 tree UI，改由 exports 檢視 provider 與 store。 */
export interface ShellScriptsApi {
  provider: ScriptTreeProvider;
  getStore: () => DualScriptStore;
}

export function activate(context: vscode.ExtensionContext): ShellScriptsApi {
  const layouts = {} as Record<ScriptSource, DataFolderLayout>;
  let store: DualScriptStore;
  let storeSubscriptions: { dispose(): void }[] = [];

  const provider = new ScriptTreeProvider(
    () => store,
    (source) => layouts[source],
  );

  const resolveWithFallback = (configured: string, fallbackDir: string): DataFolderLayout => {
    try {
      return resolveDataFolder(configured, fallbackDir);
    } catch (err) {
      void vscode.window.showErrorMessage(
        `Shell Scripts：資料夾初始化失敗（${err instanceof Error ? err.message : String(err)}），改用預設儲存空間`,
      );
      return resolveDataFolder('', fallbackDir);
    }
  };

  const initStores = (): void => {
    const config = vscode.workspace.getConfiguration('shellScripts');
    const sharedConfigured = config.get<string>('dataFolder', '');
    let privateConfigured = config.get<string>('privateDataFolder', '');
    layouts.shared = resolveWithFallback(sharedConfigured, context.globalStorageUri.fsPath);
    // 兩個根目錄不可指向同一路徑，否則同一份檔案會被兩個 store 重複讀寫
    const privateTrimmed = privateConfigured.trim();
    if (privateTrimmed !== '' && path.resolve(expandHome(privateTrimmed)) === layouts.shared.root) {
      void vscode.window.showErrorMessage(
        'Shell Scripts：私有清單與共用清單為同一路徑，私有清單改用預設儲存空間。',
      );
      privateConfigured = '';
    }
    layouts.private = resolveWithFallback(
      privateConfigured,
      path.join(context.globalStorageUri.fsPath, 'private'),
    );

    for (const sub of storeSubscriptions) {
      sub.dispose();
    }
    storeSubscriptions = [];
    store?.dispose();
    store = new DualScriptStore(
      new ScriptFileStore(layouts.shared.scriptsFile),
      new ScriptFileStore(layouts.private.scriptsFile),
    );
    activeStore = store;
    storeSubscriptions.push(
      store.onDidChange(() => provider.refresh()),
      store.onError((message) => void vscode.window.showErrorMessage(`Shell Scripts：${message}`)),
    );
    store.loadAll();
    void store.revalidateAll().then(() => provider.refresh());
  };
  initStores();

  const refreshAll = async (): Promise<void> => {
    store.checkDisk();
    await store.revalidateAll();
    provider.refresh();
    const conflicted = [
      ...findConflictedCopies(layouts.shared.root).map((f) => `共用/${f}`),
      ...findConflictedCopies(layouts.private.root).map((f) => `私有/${f}`),
    ];
    if (conflicted.length > 0) {
      void vscode.window.showWarningMessage(
        `Shell Scripts：偵測到 Dropbox 衝突副本，請手動整併：${conflicted.join('、')}`,
      );
    }
  };

  const runner = new ScriptRunner(() => store);
  const treeView = vscode.window.createTreeView('shellScripts.tree', {
    treeDataProvider: provider,
    dragAndDropController: new ScriptDragAndDropController(() => store, provider),
    canSelectMany: true,
    showCollapseAll: true,
  });

  context.subscriptions.push(
    treeView,
    runner,
    treeView.onDidChangeVisibility((e) => {
      if (e.visible) {
        store.checkDisk();
      }
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration('shellScripts.dataFolder') ||
        e.affectsConfiguration('shellScripts.privateDataFolder')
      ) {
        initStores();
        provider.refresh();
      }
    }),
    { dispose: () => {
      for (const sub of storeSubscriptions) {
        sub.dispose();
      }
      store.dispose();
    } },
  );

  registerCommands(context, {
    getStore: () => store,
    provider,
    runner,
    getLayout: (source) => layouts[source],
    refreshAll,
  });

  return { provider, getStore: () => store };
}

export async function deactivate(): Promise<void> {
  await activeStore?.flush();
}
