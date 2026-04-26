#!/usr/bin/env bash
# 巡检主 POST endpoint 接受合理 payload (D-068c).
# 用法: bash scripts/smoke_endpoints.sh
# 前提: backend on :8000, web on :8001 (或只要后端就够).
#
# 不进 pytest (需 live AI proxy + 实际跑会消耗 token), 但触发即抛 task_id 后立即 cancel.
set -uo pipefail
API="${API:-http://127.0.0.1:8000}"
PASS=0; FAIL=0

probe() {
  local label="$1" path="$2" body="$3"
  : > /tmp/_p.body
  : > /tmp/_p.head
  curl -s -D /tmp/_p.head -o /tmp/_p.body -X POST "$API$path" \
    -H "Content-Type: application/json" -d "$body" -m 30
  local code=$(awk 'NR==1{print $2}' /tmp/_p.head)
  local body_preview=$(head -c 150 /tmp/_p.body)
  if [[ "$code" == "200" ]]; then
    echo "✓ [$code] $label"
    PASS=$((PASS+1))
    local tid=$(python3 -c "import json,sys; d=json.loads(open('/tmp/_p.body').read()); print(d.get('task_id',''))" 2>/dev/null)
    [[ -n "$tid" ]] && curl -s -X POST "$API/api/tasks/$tid/cancel" -o /dev/null
  else
    echo "❌ [$code] $label  body: $body_preview"
    FAIL=$((FAIL+1))
  fi
}

probe "touliu.generate n=1"     "/api/touliu/generate"     '{"pitch":"我有 8000 个老板私域","industry":"通用老板","target_action":"点头像进直播间","n":1,"channel":"直播间","run_lint":false}'
probe "hotrewrite.analyze"      "/api/hotrewrite/analyze"  '{"hotspot":"AI 客服集体下岗?一线从业者发声"}'
probe "voicerewrite.analyze"    "/api/voicerewrite/analyze" '{"transcript":"我做实体十年, 今天我跟大家聊聊为什么 AI 客服不能直接上来就替代人工"}'
probe "baokuan.analyze"         "/api/baokuan/analyze"     '{"text":"标题党文案 我做了什么导致销售翻 5 倍"}'
probe "planner.analyze"         "/api/planner/analyze"     '{"brief":"我想做一期短视频内容讲讲实体老板怎么用 AI 提效"}'
probe "compliance.check"        "/api/compliance/check"    '{"text":"我们家美容产品立竿见影瘦 10 斤 100% 有效","industry":"美业"}'
probe "moments.derive n=3"      "/api/moments/derive"      '{"topic":"实体老板的一天","n":3,"use_kb":true,"deep":false}'
probe "topics.generate n=5"     "/api/topics/generate"     '{"seed":"老板用 AI 自动化","n":5,"deep":false}'
probe "image.generate n=1"      "/api/image/generate"      '{"prompt":"一只橘猫坐在阳台","n":1,"size":"1:1"}'

# D-078c smoke (远程任务 watcher 相关 endpoint)
probe_get() {
  local label="$1" path="$2"
  local code=$(curl -s -o /tmp/_p.body -w "%{http_code}" "$API$path" -m 10)
  local body_preview=$(head -c 150 /tmp/_p.body)
  if [[ "$code" == "200" ]]; then
    echo "✓ [$code] $label"; PASS=$((PASS+1))
  else
    echo "❌ [$code] $label  body: $body_preview"; FAIL=$((FAIL+1))
  fi
}
probe_get "remote-jobs.stats"   "/api/remote-jobs/stats"

# dreamina recover (fake submit_id → endpoint 不 crash 即 OK; 真 recover 见 by-task)
recover_code=$(curl -s -o /tmp/_p.body -w "%{http_code}" -X POST "$API/api/dreamina/recover/fake_smoke_sid" -m 30)
if [[ "$recover_code" == "200" ]]; then
  echo "✓ [$recover_code] dreamina.recover (fake sid → endpoint 在)"
  PASS=$((PASS+1))
else
  echo "❌ [$recover_code] dreamina.recover  body: $(head -c 150 /tmp/_p.body)"
  FAIL=$((FAIL+1))
fi

echo "=== TOTAL: ${PASS} pass · ${FAIL} fail ==="
exit $FAIL
