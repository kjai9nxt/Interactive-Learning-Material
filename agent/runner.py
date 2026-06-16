"""Local code execution for the interactive playground.

The frontend's CodeRunner posts {language, code} to /api/run; we run it here with
the toolchain installed on this machine and return stdout/stderr. This is a
single-user LOCAL dev tool (same machine that runs the agent), so we shell out
directly — but with a wall-clock timeout, an output cap, and an isolated temp dir.

Python always works (this server IS Python). Other languages work only if their
compiler/interpreter is on PATH; otherwise we return a clear "not installed" note.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile

TIMEOUT_SEC = 10
MAX_OUTPUT = 20_000  # chars; trim runaway prints

# language → {file, compile?, run, needs?}
# {src} = source path, {dir} = work dir, {exe} = compiled binary path.
_LANGS: dict[str, dict] = {
    "python": {"file": "main.py", "run": [sys.executable, "{src}"]},
    "java": {"file": "Main.java", "needs": "javac",
             "compile": ["javac", "{src}"], "run": ["java", "-cp", "{dir}", "Main"]},
    "c": {"file": "main.c", "needs": "gcc",
          "compile": ["gcc", "{src}", "-o", "{exe}"], "run": ["{exe}"]},
    "cpp": {"file": "main.cpp", "needs": "g++",
            "compile": ["g++", "{src}", "-o", "{exe}"], "run": ["{exe}"]},
    "go": {"file": "main.go", "needs": "go", "run": ["go", "run", "{src}"]},
    "rust": {"file": "main.rs", "needs": "rustc",
             "compile": ["rustc", "{src}", "-o", "{exe}"], "run": ["{exe}"]},
    "javascript": {"file": "main.js", "needs": "node", "run": ["node", "{src}"]},
    "ruby": {"file": "main.rb", "needs": "ruby", "run": ["ruby", "{src}"]},
    "php": {"file": "main.php", "needs": "php", "run": ["php", "{src}"]},
    "bash": {"file": "main.sh", "needs": "bash", "run": ["bash", "{src}"]},
}

# common aliases → canonical key
_ALIASES = {
    "py": "python", "python3": "python", "py3": "python",
    "c++": "cpp", "cc": "cpp",
    "golang": "go", "rs": "rust", "rb": "ruby",
    "js": "javascript", "node": "javascript",
    "sh": "bash", "shell": "bash",
}


def supported_languages() -> list[str]:
    return sorted(set(_LANGS) | set(_ALIASES))


def installed_languages() -> list[str]:
    """Canonical languages whose toolchain is actually present on this machine.

    The playground dropdown uses this so it never offers a language that can't
    run here (e.g. Java when the JDK isn't installed)."""
    out = []
    for lang, spec in _LANGS.items():
        tool = spec.get("needs")
        if not tool or shutil.which(tool):
            out.append(lang)
    return sorted(out)


def _trim(s: str) -> str:
    if len(s) > MAX_OUTPUT:
        return s[:MAX_OUTPUT] + "\n…(output truncated)"
    return s


def run_code(language: str, code: str) -> dict:
    """Execute code and return {stdout, stderr, exit_code, error}."""
    lang = (language or "").strip().lower()
    lang = _ALIASES.get(lang, lang)
    spec = _LANGS.get(lang)
    if not spec:
        return {"stdout": "", "stderr": "",
                "error": f"Language '{language}' is not runnable here. "
                         f"Supported: {', '.join(sorted(_LANGS))}."}
    tool = spec.get("needs")
    if tool and not shutil.which(tool):
        return {"stdout": "", "stderr": "",
                "error": f"'{tool}' is not installed on this machine, so {lang} "
                         f"code can't run. Install it to enable this playground."}

    workdir = tempfile.mkdtemp(prefix="ilm_run_")
    src = os.path.join(workdir, spec["file"])
    exe = os.path.join(workdir, "prog")
    try:
        with open(src, "w") as f:
            f.write(code)

        def _fmt(cmd):
            return [c.format(src=src, dir=workdir, exe=exe) for c in cmd]

        # Compile step (if any) — surface compile errors clearly.
        if "compile" in spec:
            comp = subprocess.run(_fmt(spec["compile"]), capture_output=True,
                                  text=True, timeout=TIMEOUT_SEC, cwd=workdir)
            if comp.returncode != 0:
                return {"stdout": "", "stderr": _trim(comp.stderr or comp.stdout),
                        "exit_code": comp.returncode, "error": "Compilation failed"}

        proc = subprocess.run(_fmt(spec["run"]), capture_output=True, text=True,
                              timeout=TIMEOUT_SEC, cwd=workdir)
        return {"stdout": _trim(proc.stdout), "stderr": _trim(proc.stderr),
                "exit_code": proc.returncode, "error": None}
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "",
                "error": f"Execution timed out after {TIMEOUT_SEC}s."}
    except Exception as e:  # pragma: no cover
        return {"stdout": "", "stderr": "", "error": f"Runner error: {e}"}
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
