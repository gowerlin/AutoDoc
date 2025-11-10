#!/bin/bash

# AutoDoc Agent Desktop - 開發環境測試腳本
# 用於檢查開發環境是否正確配置

set -e

echo "🧪 AutoDoc Agent Desktop - 開發環境測試"
echo "=========================================="
echo ""

# 顏色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 檢查計數
TOTAL=0
PASSED=0
FAILED=0

check() {
    TOTAL=$((TOTAL + 1))
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $1"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}✗${NC} $1"
        FAILED=$((FAILED + 1))
    fi
}

# 1. 檢查 Node.js
echo "📦 檢查 Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓${NC} Node.js: $NODE_VERSION"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗${NC} Node.js 未安裝"
    FAILED=$((FAILED + 1))
fi
TOTAL=$((TOTAL + 1))

# 2. 檢查 npm
echo "📦 檢查 npm..."
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}✓${NC} npm: $NPM_VERSION"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗${NC} npm 未安裝"
    FAILED=$((FAILED + 1))
fi
TOTAL=$((TOTAL + 1))

# 3. 檢查 Rust
echo "🦀 檢查 Rust..."
if command -v rustc &> /dev/null; then
    RUST_VERSION=$(rustc --version)
    echo -e "${GREEN}✓${NC} Rust: $RUST_VERSION"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗${NC} Rust 未安裝"
    echo -e "${YELLOW}   請訪問 https://rustup.rs/ 安裝 Rust${NC}"
    FAILED=$((FAILED + 1))
fi
TOTAL=$((TOTAL + 1))

# 4. 檢查 Cargo
echo "📦 檢查 Cargo..."
if command -v cargo &> /dev/null; then
    CARGO_VERSION=$(cargo --version)
    echo -e "${GREEN}✓${NC} Cargo: $CARGO_VERSION"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}✗${NC} Cargo 未安裝"
    FAILED=$((FAILED + 1))
fi
TOTAL=$((TOTAL + 1))

# 5. 檢查 Tauri CLI
echo "🦀 檢查 Tauri CLI..."
if npm list -g @tauri-apps/cli &> /dev/null || npm list @tauri-apps/cli &> /dev/null; then
    echo -e "${GREEN}✓${NC} Tauri CLI 已安裝"
    PASSED=$((PASSED + 1))
else
    echo -e "${YELLOW}⚠${NC}  Tauri CLI 未安裝（將在 npm install 時安裝）"
    FAILED=$((FAILED + 1))
fi
TOTAL=$((TOTAL + 1))

# 6. 檢查依賴
echo ""
echo "📦 檢查項目依賴..."
if [ -d "node_modules" ]; then
    echo -e "${GREEN}✓${NC} node_modules 存在"
    PASSED=$((PASSED + 1))
else
    echo -e "${YELLOW}⚠${NC}  node_modules 不存在（需要運行 npm install）"
    FAILED=$((FAILED + 1))
fi
TOTAL=$((TOTAL + 1))

# 7. 檢查 Rust 依賴
echo "🦀 檢查 Rust 依賴..."
if [ -d "src-tauri/target" ]; then
    echo -e "${GREEN}✓${NC} Rust 已編譯過"
    PASSED=$((PASSED + 1))
else
    echo -e "${YELLOW}⚠${NC}  Rust 未編譯（第一次運行時會自動編譯）"
fi
TOTAL=$((TOTAL + 1))

# 8. 運行 Rust 測試
echo ""
echo "🧪 運行 Rust 測試..."
if cd src-tauri && cargo test --quiet 2>&1 | grep -q "test result: ok"; then
    echo -e "${GREEN}✓${NC} Rust 測試通過"
    PASSED=$((PASSED + 1))
    cd ..
else
    echo -e "${RED}✗${NC} Rust 測試失敗"
    cd ..
    FAILED=$((FAILED + 1))
fi
TOTAL=$((TOTAL + 1))

# 9. 檢查 TypeScript 編譯
echo "📝 檢查 TypeScript 編譯..."
if npx tsc --noEmit 2>&1 | grep -q "error TS"; then
    echo -e "${RED}✗${NC} TypeScript 編譯錯誤"
    FAILED=$((FAILED + 1))
else
    echo -e "${GREEN}✓${NC} TypeScript 編譯通過"
    PASSED=$((PASSED + 1))
fi
TOTAL=$((TOTAL + 1))

# 10. 檢查圖示文件
echo "🎨 檢查圖示資源..."
if [ -f "src-tauri/icons/icon-source.svg" ]; then
    echo -e "${GREEN}✓${NC} 圖示源文件存在"
    PASSED=$((PASSED + 1))
else
    echo -e "${YELLOW}⚠${NC}  圖示源文件不存在"
    FAILED=$((FAILED + 1))
fi
TOTAL=$((TOTAL + 1))

# 總結
echo ""
echo "=========================================="
echo "測試總結："
echo -e "${GREEN}通過: $PASSED/$TOTAL${NC}"
if [ $FAILED -gt 0 ]; then
    echo -e "${RED}失敗: $FAILED/$TOTAL${NC}"
fi
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ 所有檢查通過！可以開始開發。${NC}"
    echo ""
    echo "下一步："
    echo "  npm run tauri:dev  - 啟動開發服務器"
    echo "  npm test           - 運行測試"
    echo "  npm run tauri:build - 打包應用程式"
    exit 0
else
    echo -e "${YELLOW}⚠️  有 $FAILED 項檢查未通過，請先修復。${NC}"
    echo ""
    echo "修復步驟："
    if ! command -v node &> /dev/null; then
        echo "  1. 安裝 Node.js: https://nodejs.org/"
    fi
    if ! command -v rustc &> /dev/null; then
        echo "  2. 安裝 Rust: https://rustup.rs/"
    fi
    if [ ! -d "node_modules" ]; then
        echo "  3. 運行: npm install"
    fi
    exit 1
fi
