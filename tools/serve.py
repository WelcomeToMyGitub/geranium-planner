#!/usr/bin/env python3
"""本地预览。

用法：
    python tools/serve.py
然后浏览器打开 http://localhost:8000
"""
import http.server
import os
import socketserver

PORT = 8000
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)


if __name__ == "__main__":
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"serving {ROOT}")
        print(f"http://localhost:{PORT}")
        httpd.serve_forever()
