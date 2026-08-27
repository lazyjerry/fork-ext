# Changelog

本檔案記錄 forrrk 的版本變更，格式依循 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)，版本號依循 [Semantic Versioning](https://semver.org/lang/zh-TW/)。

## [Unreleased]

## [0.1.3] - 2026-08-27

### Changed

- 面板工具列的按鈕改為圖示按鈕，各自帶實心底色與邊框；名稱移到 tooltip 與 `aria-label`。
- 資訊區由單欄改為兩欄卡片並整體收緊間距；「其他設定」橫跨整列，面板寬度不足 560px 時自動退回一欄。

### Added

- 「開啟資料夾」按鈕與指令 `Fork: Open Repository Folder`：用作業系統的檔案管理員開啟儲存庫根目錄。
- 「Auto Push」按鈕與指令 `Fork: Run git-auto-push -a`：在整合終端機以儲存庫根目錄執行 [git-auto-push](https://github.com/lazyjerry/git-auto-push) 的 `-a` 全自動模式（add → commit → push）。偵測時除了 PATH 也會找 `~/.local/bin` 與 `/usr/local/bin`；沒安裝時提示安裝指令並可複製或前往 GitHub。Windows 原生終端機不支援。

## [0.1.2] - 2026-08-25

### Changed

- 擴充識別碼由 `workjerry.fork-ext` 改為 `workjerry.forrrk`（`package.json` 的 `name`）。`fork-ext` 這個名稱在一次被取消的上傳後遭 Marketplace 永久佔用，無法釋出，只能換名。GitHub repo 仍是 `fork-ext`。
- 從 `workjerry.fork-ext` 升級不會自動接續：請先移除舊的擴充，再安裝 `workjerry.forrrk`。

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
