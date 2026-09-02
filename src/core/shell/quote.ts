// 純 Node，不 import vscode。

/** 以單引號包住並跳脫內含單引號，路徑含空白、中文、特殊字元都安全。 */
export function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
