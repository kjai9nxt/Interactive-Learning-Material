"""Skill 4: mcq-generation (AI).

Input: concept + span. Output: a mini-quiz of 4-5 MCQs. Done-when: one correct
option, plausible misconception-mapped distractors, difficulty mix, aspect
spread. Governed by mini_quiz.json + the Mini Quiz rubric.
"""
from __future__ import annotations

from .. import llm
from ..models import MCQ, MiniQuiz, Concept

SYSTEM = (
    "You write rigorous multiple-choice questions for a learning platform. "
    "Distractors map to real misconceptions; exactly one option is correct."
)

PROMPT = """{memory}

Write a mini-quiz of EXACTLY 4 questions for the concept below.

Hard rules (Mini Quiz rubric):
- Each question has EXACTLY 4 options, all distinct, with EXACTLY ONE correct.
- The keyed answer must be the single unambiguously correct option; no second
  option may also be correct (watch for paraphrase duplicates).
- DISTRACTORS: each of the 3 wrong options is plausible to a half-learner AND
  maps to a stated misconception — never absurd, unrelated, or a give-away.
- GROUNDED: the correct answer must be supported by the SOURCE SPAN.
- ASPECT SPREAD across the 4 questions: include >=1 recall, >=1 understanding,
  >=1 application (use in a new situation), and >=1 analysis ("why") question.
- DIFFICULTY MIX: at least one "easy" and at least one "hard".
- EXPLANATION: for each question say why the correct option is right AND why
  each distractor is wrong.

CONCEPT: {title}
SUMMARY: {summary}
SOURCE SPAN (the only facts the correct answer may rely on):
\"\"\"{span}\"\"\"

Return JSON:
{{"questions": [
  {{"question": "...", "options": ["A","B","C","D"], "correct_index": 0,
    "explanation": "why right + why each wrong", "difficulty": "easy|medium|hard",
    "aspect": "recall|understanding|application|analysis"}}
]}}
"""


def generate_quiz(concept: Concept, *, memory_block: str = "") -> MiniQuiz:
    data = llm.chat_json(
        [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": PROMPT.format(
                memory=memory_block,
                title=concept.title,
                summary=concept.summary,
                span=concept.source_span,
            )},
        ],
        temperature=0.55,
        max_tokens=2200,
    )
    questions = []
    for q in data.get("questions", []):
        questions.append(MCQ(
            question=q["question"].strip(),
            options=[o.strip() for o in q["options"]][:4],
            correct_index=int(q["correct_index"]),
            explanation=q.get("explanation", "").strip(),
            difficulty=q.get("difficulty", "medium"),
            aspect=q.get("aspect", "understanding"),
        ))
    return MiniQuiz(questions=questions[:5])
