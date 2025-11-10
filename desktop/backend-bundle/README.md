# Backend Sidecar Binaries

這個目錄包含打包的 Node.js 後端二進制文件，供 Tauri 桌面應用使用。

## 打包流程

### 1. 準備環境

```bash
# 進入後端目錄
cd ../backend

# 安裝依賴
npm install

# 安裝打包工具（如未安裝）
npm install -D pkg
```

### 2. 編譯 TypeScript

```bash
# 編譯 TypeScript 到 JavaScript
npm run build
```

這會將 `src/` 目錄下的 TypeScript 文件編譯到 `dist/` 目錄。

### 3. 打包為二進制文件

```bash
# 打包所有平台
npm run package:all

# 或單獨打包特定平台
npm run package:win        # Windows
npm run package:mac-intel  # macOS Intel
npm run package:mac-arm    # macOS Apple Silicon
npm run package:linux      # Linux
```

### 4. 驗證打包結果

打包完成後，此目錄應包含以下文件：

```
backend-bundle/
├── backend-win.exe          # Windows 64-bit
├── backend-macos-intel      # macOS Intel 64-bit
├── backend-macos-arm        # macOS Apple Silicon (ARM64)
└── backend-linux            # Linux 64-bit
```

### 5. 測試二進制文件

```bash
# Windows
./backend-win.exe --port 3000

# macOS/Linux
chmod +x backend-macos-intel  # 添加執行權限（首次）
./backend-macos-intel --port 3000
```

## Tauri 配置

在 `src-tauri/tauri.conf.json` 中配置 Sidecar：

```json
{
  "bundle": {
    "externalBin": [
      "backend-bundle/backend"
    ]
  }
}
```

Tauri 會自動根據目標平台選擇正確的二進制文件：
- Windows: `backend-win.exe`
- macOS Intel: `backend-macos-intel`
- macOS ARM: `backend-macos-arm`
- Linux: `backend-linux`

## 常見問題

### Q1: 打包後的文件很大？

A: 這是正常的，因為 `pkg` 會將 Node.js 運行時和所有依賴打包進去。
- Windows: ~70-100 MB
- macOS: ~70-100 MB
- Linux: ~70-100 MB

優化建議：
1. 移除不必要的依賴
2. 使用 `pkg` 的 `--compress` 選項
3. 排除不需要的文件

### Q2: 啟動失敗？

A: 檢查以下項目：
1. 確認有執行權限（macOS/Linux）
2. 檢查防火牆設置
3. 查看日誌文件確認錯誤訊息

### Q3: 如何縮小打包體積？

A: 修改 `backend/package.json` 中的 `pkg` 配置：

```json
{
  "pkg": {
    "scripts": "dist/**/*.js",
    "assets": [
      "node_modules/some-module/**/*"  // 只包含必要的模組
    ]
  }
}
```

### Q4: 跨平台打包？

A: `pkg` 支援在任何平台上為所有目標平台打包。不需要在每個平台上分別編譯。

## 自動化打包

### 使用腳本

創建 `build-all.sh`：

```bash
#!/bin/bash
set -e

echo "📦 開始打包 Backend Sidecar..."

cd backend
echo "🔨 編譯 TypeScript..."
npm run build

echo "📦 打包所有平台..."
npm run package:all

echo "✅ 打包完成！"
cd ../desktop/backend-bundle
ls -lh backend-*
```

### CI/CD 集成

在 GitHub Actions 中：

```yaml
- name: Package Backend
  run: |
    cd backend
    npm ci
    npm run build
    npm run package:all

- name: Upload Backend Artifacts
  uses: actions/upload-artifact@v3
  with:
    name: backend-binaries
    path: desktop/backend-bundle/backend-*
```

## 開發模式

在開發時，Tauri 可以直接運行未打包的 Node.js 後端：

```typescript
// sidecar.rs 中的開發模式檢測
#[cfg(debug_assertions)]
let command = "node";
let args = ["../backend/dist/index.js"];

#[cfg(not(debug_assertions))]
let command = "backend";  // 使用打包的二進制
```

## 更新流程

當後端代碼更新時：

1. 修改後端代碼
2. 重新編譯：`npm run build`
3. 重新打包：`npm run package:all`
4. 測試新的二進制文件
5. 提交更新後的二進制文件（或通過 CI 自動構建）

## 清理

```bash
# 清理打包文件
rm -f backend-bundle/backend-*

# 清理編譯文件
cd backend && rm -rf dist
```

---

**注意**：這些二進制文件不應該提交到 Git（已在 .gitignore 中排除）。
它們應該在構建過程中生成，或通過 CI/CD 系統自動構建。
