#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Ntarstudio（星玖工作室）
#
# 每次自动开发运行前执行：把仓库完整备份到外置卷。
#
# 产物两种，互为补充：
#   1. git bundle —— 含全部提交历史，可 git clone 恢复
#   2. 工作树快照 —— 含未提交改动，排除 node_modules / dist / .git
#
# 卷未挂载时不阻塞开发，只告警并返回 0；备份失败返回非 0 由调用方决定是否继续。

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VOLUME="/Volumes/Expand"
DEST="$VOLUME/Backups/nt-dpet"
TS="$(date +%Y%m%d-%H%M%S)"
COMMIT="$(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || echo unknown)"
BRANCH="$(git -C "$REPO" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"

if [ ! -d "$VOLUME" ]; then
  echo "[backup] 警告：$VOLUME 未挂载，本次跳过备份（不阻塞开发）" >&2
  exit 0
fi

mkdir -p "$DEST"

BUNDLE="$DEST/nt-dpet-$TS.bundle"
SNAPSHOT="$DEST/nt-dpet-$TS-worktree.tar.gz"

# 1) 完整历史
git -C "$REPO" bundle create "$BUNDLE" --all >/dev/null
git -C "$REPO" bundle verify "$BUNDLE" >/dev/null

# 2) 工作树（含未提交改动），排除体积大且可重建的目录
tar -czf "$SNAPSHOT" -C "$REPO" \
  --exclude='node_modules' --exclude='*/node_modules' \
  --exclude='dist' --exclude='*/dist' \
  --exclude='.git' --exclude='runtime' \
  --exclude='.DS_Store' --exclude='._*' \
  . 2>/dev/null

# 3) 清单，便于日后人工核对
{
  echo "time: $TS"
  echo "repo: $REPO"
  echo "branch: $BRANCH"
  echo "commit: $COMMIT"
  echo "files: $(git -C "$REPO" ls-files | wc -l | tr -d ' ')"
  echo "bundle: $(basename "$BUNDLE")"
  echo "snapshot: $(basename "$SNAPSHOT")"
} > "$DEST/manifest-$TS.txt"

COUNT="$(ls -1 "$DEST"/*.bundle 2>/dev/null | wc -l | tr -d ' ')"
SIZE="$(du -sh "$DEST" 2>/dev/null | cut -f1)"
echo "[backup] 完成：$TS  commit=$COMMIT  历史包=$COUNT 个  目录体积=$SIZE"

# 只报告，不删除：备份一律由人工清理，避免自动删除造成不可逆损失
if [ "$COUNT" -gt 60 ]; then
  echo "[backup] 提示：历史包已达 $COUNT 个，建议人工清理早期备份" >&2
fi
