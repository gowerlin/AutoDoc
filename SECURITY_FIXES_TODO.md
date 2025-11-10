# 🔒 安全漏洞修復 TODO 清單

**優先級**: Critical > High > Medium > Low
**目標**: 在生產部署前完成所有 Critical 和 High 級別的修復

---

## ⚠️ CRITICAL - 必須立即修復

### Backend

- [ ] **[CRITICAL]** 移除預設加密密鑰 (`backend/src/auth/credential_manager.ts:118`)
  - 強制要求 `ENCRYPTION_KEY` 環境變量
  - 在缺少密鑰時拋出錯誤，不使用預設值
  - 在 `.env.example` 中添加說明

- [ ] **[CRITICAL]** 修復路徑穿越 - 快照存儲 (`backend/src/snapshot/snapshot_storage.ts:112`)
  - 驗證 `snapshotId` 格式 (只允許字母數字和連字符)
  - 使用 `path.resolve()` 並檢查結果路徑
  - 確保路徑在 `baseDir` 內

- [ ] **[CRITICAL]** 修復路徑穿越 - 憑證導出 (`backend/src/auth/credential_manager.ts:436`)
  - 驗證輸出路徑在允許的目錄內
  - 實施路徑白名單機制

- [ ] **[CRITICAL]** 添加 WebSocket 認證 (`backend/src/server.ts:15`)
  - 實施 JWT 或 session token 驗證
  - 在連接時驗證憑證
  - 拒絕未認證的連接

- [ ] **[CRITICAL]** 修復 CORS 配置 (`backend/src/server.ts:19`)
  - 限制允許的來源到已知的域名
  - 配置具體的方法和 headers
  - 啟用 credentials 選項

### Frontend

- [ ] **[CRITICAL]** 修復 XSS 漏洞 (`frontend/src/components/InteractionPanel.tsx:58`)
  - 安裝 `dompurify` 套件
  - 淨化所有 marked 輸出
  - 配置安全的 HTML 標籤白名單

### Desktop

- [ ] **[CRITICAL]** 實施 OS 憑證管理器 (`desktop/src-tauri/src/config.rs`)
  - 添加 `keyring` crate
  - 實施 `save_api_key()` 和 `get_api_key()`
  - 遷移現有配置中的憑證

- [ ] **[CRITICAL]** 限制文件系統權限 (`desktop/src-tauri/Cargo.toml:18`)
  - 移除 `fs-all` feature
  - 使用 `fs-read-file`, `fs-write-file`, `fs-create-dir`
  - 在 `tauri.conf.json` 中添加路徑白名單

- [ ] **[CRITICAL]** 修復相對路徑命令執行 (`desktop/src-tauri/src/sidecar.rs:30`)
  - 使用 `tauri::api::path::resource_dir()` 獲取絕對路徑
  - 驗證後端文件存在
  - 考慮驗證文件哈希

- [ ] **[CRITICAL]** 禁用全局 Tauri API (`desktop/src-tauri/tauri.conf.json:57`)
  - 設置 `withGlobalTauri: false`
  - 更新所有組件使用顯式導入

- [ ] **[CRITICAL]** 實施路徑驗證 (`desktop/src-tauri/src/config.rs:158`)
  - 創建 `validate_path()` 函數
  - 正規化並檢查所有用戶提供的路徑
  - 確保路徑在應用程式目錄內

---

## 🔴 HIGH - 應盡快修復

### Backend

- [ ] **[HIGH]** 實施速率限制
  - 安裝 `express-rate-limit`
  - 為 REST API 添加速率限制
  - 為 WebSocket 實施訊息速率限制

- [ ] **[HIGH]** 添加輸入驗證中介軟體
  - 使用 Zod schema 驗證所有請求
  - 驗證 WebSocket 訊息格式
  - 添加請求大小限制

- [ ] **[HIGH]** 加強 CDP JavaScript 評估安全性 (`backend/src/browser/cdp_wrapper.ts:204`)
  - 創建允許的表達式白名單
  - 或使用更安全的 CDP 方法
  - 淨化所有用戶提供的選擇器

### Frontend

- [ ] **[HIGH]** 實施表單輸入驗證
  - URL 格式驗證 (`ControlPanel.tsx:68`)
  - 電子郵件格式驗證 (`ControlPanel.tsx:219`)
  - 數字範圍驗證 (`ControlPanel.tsx:86`)

- [ ] **[HIGH]** 添加認證機制
  - 實施用戶登錄/登出
  - 存儲和管理 session token
  - 在 API 調用中包含認證 header

### Desktop

- [ ] **[HIGH]** 實施 IPC 訪問控制
  - 為敏感命令添加權限檢查
  - 驗證命令參數
  - 記錄所有 IPC 調用

- [ ] **[HIGH]** 驗證埠號範圍 (`desktop/src-tauri/src/sidecar.rs`)
  - 限制埠號在 1024-65535 範圍
  - 拒絕特權埠
  - 檢查埠是否已被占用

---

## 🟡 MEDIUM - 安全改進

### Backend

- [ ] **[MEDIUM]** 淨化錯誤訊息 (`backend/src/error/error_handler.ts`)
  - 在生產環境中隱藏錯誤詳情
  - 不洩露系統路徑或內部信息
  - 實施結構化錯誤日誌

- [ ] **[MEDIUM]** 實施敏感數據淨化
  - 在日誌中編輯 API 密鑰
  - 在日誌中編輯密碼
  - 避免記錄完整的請求/響應體

- [ ] **[MEDIUM]** 添加會話管理
  - 實施 session token 生成
  - 添加 token 過期機制
  - 實施 token 刷新邏輯

### Frontend

- [ ] **[MEDIUM]** 加強 CSP 策略
  - 添加 `script-src` 指令
  - 添加 `img-src` 支持 data: URIs
  - 移除 `'unsafe-inline'` (如果可能)

- [ ] **[MEDIUM]** 使用安全的 WebSocket 協議
  - 在生產環境使用 `wss://`
  - 配置環境變量控制協議
  - 驗證 WebSocket 連接來源

- [ ] **[MEDIUM]** 移除或實施路由
  - 移除未使用的 `react-router-dom` 依賴
  - 或實施基於角色的路由保護
  - 添加導航守衛

### Desktop

- [ ] **[MEDIUM]** 配置 DevTools (`desktop/src-tauri/tauri.conf.json`)
  - 在生產構建中禁用 DevTools
  - 僅在開發環境啟用

- [ ] **[MEDIUM]** 加強 CSP (`desktop/src-tauri/tauri.conf.json:43`)
  - 移除 `'unsafe-inline'`
  - 使用 CSS 文件或 nonces
  - 添加 `script-src` 和其他指令

- [ ] **[MEDIUM]** 實施更新簽名驗證 (`desktop/src-tauri/src/updater.rs`)
  - 配置 Tauri updater 簽名
  - 驗證更新包的簽名
  - 在安裝前檢查哈希

---

## 🟢 LOW - 可選改進

### Backend

- [ ] **[LOW]** 添加 API 版本控制
  - 實施 `/api/v1/` 路由前綴
  - 準備未來的版本遷移

- [ ] **[LOW]** 實施審計日誌
  - 記錄所有安全相關事件
  - 記錄認證嘗試
  - 記錄權限變更

- [ ] **[LOW]** 添加 health check 認證
  - 為 health endpoint 添加簡單的認證
  - 或限制訪問來源

### Frontend

- [ ] **[LOW]** 替換 `alert()` 和 `confirm()`
  - 使用 Ant Design Modal 組件
  - 提供更好的用戶體驗
  - 避免阻塞 UI

- [ ] **[LOW]** 實施錯誤邊界
  - 添加 React Error Boundary
  - 優雅地處理運行時錯誤
  - 記錄錯誤到監控系統

### Desktop

- [ ] **[LOW]** 改進關閉處理 (`desktop/src-tauri/src/tray.rs:68`)
  - 實施優雅關閉序列
  - 保存應用程式狀態
  - 正確清理後端進程

- [ ] **[LOW]** 添加文件權限設置
  - 為創建的目錄設置限制性權限 (0700)
  - 確保敏感文件不可被其他用戶讀取

---

## 🧪 測試要求

### 安全測試

- [ ] 運行 `npm audit` 確保無依賴漏洞
- [ ] 運行 `cargo audit` 檢查 Rust 依賴
- [ ] 使用 Snyk 掃描所有項目
- [ ] 使用 Semgrep 進行 SAST 掃描
- [ ] 手動測試路徑穿越攻擊
- [ ] 手動測試 XSS 注入
- [ ] 測試 WebSocket 未授權訪問
- [ ] 測試速率限制有效性

### 功能測試

- [ ] 驗證所有修復後功能正常
- [ ] 測試加密憑證的讀寫
- [ ] 測試 OS 憑證管理器整合
- [ ] 測試文件路徑驗證不影響正常使用
- [ ] 測試 Tauri 權限限制不破壞功能
- [ ] 測試輸入驗證錯誤訊息友好

---

## 📝 文檔更新

- [ ] 更新 README.md 包含安全最佳實踐
- [ ] 創建 `.env.example` 包含所有必需的環境變量
- [ ] 文檔化認證流程
- [ ] 添加安全配置指南
- [ ] 創建部署檢查清單
- [ ] 更新 CONTRIBUTING.md 包含安全指南

---

## 🎯 完成標準

在標記任務完成前，確保：

1. ✅ 代碼已實施並測試
2. ✅ 相關的單元測試已更新/添加
3. ✅ 安全掃描通過
4. ✅ 手動安全測試通過
5. ✅ 代碼已經過審查
6. ✅ 文檔已更新
7. ✅ 功能沒有倒退

---

## 📊 進度追蹤

**當前狀態**: 🔴 Not Started

- Critical: 0/11 完成 (0%)
- High: 0/6 完成 (0%)
- Medium: 0/12 完成 (0%)
- Low: 0/7 完成 (0%)

**總進度**: 0/36 (0%)

**預估完成時間**: 2-3 週

---

**開始日期**: 2025-11-10
**目標完成日期**: 2025-12-01
**責任人**: 待分配

**注意**: 建議在完成所有 Critical 和 High 級別修復前，**不要在生產環境部署此應用程式**。
