import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    clearMocks: true,
    // Run test files sequentially so HTTP servers in different test files
    // don't collide on hardcoded ports and cause EADDRINUSE flakiness.
    fileParallelism: false,
  },
})
