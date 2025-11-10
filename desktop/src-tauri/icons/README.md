# Application Icons

## 需要的圖示格式

Tauri 需要以下格式的圖示：

### 必需文件
- `icon.png` - 主圖示 (1024x1024)
- `32x32.png` - Windows 小圖示
- `128x128.png` - macOS 圖示
- `128x128@2x.png` - macOS Retina 圖示
- `icon.ico` - Windows 圖示檔案
- `icon.icns` - macOS 圖示檔案

## 生成圖示

### 方法 1: 使用 Tauri Icon 工具

```bash
# 安裝 @tauri-apps/cli
npm install -g @tauri-apps/cli

# 從單一 PNG 生成所有格式（需要 1024x1024 或更大的 PNG）
tauri icon path/to/icon.png
```

### 方法 2: 使用線上工具

1. **Icon Kitchen**: https://icon.kitchen/
   - 上傳 1024x1024 PNG
   - 下載所有平台的圖示

2. **CloudConvert**: https://cloudconvert.com/
   - PNG → ICO (Windows)
   - PNG → ICNS (macOS)

### 方法 3: 使用圖像編輯工具

#### ImageMagick
```bash
# 安裝 ImageMagick
# Ubuntu: sudo apt-get install imagemagick
# macOS: brew install imagemagick
# Windows: choco install imagemagick

# 生成不同尺寸
convert icon.png -resize 32x32 32x32.png
convert icon.png -resize 128x128 128x128.png
convert icon.png -resize 256x256 128x128@2x.png

# 生成 ICO (Windows)
convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico

# 生成 ICNS (macOS) - 需要 iconutil (僅 macOS)
mkdir icon.iconset
sips -z 16 16     icon.png --out icon.iconset/icon_16x16.png
sips -z 32 32     icon.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     icon.png --out icon.iconset/icon_32x32.png
sips -z 64 64     icon.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   icon.png --out icon.iconset/icon_128x128.png
sips -z 256 256   icon.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   icon.png --out icon.iconset/icon_256x256.png
sips -z 512 512   icon.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   icon.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset
rm -rf icon.iconset
```

## 設計建議

### 圖示設計原則
1. **簡潔明確**: 圖示應該在小尺寸下仍然清晰可辨
2. **品牌一致性**: 使用與產品一致的顏色和風格
3. **平台適配**: 考慮不同平台的設計規範
   - macOS: 圓角、漸變、陰影
   - Windows: 扁平、清晰
   - Linux: 簡潔、識別度高

### AutoDoc Agent 建議設計
- 主色調: 藍色 (#1890ff)
- 輔助色: 綠色 (#52c41a)
- 圖示元素:
  - 機器人 🤖 或文檔 📄
  - 可考慮組合使用齒輪 ⚙️ 表示自動化

### 臨時占位符
當前使用 Tauri 預設圖示。正式發佈前請替換為實際設計的圖示。

## 快速生成腳本

```bash
# 使用提供的腳本生成所有格式
./generate-icons.sh path/to/source-icon.png
```

## 檢查清單

- [ ] 設計 1024x1024 主圖示
- [ ] 生成所有必需尺寸
- [ ] 測試不同平台顯示效果
- [ ] 更新 tauri.conf.json 中的圖示路徑
- [ ] 驗證打包後的圖示顯示
