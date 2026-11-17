#!/usr/bin/env python3
"""Serve NCR Restaurant Intelligence locally (Python standard library only).

    python serve.py            # http://127.0.0.1:8010
    python serve.py 8080       # another port

Equivalent to `python -m http.server`, but threaded with a larger connection backlog, which avoids
intermittent "connection refused" errors on Windows when the browser requests many files at once.
Binds to 127.0.0.1 only, so the site is not exposed to other machines. The site makes no external request.
You can also open index.html directly from disk; a server is optional.
"""
import functools
import http.server
import socketserver
import sys
from pathlib import Path


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 128


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8010
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(Path(__file__).resolve().parent))
    with Server(("127.0.0.1", port), handler) as httpd:
        print(f"NCR Restaurant Intelligence: http://127.0.0.1:{port}  (Ctrl+C to stop)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
