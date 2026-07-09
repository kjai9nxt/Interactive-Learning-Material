"""Token → cost pricing for the usage/cost visibility feature.

The pipeline already accumulates token/image usage per run (see `llm.py` +
`runs/usage.jsonl`). This module turns those raw counts into money so the app can
show "how much this run cost" and "how much N more units would cost".

Rates are USD per 1,000,000 tokens (OpenRouter list prices). Image models are
priced per generated image (a flat rate) — image-token accounting differs by
provider, and ~$0.04/image matches the observed gemini-2.5-flash-image spend
noted in CLAUDE.md. Prices drift, so the active generator's rates and the
per-image price are overridable via env without touching code.
"""
from __future__ import annotations

import os

from . import config

# USD per 1M tokens, keyed by OpenRouter model id: (input/prompt, output/completion).
_TEXT_PRICES: dict[str, tuple[float, float]] = {
    "anthropic/claude-haiku-4.5": (1.00, 5.00),
    "anthropic/claude-sonnet-4.5": (3.00, 15.00),
    "anthropic/claude-3.5-sonnet": (3.00, 15.00),
    "anthropic/claude-3-haiku": (0.25, 1.25),
    "openai/gpt-4o": (2.50, 10.00),
    "openai/gpt-4o-mini": (0.15, 0.60),
}
# Fallback when a model isn't in the table (keeps cost non-zero rather than lying).
_DEFAULT_TEXT = (1.00, 5.00)

# USD per generated image, keyed by image model id.
_IMAGE_PRICES: dict[str, float] = {
    "google/gemini-2.5-flash-image": 0.04,
}
_DEFAULT_IMAGE = 0.04


def _env_float(name: str) -> float | None:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def text_rate(model: str) -> tuple[float, float]:
    """(input, output) USD per 1M tokens for a chat model.

    Env overrides `ILM_GEN_INPUT_PRICE` / `ILM_GEN_OUTPUT_PRICE` apply to the
    configured generator model so prices can be corrected without a code change.
    """
    base = _TEXT_PRICES.get(model, _DEFAULT_TEXT)
    if model == config.GEN_MODEL:
        in_over = _env_float("ILM_GEN_INPUT_PRICE")
        out_over = _env_float("ILM_GEN_OUTPUT_PRICE")
        base = (in_over if in_over is not None else base[0],
                out_over if out_over is not None else base[1])
    return base


def image_rate(model: str) -> float:
    """USD per generated image (env `ILM_IMAGE_PRICE_USD` overrides)."""
    over = _env_float("ILM_IMAGE_PRICE_USD")
    if over is not None:
        return over
    return _IMAGE_PRICES.get(model, _DEFAULT_IMAGE)


def estimate_cost(usage: dict, gen_model: str | None = None,
                  image_model: str | None = None) -> dict:
    """Compute a cost breakdown (USD) from a usage snapshot.

    Prefers the chat-only token counters (`chat_prompt_tokens` /
    `chat_completion_tokens`) so image-call tokens aren't mispriced at chat
    rates; falls back to the aggregate counters for older usage records.
    """
    gen_model = gen_model or config.GEN_MODEL
    image_model = image_model or config.IMAGE_MODEL
    in_rate, out_rate = text_rate(gen_model)
    img_price = image_rate(image_model)

    prompt = usage.get("chat_prompt_tokens", usage.get("prompt_tokens", 0)) or 0
    completion = usage.get("chat_completion_tokens", usage.get("completion_tokens", 0)) or 0
    images = usage.get("image_calls", 0) or 0

    text_cost = (prompt / 1_000_000) * in_rate + (completion / 1_000_000) * out_rate
    image_cost = images * img_price
    total = text_cost + image_cost
    return {
        "currency": "USD",
        "text_cost": round(text_cost, 6),
        "image_cost": round(image_cost, 6),
        "total_cost": round(total, 6),
        "rates": rates_snapshot(gen_model, image_model),
    }


def rates_snapshot(gen_model: str | None = None,
                   image_model: str | None = None) -> dict:
    """The rates currently in effect — for the `/api/pricing` endpoint + UI footnotes."""
    gen_model = gen_model or config.GEN_MODEL
    image_model = image_model or config.IMAGE_MODEL
    in_rate, out_rate = text_rate(gen_model)
    return {
        "currency": "USD",
        "gen_model": gen_model,
        "image_model": image_model,
        "input_per_mtok": in_rate,
        "output_per_mtok": out_rate,
        "image_per_call": image_rate(image_model),
    }
