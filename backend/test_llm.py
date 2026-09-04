from backend.agent import generate_diagnosis
import json

def test_live_llm_diagnosis():
    print("Testing live LLM diagnosis using local Ollama model...")
    
    # Buggy Two Sum Java solution: j starts at i instead of i + 1,
    # causing it to select the same index twice if nums[i] * 2 == target.
    buggy_code = """
class Solution {
    public int[] twoSum(int[] nums, int target) {
        for (int i = 0; i < nums.length; i++) {
            for (int j = i; j < nums.length; j++) {
                if (nums[i] + nums[j] == target) {
                    return new int[]{i, j};
                }
            }
        }
        return new int[]{};
    }
}
"""
    
    verdict = "Wrong Answer"
    test_cases = [
        {
            "input": "nums = [3,2,4], target = 6",
            "expected": "[1,2]",
            "actual": "[0,0]"
        }
    ]
    
    diagnosis = generate_diagnosis(
        problem_title="Two Sum",
        code=buggy_code,
        language="java",
        verdict=verdict,
        error_details="Failing on duplicate index verification test case.",
        test_cases=test_cases
    )
    
    print("\n--- LLM Response Received ---")
    print(json.dumps(diagnosis, indent=2))
    
    assert diagnosis["root_cause_category"] in ["wrong_approach", "implementation_bug", "edge_case_miss", "complexity_issue", "unclear"]
    print("\nLive LLM diagnostics integration test passed!")


def test_live_llm_progressive_hints():
    from backend.agent import generate_levelled_hint
    print("Testing live LLM progressive hints...")
    buggy_code = """
class Solution {
    public int[] twoSum(int[] nums, int target) {
        for (int i = 0; i < nums.length; i++) {
            for (int j = i; j < nums.length; j++) {
                if (nums[i] + nums[j] == target) {
                    return new int[]{i, j};
                }
            }
        }
        return new int[]{};
    }
}
"""
    for level in [1, 2, 3]:
        hint_res = generate_levelled_hint(
            problem_title="Two Sum",
            code=buggy_code,
            language="java",
            level=level
        )
        print(f"\n--- Level {level} progressive hint ---")
        print(json.dumps(hint_res, indent=2))
        assert hint_res["level"] == level
        assert isinstance(hint_res["hint"], str) and len(hint_res["hint"]) > 0
        if level < 3:
            assert hint_res["has_next"] is True
        else:
            assert hint_res["has_next"] is False
    print("\nLive LLM progressive hints integration test passed!")


if __name__ == "__main__":
    test_live_llm_diagnosis()
    test_live_llm_progressive_hints()
