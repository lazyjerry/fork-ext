# 發布到 VS Code Marketplace

forrrk 上架與改版的完整流程。首次發布請從「一、帳號與認證」開始；之後的改版只需執行「二、發布」。

整套流程都在 `scripts/publish.sh`，`npm run release` 為入口。這個腳本自帶所有發布前檢查，不依賴任何 repo 外的工具。

## 零、上架前置設定

已經設定好、之後不需再動的項目：

| 項目 | 目前的值 |
| --- | --- |
| `publisher` | `workjerry` |
| `icon` | `resources/icon.png`（128×128），由 `resources/icon.svg` 經 `scripts/make-icon.sh` 產生 |
| `engines.vscode` | `^1.90.0`，`@types/vscode` 與它對齊 |
| `keywords` / `bugs` / `repository` | 供 Marketplace 搜尋與問題回報連結使用 |
| `categories` | `["SCM Providers", "Other"]` |
| `private` | 未設定（vsce 讀 npm 的同一欄位，標記 private 會被拒絕發布） |

`resources/` 下有兩個 svg，用途不同不要混用：`fork.svg` 是 Panel 容器圖示，必須用 `currentColor` 才會跟著主題變色；`icon.svg` 是 Marketplace 用的彩色版，只作為 `icon.png` 的來源，已由 `.vscodeignore` 排除、不進 VSIX。

## 一、帳號與認證（一次性）

1. 用 Microsoft 帳號建立 Azure DevOps 組織：<https://dev.azure.com>
2. 建立 Personal Access Token（右上角 User settings → Personal access tokens）：
   - **Organization**：`All accessible organizations`（必須，否則 vsce 認證失敗）
   - **Scopes**：`Custom defined` → `Marketplace` → 勾選 `Manage`
   - **Expiration**：最長 1 年
3. publisher `workjerry` 已存在（<https://marketplace.visualstudio.com/manage>），不需重建。
4. 本機登入：

   ```bash
   npx vsce login workjerry
   ```

   貼上 PAT，憑證存於系統 keychain。CI 環境改用 `VSCE_PAT` 環境變數。

同一組 PAT 對這個 publisher 下的所有擴充都有效，若先前為 note-ext 或 volley-ext 登入過就不必重做，用 `npx vsce ls-publishers` 確認。

PAT 到期後 publish 會以認證錯誤失敗，重新產一組再 `vsce login` 即可。

## 二、發布

發布分兩階段，中間隔一個 commit，讓每個發布出去的版本都對應得到可追溯的 commit。

**擴充名稱一經註冊就永久佔用。** `fork-ext` 這個名稱在一次上傳後被取消／移除，此後公開查詢查不到它（`vsce show workjerry.fork-ext` 回 `undefined`、gallery API 0 筆），但 Marketplace 上傳頁仍會擋下「The extension 'fork-ext' already exists」。unpublish 與刪除都不會把名稱釋出，只能換一個沒用過的 `name`。因此 `name` 現在是 `forrrk`，識別碼 `workjerry.forrrk`；GitHub repo 仍叫 `fork-ext`，兩者不需一致。

**階段一：版本準備（之後的改版）**

```bash
npm run release patch     # 或 minor / major
```

改 `package.json`、`package-lock.json` 的版本，並把 `CHANGELOG.md` 的 `[Unreleased]` 內容整段搬到新版本號下。**不 commit、不打包、不上傳。** 檢查 diff 後自行提交。

`[Unreleased]` 是空的會直接失敗——沒有變更就不該發版。

**階段二：發布**

```bash
DRY_RUN=1 npm run release     # 走完打包與稽核，止於上傳前
npm run release               # 完整發布
```

腳本依序執行：

1. 工作區乾淨檢查
2. `package.json` 欄位驗證（`private`、必填欄位、SemVer 格式）
3. 比對 Marketplace 版本，本機必須嚴格大於遠端
4. `npm run check`（lint + build + unit + integration）
5. `vsce package`
6. VSIX 內的 manifest 與 `package.json` 比對
7. **VSIX 內容稽核**——含有 `src/`、`test/`、`scripts/`、`docs/`、`.claude/`、`.agents/`、`CLAUDE.md`、`AGENTS.md` 任何一項就中止
8. 安裝到本機 VS Code
9. 互動確認（輸入 `yes`）
10. 上傳**同一個**已稽核的 VSIX（`vsce publish --packagePath`）
11. 輪詢 Marketplace 直到版本上架且 SHA-256 相符

第 8 步之後務必實際開一次底部 Panel 的 **forrrk** 分頁，確認資訊讀得出來、「在 Fork 中開啟」按得動。腳本能驗證 VSIX 的內容物，但驗不了 UI 是否真的能動。

發布後 Marketplace 需數分鐘驗證才會上架，狀態見 <https://marketplace.visualstudio.com/manage/publishers/workjerry>。

**版本號一經發布無法覆蓋或刪除，只能往上遞增。** 這是腳本要求互動確認與工作區乾淨的原因。

## 三、跑 .vscode-test 之前

`npm run check` 會下載約 300MB 的簽署 VS Code app bundle 到 `.vscode-test/`。專案若放在雲端同步資料夾，先把 `.vscode-test/` 排除同步，否則同步程式可能對該 bundle 反覆觸發 macOS App Management 權限提示。

## 四、設計取捨

**build 與 publish 分離。** `npm run check`、`npm run package:vsix` 只產生並驗證本機 artifact，即使環境中存在 `VSCE_PAT` 也不會上傳。上傳只發生在 `scripts/publish.sh`，且需顯式執行加互動確認。避免 CI 或本機建置意外推出一個無法回收的版本。

**版本準備與發布分兩次執行。** 若讓 `vsce publish patch` 自行 bump，它會在上傳前重新打包一次——那麼稽核過、安裝驗證過的 VSIX 就不是實際上傳的那一份。改成先準備版本、commit，再打包一次並用 `--packagePath` 上傳同一個檔案，驗證對象與發布對象才是同一個 artifact。

**VSIX 內容稽核以 `.vscodeignore` 為準，不看 git。** vsce 會打包工作目錄裡任何沒被 `.vscodeignore` 排除的檔案，未進版控的也照包，`.gitignore` 擋不住它。新增本機工具目錄（`.claude/`、`.agents/` 這類）時，兩個 ignore 檔都要加。

**icon 生成不進 build。** `scripts/make-icon.sh` 依賴 macOS 的 `sips`，掛進 `npm run build` 會讓非 macOS 環境的建置失敗。`resources/icon.png` 直接進版控，只有在 `icon.svg` 改動時才手動重跑。

**`engines.vscode` 選 1.90 的理由。** 程式實際用到的 API——`registerWebviewViewProvider`（1.49）、`Uri.joinPath`（1.45）、`env.clipboard`（1.30）、`window.setStatusBarMessage`（1.0）——最低只需 1.49。取 1.90 是與同目錄的 volley-ext 對齊，也留一段安全邊際。要往下修就得重跑 `npm run typecheck` 確認型別定義中沒有超前的 API。

## 五、後續維護

- 開發過程中把變更寫進 `CHANGELOG.md` 的 `[Unreleased]` 段落即可，搬到版本號下由 `npm run release <bump>` 處理。
- `README.md` 整份就是 Marketplace 頁面內容，維持使用者導向。開發相關說明放 `CONTRIBUTING.md`（已由 `.vscodeignore` 排除，不進 VSIX）。
- 要下架某個版本用 `npx vsce unpublish workjerry.forrrk@<version>`；下架整個擴充是 `npx vsce unpublish workjerry.forrrk`，**擴充名稱會被永久保留、無法重新使用**。
