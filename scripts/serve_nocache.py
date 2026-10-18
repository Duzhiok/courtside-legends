#!/usr/bin/env python3
"""Local static server with no-cache headers (dev only)."""
from __future__ import annotations

import functools
import http.server
import os
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def main() -> None:
    os.chdir(ROOT)
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    with socketserver.TCPServer(("", PORT), handler) as httpd:
        print(f"Serving {ROOT} on http://127.0.0.1:{PORT}/ (no-cache)", flush=True)
        httpd.serve_forever()


if __name__ == "__main__":
    main()
