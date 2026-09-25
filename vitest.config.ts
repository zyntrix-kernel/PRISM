import { defineConfig } from 'vitest/config';

// Scoped to PRISM's own sources: the Reference Repos/ directory contains
// third-party test files (jasmine-based) that must not run with our suite.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
