import '@testing-library/jest-dom/vitest';

// Comprehensive Chrome Extension API Mocks (Manifest V3)
const storageMock = (() => {
  let store = {};
  return {
    get: vi.fn((keys, callback) => {
      let result = {};
      if (typeof keys === 'string') {
        result[keys] = store[keys];
      } else if (Array.isArray(keys)) {
        keys.forEach((k) => {
          result[k] = store[k];
        });
      } else if (keys && typeof keys === 'object') {
        Object.keys(keys).forEach((k) => {
          result[k] = store[k] !== undefined ? store[k] : keys[k];
        });
      } else {
        result = { ...store };
      }
      if (callback) callback(result);
      return Promise.resolve(result);
    }),
    set: vi.fn((items, callback) => {
      Object.assign(store, items);
      if (callback) callback();
      return Promise.resolve();
    }),
    remove: vi.fn((keys, callback) => {
      const arr = Array.isArray(keys) ? keys : [keys];
      arr.forEach((k) => delete store[k]);
      if (callback) callback();
      return Promise.resolve();
    }),
    clear: vi.fn((callback) => {
      store = {};
      if (callback) callback();
      return Promise.resolve();
    }),
    _dump: () => store,
  };
})();

global.chrome = {
  runtime: {
    sendMessage: vi.fn((msg, callback) => {
      if (callback) callback({ status: 'ok' });
      return Promise.resolve({ status: 'ok' });
    }),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListeners: vi.fn(() => true),
    },
    onInstalled: {
      addListener: vi.fn(),
    },
    onStartup: {
      addListener: vi.fn(),
    },
    getURL: vi.fn((path) => `chrome-extension://mock-extension-id/${path}`),
    lastError: null,
  },
  storage: {
    local: storageMock,
    sync: storageMock,
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  alarms: {
    create: vi.fn(),
    clear: vi.fn(),
    get: vi.fn(),
    getAll: vi.fn(),
    onAlarm: {
      addListener: vi.fn(),
    },
  },
  tabs: {
    query: vi.fn((queryInfo, callback) => {
      const mockTabs = [{ id: 101, url: 'https://leetcode.com/problems/two-sum/', active: true }];
      if (callback) callback(mockTabs);
      return Promise.resolve(mockTabs);
    }),
    sendMessage: vi.fn((tabId, msg, callback) => {
      if (callback) callback({ status: 'received' });
      return Promise.resolve({ status: 'received' });
    }),
    onUpdated: {
      addListener: vi.fn(),
    },
  },
  action: {
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn(),
  },
};

// Global Fetch Mock helper
beforeEach(() => {
  vi.clearAllMocks();
  chrome.storage.local.clear();
});
