import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';

// Node 25+ ships its own global `localStorage` (undefined without
// --localstorage-file) that shadows jsdom's. Use a real in-memory Storage.
if (typeof globalThis.localStorage?.clear !== 'function') {
  const store = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() { return store.size; },
    clear: () => store.clear(),
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    key: (i) => Array.from(store.keys())[i] ?? null,
    removeItem: (k) => { store.delete(k); },
    setItem: (k, v) => { store.set(k, String(v)); },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage, configurable: true });
  if (typeof window !== 'undefined' && window !== globalThis) {
    Object.defineProperty(window, 'localStorage', { value: memoryStorage, configurable: true });
  }
}

// jsdom's localStorage persists across tests in the same file — wipe it so
// each test starts from a clean auth state (no stale access_token).
beforeEach(() => {
  localStorage.clear();
});
