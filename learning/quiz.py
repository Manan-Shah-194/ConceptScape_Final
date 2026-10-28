import json
import logging
from typing import Any, Dict, List, Optional

from llm_provider import LLMProvider


QUIZ_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "questions": {
            "type": "ARRAY",
            "minItems": 5,
            "maxItems": 5,
            "items": {
                "type": "OBJECT",
                "properties": {
                    "id": {"type": "STRING"},
                    "question": {"type": "STRING"},
                    "options": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {"id": {"type": "STRING"}, "text": {"type": "STRING"}}, "required": ["id", "text"]}},
                    "correct_option_id": {"type": "STRING"},
                    "expected_answer": {"type": "STRING"},
                    "explanation": {"type": "STRING"},
                    "key_takeaway": {"type": "STRING"},
                },
                "required": ["id", "question", "options", "correct_option_id", "expected_answer", "explanation", "key_takeaway"],
            },
        }
    },
    "required": ["questions"],
}

EVALUATION_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "correct": {"type": "BOOLEAN"},
        "explanation": {"type": "STRING"},
        "correct_answer": {"type": "STRING"},
        "key_takeaway": {"type": "STRING"},
    },
    "required": ["correct", "explanation", "correct_answer", "key_takeaway"],
}


def _evidence_context(concept: Dict[str, Any], related: List[Dict[str, Any]]) -> str:
    parts = [f"CONCEPT: {concept.get('canonical_name', '')}", f"DEFINITION: {concept.get('definition', '')}"]
    parts.append("VERIFIED EVIDENCE:\n" + "\n".join(f"- {text}" for text in (concept.get("evidence") or [])[:8]))
    if related:
        parts.append("RELATED VERIFIED CONCEPTS:\n" + "\n".join(
            f"- {item.get('canonical_name', '')}: {item.get('definition', '')}" for item in related[:8]
        ))
    return "\n\n".join(parts)


def generate_quiz(concept: Dict[str, Any], related: List[Dict[str, Any]], question_type: str, llm: Optional[LLMProvider] = None) -> Dict[str, Any]:
    evidence = concept.get("evidence") or []
    if not evidence:
        raise ValueError("This concept has no verified evidence for quiz generation")
    type_instruction = {
        "multiple_choice": "Create five distinct multiple-choice questions. Each must have exactly four options and test a different aspect of the concept.",
        "short_answer": "Create five distinct short-answer questions. Set options to an empty array and put the grounded expected answer in expected_answer.",
        "relationship": "Create five distinct relationship questions using only the supplied related concepts and verified relationships. If there is not enough relationship evidence, create questions about explicitly evidenced dependencies or state that the quiz cannot be generated.",
    }[question_type]
    prompt = f"""Create a five-question educational quiz about the selected concept.
QUESTION TYPE: {question_type}
{type_instruction}

Use ONLY the verified evidence below. Do not use outside knowledge. Every question must be answerable from the evidence, and every explanation must teach why the answer is correct. Avoid duplicate questions, generic filler, and unrelated distractors. For multiple choice, incorrect options must be plausible but contradicted or unsupported by the supplied evidence. Return exactly five questions.

{_evidence_context(concept, related)}"""
    system = "You are an evidence-grounded educational assessment generator. Return only valid JSON matching the schema."
    result = (llm or LLMProvider()).call(prompt, system, QUIZ_SCHEMA)
    if result is None:
        raise RuntimeError("Quiz generation failed: both configured model providers were unavailable")
    raw, model_used = result
    try:
        payload = json.loads(raw)
        questions = payload.get("questions") or []
    except Exception as exc:
        logging.error("Could not parse generated quiz: %s", exc)
        raise RuntimeError("Quiz generation returned invalid structured data") from exc
    if len(questions) != 5:
        raise RuntimeError("Quiz generation did not return exactly five questions")
    for index, question in enumerate(questions):
        question["id"] = str(question.get("id") or f"q{index + 1}")
        question["options"] = [
            {"id": str(option.get("id") or str(option_index)), "text": str(option.get("text") or "")}
            for option_index, option in enumerate(question.get("options") or [])
        ]
    return {"questions": questions, "model_used": model_used}


def evaluate_answer(question: Dict[str, Any], answer: str, evidence: str, llm: Optional[LLMProvider] = None) -> Dict[str, Any]:
    prompt = f"""Evaluate a learner's answer to this evidence-grounded question.

QUESTION: {question.get('question', '')}
EXPECTED ANSWER: {question.get('expected_answer', '')}
OPTIONS: {json.dumps(question.get('options', []), ensure_ascii=False)}
LEARNER ANSWER: {answer}
VERIFIED EVIDENCE: {evidence}

Mark correct only when the answer matches the grounded meaning. If wrong, explain the misunderstanding and state the correct answer. Do not add outside knowledge."""
    result = (llm or LLMProvider()).call(prompt, "You are a strict but helpful teacher. Return only valid JSON.", EVALUATION_SCHEMA)
    if result is None:
        expected = str(question.get("correct_option_id") or question.get("expected_answer") or "")
        correct = answer.casefold().strip() == expected.casefold().strip()
        return {"correct": correct, "explanation": question.get("explanation", "Review the cited evidence."), "correct_answer": question.get("expected_answer", expected), "key_takeaway": question.get("key_takeaway", "")}
    raw, _ = result
    try:
        return json.loads(raw)
    except Exception:
        return {"correct": False, "explanation": "The answer could not be evaluated. Review the cited evidence.", "correct_answer": question.get("expected_answer", ""), "key_takeaway": question.get("key_takeaway", "")}
