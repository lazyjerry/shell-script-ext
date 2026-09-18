# Shell Scripts

在 VS Code 側欄管理 bash script 清單，一鍵在內建終端機互動執行。

## 功能

- **側欄清單**：活動列的 Shell Scripts 圖示開啟原生 TreeView，script 以「登錄路徑參照」管理（不掃描實體目錄），支援巢狀資料夾分組與拖曳排序／搬移。
- **共用／私有雙清單**：頂層固定兩個區段，各自對應一個保存資料夾。共用清單可指到 Dropbox 等雲端同步資料夾跨裝置共用；私有清單放不同步的個人 script。
- **備註**：每個 script 可加備註，顯示在檔名後面作為標記。
- **驗證**：刷新時檢查檔案存在、且為 bash 檔（副檔名 `.sh`/`.bash`，或第一行 shebang 含 `bash`/`sh`）；未通過的項目顯示警告圖示，hover 可見原因。
- **執行**：script 項目上的綠色播放鍵在內建終端機執行 `bash '<path>'`；終端機可互動（`read`、TUI 都可用）。同一 script 重複執行會沿用同一個終端機。預設終端機不是 bash／zsh／sh（例如 fish、PowerShell）時，改開一個直接以 bash 執行該 script 的終端機，script 結束後不留互動 shell。
- **路徑支援 `~`**：手動輸入路徑可用 `~/` 開頭；家目錄下的路徑儲存與顯示一律收斂為 `~` 形式，方便多機同步。

## 使用方式

1. 點活動列的 Shell Scripts 圖示。
2. 用標題列的「新增 Script」登錄 script（檔案選擇器或手動輸入路徑），或先「新增資料夾」建立分組；來源區段與資料夾上也有各自的新增按鈕。
3. hover 到 script 上按綠色播放鍵執行；右鍵可編輯備註、編輯路徑、刪除。
4. 在「共用」或「私有」區段右鍵「選擇保存位置」，把清單檔（`scripts.json`）放到 Dropbox 等同步資料夾。

### 設定

| 設定鍵 | 說明 |
|---|---|
| `shellScripts.dataFolder` | 共用清單保存資料夾；空值使用延伸模組儲存空間。支援 `~/` 開頭。 |
| `shellScripts.privateDataFolder` | 私有清單保存資料夾；空值使用儲存空間的 `private/` 子目錄。不可與共用相同。 |

兩個設定的 scope 是 `machine`：只能在使用者設定（User settings）設定，工作區的 `.vscode/settings.json` 無法覆寫，避免開啟來路不明的 repo 時清單被換掉；不同機器仍可各自設定本機路徑、共享同一朵雲端資料夾。延伸模組在未受信任（Restricted Mode）的工作區停用。

### 同步行為

- 清單以 `scripts.json` 保存，寫入採 debounce + tmp/rename 原子寫。
- 外部變更（另一台機器經 Dropbox 回寫）在面板重新可見或按「刷新」時載入；衝突策略為 last-writer-wins，偵測到 Dropbox 衝突副本檔會提醒手動整併。

## 專案結構

```
src/
├── extension.ts              # 進入點：初始化雙 store、掛 TreeView、註冊指令
├── core/                     # 純 Node 邏輯，不 import vscode（單元測試主體）
│   ├── model/                # 資料模型與樹操作純函式
│   ├── paths/                # ~ 展開／收斂
│   ├── validate/             # bash 檔驗證
│   └── shell/                # shell 單引號跳脫
├── storage/                  # scripts.json 讀寫、共用/私有路由、資料夾解析
├── views/                    # TreeDataProvider 與拖曳控制
├── run/                      # 終端機執行
└── commands/                 # 指令註冊
```

## 開發

```bash
npm install
npm run build                 # typecheck + esbuild
npm run test:unit
npm run test:integration
npm run package:vsix
```

按 F5 啟動 Extension Development Host 手動測試。

## 授權

Apache-2.0
