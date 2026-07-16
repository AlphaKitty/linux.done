#!/usr/bin/env bash
# 将当前扩展目录导出为「干净可开源」副本（不包含 .git / node_modules）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
VERSION="$(node -p "require('./package.json').version" 2>/dev/null || echo "0.0.0")"
STAMP="$(date +%Y%m%d)"
OUT_PARENT="${1:-$ROOT/../linux.done-oss}"
OUT_DIR="${OUT_PARENT%/}"

if [[ -e "$OUT_DIR" && "$OUT_DIR" != "$ROOT" ]]; then
  echo "目标已存在: $OUT_DIR"
  echo "请换一个空路径，例如: ./scripts/export-clean.sh ../linux.done-oss"
  exit 1
fi

mkdir -p "$OUT_DIR"

rsync -a \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude '.DS_Store' \
  --exclude '*.zip' \
  --exclude '*.crx' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude 'scripts/export-clean.sh' \
  "$ROOT/" "$OUT_DIR/"

# 若脚本目录被排除导致 scripts 不存在，保证目标仍是完整扩展根
echo "已导出干净副本 → $OUT_DIR"
echo "版本: v$VERSION  日期: $STAMP"
echo
echo "下一步:"
echo "  cd \"$OUT_DIR\""
echo "  git init && git add . && git commit -m \"chore: initial open-source release v$VERSION\""
echo "  git branch -M main"
echo "  git remote add origin git@github.com:<your-username>/linux.done.git"
echo "  git push -u origin main"
