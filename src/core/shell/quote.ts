// 純 Node，不 import vscode。

/** 以單引號包住並跳脫內含單引號，路徑含空白、中文、特殊字元都安全。 */
export function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

// shellSingleQuote 的 '\'' 跳脫只在 POSIX 系 shell 成立；fish 單引號內 \' 是跳脫、
// PowerShell 用 '' 跳脫、cmd 不認單引號，照樣拼字串會讓特殊路徑變成指令注入。
const POSIX_SHELLS = new Set(['bash', 'zsh', 'sh', 'dash', 'ksh', 'gitbash']);

/** 接受 shell 路徑（vscode.env.shell）或 shell 類型（terminal.state.shell），空值視為未知。 */
export function isPosixShell(shell: string | undefined): boolean {
  if (!shell) {
    return false;
  }
  const name = shell
    .split(/[\\/]/)
    .pop()!
    .toLowerCase()
    .replace(/\.exe$/, '');
  return POSIX_SHELLS.has(name);
}

export type RunPlan =
  | { mode: 'sendText'; text: string }
  | { mode: 'direct'; shellPath: string; shellArgs: string[] };

/** POSIX shell 維持送出 `bash '<path>'`；其他 shell 改由 bash 直接以參數執行，不經任何字串解析。 */
export function planRun(absolutePath: string, shell: string | undefined): RunPlan {
  if (isPosixShell(shell)) {
    return { mode: 'sendText', text: `bash ${shellSingleQuote(absolutePath)}` };
  }
  return { mode: 'direct', shellPath: 'bash', shellArgs: [absolutePath] };
}
