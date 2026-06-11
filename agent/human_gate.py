"""Human review gate (PRD non-negotiable #1).

Nothing ships without this. Autonomy stays at Assist/Recommend in V1: the agent
recommends, the human approves/edits/rejects. Supports an --auto-approve mode
for unattended/CI runs (still records WHO approved, so the guardrail is auditable
and units are never published with review.status == pending).
"""
from __future__ import annotations

from typing import Any

from . import memory


def review_units(
    units: list[dict[str, Any]],
    audits: dict[str, Any],
    *,
    auto_approve: bool = False,
    reviewer: str = "auto-gate",
) -> list[dict[str, Any]]:
    approved: list[dict[str, Any]] = []
    for u in units:
        rep = audits.get(u["id"])
        clean = rep is None or rep.passed
        if auto_approve:
            u["review"] = {
                "status": "approved" if clean else "rejected",
                "reviewer": reviewer,
                "notes": "auto-approved (clean audit)" if clean
                         else f"auto-rejected: {len(rep.flags)} open flag(s)",
            }
            if u["review"]["status"] == "approved":
                approved.append(u)
            continue

        # Interactive review.
        print("\n" + "=" * 70)
        print(f"CONCEPT UNIT: {u['title']}  (id={u['id']})")
        print(f"  explanation: {u['explanation']['text'][:160]}")
        print(f"  analogy    : {u['analogy']['text'][:160]}")
        print(f"  quiz       : {len(u['mini_quiz']['questions'])} questions")
        if rep and rep.flags:
            print(f"  ⚠ {len(rep.flags)} flag(s) need attention:")
            for fl in rep.flags:
                print(f"     - [{fl['criterion']}] {fl['reason']}")
        else:
            print("  ✓ audit clean")
        choice = input("  [a]pprove / [r]eject / [n]ote+approve ? ").strip().lower()
        if choice.startswith("n"):
            note = input("  reviewer note (fed back to memory): ").strip()
            if note:
                memory.record_correction(note)
            u["review"] = {"status": "approved", "reviewer": reviewer, "notes": note}
            approved.append(u)
        elif choice.startswith("a"):
            u["review"] = {"status": "approved", "reviewer": reviewer, "notes": None}
            approved.append(u)
        else:
            u["review"] = {"status": "rejected", "reviewer": reviewer,
                           "notes": "rejected at human gate"}
    return approved
