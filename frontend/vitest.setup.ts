import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';

// jsdom's localStorage persists across tests in the same file — wipe it so
// each test starts from a clean auth state (no stale access_token).
beforeEach(() => {
  localStorage.clear();
});
