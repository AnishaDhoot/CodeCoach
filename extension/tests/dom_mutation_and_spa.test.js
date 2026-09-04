import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('LeetCode SPA Navigation & DOM Mutation Recovery', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="__next"><div class="layout"></div></div>';
    vi.clearAllMocks();
  });

  it('guarantees idempotent injection of overlay host without duplicate roots', () => {
    function injectOverlayRoot() {
      let host = document.getElementById('codecoach-overlay-root');
      if (!host) {
        host = document.createElement('div');
        host.id = 'codecoach-overlay-root';
        const shadow = host.attachShadow({ mode: 'open' });
        const mountPoint = document.createElement('div');
        mountPoint.id = 'codecoach-mount';
        shadow.appendChild(mountPoint);
        document.body.appendChild(host);
      }
      return host;
    }

    const host1 = injectOverlayRoot();
    const host2 = injectOverlayRoot();

    expect(host1).toBe(host2);
    expect(document.querySelectorAll('#codecoach-overlay-root').length).toBe(1);
    expect(host1.shadowRoot.querySelector('#codecoach-mount')).not.toBeNull();
  });

  it('detects SPA route changes and re-evaluates active problem slug', () => {
    const routeChanges = [];
    function onUrlChange(newUrl) {
      const match = newUrl.match(/\/problems\/([^/]+)/);
      const slug = match ? match[1] : null;
      routeChanges.push({ url: newUrl, slug });
      return slug;
    }

    onUrlChange('https://leetcode.com/problems/two-sum/description/');
    onUrlChange('https://leetcode.com/problems/group-anagrams/submissions/');
    onUrlChange('https://leetcode.com/contest/weekly-contest-400/');

    expect(routeChanges).toHaveLength(3);
    expect(routeChanges[0].slug).toBe('two-sum');
    expect(routeChanges[1].slug).toBe('group-anagrams');
    expect(routeChanges[2].slug).toBeNull();
  });

  it('re-attaches overlay if LeetCode React re-render strips host from DOM', () => {
    // Initial injection
    const host = document.createElement('div');
    host.id = 'codecoach-overlay-root';
    document.body.appendChild(host);
    expect(document.getElementById('codecoach-overlay-root')).not.toBeNull();

    // Simulate destructive LeetCode DOM wipe / re-render
    document.body.innerHTML = '<div id="__next"><div class="new-layout"></div></div>';
    expect(document.getElementById('codecoach-overlay-root')).toBeNull();

    // MutationObserver auto-recovery routine
    function reconcileOverlay() {
      if (!document.getElementById('codecoach-overlay-root')) {
        const newHost = document.createElement('div');
        newHost.id = 'codecoach-overlay-root';
        document.body.appendChild(newHost);
      }
    }

    reconcileOverlay();
    expect(document.getElementById('codecoach-overlay-root')).not.toBeNull();
  });
});
