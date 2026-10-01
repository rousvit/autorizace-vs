"""Vývojový server pro docs/ bez cache prohlížeče.  python tools/devserver.py [port]"""
import functools
import http.server
import pathlib
import sys

DOCS = pathlib.Path(__file__).resolve().parent.parent / "docs"


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".webmanifest": "application/manifest+json", ".js": "text/javascript"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Handler, directory=str(DOCS)))
    print(f"http://127.0.0.1:{port}/", flush=True)
    server.serve_forever()
