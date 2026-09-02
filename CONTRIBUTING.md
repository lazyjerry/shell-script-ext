# 開發指南

## 需求

- Node.js 22+
- macOS（`scripts/make-icon.sh` 依賴 sips；其他平台可略過）

## 常用指令

| 指令 | 說明 |
|---|---|
| `npm run build` | typecheck（tsc --noEmit）+ esbuild bundle 到 `out/extension.js` |
| `npm run lint` | eslint flat config |
| `npm run test:unit` | tsc 編譯後以 mocha 跑 `test/unit/`（純 Node，不開 VSCode） |
| `npm run test:integration` | 下載測試用 VSCode 跑 `test/integration/` |
| `npm run check` | lint + build + 全部測試 |
| `npm run package:vsix` | check 後以 vsce 打包（`--no-dependencies`，extension 已 bundle） |

## 結構原則

- `src/core/` 與 `src/storage/` 是純 Node，**絕不 import vscode**——單元測試靠它。「樹要怎麼變」全在 `core/model/treeOps.ts` 純函式；views/commands 只是「收 vscode 事件 → treeOps → store.update → provider refresh」的接線。
- script 的 `path` 儲存值一律是 `~` 收斂形式（`core/paths/homePath.ts`），任何 fs 操作與執行前先 `expandHome`。
- 保存位置指令只寫 settings，store 重建一律由 `onDidChangeConfiguration` 觸發（使用者手改 settings.json 也走同一條路）。

## 環境注意事項

- 整合測試噴 `bad option: --disable-extensions` = 環境繼承了 `ELECTRON_RUN_AS_NODE`；`test/runTest.ts` 已處理，勿移除。
- 整合測試 `listen EINVAL ...main.sock` = 專案路徑太長；`test/runTest.ts` 已改用 `/private/tmp` 下短路徑的 `--user-data-dir`，勿移除。
- 測試跑的是 `out/` 下的 tsc 產物，改完 code 要先編譯（`npm run test:unit` 已包含）。
