# Changelog

本檔案記錄 forrrk 的版本變更，格式依循 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)，版本號依循 [Semantic Versioning](https://semver.org/lang/zh-TW/)。

## [Unreleased]

## [0.1.1] - 2026-08-25

### Changed

- 顯示名稱由 **foooork** 改為 **forrrk**：Marketplace 標題、底部 Panel 分頁名稱與所有通知訊息一併更新。擴充識別碼 `workjerry.fork-ext` 不變。

## [0.1.0] - 2026-08-25

### Added

- 底部 Panel 的 **foooork** 分頁，顯示目前儲存庫的 HEAD、遠端與 `.git/config` 其他設定。
- HEAD 區塊含 detached 標示、可點擊複製的 HEAD SHA、stash 筆數與最近切換過的分支。
- 「刷新」按鈕與最後讀取時間；資訊只在按下刷新或 Panel 重新載入時更新。
- 「在 Fork 中開啟」按鈕，呼叫 `fork -C <repo> open`；依 CLI／應用程式的安裝狀況分別提示安裝步驟、下載連結或不支援的平台。
- 指令 `Fork: Refresh Repository Info` 與 `Fork: Open Current Repository in Fork`。

### Known issues

- Windows 版 Fork 的命令列工具安裝路徑未經實機驗證，該情境只提供文字步驟，不提供可複製的指令。
