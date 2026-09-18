# Changelog

本檔格式依 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)，版本號依 [Semantic Versioning](https://semver.org/lang/zh-TW/)。

## [0.1.1] - 2026-09-19

### Security

- `shellScripts.dataFolder`、`shellScripts.privateDataFolder` 的 scope 由 `machine-overridable` 改為 `machine`：工作區的 `.vscode/settings.json` 不能再把清單換成 repo 內的 `scripts.json`，也不能讓延伸模組在任意路徑建立資料夾或改名檔案。原本就設定在使用者設定的值不受影響。
- 宣告 `capabilities.untrustedWorkspaces.supported: false`，在未受信任的工作區停用。
- 執行 script 時偵測終端機 shell：bash／zsh／sh 維持送出 `bash '<path>'`；fish、PowerShell、cmd 或偵測不到時，改用直接以 bash 執行該 script 的終端機，路徑不再經過 shell 字串解析，避免特殊檔名造成指令注入。
- 「顯示保存資料夾」改用 `revealFileInOS`，不再以 `openExternal` 開資料夾，避免資料夾名為 `*.app` 等 bundle 時被 macOS 當成 app 啟動。

## [0.1.0] - 2026-09-02

### Added

- 活動列 TreeView 管理 bash script 清單：資料夾分組、備註、拖曳排序與跨來源搬移。
- 共用／私有兩份清單，各自保存於可設定的資料夾（`scripts.json`），支援 `~/` 路徑與雲端同步。
- 檔案存在與 bash 檔驗證，未通過顯示警告圖示。
- 綠色播放鍵在內建終端機以 `bash '<path>'` 互動執行，同一 script 沿用同一個終端機。

[0.1.1]: https://github.com/lazyjerry/shell-script-ext/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/lazyjerry/shell-script-ext/releases/tag/v0.1.0
