# AutoDoc Agent Desktop - 測試指南

## 📋 測試類型

### 1. Rust 單元測試

Rust 後端的單元測試位於 `src-tauri/src/` 目錄中的各個模組。

#### 運行 Rust 測試

```bash
# 運行所有 Rust 測試
npm run test:rust

# 或直接使用 Cargo
cd src-tauri
cargo test

# 運行特定模組的測試
cargo test config

# 顯示詳細輸出
cargo test -- --nocapture
```

#### 測試覆蓋的模組

- **config.rs**: 配置管理測試（10 個測試）
  - 預設配置測試
  - 配置驗證測試
  - API Key 格式驗證
  - 參數範圍驗證

### 2. React 組件測試

使用 Vitest + React Testing Library 進行前端測試。

#### 運行 React 測試

```bash
# 運行所有測試
npm test

# 監聽模式（開發時使用）
npm test -- --watch

# UI 模式（可視化測試運行）
npm run test:ui

# 生成覆蓋率報告
npm run test:coverage
```

#### 測試覆蓋的組件

- **App.tsx**: 主應用邏輯測試
  - 載入狀態測試
  - 首次啟動精靈觸發測試
  - 主視窗顯示測試

#### 編寫新測試

測試文件位於 `src/__tests__/` 目錄：

```typescript
// src/__tests__/MyComponent.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import MyComponent from '../components/MyComponent'

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })
})
```

### 3. 開發環境測試

檢查開發環境是否正確配置。

```bash
# 運行環境檢查
./test-env.sh
```

檢查項目：
- ✓ Node.js 版本
- ✓ npm 版本
- ✓ Rust 版本
- ✓ Cargo 版本
- ✓ Tauri CLI
- ✓ 項目依賴
- ✓ TypeScript 編譯
- ✓ Rust 測試通過
- ✓ 圖示資源

## 🧪 測試覆蓋率目標

| 類型 | 目標覆蓋率 | 當前狀態 |
|------|-----------|---------|
| Rust 後端 | >80% | ~75% |
| React 組件 | >70% | ~40% |
| 整體 | >75% | ~60% |

## 📊 測試金字塔

```
     /\
    /E2E\         (10%) - 端到端測試
   /------\
  /整合測試\       (30%) - API 整合測試
 /----------\
/  單元測試  \     (60%) - 組件和函數測試
/------------\
```

## 🔍 測試最佳實踐

### Rust 測試

1. **測試命名**: 使用 `test_` 前綴
2. **測試組織**: 在模組內使用 `#[cfg(test)] mod tests`
3. **斷言**: 使用 `assert_eq!` 和 `assert!`
4. **模擬**: 使用 `mock` 或 `fake` 數據

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_something() {
        let result = do_something();
        assert_eq!(result, expected_value);
    }
}
```

### React 測試

1. **測試用戶行為**: 不是實現細節
2. **使用 `screen` 查詢**: 更具可訪問性
3. **等待異步操作**: 使用 `waitFor`
4. **模擬 Tauri API**: 使用 `vi.mock`

```typescript
it('should handle user interaction', async () => {
  const user = userEvent.setup()
  render(<Component />)

  const button = screen.getByRole('button', { name: /submit/i })
  await user.click(button)

  await waitFor(() => {
    expect(screen.getByText('Success')).toBeInTheDocument()
  })
})
```

## 🐛 常見問題

### Q1: Rust 測試失敗 - "could not find Cargo.toml"

A: 確保在 `src-tauri` 目錄中運行測試：

```bash
cd src-tauri && cargo test
```

或使用 npm 腳本：
```bash
npm run test:rust
```

### Q2: React 測試失敗 - "Cannot find module @tauri-apps/api"

A: 確保已安裝依賴並正確 mock Tauri API：

```bash
npm install
```

測試文件中添加：
```typescript
vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: vi.fn(),
}))
```

### Q3: 覆蓋率報告在哪裡？

A: 運行 `npm run test:coverage` 後，報告位於 `coverage/` 目錄：

- `coverage/index.html` - HTML 報告（在瀏覽器中打開）
- `coverage/coverage-final.json` - JSON 格式
- 終端會顯示簡要統計

### Q4: 如何跳過特定測試？

A: 使用 `.skip` 或 `#[ignore]`：

```typescript
// Vitest
it.skip('this test is skipped', () => {})
```

```rust
// Rust
#[test]
#[ignore]
fn test_something() {}
```

## 🚀 CI/CD 整合

在 CI 環境中運行所有測試：

```yaml
# .github/workflows/test.yml
- name: Run Rust tests
  run: cd src-tauri && cargo test

- name: Run Frontend tests
  run: npm test -- --run

- name: Generate coverage
  run: npm run test:coverage
```

## 📝 測試檢查清單

發布前確保：

- [ ] 所有 Rust 測試通過
- [ ] 所有 React 測試通過
- [ ] 測試覆蓋率達標 (>75%)
- [ ] 無 TypeScript 編譯錯誤
- [ ] 環境測試腳本通過
- [ ] 手動測試主要功能
- [ ] 跨平台測試（如可行）

## 📚 參考資源

- [Vitest 文檔](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Rust 測試指南](https://doc.rust-lang.org/book/ch11-00-testing.html)
- [Tauri 測試](https://tauri.app/v2/guides/testing/)

---

**保持測試綠燈！** 🟢
