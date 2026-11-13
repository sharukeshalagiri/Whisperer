"""OpenAI-compatible stub for end-to-end plumbing tests. Returns fixed, clearly labelled text.

Usage: python stub_gateway.py <port>. Logs every request path and model to stdout.
"""

import json
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SUMMARY = "## Summary\n\nSTUB SUMMARY: the meeting discussed the quarterly report.\n\n## Action items\n\n- STUB: send the report by Friday."


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        return

    def _json(self, body, status=200):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.rstrip("/").endswith("/models"):
            return self._json({"object": "list", "data": [{"id": "stub-llm", "object": "model", "owned_by": "e2e"}]})
        return self._json({"error": "not found"}, 404)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        try:
            body = json.loads(raw or b"{}")
        except ValueError:
            body = {}
        print(json.dumps({"path": self.path, "model": body.get("model")}), flush=True)
        if not self.path.rstrip("/").endswith("/chat/completions"):
            return self._json({"error": "not found"}, 404)
        prompt = json.dumps(body.get("messages", [])).lower()
        if "summar" in prompt:
            text = SUMMARY
        elif "question" in prompt or "answer" in prompt:
            text = "STUB ANSWER: the report is due on Friday."
        else:
            text = "STUB TRANSFORM: Please send the quarterly report to Sam by Friday."
        self._json({
            "id": "chatcmpl-stub", "object": "chat.completion", "created": int(time.time()), "model": body.get("model", "stub-llm"),
            "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": text}}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 10, "total_tokens": 20},
        })


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), Handler).serve_forever()
