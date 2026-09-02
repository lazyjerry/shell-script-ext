// 執行：每個 script 一個具名終端機，存在且未結束就 reuse 帶到前景再送指令。
// 用 `bash '<path>'` 執行，避開 chmod +x 權限問題；stdin 互動與 TUI 是內建終端機原生能力。

import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ScriptNode } from '../core/model/types';
import { expandHome } from '../core/paths/homePath';
import { shellSingleQuote } from '../core/shell/quote';
import { validationMessage } from '../core/validate/validateScript';
import type { DualScriptStore } from '../storage/dualStore';

export class ScriptRunner implements vscode.Disposable {
  private readonly terminals = new Map<string, vscode.Terminal>();
  private readonly closeSubscription: vscode.Disposable;

  constructor(private readonly getStore: () => DualScriptStore) {
    this.closeSubscription = vscode.window.onDidCloseTerminal((terminal) => {
      for (const [id, t] of this.terminals) {
        if (t === terminal) {
          this.terminals.delete(id);
        }
      }
    });
  }

  async run(script: ScriptNode): Promise<void> {
    // 執行前即時重驗證（不信任快取），失敗就擋下並讓警告 icon 更新
    const validation = await this.getStore().validate(script);
    if (!validation.ok) {
      void vscode.window.showWarningMessage(
        `無法執行「${script.label}」：${validationMessage(validation)}（${script.path}）`,
      );
      return;
    }

    const absolutePath = expandHome(script.path);
    let terminal = this.terminals.get(script.id);
    if (!terminal || terminal.exitStatus !== undefined) {
      terminal = vscode.window.createTerminal({
        name: `▶ ${script.label}`,
        cwd: path.dirname(absolutePath),
      });
      this.terminals.set(script.id, terminal);
    }
    terminal.show();
    terminal.sendText(`bash ${shellSingleQuote(absolutePath)}`);
  }

  dispose(): void {
    this.closeSubscription.dispose();
  }
}
