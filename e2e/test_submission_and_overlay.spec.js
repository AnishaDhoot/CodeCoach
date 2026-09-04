import { test, expect } from '@playwright/test';

test.describe('CodeCoach LeetCode E2E Integration Suite', () => {
  test('injects shadow DOM overlay on LeetCode problem description page', async ({ page }) => {
    // Navigate to problem page
    await page.goto('https://leetcode.com/problems/two-sum/');

    // Verify shadow DOM root injection
    const overlayHost = page.locator('#codecoach-overlay-root');
    await expect(overlayHost).toBeAttached({ timeout: 10000 });
  });

  test('displays diagnostic card when a submission returns Wrong Answer', async ({ page }) => {
    await page.goto('https://leetcode.com/problems/two-sum/');

    // Dispatch simulated LeetCode submission event
    await page.evaluate(() => {
      window.postMessage({
        source: 'CODECOACH_INJECTED',
        type: 'LEETCODE_SUBMISSION_RESULT',
        problem_title: 'Two Sum',
        problem_slug: 'two-sum',
        code: 'class Solution { public int[] twoSum(int[] nums, int target) { return new int[]{}; } }',
        language: 'java',
        verdict: 'Wrong Answer',
        passed_test_cases: 0,
        total_test_cases: 58,
        test_cases: [{ input: '[2,7,11,15]\n9', expected: '[0,1]', actual: '[]' }]
      }, '*');
    });

    // Verify overlay captures and displays diagnosis badge
    const diagnosisCard = page.locator('[data-testid="diagnostic-card"]');
    await expect(diagnosisCard).toBeVisible({ timeout: 10000 });
  });


});
