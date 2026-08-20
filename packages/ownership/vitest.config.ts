import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  test: {
    name: '@wts/ownership',
    root,
    include: ['tests/**/*.test.ts'],
  },
});
