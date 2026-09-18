// 執行：每個 script 一個具名終端機，存在且未結束就 reuse 帶到前景再送指令。
// 用 `bash '<path>'` 執行，避開 chmod +x 權限問題；stdin 互動與 TUI 是內建終端機原生能力。
// 終端機不是 POSIX shell 時改成終端機本身就是 `bash <path>` 行程，script 結束即結束。

import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ScriptNode } from '../core/model/types';
import { expandHome } from '../core/paths/homePath';
import { planRun } from '../core/shell/quote';
import { validationMessage } from '../core/validate/validateScript';
import type { DualScriptStore } from '../storage/dualStore';

export class ScriptRunner implements vscode.Disposable {
  private readonly terminals = new Map<string, vscode.Terminal>();
  /** 以 shellPath=bash 直接執行 script 的終端機；存活代表 script 仍在跑。 */
  private readonly directTerminals = new Set<vscode.Terminal>();
  private readonly closeSubscription: vscode.Disposable;

  constructor(private readonly getStore: () => DualScriptStore) {
    this.closeSubscription = vscode.window.onDidCloseTerminal((terminal) => {
      this.directTerminals.delete(terminal);
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
    const existing = this.terminals.get(script.id);
    if (existing && existing.exitStatus === undefined) {
      if (this.directTerminals.has(existing)) {
        // 再送字串只會變成執行中 script 的 stdin
        existing.show();
        void vscode.window.showInformationMessage(`「${script.label}」仍在執行中。`);
        return;
      }
      // state.shell 反映終端機目前實際的 shell；未偵測到時退回預設 profile 的 shell
      const plan = planRun(absolutePath, existing.state.shell ?? vscode.env.shell);
      if (plan.mode === 'sendText') {
        existing.show();
        existing.sendText(plan.text);
        return;
      }
    }

    const plan = planRun(absolutePath, vscode.env.shell);
    const options: vscode.TerminalOptions = {
      name: `▶ ${script.label}`,
      cwd: path.dirname(absolutePath),
    };
    if (plan.mode === 'direct') {
      options.shellPath = plan.shellPath;
      options.shellArgs = plan.shellArgs;
    }
    const terminal = vscode.window.createTerminal(options);
    this.terminals.set(script.id, terminal);
    if (plan.mode === 'direct') {
      this.directTerminals.add(terminal);
    }
    terminal.show();
    if (plan.mode === 'sendText') {
      terminal.sendText(plan.text);
    }
  }

  dispose(): void {
    this.closeSubscription.dispose();
  }
}
