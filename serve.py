"""Static dev server with caching disabled — python http.server sends no
Cache-Control, so browsers heuristically cache JS/CSS and serve mixed stale
versions during development."""
import functools
import http.server


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    http.server.test(
        HandlerClass=functools.partial(NoCacheHandler, directory='E:/claude-math-brawler'),
        port=8080,
    )
