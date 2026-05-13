import { defineConfig } from 'vitest/config';

// Vitest discovers any *.test.ts file. We have extracted update-pack folders
// under the repo root (encounter-update*/) that contain duplicate copies of
// already-integrated test files — exclude them so vitest only runs the
// canonical copies in src/.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: [
      'node_modules/**',
      'dist/**',
      'server/**',
      'encounter-update*/**',
    ],
  },
});
