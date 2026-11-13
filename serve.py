#!/usr/bin/env python3
"""Local preview server: python3 serve.py [port]

Like `python3 -m http.server`, but it answers Range requests, which browsers
need in order to seek within the video. (GitHub Pages and other hosts do this
already; this is only for previewing on your own machine.)
"""
import os
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class Handler(SimpleHTTPRequestHandler):
    def send_head(self):
        self.span = None
        match = re.match(r"bytes=(\d*)-(\d*)$", self.headers.get("Range", ""))
        path = self.translate_path(self.path)
        if not match or not os.path.isfile(path):
            return super().send_head()
        size = os.path.getsize(path)
        first, last = match.groups()
        if first == "":                       # "-500": the last 500 bytes
            start, end = max(0, size - int(last or 0)), size - 1
        else:
            start, end = int(first), min(int(last), size - 1) if last else size - 1
        if start > end or start >= size:
            self.send_error(416, "Requested range not satisfiable")
            return None
        self.span = end - start + 1
        f = open(path, "rb")
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(self.span))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        return f

    def copyfile(self, source, outputfile):
        if self.span is None:
            return super().copyfile(source, outputfile)
        left = self.span
        while left > 0:
            chunk = source.read(min(65536, left))
            if not chunk:
                break
            outputfile.write(chunk)
            left -= len(chunk)

    def end_headers(self):
        if getattr(self, "span", None) is None:
            self.send_header("Accept-Ranges", "bytes")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    print(f"http://localhost:{port}")
    ThreadingHTTPServer(("", port), Handler).serve_forever()
