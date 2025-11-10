# GitHub Actions 工作流程說明

本專案包含三個主要的 GitHub Actions 工作流程，用於自動化 CI/CD 流程。

## 📋 工作流程概覽

### 1. CI 工作流程 (`ci.yml`)

**觸發條件**：
- 推送到 `main`、`develop` 或 `claude/**` 分支
- 針對 `main` 或 `develop` 的 Pull Request

**執行內容**：
- ✅ Backend 測試與構建（單元測試、整合測試）
- ✅ Frontend 測試與構建（Lint 檢查）
- ✅ Desktop 應用測試（前端測試、Rust 測試）
- ✅ E2E 測試（Playwright）

**產物保留**：
- Backend 構建產物（7 天）
- Frontend 構建產物（7 天）
- Playwright 測試報告（7 天）

### 2. Release 工作流程 (`release.yml`)

**觸發條件**：
- 推送符合 `v*.*.*` 格式的標籤（例如：`v2.0.0`）
- 手動觸發（可指定版本號）

**執行內容**：
1. 創建 GitHub Release
2. 構建跨平台 Desktop 應用：
   - Windows (x64)
   - macOS (Intel & Apple Silicon)
   - Linux (AppImage & deb)
3. 打包 Backend（所有平台）
4. 構建 Frontend（Web 版本）
5. 上傳所有構建產物到 Release

**產出檔案**：
```
autodoc-agent_v2.0.0_x64.msi                    # Windows 安裝檔
autodoc-agent_v2.0.0_x64.dmg                    # macOS Intel 安裝檔
autodoc-agent_v2.0.0_aarch64.dmg                # macOS Apple Silicon 安裝檔
autodoc-agent_v2.0.0_amd64.AppImage             # Linux 可執行檔
autodoc-agent_v2.0.0_amd64.deb                  # Linux Debian 套件
backend-bundle_v2.0.0.tar.gz                    # Backend 打包檔
frontend-web_v2.0.0.tar.gz                      # Frontend 打包檔
```

### 3. Package 工作流程 (`package.yml`)

**觸發條件**：
- 僅限手動觸發

**執行內容**：
- 可選擇性打包特定組件：
  - `all`: 所有組件
  - `desktop-windows`: Windows 桌面應用
  - `desktop-macos`: macOS 桌面應用
  - `desktop-linux`: Linux 桌面應用
  - `backend`: 後端服務
  - `frontend`: 前端 Web 應用

**用途**：
- 測試打包流程
- 創建 Beta 版本
- 針對特定平台進行構建

**產物保留**：30 天

## 🚀 使用指南

### 發布新版本

#### 方法 1：使用 Git 標籤（推薦）

```bash
# 1. 確保所有變更已提交
git add .
git commit -m "feat: prepare for v2.1.0 release"

# 2. 創建並推送標籤
git tag v2.1.0
git push origin v2.1.0

# 3. GitHub Actions 會自動：
#    - 創建 Release
#    - 構建所有平台的應用
#    - 上傳構建產物
```

#### 方法 2：手動觸發

1. 前往 GitHub Actions 頁面
2. 選擇 **Release** 工作流程
3. 點擊 **Run workflow**
4. 輸入版本號（例如：`v2.1.0`）
5. 點擊 **Run workflow** 確認

### 測試打包流程

```bash
# 使用 Package 工作流程進行測試
```

1. 前往 GitHub Actions 頁面
2. 選擇 **Package** 工作流程
3. 點擊 **Run workflow**
4. 選擇要打包的目標：
   - `all`: 構建所有組件
   - `desktop-windows`: 僅 Windows 版本
   - `desktop-macos`: 僅 macOS 版本
   - `desktop-linux`: 僅 Linux 版本
   - `backend`: 僅後端
   - `frontend`: 僅前端
5. 選擇是否上傳產物（建議選擇 `true`）
6. 點擊 **Run workflow** 確認

### 檢視構建產物

#### CI 工作流程產物

1. 進入 Pull Request 或 Commit 頁面
2. 查看 **Checks** 標籤
3. 點擊相應的工作流程
4. 在頁面底部找到 **Artifacts** 區塊
5. 下載需要的產物

#### Release 產物

1. 前往 Repository 的 **Releases** 頁面
2. 選擇對應的版本
3. 在 **Assets** 區塊下載需要的檔案

#### Package 工作流程產物

1. 前往 GitHub Actions 頁面
2. 選擇對應的 **Package** 工作流程執行
3. 在頁面底部找到 **Artifacts** 區塊
4. 下載需要的產物（保留 30 天）

## 🔧 維護指南

### 更新 Node.js 版本

在所有工作流程檔案中更新 `node-version`:

```yaml
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '20'  # 修改此處
```

### 更新 Rust 工具鏈

```yaml
- name: Install Rust stable
  uses: dtolnay/rust-toolchain@stable
  with:
    targets: x86_64-pc-windows-msvc  # 根據需要調整
```

### 調整測試配置

修改 `ci.yml` 中的測試命令：

```yaml
- name: Run unit tests
  working-directory: backend
  run: npm run test:unit
  continue-on-error: true  # 設為 false 可在測試失敗時中止工作流程
```

### 自定義 Release 說明

編輯 `release.yml` 中的 `body` 內容：

```yaml
body: `## 🎉 Release ${{ steps.get-version.outputs.version }}\n\n### 變更內容\n...`
```

## 📊 工作流程狀態徽章

將以下徽章加入 README.md：

```markdown
[![CI](https://github.com/YOUR_USERNAME/AudoDoc/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/AudoDoc/actions/workflows/ci.yml)
[![Release](https://github.com/YOUR_USERNAME/AudoDoc/actions/workflows/release.yml/badge.svg)](https://github.com/YOUR_USERNAME/AudoDoc/actions/workflows/release.yml)
```

## 🛠️ 故障排除

### 構建失敗

1. **檢查日誌**：在 Actions 頁面查看詳細錯誤訊息
2. **本地測試**：在本地執行相同的構建命令
3. **依賴問題**：確保 `package-lock.json` 已提交
4. **快取問題**：清除 Actions 快取後重試

### 產物上傳失敗

1. 檢查檔案路徑是否正確
2. 確認檔案確實被生成
3. 檢查權限設定

### macOS 構建問題

- 確保已安裝 Xcode Command Line Tools
- 檢查 Rust 目標是否正確設定

### Linux 依賴問題

更新 `apt-get install` 列表中的套件：

```yaml
- name: Install dependencies (Ubuntu)
  run: |
    sudo apt-get update
    sudo apt-get install -y \
      libwebkit2gtk-4.1-dev \
      # 在此添加其他依賴...
```

## 📝 版本命名規範

遵循語義化版本控制（Semantic Versioning）：

- **Major** (`v2.0.0`): 不相容的 API 變更
- **Minor** (`v2.1.0`): 向後相容的功能新增
- **Patch** (`v2.1.1`): 向後相容的問題修正

## 🔐 安全性考量

- 所有 workflow 使用官方 Actions（`actions/*`、`dtolnay/*`）
- 避免在 workflow 中暴露敏感資訊
- 使用 GitHub Secrets 儲存認證資訊
- 定期更新 Actions 版本

## 📚 參考資源

- [GitHub Actions 文檔](https://docs.github.com/en/actions)
- [Tauri 構建指南](https://tauri.app/v1/guides/building/)
- [語義化版本](https://semver.org/lang/zh-TW/)

## 🆘 需要協助？

如有任何問題，請：
1. 查看 GitHub Actions 日誌
2. 參考本文檔的故障排除章節
3. 開啟 GitHub Issue
