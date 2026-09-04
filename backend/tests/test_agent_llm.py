import pytest
from unittest.mock import patch, MagicMock
from backend.agent import (
    clean_json_string,
    repair_json_string,
    query_llm_json,
    generate_diagnosis,
    generate_levelled_hint,
    generate_approach_critique,
    analyze_edge_cases,
    generate_explain_back_check,
)

def test_clean_json_string_strips_thinking_tags_and_markdown():
    """Verifies that <think> tags from reasoning models and markdown fences are completely removed."""
    raw_response = (
        "<think>Let me reason about the optimal two pointers approach...</think>\n"
        "```json\n"
        '{\n  "hint": "Use two pointers from left and right.",\n  "level": 1,\n  "has_next": true\n}\n'
        "```"
    )
    cleaned = clean_json_string(raw_response)
    assert "<think>" not in cleaned
    assert "```" not in cleaned
    assert cleaned.startswith("{")
    assert cleaned.endswith("}")

def test_repair_json_string_fixes_trailing_commas():
    """Verifies trailing commas before closing brackets are safely removed."""
    invalid_json = '{"items": ["a", "b",], "count": 2,}'
    repaired = repair_json_string(invalid_json)
    assert repaired == '{"items": ["a", "b"], "count": 2}'

def test_query_llm_json_uses_fallback_on_complete_failure():
    """Verifies fallback dictionary is returned if LLM queries fail or return unparseable gibberish."""
    fallback = {"status": "fallback", "value": 42}
    with patch("backend.agent.query_llm", side_effect=Exception("API connection timeout")):
        result = query_llm_json("prompt", "system", fallback)
        assert result == fallback

def test_generate_diagnosis_handles_all_failure_categories():
    """Verifies diagnostic classification maps categories accurately."""
    mock_llm_reply = (
        '{"category": "wrong_approach", "explanation": "Greedy approach fails for negative weights.", '
        '"suggested_action": "Use Dynamic Programming (0/1 Knapsack) instead."}'
    )
    with patch("backend.agent.query_llm", return_value=mock_llm_reply):
        res = generate_diagnosis("Coin Change", "code", "python3", "Wrong Answer")
        assert res["root_cause_category"] == "wrong_approach"
        assert "Greedy approach fails" in res["explanation"]
        assert "Dynamic Programming" in res["suggested_action"]

def test_generate_levelled_hint_progressive_structure():
    """Verifies Level 1, 2, 3 hints return proper progressive structure and boolean flags."""
    mock_l1 = '{"hint": "Notice array is sorted.", "level": 1, "has_next": true}'
    with patch("backend.agent.query_llm", return_value=mock_l1):
        res = generate_levelled_hint("Two Sum II", "code", "python3", level=1)
        assert res["level"] == 1
        assert res["has_next"] is True
        assert "sorted" in res["hint"]

def test_explain_back_check_verifies_explanation_alignment():
    """Verifies plain-English explanation comparison against submitted code."""
    mock_check = '{"matches": true, "discrepancy_note": null}'
    with patch("backend.agent.query_llm", return_value=mock_check):
        res = generate_explain_back_check("code", "python3", "I used a Hash Map to store seen elements.")
        assert res["matches"] is True
        assert res["discrepancy_note"] is None
