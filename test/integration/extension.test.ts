import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import * as vscode from 'vscode';

import { isPosixShell } from '../../src/core/shell/quote';
import type { ShellScriptsApi } from '../../src/extension';

suite('Shell Scripts 延伸模組', () => {
  let dataDir: string;

  suiteSetup(async () => {
    // 先把共用清單指到預埋好資料的暫存資料夾，再啟動延伸模組
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssx-int-'));
    const seeded = {
      version: 1,
      roots: [
        {
          kind: 'folder',
          id: 'f1',
          name: '部署',
          children: [{ kind: 'script', id: 's1', label: 'deploy.sh', path: '~/bin/deploy.sh', note: '正式站' }],
        },
        { kind: 'script', id: 's2', label: 'backup.sh', path: '/tmp/backup.sh' },
      ],
    };
    fs.writeFileSync(path.join(dataDir, 'scripts.json'), JSON.stringify(seeded));
    await vscode.workspace
      .getConfiguration('shellScripts')
      .update('dataFolder', dataDir, vscode.ConfigurationTarget.Global);
  });

  suiteTeardown(async () => {
    await vscode.workspace
      .getConfiguration('shellScripts')
      .update('dataFolder', undefined, vscode.ConfigurationTarget.Global);
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  test('可啟動並註冊全部指令', async () => {
    const extension = vscode.extensions.getExtension('workjerry.shell-script');
    assert.ok(extension);
    await extension.activate();

    const commands = await vscode.commands.getCommands(true);
    for (const command of [
      'shellScripts.addScript',
      'shellScripts.addFolder',
      'shellScripts.refresh',
      'shellScripts.run',
      'shellScripts.delete',
      'shellScripts.editNote',
      'shellScripts.editPath',
      'shellScripts.renameFolder',
      'shellScripts.chooseDataFolder',
      'shellScripts.openDataFolder',
    ]) {
      assert.ok(commands.includes(command), `缺少指令 ${command}`);
    }
  });

  test('TreeView 頂層是共用/私有兩個來源區段，並載入預埋的清單', async () => {
    const extension = vscode.extensions.getExtension('workjerry.shell-script');
    assert.ok(extension);
    const api = (await extension.activate()) as ShellScriptsApi;

    const roots = api.provider.getChildren();
    assert.equal(roots.length, 2);
    assert.deepEqual(
      roots.map((e) => api.provider.getTreeItem(e).contextValue),
      ['source-shared', 'source-private'],
    );

    const sharedChildren = api.provider.getChildren(roots[0]);
    assert.equal(sharedChildren.length, 2);

    const folderItem = api.provider.getTreeItem(sharedChildren[0]);
    assert.equal(folderItem.contextValue, 'folder');
    assert.equal(folderItem.label, '部署');

    const inFolder = api.provider.getChildren(sharedChildren[0]);
    const scriptItem = api.provider.getTreeItem(inFolder[0]);
    assert.equal(scriptItem.contextValue, 'script');
    assert.equal(scriptItem.label, 'deploy.sh');
    assert.equal(scriptItem.description, '正式站');

    // 私有來源未設定，應為空清單
    assert.equal(api.provider.getChildren(roots[1]).length, 0);
  });

  test('驗證快取：不存在的路徑刷新後標為警告', async () => {
    const extension = vscode.extensions.getExtension('workjerry.shell-script');
    assert.ok(extension);
    const api = (await extension.activate()) as ShellScriptsApi;

    await api.getStore().revalidateAll();
    const validation = api.getStore().getValidation('s2'); // /tmp/backup.sh 不存在
    assert.ok(validation);
    assert.equal(validation.ok, false);
  });

  test('執行：依預設 shell 決定送字串或直接以 bash 執行，cwd 為 script 所在資料夾', async () => {
    const extension = vscode.extensions.getExtension('workjerry.shell-script');
    assert.ok(extension);
    await extension.activate();

    const scriptPath = path.join(dataDir, 'run me.sh');
    fs.writeFileSync(scriptPath, 'echo ok\n');
    const node = { kind: 'script', id: 's-run', label: 'run me.sh', path: scriptPath };
    await vscode.commands.executeCommand('shellScripts.run', { type: 'node', source: 'shared', node });

    const terminal = vscode.window.terminals.find((t) => t.name === '▶ run me.sh');
    assert.ok(terminal, '未建立終端機');
    try {
      const options = terminal.creationOptions as vscode.TerminalOptions;
      assert.equal(options.cwd, dataDir);
      if (isPosixShell(vscode.env.shell)) {
        assert.equal(options.shellPath, undefined);
      } else {
        assert.equal(options.shellPath, 'bash');
        assert.deepEqual(options.shellArgs, [scriptPath]);
      }
    } finally {
      terminal.dispose();
    }
  });
});
