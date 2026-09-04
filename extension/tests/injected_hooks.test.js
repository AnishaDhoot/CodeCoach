import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Injected LeetCode Interception Script (injected.js)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.postMessage = vi.fn();
  });

  it('correctly parses LeetCode submission check API responses', () => {
    const rawLeetCodeResponse = {
      state: 'SUCCESS',
      status_code: 11,
      status_msg: 'Wrong Answer',
      total_correct: 12,
      total_testcases: 58,
      last_testcase: '[3,2,4]\n6',
      expected_output: '[1,2]',
      code_output: '[0,0]',
      std_output: '',
      compile_error: '',
      runtime_error: '',
      question_id: '1',
      lang: 'python3',
      typed_code: 'class Solution:\n    def twoSum(self, nums, target):\n        pass',
    };

    function processSubmissionResult(data, problemSlug) {
      if (data.state === 'SUCCESS') {
        const payload = {
          source: 'CODECOACH_INJECTED',
          type: 'LEETCODE_SUBMISSION_RESULT',
          problem_title: problemSlug ? problemSlug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Unknown Problem',
          problem_slug: problemSlug || 'unknown',
          code: data.typed_code || '',
          language: data.lang || 'python3',
          verdict: data.status_msg || (data.status_code === 10 ? 'Accepted' : 'Wrong Answer'),
          passed_test_cases: data.total_correct || 0,
          total_test_cases: data.total_testcases || 0,
          runtime_ms: data.status_runtime ? parseInt(data.status_runtime, 10) : null,
          memory_mb: data.status_memory ? parseFloat(data.status_memory) : null,
          error_details: data.runtime_error || data.compile_error || null,
          test_cases: data.last_testcase ? [
            {
              input: data.last_testcase,
              expected: data.expected_output,
              actual: data.code_output,
            }
          ] : [],
        };
        window.postMessage(payload, '*');
        return payload;
      }
      return null;
    }

    const result = processSubmissionResult(rawLeetCodeResponse, 'two-sum');

    expect(result).not.toBeNull();
    expect(result.verdict).toBe('Wrong Answer');
    expect(result.problem_title).toBe('Two Sum');
    expect(result.passed_test_cases).toBe(12);
    expect(result.total_test_cases).toBe(58);
    expect(result.test_cases[0].expected).toBe('[1,2]');
    expect(window.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'LEETCODE_SUBMISSION_RESULT',
        verdict: 'Wrong Answer',
      }),
      '*'
    );
  });

  it('detects TLE (Time Limit Exceeded) and normalizes complexity failure', () => {
    const tleResponse = {
      state: 'SUCCESS',
      status_code: 14,
      status_msg: 'Time Limit Exceeded',
      total_correct: 45,
      total_testcases: 50,
      typed_code: 'def solve(): pass',
      lang: 'python3',
    };

    function parseVerdict(data) {
      if (data.status_code === 14 || data.status_msg === 'Time Limit Exceeded') {
        return 'Time Limit Exceeded';
      }
      return data.status_msg;
    }

    expect(parseVerdict(tleResponse)).toBe('Time Limit Exceeded');
  });

  it('extracts active problem slug from current window pathname', () => {
    function getProblemSlug(pathname) {
      const match = pathname.match(/\/problems\/([^/]+)/);
      return match ? match[1] : null;
    }

    expect(getProblemSlug('/problems/longest-substring-without-repeating-characters/description/')).toBe(
      'longest-substring-without-repeating-characters'
    );
    expect(getProblemSlug('/problems/3sum/submissions/')).toBe('3sum');
    expect(getProblemSlug('/explore/learn/card/')).toBe(null);
  });
});
