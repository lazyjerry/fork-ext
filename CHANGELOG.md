# Changelog

本檔案記錄 forrrk 的版本變更，格式依循 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)，版本號依循 [Semantic Versioning](https://semver.org/lang/zh-TW/)。

## [Unreleased]

## [0.1.6] - 2026-08-29

### Added

- **開啟遠端網頁**按鈕與指令 `Fork: Open Remote Repository in Browser`：用預設瀏覽器開啟遠端儲存庫的網頁。遠端優先取目前分支追蹤的那個，其次 `origin`。SSH 形式（`git@host:owner/repo.git`）、`ssh://`、`git://` 會改寫成 `https://`，路徑保持原樣交給託管服務跳轉；本機路徑與 `file://` 沒有網頁可開，會直接說明。

## [0.1.5] - 2026-08-27

### Changed

- 面板整體收緊間距：工具列、卡片內距、設定表格的列高、清單間距與空狀態留白都調小，圖示按鈕由 26px 縮為 22px。
- 卡片格線在面板寬度 940px 以上改為三欄（原本固定兩欄）；斷點為 560px 以下一欄、560–940px 兩欄、940px 以上三欄。
- 卡片合併成固定四張：HEAD（含遠端）、專案（含 README 與環境）、最近提交，加上橫跨整列的「其他設定」。卡片數不再隨 repo 內容變動，寬面板不會出現半列空白。
- 遠端網址拆成「網域 Host」與「路徑 Path」兩個欄位，不再把整串 URL 折行擠在一格裡；push URL 與 fetch URL 不同時另列一行。
- README 的標題與專案宣告檔的名稱相同時不再重複顯示。

## [0.1.4] - 2026-08-27

### Added

- **專案卡片**：讀 `package.json`／`pyproject.toml`／`Cargo.toml`／`composer.json`／`deno.json`／`go.mod` 的名稱、版本與描述，加上 LICENSE 首行推斷的授權、分支數、標籤數、packfile 佔用與上次 git 操作時間。
- **最近提交卡片**：從 `.git/logs/HEAD`（reflog）取最近 5 次提交的訊息、作者、時間與短 SHA，並統計近 7／30 天的提交次數與出現過的作者。reflog 只記本機操作，卡片下方有標註。
- **README 卡片**：取 repo 根目錄 README 的首個標題與第一段敘述（跳過徽章），可點「開啟」在編輯器開啟該檔；指令為新增的 `fork.openFile` 訊息。
- **環境卡片**：submodule（`.gitmodules`）、linked worktree（`.git/worktrees`）、已安裝的 hook（排除 `.sample`）、Git LFS（`.gitattributes`）、GitHub Actions workflow 檔；全部沒有時整張卡不出現。

### Changed

- 卡片標題改為中英並列（例如「專案 Project」），新卡片的欄位名稱也是中英對照。
- 「其他設定」的 git config 鍵名旁補上中文說明（約 35 個常見鍵，查不到的不標），布林值由填色藥丸改為著色文字，列與列之間加斑馬紋，群組卡片在群組少時撐滿整列。

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
