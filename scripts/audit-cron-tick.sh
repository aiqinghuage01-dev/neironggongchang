#!/usr/bin/env bash
# 24h 全站审计 cron tick (launchd 触发)
# 启动: 2026-04-25 23:31 CST
# 截止: 2026-04-26 23:31 CST (到点自停 + 自卸载)
#
# launchd plist: ~/Library/LaunchAgents/ai.openclaw.neironggongchang-audit-cron.plist
# 触发 prompt: docs/design/audit/CRON_TRIGGER_PROMPT.txt
# 进度文件: docs/design/audit/PROGRESS.md

set -u

PROJECT_DIR="/Users/black.chen/Desktop/neironggongchang"
LOG_DIR="$PROJECT_DIR/docs/design/audit/cron-logs"
PLIST="$HOME/Library/LaunchAgents/ai.openclaw.neironggongchang-audit-cron.plist"
DEADLINE_HUMAN="2026-04-26 23:31:00"
CLAUDE_BIN="/Users/black.chen/.local/bin/claude"

mkdir -p "$LOG_DIR"
TS=$(date +"%Y%m%d-%H%M%S")
LOG_FILE="$LOG_DIR/tick-$TS.log"

# 防并发 (上一个 tick 还在跑就不启动新 tick, 顺延规则)
LOCK_FILE="$LOG_DIR/.tick.lock"
if [ -f "$LOCK_FILE" ]; then
  LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
  if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
    echo "[$TS] 上一个 tick (pid=$LOCK_PID) 还在跑, 跳过本次 (顺延规则)" >> "$LOG_FILE"
    exit 0
  fi
fi
echo $$ > "$LOCK_FILE"
trap "rm -f '$LOCK_FILE'" EXIT

cd "$PROJECT_DIR" || { echo "[$TS] cd failed" >> "$LOG_FILE"; exit 1; }

# 24h 截止判定 (BSD date 语法)
NOW_TS=$(date +%s)
DEADLINE=$(date -j -f "%Y-%m-%d %H:%M:%S" "$DEADLINE_HUMAN" +%s 2>/dev/null || echo 0)
if [ "$DEADLINE" -gt 0 ] && [ "$NOW_TS" -gt "$DEADLINE" ]; then
  echo "[$TS] 24h 已到, 自停 + 卸载 launchd plist" | tee -a "$LOG_FILE"
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "[$TS] launchd unloaded + plist removed" | tee -a "$LOG_FILE"
  exit 0
fi

PROMPT_FILE="docs/design/audit/CRON_TRIGGER_PROMPT.txt"
if [ ! -f "$PROMPT_FILE" ]; then
  echo "[$TS] ERR: $PROMPT_FILE 不存在" | tee -a "$LOG_FILE"
  exit 2
fi

if [ ! -x "$CLAUDE_BIN" ]; then
  echo "[$TS] ERR: claude CLI 不在 $CLAUDE_BIN" | tee -a "$LOG_FILE"
  exit 3
fi

echo "[$TS] tick start (pid=$$)" >> "$LOG_FILE"
"$CLAUDE_BIN" -p \
  --permission-mode bypassPermissions \
  --add-dir "$PROJECT_DIR" \
  "$(cat "$PROMPT_FILE")" \
  >> "$LOG_FILE" 2>&1
EXIT_CODE=$?
echo "[$TS] tick end (exit=$EXIT_CODE)" >> "$LOG_FILE"
