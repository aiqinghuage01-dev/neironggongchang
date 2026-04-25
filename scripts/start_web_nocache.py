#!/usr/bin/env python3
# 静态 web 服务 — 强制 no-cache (避免 JSX 修改后浏览器死活拿老版)
# 用法: python3 scripts/start_web_nocache.py [port]
import http.server
import socketserver
import sys
import os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8001
WEB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web")


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # 减噪: 只 log 错误
        if "200" not in fmt % args and "304" not in fmt % args:
            super().log_message(fmt, *args)


os.chdir(WEB_DIR)
with socketserver.TCPServer(("", PORT), NoCacheHandler) as httpd:
    httpd.allow_reuse_address = True
    print(f"📡 web (no-cache) on http://localhost:{PORT} · serving {WEB_DIR}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n⏹  stopped")
