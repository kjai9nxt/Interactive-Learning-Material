"""ILM — Interactive Learning Material agent (V1).

Plain-Python pipeline that turns one static Markdown reading material into
eval-governed, human-gated interactive Concept Units. No LangChain framework
(PRD lock-in); we only use the LLM via a thin OpenRouter client.
"""

# The pipeline prints Unicode status glyphs (→ ⚠ ✓ ·). On Windows the console
# defaults to a legacy code page (cp1252) whose "charmap" codec can't encode
# them, raising UnicodeEncodeError. Force stdout/stderr to UTF-8 so logging is
# platform-independent. Guarded: reconfigure() exists on 3.7+ TextIOWrapper, but
# streams may be redirected to something without it.
import sys as _sys

for _stream in (_sys.stdout, _sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
