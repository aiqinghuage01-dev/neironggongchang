#!/usr/bin/env bash
# 停掉所有内容工厂服务
for p in 8000 8001 8766; do
  pid=$(lsof -ti:$p 2>/dev/null || true)
  if [ -n "$pid" ]; then
    echo "  停 :$p (pid=$pid)"
    kill $pid 2>/dev/null || true
  fi
done
echo "✓ 全部停止"
