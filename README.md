# forrrk

在 VS Code 底部 Panel 顯示目前儲存庫的唯讀 git 資訊，並一鍵用 [Fork](https://git-fork.com/) 開啟該儲存庫。

資訊全部由直接讀取 `.git` 底下的檔案取得，**不呼叫 `git` 指令**，系統沒安裝 git 也能用。

## 功能

- **常駐 Panel**：資訊固定在底部 Panel 的 **forrrk** 分頁，與 Terminal、Problems 並列。
- **跟隨作用中編輯器**：從目前開啟的檔案往上找最近的 `.git`，找不到才退回工作區第一個資料夾。多儲存庫的工作區下也指得對。
- **只在你要求時讀取**：不輪詢、不監看檔案。按下工具列的刷新圖示才重新定位並重讀，Panel 上標著最後讀取時間。
- **一鍵開啟 Fork**：呼叫 `fork -C <repo> open`。沒有 CLI 時提示安裝步驟並附上可複製的指令，沒有 Fork 時導向下載頁，不是儲存庫時直接說清楚。
- **一鍵 Auto Push**：在整合終端機執行 [git-auto-push](https://github.com/lazyjerry/git-auto-push) 的 `git-auto-push -a`（自動 add → commit → push）。沒安裝時提示安裝指令。
- **完全離線**：不載入遠端資源、不傳送 telemetry、不呼叫任何網路服務（Auto Push 本身是你裝的外部工具，網路行為由它決定）。

## 顯示的資訊

| 區塊 | 內容 | 來源 |
| --- | --- | --- |
| HEAD | 目前分支或 detached 標示、HEAD SHA（點擊複製完整值）、stash 筆數、最近切換過的分支 | `.git/HEAD`、`refs/`、`packed-refs`、`logs/HEAD`、`logs/refs/stash` |
| 遠端 | 每個 remote 的 URL 與 push URL、目前分支的上游追蹤 | `.git/config` |
| 其他設定 | `.git/config` 其餘設定，依 section 分組編排 | `.git/config` |

linked worktree 與 submodule 的 `.git` 是指向別處的文字檔，兩者都能正確解析。

**不顯示**工作區乾淨／髒污狀態、ahead/behind 數字與提交歷史——這些純讀檔算不出來，且 VS Code 內建的 Source Control 面板已經有了。

## 使用方式

在底部 Panel 選擇 **forrrk**。工具列右側是三個圖示按鈕——刷新、Auto Push、在 Fork 中開啟，滑鼠停留可看名稱；資訊區以兩欄卡片排列，面板拉窄時自動退回一欄。也可從 Command Palette 執行：

| 指令 | 說明 |
| --- | --- |
| `Fork: Refresh Repository Info` | 重新定位儲存庫並讀取資訊 |
| `Fork: Open Current Repository in Fork` | 用 Fork 開啟目前的儲存庫 |
| `Fork: Run git-auto-push -a` | 在整合終端機執行 `git-auto-push -a` |

## git-auto-push

「Auto Push」需要 `git-auto-push` 指令。偵測順序是 PATH → `~/.local/bin` → `/usr/local/bin`（後兩者是官方 install.sh 的預設與 `--global` 位置），執行時使用絕對路徑，終端機 PATH 沒有它也沒關係。沒安裝時會跳出安裝指令：

```sh
curl -fsSL https://raw.githubusercontent.com/lazyjerry/git-auto-push/refs/heads/master/install.sh | sh
```

它是 bash 腳本，Windows 原生終端機不支援。

## Fork 命令列工具

「在 Fork 中開啟」需要 `fork` 指令在 PATH 中。在 Fork 選單列選 **Fork → Install Command Line Tools** 即可安裝；若該選項因 `/usr/local/bin` 權限不足而失敗，本擴充套件會提供等效的手動指令供複製。

Fork 只發行 macOS 與 Windows 版本，其他平台會直接告知不支援。

## 開發

建置、測試與封裝流程見 [CONTRIBUTING.md](CONTRIBUTING.md)，發布流程見 [docs/PUBLISHING.md](docs/PUBLISHING.md)。

## 授權

[Apache License 2.0](LICENSE)
