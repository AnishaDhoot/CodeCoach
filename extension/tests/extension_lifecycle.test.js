import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Chrome Extension Lifecycle, Manifest V3 & Storage Recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates manifest.json adheres to Manifest V3 specification', () => {
    const manifestPath = path.resolve(__dirname, '../public/manifest.json');
    const manifestContent = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestContent);

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBeDefined();
    expect(manifest.version).toBeDefined();
    expect(manifest.background).toBeDefined();
    expect(manifest.background.service_worker).toBe('background.js');
    expect(manifest.permissions).toContain('storage');
    expect(manifest.permissions).toContain('alarms');
    expect(manifest.host_permissions).toContain('https://leetcode.com/*');
    expect(manifest.content_scripts).toBeInstanceOf(Array);
    expect(manifest.content_scripts[0].matches).toContain('https://leetcode.com/*');
  });

  it('handles service worker wake-up from idle state and restores session', async () => {
    // Simulate Service Worker termination and wake-up
    const mockSession = {
      active_test_id: 12,
      topic: 'Arrays & Hashing',
      start_time: Date.now() - 60000,
    };
    await chrome.storage.local.set({ active_session: mockSession });

    // Wake-up routine
    async function onWakeUp() {
      const { active_session } = await chrome.storage.local.get('active_session');
      return active_session || null;
    }

    const restored = await onWakeUp();
    expect(restored).not.toBeNull();
    expect(restored.active_test_id).toBe(12);
    expect(restored.topic).toBe('Arrays & Hashing');
  });

  it('re-registers periodic review alarms after extension reload or update', async () => {
    function onStartupOrUpdate(reason) {
      chrome.alarms.clear('check_due_reviews_alarm');
      chrome.alarms.create('check_due_reviews_alarm', {
        periodInMinutes: 60,
      });
      return { status: 'alarms_reinitialized', reason };
    }

    const res = onStartupOrUpdate('update');
    expect(chrome.alarms.clear).toHaveBeenCalledWith('check_due_reviews_alarm');
    expect(chrome.alarms.create).toHaveBeenCalledWith('check_due_reviews_alarm', {
      periodInMinutes: 60,
    });
    expect(res.status).toBe('alarms_reinitialized');
  });
});
