# AutoDoc Agent - 多平台發布指南

## 📦 支援的平台

AutoDoc Agent 桌面版支援以下三個作業系統平台：

### Windows
- **格式**: `.msi` (Windows Installer) 和 `.exe` (NSIS Installer)
- **架構**: x86_64
- **系統要求**: Windows 10 或更高版本

### macOS
- **格式**: `.dmg` (磁碟映像)
- **架構**:
  - x86_64 (Intel Mac)
  - aarch64 (Apple Silicon M1/M2/M3)
- **系統要求**: macOS 10.15 (Catalina) 或更高版本

### Linux
- **格式**:
  - `.AppImage` (通用可執行檔)
  - `.deb` (Debian/Ubuntu 套件)
- **架構**: x86_64 (amd64)
- **系統要求**: 現代 Linux 發行版 (Ubuntu 20.04+, Debian 11+, Fedora 35+ 等)

## 🚀 如何發布新版本

### 方法 1: 通過 Git Tag 觸發 (推薦)

1. **更新版本號**

   首先更新以下檔案中的版本號：
   ```bash
   # 更新 desktop/package.json
   # "version": "2.0.0" -> "2.1.0"

   # 更新 desktop/src-tauri/tauri.conf.json
   # "version": "2.0.0" -> "2.1.0"

   # 更新 desktop/src-tauri/Cargo.toml
   # version = "2.0.0" -> version = "2.1.0"
   ```

2. **提交變更**
   ```bash
   git add .
   git commit -m "chore: bump version to v2.1.0"
   ```

3. **創建並推送 Tag**
   ```bash
   git tag v2.1.0
   git push origin v2.1.0
   ```

4. **等待構建完成**

   前往 GitHub Actions 頁面查看構建進度：
   - Windows 構建 (~15-20 分鐘)
   - macOS 構建 (x2，每個 ~20-25 分鐘)
   - Linux 構建 (~10-15 分鐘)
   - Backend 打包 (~5 分鐘)
   - Frontend 打包 (~3-5 分鐘)

### 方法 2: 手動觸發

1. 前往 GitHub Actions 頁面
2. 選擇 "Release" workflow
3. 點擊 "Run workflow"
4. 輸入版本號 (例如: `v2.1.0`)
5. 點擊 "Run workflow" 按鈕

## 📋 Release 產出物

每次成功的 release 會產生以下檔案：

### 桌面應用程式
```
autodoc-agent_v2.0.0_x64.msi          # Windows (MSI)
autodoc-agent_v2.0.0_x64-setup.exe    # Windows (NSIS)
autodoc-agent_v2.0.0_x64.dmg          # macOS (Intel)
autodoc-agent_v2.0.0_aarch64.dmg      # macOS (Apple Silicon)
autodoc-agent_v2.0.0_amd64.AppImage   # Linux (AppImage)
autodoc-agent_v2.0.0_amd64.deb        # Linux (Debian/Ubuntu)
```

### 額外組件
```
backend-bundle_v2.0.0.tar.gz          # Backend 獨立打包
frontend-web_v2.0.0.tar.gz            # Frontend Web 版本
```

## 🛠️ 本地構建測試

在推送 release 之前，建議先在本地測試構建：

### Windows (需要 Windows 環境)
```bash
cd desktop
npm install
npm run tauri:build
```

### macOS (需要 macOS 環境)
```bash
cd desktop
npm install

# Intel Mac
npm run tauri:build -- --target x86_64-apple-darwin

# Apple Silicon Mac
npm run tauri:build -- --target aarch64-apple-darwin
```

### Linux (需要 Linux 環境)
```bash
cd desktop

# 安裝系統依賴 (Ubuntu/Debian)
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev \
  build-essential curl wget file \
  libxdo-dev libssl-dev \
  libayatana-appindicator3-dev librsvg2-dev

# 構建
npm install
npm run tauri:build
```

## 🔍 檢查清單

在發布新版本前，請確認：

- [ ] 所有測試通過 (`npm test`)
- [ ] 版本號已在所有相關檔案中更新
- [ ] CHANGELOG.md 已更新
- [ ] 本地構建測試成功
- [ ] 確認沒有未提交的變更
- [ ] 確認 Git tag 格式正確 (v*.*.*)

## 📝 版本號規範

遵循語義化版本控制 (Semantic Versioning):

```
v主版本.次版本.修訂版本

例如: v2.1.0
  2 = 主版本 (重大變更)
  1 = 次版本 (新功能)
  0 = 修訂版本 (錯誤修復)
```

### 何時增加版本號

- **主版本**: 不向後相容的 API 變更
- **次版本**: 向後相容的新功能
- **修訂版本**: 向後相容的錯誤修復

## 🐛 常見問題

### Q: 構建失敗怎麼辦？

1. 檢查 GitHub Actions 日誌
2. 確認所有依賴套件已正確安裝
3. 確認版本號格式正確
4. 檢查是否有語法錯誤或編譯錯誤

### Q: 如何撤銷已發布的版本？

```bash
# 刪除本地 tag
git tag -d v2.1.0

# 刪除遠端 tag
git push origin :refs/tags/v2.1.0

# 在 GitHub 上刪除 Release
# 前往 GitHub Releases 頁面手動刪除
```

### Q: 如何發布預發布版本？

修改版本號為包含預發布標籤：
```
v2.1.0-beta.1
v2.1.0-rc.1
v2.1.0-alpha.1
```

GitHub Release 會自動標記為 "Pre-release"。

## 🔗 相關資源

- [Tauri 官方文檔](https://tauri.app/v1/guides/)
- [GitHub Actions 文檔](https://docs.github.com/en/actions)
- [語義化版本控制](https://semver.org/lang/zh-TW/)
- [發布工作流程](.github/workflows/release.yml)

## 📧 支援

如有問題，請：
1. 查看 GitHub Issues
2. 聯繫開發團隊
3. 查閱專案文檔

---

**最後更新**: 2025-11-10
**維護者**: AutoDoc Team
