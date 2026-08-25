# 開發指南

## 需求

- Node.js 20 以上
- VS Code 1.90 以上

## 常用指令

| 指令 | 用途 |
| --- | --- |
| `npm run build` | 型別檢查 + 打包 extension 與 webview |
| `npm run lint` | ESLint |
| `npm run test:unit` | 單元測試（mocha，只測 `src/core/`） |
| `npm run test:integration` | 整合測試（`@vscode/test-electron`） |
| `npm run check` | lint + build + 全部測試 |
| `npm run package:vsix` | 先跑 `check` 再產生 VSIX |

按 F5 可啟動 Extension Development Host 實際操作。

## 結構

| 路徑 | 用途 |
| --- | --- |
| `src/extension.ts` | 啟動、註冊 provider 與指令 |
| `src/views/forkViewProvider.ts` | Webview view provider，所有 vscode API 互動集中在此 |
| `src/core/git/` | 讀取與解析 `.git`；純 Node，不 import `vscode` |
| `src/core/fork/` | 偵測 Fork CLI／應用程式，產生安裝提示 |
| `src/shared/protocol.ts` | extension ⇄ webview 的訊息型別，兩端共用 |
| `src/webview/` | Panel 內容；零框架，狀態變了就整段重畫 |
| `media/` | CSS 與 webview 打包產物（`main.js` 不進版控） |

**`src/core/` 絕不能 import `vscode`**，否則單元測試無法在純 Node 下執行。

## 環境注意事項

- `test/runTest.ts` 會清掉 `ELECTRON_RUN_AS_NODE`，並把測試用的 profile 放在 `/private/tmp`。前者是因為 VS Code 終端機會繼承該旗標，後者是因為專案路徑過長會讓 IPC socket 超出長度限制。
