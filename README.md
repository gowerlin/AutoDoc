# AutoDoc Agent

## 🎯 專案概述

AutoDoc Agent 是一個智能探索式使用手冊生成器，能夠自動探索網頁應用並生成結構化的使用手冊。

### 版本說明
- **v1.0**: Web 應用版本（需要 Node.js 環境）
- **v2.0**: 桌面應用版本（單一執行檔，跨平台）✨ NEW

---

## 🖥️ v2.0 桌面應用 (NEW)

### 特性
- 🚀 **輕量級**：打包大小僅 ~15MB
- 🔒 **安全**：使用 Rust + Tauri 構建
- 🌐 **跨平台**：支援 Windows、macOS、Linux
- ⚙️ **圖形化設定**：無需編輯配置文件
- 🔄 **自動更新**：內建更新機制
- 💾 **系統托盤**：最小化到系統托盤

### 快速開始

```bash
# 進入桌面應用目錄
cd desktop

# 安裝依賴
npm install

# 開發模式
npm run tauri:dev

# 打包應用
npm run tauri:build
```

### 詳細文檔
- [桌面應用 README](desktop/README.md)
- [v2 實作狀態](desktop/IMPLEMENTATION_STATUS.md)
- [v2 完整規格](docs/spec/v2/)

---

## 📚 v1.0 文檔清單

### 1. BMAD Story Format（完整規格）
**檔案**: `autodoc_agent_bmad_story.md`  
**頁數**: ~90 頁  
**字數**: ~30,000 字

**包含內容**：
- ✅ Story Description（產品願景 + Mermaid 流程圖）
- ✅ **11 個主要 Tasks**（新增 Task 11: 專案存檔與比對）
- ✅ 詳細的 Subtasks（每個 Task 有 3-8 個 Subtasks）
- ✅ 完整的 Testing Requirements（Unit, Integration, E2E, Performance）
- ✅ **13 條 Acceptance Criteria**（新增專案存檔相關標準）
- ✅ Dev Notes（包含 Mermaid 架構圖、狀態機圖、差異檢測流程圖）
- ✅ File List（所有需要建立的檔案）
- ✅ Sprint 計劃（10 週實施時程）

**適合對象**：開發團隊、AI 開發工具（Cursor, Copilot）

---

### 2. Spec-Kit Format（結構化規格）
**檔案**: `autodoc_agent_speckit_v2.md`  
**頁數**: ~50 頁  
**字數**: ~18,000 字

**包含內容**：
- ✅ Constitution（治理原則、核心價值）
- ✅ **7 個核心功能規格**（新增 Feature 7: 專案存檔與比對）
- ✅ Plan（技術架構、API 設計、資料庫 Schema）
- ✅ Tasks（11 個可執行任務 + Gantt 圖）
- ✅ **Mermaid 圖表**（架構圖、狀態機圖、流程圖、序列圖、甘特圖）

**適合對象**：產品經理、技術架構師、專案管理者

---

## 🆕 版本 2.0 更新內容

### 主要新增功能

#### 1. 專案存檔與版本比對系統 (Task 11)

**核心能力**：
```
探索完成 → 保存快照 → 版本比對 → 策略推薦 → 智能更新
```

**關鍵特性**：
- 💾 **完整快照保存**：DOM 結構、截圖、手冊內容、探索統計
- 🔍 **三層差異檢測**：
  - 結構性差異（DOM 比對）
  - 視覺差異（截圖比對，使用 pixelmatch）
  - 語義差異（功能比對，使用 Claude API）
- 🎯 **智能策略推薦**：
  - >50% 變更 → 建議「生成全新手冊」
  - 20-50% 變更 → 建議「異動補充章節」
  - 10-20% 變更 → 建議「僅更新截圖」
  - <10% 變更 → 建議「手動審核即可」
- 📊 **詳細比對報告**：支援 Markdown, PDF, HTML 格式
- 🏷️ **版本管理**：語義化版本號（Major.Minor.Patch）
- 📦 **匯出/匯入**：支援 JSON, ZIP 格式，跨系統相容

**使用場景**：
```
情境 1: 產品大改版
快照 v1.0.0 vs v2.0.0 → 檢測出 60% 變更 → 推薦「全新手冊」

情境 2: 新增部分功能
快照 v1.0.0 vs v1.1.0 → 檢測出 30% 變更 → 推薦「異動補充」

情境 3: UI 微調
快照 v1.0.0 vs v1.0.1 → 檢測出 5% 變更 → 推薦「更新截圖」
```

---

#### 2. Mermaid 流程圖全面整合

**新增圖表**：

1. **系統工作流程圖**（BMAD Story）
   - 展示完整的使用者旅程：用戶輸入 URL → AI 探索 → 雙向協作 → 生成手冊 → 保存快照 → 版本比對
   - 使用 flowchart 圖表呈現決策分支

2. **雙向協作序列圖**（BMAD Story）
   - 展示 AI ↔ 人類 ↔ Chrome 的互動流程
   - 使用 sequence diagram 呈現時序關係

3. **系統架構圖**（兩份文檔）
   - 展示前端、應用層、基礎設施的完整架構
   - 包含所有模組的依賴關係

4. **協作狀態機圖**（兩份文檔）
   - 5 種狀態的轉換邏輯
   - 包含註解說明每個狀態的用途

5. **差異檢測與更新流程圖**（BMAD Story）
   - 從快照比對到策略執行的完整流程
   - 展示決策樹和分支邏輯

6. **專案存檔流程圖**（Spec-Kit）
   - 詳細的存檔、比對、更新決策流程

7. **Gantt 時程圖**（Spec-Kit）
   - 11 個 Task 的時間規劃
   - 清楚顯示並行任務和依賴關係

**優勢**：
- ✅ 視覺化展示複雜流程
- ✅ 易於理解系統運作邏輯
- ✅ 方便團隊溝通和討論
- ✅ 可直接渲染在 GitHub, Notion 等平台

---

### 更新的功能細節

#### Task 11: 專案存檔與比對系統

**新增檔案**（7 個核心模組）：
```
backend/src/snapshot/
├── snapshot_schema.ts          - 快照資料結構
├── snapshot_storage.ts         - 儲存管理（壓縮、分層）
├── diff_engine.ts              - 差異檢測（三層比對）
├── update_strategy.ts          - 策略決策引擎
├── version_manager.ts          - 版本管理（語義化版本）
├── report_generator.ts         - 比對報告生成
└── import_export.ts            - 匯出/匯入功能

frontend/src/components/
├── ProjectManager.tsx          - 專案管理介面
├── SnapshotList.tsx           - 快照列表視圖
├── VersionComparison.tsx      - 版本比對介面
├── DiffViewer.tsx             - 差異查看器
└── StrategySelector.tsx       - 策略選擇對話框
```

**新增 Subtasks**（8 個）：
1. 設計專案快照資料結構
2. 實作快照儲存管理器（支援壓縮、分層儲存）
3. 開發智能差異檢測引擎（DOM + 視覺 + 語義）
4. 建立差異分類與策略決策器
5. 實作專案版本管理（語義化版本號）
6. 開發比對報告生成器（Markdown/PDF/HTML）
7. 建立專案管理 UI（快照列表、版本比對、策略選擇）
8. 實作快照匯出與匯入

**新增資料庫表格**（2 個）：
```sql
project_snapshots        - 快照資料表
version_comparisons      - 版本比對記錄表
```

**新增 API Endpoints**（8 個）：
```
POST   /api/snapshots                 - 建立新快照
GET    /api/snapshots                 - 列出所有快照
POST   /api/comparisons               - 比對兩個版本
GET    /api/comparisons/:id/report    - 下載比對報告
...
```

---

#### 更新的 Acceptance Criteria

**新增 AC11**：專案存檔與比對
- ✅ 能完整保存探索快照
- ✅ 支援快照列表查看與篩選
- ✅ 三層差異檢測準確率 > 90%
- ✅ 能根據差異推薦更新策略
- ✅ 支援快照匯出與匯入
- ✅ 快照儲存壓縮率 > 70%
- ✅ 版本管理支援語義化版本號

**更新其他 AC**：
- AC12: 性能指標（原 AC11）
- AC13: 可用性（原 AC12）

---

#### 更新的測試需求

**新增 Unit Tests**：
- Snapshot 層測試（快照保存/載入、差異檢測、版本管理）

**新增 Integration Tests**：
- 快照儲存與載入
- 版本比對流程

**新增 E2E Tests**：
- 場景 7：專案存檔與版本比對（完整流程）
- 場景 8：快照匯出與匯入

---

#### 更新的實施計劃

**Sprint 4 更新**（Week 7-8）：
```
原計劃:
- Task 7: Incremental Updates
- Task 8: Multi-Variant Management

新計劃:
- Task 7: Incremental Updates
- Task 11: Snapshot & Comparison ⭐ (新增)
- Task 8: Multi-Variant Management
```

**預估時間調整**：
- 總開發時程：10 週（維持不變）
- Task 11 預估：7 天（Medium-High 複雜度）

---

## 📊 關鍵數據對比

| 項目 | v1.0 | v2.0 (新版) |
|------|------|-------------|
| **主要 Tasks** | 10 個 | **11 個** ⬆️ |
| **Acceptance Criteria** | 12 條 | **13 條** ⬆️ |
| **後端檔案數** | ~35 個 | **~43 個** ⬆️ |
| **前端組件數** | ~6 個 | **~11 個** ⬆️ |
| **資料庫表格** | 5 個 | **7 個** ⬆️ |
| **API Endpoints** | ~20 個 | **~28 個** ⬆️ |
| **Mermaid 圖表** | 0 個 | **7 個** ⬆️ |
| **功能模組** | 6 個 | **7 個** ⬆️ |

---

## 🎯 使用指南

### 對於開發團隊

1. **先讀 Spec-Kit** (`autodoc_agent_speckit_v2.md`)
   - 快速理解系統架構
   - 查看 Mermaid 圖表掌握整體邏輯
   - 了解 7 個核心功能

2. **再讀 BMAD Story** (`autodoc_agent_bmad_story.md`)
   - 獲取詳細的實作指引
   - 查看完整的 Subtasks 和檔案路徑
   - 參考測試需求和驗收標準

3. **重點關注 Task 11**
   - 這是新增的核心功能
   - 包含完整的實作細節
   - 有清晰的資料結構設計

### 對於產品經理

1. **閱讀 Spec-Kit 的 Specify 部分**
   - 了解每個功能的 What, Why, User Stories
   - 查看 Mermaid 流程圖理解互動邏輯

2. **查看 Feature 7: Project Snapshot & Comparison**
   - 這是應對產品迭代的關鍵功能
   - 理解智能更新策略的決策邏輯

3. **參考 Acceptance Criteria**
   - 明確每個功能的驗收標準
   - 用於跨部門溝通和需求確認

### 對於技術架構師

1. **重點查看 Plan 部分**（Spec-Kit）
   - 系統架構圖（Mermaid）
   - 資料庫 Schema
   - API 設計

2. **評估技術決策**
   - 為什麼選擇 Chrome DevTools Protocol
   - 為什麼需要三層差異檢測
   - 儲存優化策略（壓縮、分層儲存）

3. **風險評估**
   - 查看 Risk Assessment 表格
   - 了解緩解措施

---

## 💡 核心改進亮點

### 1. 完整的版本管理能力

**問題**：產品不斷迭代，手冊如何跟上？

**解決方案**：
```
保存每次探索的完整快照
     ↓
智能比對新舊版本差異
     ↓
推薦最佳更新策略
     ↓
生成詳細比對報告
```

### 2. 視覺化流程展示

**問題**：複雜的系統邏輯難以理解？

**解決方案**：
- 7 個 Mermaid 圖表
- 涵蓋流程圖、架構圖、狀態機圖、序列圖、甘特圖
- 一圖勝千言

### 3. 智能決策支援

**問題**：面對變更，該全新生成還是增量更新？

**解決方案**：
```
三層差異檢測（結構 + 視覺 + 語義）
     ↓
計算變更嚴重度
     ↓
AI 推薦最佳策略（附成本和時間預估）
     ↓
人類最終決策
```

---

## 🚀 快速開始

### 1. 設定開發環境

```bash
# 安裝 Node.js 20+
nvm install 20

# 安裝 PostgreSQL 14+
brew install postgresql@14

# 安裝新增的依賴
npm install pixelmatch sharp archiver
```

### 2. 建立專案結構

```bash
mkdir autodoc-agent
cd autodoc-agent

# 按照 File List 建立目錄結構
mkdir -p backend/src/{browser,explorer,collaboration,ai,output,versioning,snapshot,config,auth,error,monitoring}
mkdir -p frontend/src/{components,store}
```

### 3. 開始實作

**建議順序**：
1. Week 1-2: Task 1, Task 2（基礎）
2. Week 3-4: Task 3, Task 4（智能）
3. Week 5-6: Task 5, Task 6（整合）
4. Week 7-8: Task 7, **Task 11** ⭐, Task 8（進階）
5. Week 9-10: Task 9, Task 10, Testing（完善）

**Task 11 實作建議**：
- 從 `snapshot_schema.ts` 開始（定義資料結構）
- 實作 `snapshot_storage.ts`（保存/載入）
- 開發 `diff_engine.ts`（差異檢測）
- 建立 `update_strategy.ts`（決策邏輯）
- 最後實作前端 UI

---

## 📞 聯絡與支援

如有任何問題或需要進一步調整，請隨時提出！

**文檔版本**：2.0  
**更新日期**：2025-11-10  
**生成工具**：SmartSpec (Claude Sonnet 4)

---

## 🎉 總結

AutoDoc Agent v2.0 在原有的 AI 探索與雙向協作基礎上，新增了完整的**專案存檔與版本比對系統**，並使用 **Mermaid 圖表**全面提升了文檔的可讀性。

**核心價值**：
- ✅ 零配置啟動（輸入 URL 即可）
- ✅ 雙向協作學習（AI ↔ 人類）
- ✅ 智能版本管理（三層差異檢測）
- ✅ 策略化更新（全新手冊 vs 異動補充）
- ✅ 視覺化呈現（Mermaid 圖表）

**立即行動**：
1. 閱讀兩份文檔
2. 評估技術可行性
3. 開始 Sprint 1 實作

祝開發順利！🚀
