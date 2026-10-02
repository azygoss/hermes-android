#!/usr/bin/env python3
"""Tiny OpenAI-compatible streaming server for exercising Hermes without a real model.

Point Hermes at it with:
  model: {provider: custom, default: mock-model, base_url: http://127.0.0.1:8999/v1, api_key: mock}

The reply depends on keywords in the last user message:
  "#danger"  -> terminal tool with a command that needs approval
  "#tool"    -> terminal tool with a harmless command
  "#clarify" -> clarify tool with two questions
  "#todo"    -> todo tool with a small plan
  "#remember" -> memory tool adding a user fact
  "#skill"   -> skill_manage creating a small skill
  anything else -> streamed markdown with reasoning
After a tool result arrives the model streams a short summary.
"""
import json
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 8999


def chunk(delta, finish=None):
    return {
        "id": "chatcmpl-mock",
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": "mock-model",
        "choices": [{"index": 0, "delta": delta, "finish_reason": finish}],
    }


def text_of(message):
    content = message.get("content")
    if isinstance(content, list):
        return " ".join(p.get("text", "") for p in content if isinstance(p, dict))
    return content or ""


def plan(body):
    messages = body.get("messages", [])
    tools = {t["function"]["name"] for t in body.get("tools", []) if "function" in t}
    print("tools:", ",".join(sorted(tools)), flush=True)
    last = messages[-1] if messages else {}
    if last.get("role") == "tool":
        return {"text": "Done. The tool returned:\n\n```\n" + text_of(last)[:400] + "\n```\n\nAnything else?"}
    user = text_of(last).lower()
    if "#danger" in user and "terminal" in tools:
        return {"tool": ("terminal", {"command": "rm -rf /tmp/hermes-mock-dir"})}
    if "#tool" in user and "terminal" in tools:
        return {"tool": ("terminal", {"command": "echo hello from hermes && uname -a"})}
    if "#clarify" in user and "clarify" in tools:
        return {"tool": ("clarify", {"questions": [
            {"question": "Which flavour do you prefer?", "choices": ["Vanilla", "Chocolate"]},
            {"question": "Which toppings?", "choices": ["Nuts", "Sprinkles", "Cherry"], "multi_select": True},
        ]})}
    if "#remember" in user and "memory" in tools:
        return {"tool": ("memory", {"action": "add", "target": "user", "content": "Prefers concise answers and Turkish UI copy."})}
    if "#skill" in user and "skill_manage" in tools:
        return {"tool": ("skill_manage", {"action": "create", "name": "mock-release-notes", "category": "productivity",
                                          "content": "---\nname: mock-release-notes\ndescription: Draft release notes from a git log.\n---\n\n# Release notes\n\n1. Read `git log`.\n2. Group by feature.\n"})}
    if "#todo" in user and "todo_list" in tools:
        return {"tool": ("todo_list", {"todos": [
            {"id": "1", "content": "Read the docs", "status": "completed"},
            {"id": "2", "content": "Build the Android app", "status": "in_progress"},
            {"id": "3", "content": "Ship the APK", "status": "pending"},
        ]})}
    system = " ".join(text_of(m) for m in messages if m.get("role") == "system").lower()
    if not tools and "title" in system:
        return {"text": "Mock conversation about " + (user.split()[0] if user.split() else "nothing")}
    return {
        "reasoning": "The user said something. I will answer with a short markdown sample.",
        "text": (
            "# Hello from the mock model\n\n"
            "This reply is **streamed** token by token so the app can render it live.\n\n"
            "- Lists work\n- `inline code` works\n\n"
            "```python\nprint('hermes')\n```\n\n"
            "| Feature | Status |\n|---|---|\n| Streaming | ok |\n"
        ),
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _json(self, code, obj):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.rstrip("/").endswith("/models"):
            self._json(200, {"object": "list", "data": [{"id": "mock-model", "object": "model", "context_length": 128000}]})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        p = plan(body)
        if not body.get("stream"):
            msg = {"role": "assistant", "content": p.get("text", "")}
            self._json(200, {"id": "x", "object": "chat.completion", "model": "mock-model",
                             "choices": [{"index": 0, "message": msg, "finish_reason": "stop"}],
                             "usage": {"prompt_tokens": 10, "completion_tokens": 10, "total_tokens": 20}})
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()

        def send(obj):
            self.wfile.write(f"data: {json.dumps(obj)}\n\n".encode())
            self.wfile.flush()

        send(chunk({"role": "assistant"}))
        for word in p.get("reasoning", "").split(" ") if p.get("reasoning") else []:
            send(chunk({"reasoning_content": word + " "}))
            time.sleep(0.02)
        if "tool" in p:
            name, args = p["tool"]
            call_id = "call_" + uuid.uuid4().hex[:8]
            send(chunk({"tool_calls": [{"index": 0, "id": call_id, "type": "function",
                                        "function": {"name": name, "arguments": ""}}]}))
            raw = json.dumps(args)
            for i in range(0, len(raw), 12):
                send(chunk({"tool_calls": [{"index": 0, "function": {"arguments": raw[i:i + 12]}}]}))
                time.sleep(0.02)
            send(chunk({}, "tool_calls"))
        else:
            text = p.get("text", "")
            for i in range(0, len(text), 6):
                send(chunk({"content": text[i:i + 6]}))
                time.sleep(0.03)
            send(chunk({}, "stop"))
        usage = {"id": "chatcmpl-mock", "object": "chat.completion.chunk", "model": "mock-model", "choices": [],
                 "usage": {"prompt_tokens": 1200, "completion_tokens": 80, "total_tokens": 1280}}
        send(usage)
        self.wfile.write(b"data: [DONE]\n\n")
        self.wfile.flush()


if __name__ == "__main__":
    print(f"mock LLM on http://127.0.0.1:{PORT}/v1", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
