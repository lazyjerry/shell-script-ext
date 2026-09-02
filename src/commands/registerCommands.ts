// 全部指令註冊：收 vscode 事件 → treeOps → store.update → provider.refresh 的薄膠水。

import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import type { FolderNode, ScriptNode, ScriptSource } from '../core/model/types';
import { addNode, removeNode, renameFolder, updateScript } from '../core/model/treeOps';
import { contractHome, expandHome } from '../core/paths/homePath';
import { validationMessage } from '../core/validate/validateScript';
import type { DataFolderLayout } from '../storage/dataFolder';
import { hasScriptsFile } from '../storage/dataFolder';
import type { DualScriptStore } from '../storage/dualStore';
import type { ScriptRunner } from '../run/scriptRunner';
import type { ScriptTreeProvider, TreeElement } from '../views/scriptTreeProvider';
import { SOURCE_LABELS } from '../views/scriptTreeProvider';

export interface CommandDeps {
  getStore: () => DualScriptStore;
  provider: ScriptTreeProvider;
  runner: ScriptRunner;
  getLayout: (source: ScriptSource) => DataFolderLayout;
  refreshAll: () => Promise<void>;
}

interface AddTarget {
  source: ScriptSource;
  parentFolderId?: string;
}

function isTreeElement(value: unknown): value is TreeElement {
  return (
    typeof value === 'object' &&
    value !== null &&
    ((value as TreeElement).type === 'source' || (value as TreeElement).type === 'node')
  );
}

function asSource(value: unknown): ScriptSource | undefined {
  return value === 'shared' || value === 'private' ? value : undefined;
}

export function registerCommands(context: vscode.ExtensionContext, deps: CommandDeps): void {
  const { getStore, provider, runner, getLayout, refreshAll } = deps;

  const register = (command: string, handler: (...args: unknown[]) => unknown): void => {
    context.subscriptions.push(vscode.commands.registerCommand(command, handler));
  };

  const pickSource = async (title: string): Promise<ScriptSource | undefined> => {
    const picked = await vscode.window.showQuickPick(
      (['shared', 'private'] as const).map((source) => ({
        label: `${SOURCE_LABELS[source]}清單`,
        description: contractHome(getLayout(source).root),
        source,
      })),
      { title },
    );
    return picked?.source;
  };

  /** 從 tree context 解析新增目標：來源節點 = 該來源 roots、folder = 移入該資料夾、無 context = 先問來源。 */
  const resolveAddTarget = async (arg: unknown): Promise<AddTarget | undefined> => {
    if (isTreeElement(arg)) {
      if (arg.type === 'source') {
        return { source: arg.source };
      }
      if (arg.node.kind === 'folder') {
        return { source: arg.source, parentFolderId: arg.node.id };
      }
      return { source: arg.source };
    }
    const source = await pickSource('加到哪份清單？');
    return source ? { source } : undefined;
  };

  /** 手動輸入或檔案選擇器二擇一，回傳收斂後（~）的儲存路徑。 */
  const promptScriptPath = async (initialValue?: string): Promise<string | undefined> => {
    if (initialValue === undefined) {
      const method = await vscode.window.showQuickPick(
        [
          { label: '$(folder-opened) 選擇檔案…', method: 'dialog' as const },
          { label: '$(edit) 手動輸入路徑…', method: 'input' as const },
        ],
        { title: '新增 Script' },
      );
      if (!method) {
        return undefined;
      }
      if (method.method === 'dialog') {
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          openLabel: '加入 Script',
        });
        return uris?.[0] ? contractHome(uris[0].fsPath) : undefined;
      }
    }
    const raw = await vscode.window.showInputBox({
      title: initialValue === undefined ? '輸入 script 路徑' : '編輯 script 路徑',
      value: initialValue,
      placeHolder: '~/bin/deploy.sh 或絕對路徑',
      validateInput: (value) =>
        value.trim().startsWith('/') || value.trim().startsWith('~')
          ? undefined
          : '請輸入絕對路徑或 ~ 開頭的路徑',
    });
    if (!raw) {
      return undefined;
    }
    return contractHome(path.resolve(expandHome(raw.trim())));
  };

  /** 登錄即驗證：失敗只警告不擋（讓使用者先登錄、之後修檔），警告 icon 由快取呈現。 */
  const validateAndWarn = async (script: ScriptNode): Promise<void> => {
    const validation = await getStore().validate(script);
    if (!validation.ok) {
      void vscode.window.showWarningMessage(
        `「${script.label}」驗證未通過：${validationMessage(validation)}`,
      );
    }
    provider.refresh();
  };

  register('shellScripts.addScript', async (arg) => {
    const target = await resolveAddTarget(arg);
    if (!target) {
      return;
    }
    const storedPath = await promptScriptPath();
    if (!storedPath) {
      return;
    }
    const script: ScriptNode = {
      kind: 'script',
      id: randomUUID(),
      label: path.basename(expandHome(storedPath)),
      path: storedPath,
    };
    getStore()
      .storeFor(target.source)
      .update((state) => addNode(state, script, target.parentFolderId));
    provider.refresh();
    await validateAndWarn(script);
  });

  register('shellScripts.addFolder', async (arg) => {
    const target = await resolveAddTarget(arg);
    if (!target) {
      return;
    }
    const name = await vscode.window.showInputBox({ title: '新資料夾名稱', value: '新資料夾' });
    if (!name) {
      return;
    }
    const folder: FolderNode = { kind: 'folder', id: randomUUID(), name: name.trim(), children: [] };
    getStore()
      .storeFor(target.source)
      .update((state) => addNode(state, folder, target.parentFolderId));
    provider.refresh();
  });

  register('shellScripts.refresh', () => refreshAll());

  register('shellScripts.run', async (arg) => {
    if (isTreeElement(arg) && arg.type === 'node' && arg.node.kind === 'script') {
      await runner.run(arg.node);
      provider.refresh();
    }
  });

  register('shellScripts.delete', async (arg) => {
    if (!isTreeElement(arg) || arg.type !== 'node') {
      return;
    }
    const isFolder = arg.node.kind === 'folder';
    const name = isFolder ? (arg.node as FolderNode).name : (arg.node as ScriptNode).label;
    const confirm = await vscode.window.showWarningMessage(
      `確定刪除${isFolder ? '資料夾' : ' script'}「${name}」？`,
      {
        modal: true,
        detail: isFolder
          ? '資料夾內的項目會一併從清單移除。不會動到磁碟上的實體檔案。'
          : '只從清單移除，不會刪除磁碟上的檔案。',
      },
      '刪除',
    );
    if (confirm !== '刪除') {
      return;
    }
    getStore()
      .storeFor(arg.source)
      .update((state) => removeNode(state, arg.node.id) !== undefined);
    provider.refresh();
  });

  register('shellScripts.editNote', async (arg) => {
    if (!isTreeElement(arg) || arg.type !== 'node' || arg.node.kind !== 'script') {
      return;
    }
    const script = arg.node;
    const note = await vscode.window.showInputBox({
      title: `編輯備註：${script.label}`,
      value: script.note ?? '',
      placeHolder: '顯示在檔名後面的說明（留空清除）',
    });
    if (note === undefined) {
      return;
    }
    getStore()
      .storeFor(arg.source)
      .update((state) => updateScript(state, script.id, { note: note.trim() }));
    provider.refresh();
  });

  register('shellScripts.editPath', async (arg) => {
    if (!isTreeElement(arg) || arg.type !== 'node' || arg.node.kind !== 'script') {
      return;
    }
    const script = arg.node;
    const storedPath = await promptScriptPath(script.path);
    if (!storedPath || storedPath === script.path) {
      return;
    }
    // 顯示名稱若沿用舊檔名，跟著換成新檔名；使用者自訂過的名稱不動
    const patch: Partial<Pick<ScriptNode, 'label' | 'path'>> = { path: storedPath };
    if (script.label === path.basename(expandHome(script.path))) {
      patch.label = path.basename(expandHome(storedPath));
    }
    getStore()
      .storeFor(arg.source)
      .update((state) => updateScript(state, script.id, patch));
    await validateAndWarn({ ...script, ...patch });
  });

  register('shellScripts.renameFolder', async (arg) => {
    if (!isTreeElement(arg) || arg.type !== 'node' || arg.node.kind !== 'folder') {
      return;
    }
    const folder = arg.node;
    const name = await vscode.window.showInputBox({ title: '資料夾改名', value: folder.name });
    if (!name) {
      return;
    }
    getStore()
      .storeFor(arg.source)
      .update((state) => renameFolder(state, folder.id, name.trim()));
    provider.refresh();
  });

  register('shellScripts.chooseDataFolder', async (arg) => {
    const source =
      asSource(arg) ??
      (isTreeElement(arg) && arg.type === 'source' ? arg.source : await pickSource('選擇要設定的清單'));
    if (!source) {
      return;
    }
    const layout = getLayout(source);
    const method = await vscode.window.showQuickPick(
      [
        { label: '$(folder-opened) 選擇資料夾…', method: 'dialog' as const },
        { label: '$(edit) 手動輸入路徑…', method: 'input' as const },
      ],
      { title: `設定${SOURCE_LABELS[source]}清單保存位置` },
    );
    if (!method) {
      return;
    }
    let picked: string | undefined;
    if (method.method === 'dialog') {
      const uris = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: `設為${SOURCE_LABELS[source]}保存位置`,
        defaultUri: layout.isFallback ? undefined : vscode.Uri.file(layout.root),
      });
      picked = uris?.[0]?.fsPath;
    } else {
      const raw = await vscode.window.showInputBox({
        title: `輸入${SOURCE_LABELS[source]}清單保存資料夾`,
        value: layout.isFallback ? '' : contractHome(layout.root),
        placeHolder: '~/Dropbox/shell-scripts 或絕對路徑',
        validateInput: (value) =>
          value.trim().startsWith('/') || value.trim().startsWith('~')
            ? undefined
            : '請輸入絕對路徑或 ~ 開頭的路徑',
      });
      picked = raw?.trim();
    }
    if (!picked) {
      return;
    }
    const resolved = path.resolve(expandHome(picked));
    const other: ScriptSource = source === 'shared' ? 'private' : 'shared';
    if (resolved === getLayout(other).root) {
      void vscode.window.showErrorMessage(
        `Shell Scripts：該路徑已是${SOURCE_LABELS[other]}清單的保存位置，兩者不可相同。`,
      );
      return;
    }
    if (hasScriptsFile(resolved)) {
      const confirm = await vscode.window.showWarningMessage(
        `該資料夾已有 scripts.json，設為${SOURCE_LABELS[source]}保存位置後將改用其內容。要繼續嗎？`,
        { modal: true },
        '繼續',
      );
      if (confirm !== '繼續') {
        return;
      }
    }
    const key = source === 'shared' ? 'dataFolder' : 'privateDataFolder';
    // 寫入設定後由 onDidChangeConfiguration 重建 stores 並刷新畫面
    await vscode.workspace
      .getConfiguration('shellScripts')
      .update(key, contractHome(resolved), vscode.ConfigurationTarget.Global);
    void vscode.window.showInformationMessage(
      `Shell Scripts：${SOURCE_LABELS[source]}清單保存位置已設為 ${contractHome(resolved)}`,
    );
  });

  register('shellScripts.openDataFolder', async (arg) => {
    const source =
      asSource(arg) ??
      (isTreeElement(arg) && arg.type === 'source' ? arg.source : await pickSource('顯示哪份清單的保存資料夾？'));
    if (!source) {
      return;
    }
    void vscode.env.openExternal(vscode.Uri.file(getLayout(source).root));
  });
}
