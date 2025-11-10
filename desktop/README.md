# AutoDoc Agent Desktop v2.0

AutoDoc Agent 桌面應用程式 - 使用 Tauri v2 打造的跨平台智能文件生成工具

## ✨ 特性

- 🚀 **輕量級**：打包大小僅 ~15MB
- 🔒 **安全**：使用 Rust 構建，記憶體安全保證
- 🌐 **跨平台**：支援 Windows、macOS、Linux
- ⚙️ **圖形化設定**：無需編輯配置文件
- 🔄 **自動更新**：內建更新機制
- 💾 **系統托盤**：最小化到系統托盤

## 📋 系統需求

### 開發環境

- **Node.js**: >= 18.0.0
- **Rust**: >= 1.70.0
- **npm**: >= 9.0.0

### 平台特定需求

#### Windows
- Windows 10/11 (x64)
- WebView2 Runtime (通常已內建)

#### macOS
- macOS 12+ (Monterey 或更新)
- Xcode Command Line Tools

#### Linux
- Ubuntu 22.04+ / Fedora 38+ 或其他主流發行版
- WebKitGTK 相關依賴

```bash
# Ubuntu/Debian
sudo apt-get install libwebkit2gtk-4.0-dev libappindicator3-dev librsvg2-dev patchelf

# Fedora
sudo dnf install webkit2gtk4.0-devel libappindicator-gtk3-devel librsvg2-devel patchelf
```

## 🚀 快速開始

### 1. 安裝依賴

```bash
cd desktop
npm install
```

### 2. 開發模式

```bash
# 啟動開發服務器（熱重載）
npm run tauri:dev
```

### 3. 打包應用

```bash
# 打包當前平台
npm run tauri:build

# 輸出位置
# desktop/src-tauri/target/release/bundle/
```

## 📁 專案結構

```
desktop/
├── src/                          # React 前端源碼
│   ├── components/               # React 組件
│   │   ├── SettingsTabs/        # 設定頁籤組件
│   │   ├── MainWindow.tsx       # 主視窗
│   │   ├── SettingsWindow.tsx   # 設定視窗
│   │   └── WelcomeWizard.tsx    # 首次啟動精靈
│   ├── App.tsx                  # 主應用組件
│   ├── main.tsx                 # React 入口
│   └── styles.css               # 全局樣式
│
├── src-tauri/                    # Tauri Rust 後端
│   ├── src/
│   │   ├── main.rs              # 主程式入口
│   │   ├── config.rs            # 配置管理
│   │   ├── sidecar.rs           # Backend Sidecar 管理
│   │   ├── tray.rs              # 系統托盤
│   │   └── updater.rs           # 自動更新
│   ├── tauri.conf.json          # Tauri 配置
│   ├── Cargo.toml               # Rust 依賴
│   └── build.rs                 # 編譯腳本
│
├── backend-bundle/               # 打包的 Node.js 後端
├── package.json
├── vite.config.ts
└── README.md
```

## ⚙️ 配置

### Tauri 配置

編輯 `src-tauri/tauri.conf.json` 來修改應用程式配置：

```json
{
  "productName": "AutoDoc Agent",
  "version": "2.0.0",
  "identifier": "com.autodoc.agent",
  ...
}
```

### 應用配置

配置文件自動保存在：

- **Windows**: `%APPDATA%\AutoDoc\config.toml`
- **macOS**: `~/Library/Application Support/AutoDoc/config.toml`
- **Linux**: `~/.config/AutoDoc/config.toml`

## 🔨 開發指南

### 添加新的 Tauri Command

1. 在對應的 Rust 模組中添加函數並標記 `#[tauri::command]`
2. 在 `main.rs` 的 `invoke_handler` 中註冊
3. 在前端使用 `invoke()` 調用

```rust
// src-tauri/src/config.rs
#[tauri::command]
pub fn my_command() -> Result<String, String> {
    Ok("Hello".to_string())
}

// src-tauri/src/main.rs
.invoke_handler(tauri::generate_handler![
    my_command,
    // ... 其他命令
])
```

```typescript
// 前端調用
import { invoke } from "@tauri-apps/api/tauri";

const result = await invoke<string>("my_command");
```

### 添加新的設定頁籤

1. 在 `src/components/SettingsTabs/` 創建新組件
2. 在 `SettingsWindow.tsx` 中導入並添加到 Tabs
3. 更新 `config.rs` 中的配置結構

## 📦 打包與發佈

### 跨平台打包

```bash
# Windows (NSIS 安裝程式)
npm run tauri build -- --target x86_64-pc-windows-msvc --bundles nsis

# macOS (DMG)
npm run tauri build -- --target x86_64-apple-darwin --bundles dmg

# Linux (AppImage)
npm run tauri build -- --target x86_64-unknown-linux-gnu --bundles appimage
```

### 程式碼簽章

請參考 `docs/spec/v2/v2_desktop_packaging.md` 獲取詳細的簽章說明。

## 🐛 除錯

### 查看日誌

- 開發模式：日誌會輸出到終端
- 生產模式：
  - **Windows**: `%APPDATA%\AutoDoc\logs\`
  - **macOS**: `~/Library/Logs/AutoDoc/`
  - **Linux**: `~/.local/share/AutoDoc/logs/`

### 常見問題

**問題：後端未啟動**
- 檢查 Node.js 後端是否已編譯
- 查看日誌確認錯誤訊息

**問題：無法打包**
- 確認已安裝所有依賴
- 檢查 Rust 和 Node.js 版本

## 📚 相關文檔

- [v2 概覽](../docs/spec/v2/v2_desktop_overview.md)
- [Task 12 實作指南](../docs/spec/v2/v2_desktop_task12.md)
- [GUI 設計](../docs/spec/v2/v2_desktop_gui.md)
- [打包策略](../docs/spec/v2/v2_desktop_packaging.md)
- [Tauri 官方文檔](https://tauri.app/v2/)

## 🤝 貢獻

歡迎提交 Issue 和 Pull Request！

## 📄 授權

MIT License

---

**AutoDoc Agent v2.0** - © 2025 AutoDoc Team
