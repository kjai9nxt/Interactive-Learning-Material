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

Write a mini-quiz of EXACTLY 4 EASY questions for the concept below.

Goal: a student who has just READ THE SOURCE SPAN should be able to answer every
question. Test understanding of what the material actually says — not trivia,
tricks, or outside knowledge.

Hard rules (Mini Quiz rubric):
- EASY & DIRECT: each question checks one simple idea stated in the source span.
  No trick questions, no "all/none of the above", no multi-step reasoning.
- SHORT: the question is ONE clear sentence in plain words. Each option is a short
  phrase (a few words), not a long sentence.
- Each question has EXACTLY 4 options, all distinct, with EXACTLY ONE correct.
- The keyed answer must be the single unambiguously correct option; no second
  option may also be correct (watch for paraphrase duplicates).
- GROUNDED — STRICT: both the question AND its correct answer must come straight
  from the SOURCE SPAN. Do NOT ask about anything the span does not state. If the
  span doesn't cover something, don't ask it.
- DISTRACTORS: each of the 3 wrong options is a plausible everyday slip-up (a
  common beginner mistake), but clearly wrong to someone who read the span — never
  absurd, unrelated, or a give-away.
- DIFFICULTY: keep them mostly "easy" (a couple "medium" at most); never "hard".
- ASPECT: favour recall + understanding; at most one simple "application".
- EXPLANATION: 1-2 SHORT sentences — say plainly why the correct option is right
  (you may add a brief note on the main wrong option). Keep it concise.

CONCEPT: {title}
SUMMARY: {summary}
SOURCE SPAN (the ONLY facts the questions and answers may rely on):
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
        temperature=0.5,
        max_tokens=1500,  # 4 short questions + concise explanations
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
