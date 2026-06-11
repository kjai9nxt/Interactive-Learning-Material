"""The Concept Unit schema — the single most important contract in the project.

PRD build-step #2: "Design the output schema ... everything depends on this."
The rubrics (Explanation / Analogy / Example Scenarios / Mini Quiz /
Concept Partition / Unit-level) all assert against the shapes below, and the
React renderer reads exactly these fields.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


# ── Skill 1: concept extraction ────────────────────────────────────────────
class Concept(BaseModel):
    id: str
    title: str
    summary: str
    source_span: str  # the verbatim slice of the RM this concept maps to

    @field_validator("source_span")
    @classmethod
    def _span_nonblank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("source_span must be non-blank (grounding anchor)")
        return v


# ── Skill 3: explainer (text + visual) + scenarios ─────────────────────────
class Explanation(BaseModel):
    text: str = Field(..., description="2-4 sentences, grounded in source")
    visual_diagram_html: str = Field(..., description="inline SVG/HTML diagram")


class Scenario(BaseModel):
    text: str = Field(..., description="<=3 sentences, a concrete instance")
    # Present only when the concept involves code (rubric: Example Scenarios #6).
    code_playground: Optional[dict] = None  # {"language", "html"/"css"/"code"}


# ── Skill 2: analogy ───────────────────────────────────────────────────────
class Analogy(BaseModel):
    text: str = Field(..., description="<=3 sentences, explicit mapping")
    visual_html: str = Field(..., description="inline SVG/HTML supporting the analogy")
    grounding_check: str = Field(..., description="how the analogy traces to source")


# ── Skill 4: MCQs ──────────────────────────────────────────────────────────
class MCQ(BaseModel):
    question: str
    options: list[str] = Field(..., min_length=4, max_length=4)
    correct_index: int = Field(..., ge=0, le=3)
    explanation: str  # why correct is right AND why each distractor is wrong
    difficulty: Literal["easy", "medium", "hard"]
    aspect: Literal["recall", "understanding", "application", "analysis"]


class MiniQuiz(BaseModel):
    questions: list[MCQ] = Field(..., min_length=4, max_length=5)


# ── Human gate ─────────────────────────────────────────────────────────────
class Review(BaseModel):
    status: Literal["pending", "approved", "rejected"] = "pending"
    reviewer: Optional[str] = None
    notes: Optional[str] = None


# ── The assembled unit ─────────────────────────────────────────────────────
class ConceptUnit(BaseModel):
    id: str
    title: str
    summary: str
    source_span: str
    is_code_concept: bool = False
    explanation: Explanation
    analogy: Analogy
    scenarios: list[Scenario] = Field(..., min_length=1)
    mini_quiz: MiniQuiz
    review: Review = Field(default_factory=Review)

    @field_validator("source_span")
    @classmethod
    def _span_nonblank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("source_span must be non-blank")
        return v
