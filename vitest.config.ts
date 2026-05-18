import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    clearMocks: true,
    // Run test files sequentially so HTTP servers in different test files
    // don't collide on hardcoded ports and cause EADDRINUSE flakiness.
    fileParallelism: false,
    // Dynamic imports with vi.resetModules() need TypeScript transform on first load
    // which can take ~2s. 5s default timeout is too tight under full-suite load.
    testTimeout: 15_000,
  },
})
