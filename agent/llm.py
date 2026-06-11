"""Thin OpenRouter chat client.

Deliberately not LangChain (PRD §2): a single function, easy to debug and to
write evals against. Supports JSON-mode responses and bounded retries on
transient errors.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from typing import Any

from . import config


class LLMError(RuntimeError):
    pass


def chat(
    messages: list[dict[str, str]],
    *,
    model: str | None = None,
    temperature: float = 0.4,
    max_tokens: int = 1500,
    json_mode: bool = False,
    retries: int = 3,
) -> str:
    """Call OpenRouter chat-completions and return the assistant text.

    `json_mode=True` asks the provider for a JSON object response.
    """
    if not config.OPENROUTER_API_KEY:
        raise LLMError("OPENROUTER_API_KEY is not set (check your .env).")

    payload: dict[str, Any] = {
        "model": model or config.GEN_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    body = json.dumps(payload).encode()
    headers = {
        "Authorization": f"Bearer {config.OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://localhost/ilm",
        "X-Title": "ILM Agent V1",
    }

    last_err: Exception | None = None
    for attempt in range(retries):
        req = urllib.request.Request(config.OPENROUTER_URL, data=body, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=config.REQUEST_TIMEOUT) as resp:
                data = json.load(resp)
            return data["choices"][0]["message"]["content"]
        except urllib.error.HTTPError as e:
            detail = e.read().decode()[:400]
            last_err = LLMError(f"HTTP {e.code}: {detail}")
            # 4xx other than 429 won't get better by retrying.
            if e.code not in (429, 500, 502, 503, 524) :
                raise last_err
        except Exception as e:  # network / timeout
            last_err = e
        time.sleep(1.5 * (attempt + 1))
    raise LLMError(f"LLM call failed after {retries} attempts: {last_err}")


def chat_json(messages: list[dict[str, str]], **kwargs: Any) -> Any:
    """Call the model in JSON mode and parse the result.

    Tolerates models that wrap JSON in ```json fences.
    """
    kwargs.setdefault("json_mode", True)
    raw = chat(messages, **kwargs)
    return _parse_json(raw)


def _parse_json(raw: str) -> Any:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.lstrip().startswith("json"):
            raw = raw.lstrip()[4:]
    raw = raw.strip().strip("`").strip()
    # Best-effort: slice to the outermost JSON object/array.
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start = min((raw.find("{") if "{" in raw else len(raw)),
                    (raw.find("[") if "[" in raw else len(raw)))
        end = max(raw.rfind("}"), raw.rfind("]"))
        if 0 <= start <= end:
            return json.loads(raw[start:end + 1])
        raise
