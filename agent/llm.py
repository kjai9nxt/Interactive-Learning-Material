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


def chat_json(messages: list[dict[str, str]], *, json_retries: int = 3, **kwargs: Any) -> Any:
    """Call the model in JSON mode and parse the result.

    Tolerates models that wrap JSON in ```json fences. Because JSON-mode output
    is stochastic, a single generation can contain an unescaped quote/newline in
    a verbatim span and fail to parse. We retry a few times (nudging temperature
    up so we don't replay the same bad generation) before giving up, and dump the
    last raw response for diagnosis.
    """
    kwargs.setdefault("json_mode", True)
    base_temp = float(kwargs.get("temperature", 0.4))
    # Hard instruction appended as a final user turn: stops the model from
    # "thinking out loud" before its JSON. That reasoning preamble was what
    # exhausted max_tokens and left the response with no JSON at all. (We can't
    # use assistant-prefill here — OpenRouter routes this model to a provider
    # that rejects it — so we enforce it via the prompt instead.)
    json_only = {
        "role": "user",
        "content": (
            "Respond with ONLY the JSON described above and nothing else. "
            "No explanation, no analysis, no markdown code fences, no text before "
            "or after. Your entire reply must be a single valid JSON value that "
            "starts with { or [."
        ),
    }
    msgs = list(messages) + [json_only]
    last_err: Exception | None = None
    last_raw = ""
    for attempt in range(json_retries):
        if attempt:
            # add variance so a deterministic bad generation isn't reproduced
            kwargs["temperature"] = min(1.0, base_temp + 0.2 * attempt)
        last_raw = chat(msgs, **kwargs)
        try:
            return _parse_json(last_raw)
        except json.JSONDecodeError as e:
            last_err = e
    _dump_failed_json(last_raw, last_err)
    raise LLMError(
        f"Model did not return valid JSON after {json_retries} attempts: {last_err}. "
        f"Raw response saved to {config.RUNS_DIR / 'last_json_parse_fail.txt'}"
    )


def _dump_failed_json(raw: str, err: Exception | None) -> None:
    try:
        path = config.RUNS_DIR / "last_json_parse_fail.txt"
        path.write_text(f"# parse error: {err}\n\n{raw}")
    except Exception:
        pass


def _parse_json(raw: str) -> Any:
    original = raw
    stripped = raw.strip()
    # Strip a *wrapping* ```json fence only — but NOT when the content itself
    # contains fenced code blocks (source spans often embed ```jsx ...```),
    # since a naive split would truncate the JSON at the first inner fence.
    if stripped.startswith("```") and stripped.count("```") == 2:
        inner = stripped.split("```", 2)[1]
        if inner.lstrip().startswith("json"):
            inner = inner.lstrip()[4:]
        stripped = inner.strip().strip("`").strip()
    # Build candidate strings: the (de-fenced) text, then the outermost slice.
    candidates = [stripped]
    start = min((stripped.find("{") if "{" in stripped else len(stripped)),
                (stripped.find("[") if "[" in stripped else len(stripped)))
    end = max(stripped.rfind("}"), stripped.rfind("]"))
    if 0 <= start <= end:
        candidates.append(stripped[start:end + 1])
    last_err: json.JSONDecodeError | None = None
    for cand in candidates:
        try:
            return json.loads(cand)
        except json.JSONDecodeError as e:
            last_err = e
    # Last resort: json-repair handles the common LLM breakages — unescaped
    # quotes copied from verbatim source text, stray control chars, trailing
    # commas, and surrounding markdown fences. Feed it the ORIGINAL response so
    # nothing has been truncated by the fence handling above.
    try:
        from json_repair import repair_json
        return json.loads(repair_json(original))
    except Exception:
        pass
    assert last_err is not None
    raise last_err
