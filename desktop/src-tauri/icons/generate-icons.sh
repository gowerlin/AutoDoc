#!/bin/bash

# AutoDoc Agent Icon Generation Script
# 使用方法: ./generate-icons.sh <source-icon.png>

set -e

if [ $# -eq 0 ]; then
    echo "錯誤: 請提供源圖示文件路徑"
    echo "使用方法: ./generate-icons.sh <source-icon.png>"
    echo "源圖示建議尺寸: 1024x1024 或更大"
    exit 1
fi

SOURCE_ICON=$1

if [ ! -f "$SOURCE_ICON" ]; then
    echo "錯誤: 文件不存在: $SOURCE_ICON"
    exit 1
fi

echo "🎨 開始生成圖示..."
echo "源文件: $SOURCE_ICON"

# 檢查 ImageMagick
if ! command -v convert &> /dev/null; then
    echo "❌ 錯誤: 未找到 ImageMagick"
    echo "請先安裝 ImageMagick:"
    echo "  Ubuntu/Debian: sudo apt-get install imagemagick"
    echo "  macOS: brew install imagemagick"
    echo "  Windows: choco install imagemagick"
    exit 1
fi

# 設定輸出目錄
OUTPUT_DIR="$(dirname "$0")"
cd "$OUTPUT_DIR"

echo "📁 輸出目錄: $OUTPUT_DIR"

# 生成 PNG 尺寸
echo "🖼️  生成 PNG 圖示..."
convert "$SOURCE_ICON" -resize 32x32 32x32.png
convert "$SOURCE_ICON" -resize 128x128 128x128.png
convert "$SOURCE_ICON" -resize 256x256 "128x128@2x.png"
convert "$SOURCE_ICON" -resize 256x256 256x256.png
convert "$SOURCE_ICON" -resize 512x512 "256x256@2x.png"
convert "$SOURCE_ICON" -resize 512x512 512x512.png
convert "$SOURCE_ICON" -resize 1024x1024 icon.png

echo "✅ PNG 圖示生成完成"

# 生成 ICO (Windows)
echo "🪟 生成 Windows ICO..."
convert "$SOURCE_ICON" -define icon:auto-resize=256,128,64,48,32,16 icon.ico
echo "✅ Windows ICO 生成完成"

# 生成 ICNS (macOS) - 僅在 macOS 上可用
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "🍎 生成 macOS ICNS..."

    mkdir -p icon.iconset

    sips -z 16 16     "$SOURCE_ICON" --out icon.iconset/icon_16x16.png
    sips -z 32 32     "$SOURCE_ICON" --out icon.iconset/icon_16x16@2x.png
    sips -z 32 32     "$SOURCE_ICON" --out icon.iconset/icon_32x32.png
    sips -z 64 64     "$SOURCE_ICON" --out icon.iconset/icon_32x32@2x.png
    sips -z 128 128   "$SOURCE_ICON" --out icon.iconset/icon_128x128.png
    sips -z 256 256   "$SOURCE_ICON" --out icon.iconset/icon_128x128@2x.png
    sips -z 256 256   "$SOURCE_ICON" --out icon.iconset/icon_256x256.png
    sips -z 512 512   "$SOURCE_ICON" --out icon.iconset/icon_256x256@2x.png
    sips -z 512 512   "$SOURCE_ICON" --out icon.iconset/icon_512x512.png
    sips -z 1024 1024 "$SOURCE_ICON" --out icon.iconset/icon_512x512@2x.png

    iconutil -c icns icon.iconset
    rm -rf icon.iconset

    echo "✅ macOS ICNS 生成完成"
else
    echo "⚠️  跳過 macOS ICNS (僅在 macOS 上可用)"
    echo "   在 macOS 上運行此腳本來生成 .icns 文件"
fi

echo ""
echo "🎉 圖示生成完成！"
echo ""
echo "生成的文件:"
ls -lh *.png *.ico *.icns 2>/dev/null || ls -lh *.png *.ico

echo ""
echo "📝 下一步:"
echo "1. 檢查生成的圖示"
echo "2. 確認 tauri.conf.json 中的圖示路徑配置正確"
echo "3. 運行 'npm run tauri build' 測試打包"
