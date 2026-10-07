# forrrk

在 VS Code 底部 Panel 顯示目前儲存庫的唯讀 git 資訊，並一鍵用 [Fork](https://git-fork.com/) 開啟該儲存庫。

顯示的資訊全部由直接讀取 `.git` 底下的檔案取得，**不呼叫 `git` 指令**，系統沒安裝 git 也能看。唯一的例外是「取消／恢復追蹤變更」這個會**寫入** git 狀態的動作——旗標存在 `.git/index` 的二進位裡，改它交給 `git update-index` 比自己重寫整份 index 安全，所以只有這個按鈕需要系統裝有 git。

## 功能

- **常駐 Panel**：資訊固定在底部 Panel 的 **forrrk** 分頁，與 Terminal、Problems 並列。
- **跟隨作用中編輯器**：從目前開啟的檔案往上找最近的 `.git`，找不到才退回工作區第一個資料夾。多儲存庫的工作區下也指得對。
- **只在你要求時讀取**：不輪詢、不監看檔案。按下工具列的刷新圖示才重新定位並重讀，Panel 上標著最後讀取時間。
- **一鍵開啟資料夾**：用作業系統的檔案管理員（macOS 的 Finder、Windows 的檔案總管）開啟儲存庫根目錄。
- **一鍵切換忽略變更**：對目前開啟的檔案下 `git update-index --skip-worktree`（或清掉旗標恢復追蹤），按下去會先跳確認對話框，把指令與後果講清楚才執行。
- **一鍵開啟 `info/exclude`**：在編輯器打開 `.git/info/exclude` 直接編輯，檔案不存在時不會出現這個按鈕。
- **一鍵開啟遠端網頁**：用預設瀏覽器開啟遠端儲存庫的網頁。`git@host:owner/repo.git` 這種 SSH 網址會改寫成 `https://`，路徑不動，由 GitHub／GitLab 這類服務自行跳轉。
- **一鍵開啟 Fork**：呼叫 `fork -C <repo> open`。沒有 CLI 時提示安裝步驟並附上可複製的指令，沒有 Fork 時導向下載頁，不是儲存庫時直接說清楚。
- **一鍵 Auto Push**：在整合終端機執行 [git-auto-push](https://github.com/lazyjerry/git-auto-push) 的 `git-auto-push -a`（自動 add → commit → push）。沒安裝時提示安裝指令。
- **只推目前檔案**：對目前開啟的檔案執行 `git-auto-push -a -f <檔案>`，只 add、commit、push 這一個檔案，不動儲存庫裡其他變更。
- **完全離線**：不載入遠端資源、不傳送 telemetry、不主動呼叫任何網路服務（「開啟遠端網頁」是把網址交給你的瀏覽器；Auto Push 本身是你裝的外部工具，網路行為由它決定）。

## 顯示的資訊

資訊固定分成五張卡片：前三張並排，「忽略變更」與「其他設定」橫跨整列。

| 卡片 | 內容 | 來源 |
| --- | --- | --- |
| HEAD 目前狀態與遠端 | 目前分支或 detached 標示、HEAD SHA（點擊複製完整值）、stash 筆數、最近切換過的分支；每個 remote 的網域與路徑分兩欄列出，push URL 不同時另列一行，並標出目前分支的上游追蹤 | `.git/HEAD`、`refs/`、`packed-refs`、`logs/HEAD`、`logs/refs/stash`、`.git/config` |
| 專案 Project | 專案名稱、版本、描述、授權、分支數、標籤數、packfile 佔用、上次 git 操作時間；有用到才列出的 submodule、linked worktree、已安裝的 hook、Git LFS、CI workflow；README 的首個標題與第一段敘述，可點擊在編輯器開啟 | `package.json` 等宣告檔、`LICENSE`、`refs/`、`packed-refs`、`objects/`、`.git/index`、`.gitmodules`、`.git/worktrees`、`.git/hooks`、`.gitattributes`、`.github/workflows`、repo 根目錄的 `README.md` |
| 最近提交 Recent commits | 最近 5 次提交的訊息、作者、時間與短 SHA，近 7／30 天提交次數、出現過的作者 | `.git/logs/HEAD` |
| 忽略變更 Ignored changes | 目前開啟的檔案有沒有被標記忽略變更（`skip-worktree`／`assume-unchanged`）或被 `info/exclude` 排除，加上全部被標記的檔案清單與 `info/exclude` 的原始內容，路徑點擊複製 | `.git/index`、`.git/info/exclude` |
| 其他設定 Config | `.git/config` 其餘設定，依 section 分組編排，常見鍵名附中文說明 | `.git/config` |

「最近提交」來自 reflog，只記錄**這台機器上**發生過的操作：clone 之前的歷史、別人推上遠端的提交都不在裡面。

「忽略變更」卡片上有兩顆按鈕：對目前的檔案**取消／恢復追蹤變更**（已標記時顯示「恢復」，未標記時顯示「取消」；git 沒追蹤的檔案不給切換），以及**開啟 `info/exclude`**。切換只對**已受信任的工作區資料夾內**的檔案開放（解開 symlink 後比對）：git 會依儲存庫自己的 `.git/config` 執行外部指令（例如 `filter.<名>.clean`），外來目錄的設定不該被觸發，所以工作區外的檔案只會提示「檔案不在工作區內，未執行 git」，面板顯示不受影響。切換會跳確認對話框，恢復時會分兩次呼叫 `--no-skip-worktree` 與 `--no-assume-unchanged`——git 的 `update-index` 一次只會套用一個 mark 旗標，寫成一行會有一半沒清掉。

「忽略變更」判斷的是**按下刷新當下開著的那個檔案**：旗標直接解 `.git/index` 這份二進位檔（版本 2 與 3，SHA-1 與 SHA-256 都認），`info/exclude` 的比對實作了 gitignore 常用的語法（註解、`!` 反向、結尾 `/` 只匹配目錄、開頭或中間的 `/` 從根算起、`*` `?` `**`），不含跳脫字元與 `[abc]` 字元集。sparse checkout 會把上萬個檔案標成 `skip-worktree`，清單只列前 200 筆並標明總數。

linked worktree 與 submodule 的 `.git` 是指向別處的文字檔，兩者都能正確解析。

**不顯示**工作區乾淨／髒污狀態、ahead/behind 數字與提交歷史——這些純讀檔算不出來，且 VS Code 內建的 Source Control 面板已經有了。

## 使用方式

在底部 Panel 選擇 **forrrk**。工具列右側是六個圖示按鈕——刷新、Push 目前檔案、Auto Push、開啟資料夾、開啟遠端網頁、在 Fork 中開啟，滑鼠停留可看名稱；資訊區的卡片依面板寬度排成一到三欄（560px 以下一欄、940px 以上三欄）。也可從 Command Palette 執行：

| 指令 | 說明 |
| --- | --- |
| `Fork: Refresh Repository Info` | 重新定位儲存庫並讀取資訊 |
| `Fork: Open Current Repository in Fork` | 用 Fork 開啟目前的儲存庫 |
| `Fork: Run git-auto-push -a` | 在整合終端機執行 `git-auto-push -a` |
| `Fork: Run git-auto-push -a for Current File Only` | 只對目前開啟的檔案執行 `git-auto-push -a -f <檔案>` |
| `Fork: Open Repository Folder` | 用檔案管理員開啟儲存庫根目錄 |
| `Fork: Open Remote Repository in Browser` | 用瀏覽器開啟遠端儲存庫的網頁 |

## git-auto-push

「Auto Push」需要 `git-auto-push` 指令。偵測順序是 PATH → `~/.local/bin` → `/usr/local/bin`（後兩者是官方 install.sh 的預設與 `--global` 位置），執行時使用絕對路徑，終端機 PATH 沒有它也沒關係。沒安裝時會跳出安裝指令：

```sh
curl -fsSL https://raw.githubusercontent.com/lazyjerry/git-auto-push/refs/heads/master/install.sh | sh
```

它是 bash 腳本，Windows 原生終端機不支援。

「Push 目前檔案」執行前會先跑兩個唯讀的 git 指令檢查：檔案沒有變更就不執行；暫存區已有**其他**檔案也不執行，並列出那些檔案。`-f` 只限縮 `git add` 的範圍，`git-auto-push` 的 commit 不帶路徑，暫存區裡的東西會被一起提交。檔案還沒存檔時會先問要不要存。這兩個 git 指令與「取消／恢復追蹤變更」一樣，只對已受信任工作區資料夾內的檔案執行。

## Fork 命令列工具

「在 Fork 中開啟」需要 `fork` 命令列工具，偵測順序是 PATH → `/usr/local/bin` → App 內建的 `Fork.app/Contents/Resources/fork_cli`（僅 macOS）。macOS 只要 Fork 裝在 `/Applications` 或 `~/Applications` 就能直接用，不必另外安裝命令列工具；VS Code 從 Finder／Dock 啟動時拿不到 shell 的 PATH，靠這兩道後備才不會誤判成沒裝。

Windows 需要 `fork` 指令在 PATH 中：在 Fork 偏好設定啟用 command line tool 後重開 VS Code。macOS 若 App 內建的執行檔無法使用，會改提示從 Fork 選單列選 **Fork → Install Command Line Tools**；該選項因 `/usr/local/bin` 權限不足而失敗時，本擴充套件會提供等效的手動指令供複製。

Fork 只發行 macOS 與 Windows 版本，其他平台會直接告知不支援。

## 開發

建置、測試與封裝流程見 [CONTRIBUTING.md](CONTRIBUTING.md)，發布流程見 [docs/PUBLISHING.md](docs/PUBLISHING.md)。

## 授權

[Apache License 2.0](LICENSE)
