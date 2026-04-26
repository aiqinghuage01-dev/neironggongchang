#!/usr/bin/env bash
# 全量 e2e 验收脚本 (D-078/D-082 完工后).
# 用法: bash scripts/run_e2e_full.sh
# 串: smoke endpoints + 文案 12 pipeline 真烧 credits 批量 + 关键 page 浏览器截图.
# 期望: 跑一次 5-15min, 报告 ✅/❌ 哪些 pipeline 通.

set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SHOTS_DIR="/tmp/_e2e_shots/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$SHOTS_DIR"
REPORT="$SHOTS_DIR/REPORT.md"

echo "# e2e_full 报告 · $(date)" > "$REPORT"
echo "" >> "$REPORT"
echo "shots dir: $SHOTS_DIR" >> "$REPORT"
echo "" >> "$REPORT"

cd "$ROOT"

echo "=== Phase 1: backend smoke (11 endpoints) ==="
echo "## Phase 1 · backend smoke" >> "$REPORT"
if bash scripts/smoke_endpoints.sh 2>&1 | tee /tmp/_e2e_smoke.log; then
  echo "smoke: ✅" | tee -a "$REPORT"
else
  echo "smoke: ❌ (有 endpoint 不通)" | tee -a "$REPORT"
fi
tail -20 /tmp/_e2e_smoke.log >> "$REPORT"
echo "" >> "$REPORT"

echo ""
echo "=== Phase 2: 文案 LLM 真烧 credits 批量 (D-082d) ==="
echo "## Phase 2 · 文案 LLM 真烧 credits 批量 (D-082d)" >> "$REPORT"
python3 /tmp/_d082d_batch.py 2>&1 | tee /tmp/_e2e_d082d.log
tail -30 /tmp/_e2e_d082d.log >> "$REPORT"
echo "" >> "$REPORT"

echo ""
echo "=== Phase 3: 关键 page 浏览器截图巡检 ==="
echo "## Phase 3 · 关键 page 浏览器截图" >> "$REPORT"
node "$ROOT/scripts/e2e_pages_smoke.js" "$SHOTS_DIR" 2>&1 | tee /tmp/_e2e_pages.log
tail -30 /tmp/_e2e_pages.log >> "$REPORT"
echo "" >> "$REPORT"

echo ""
echo "=== Phase 4: pytest 完整套件 ==="
echo "## Phase 4 · pytest 完整套件" >> "$REPORT"
python3 -m pytest --tb=no -q 2>&1 | tail -5 | tee -a "$REPORT"

echo ""
echo "=== 报告: $REPORT ==="
echo ""
cat "$REPORT" | tail -40
