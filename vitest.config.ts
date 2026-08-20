import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Each package owns its own name/root/include; apps are added as they gain suites.
    projects: ['packages/*/vitest.config.ts'],

    // Coverage is resolved once at the root — Vitest ignores per-project
    // coverage blocks — so thresholds for every package live here.
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        '**/index.ts',
        '**/*.d.ts',
        // Drives a real browser; covered by integration runs, not unit tests.
        'packages/runner/src/execute.ts',
        'packages/runner/src/resolve.ts',
      ],
      reporter: ['text', 'html'],
      thresholds: {
        // Project-wide floor.
        lines: 80,
        branches: 80,
        functions: 80,

        // Modules where a coverage gap is a security incident rather than a
        // bug: the DSL validator, the authorization engine, and the legal
        // ownership gate.
        'packages/dsl/src/lint.ts': { lines: 100, branches: 100, functions: 100 },
        'packages/policy/src/engine.ts': { lines: 100, branches: 100, functions: 100 },
        'packages/policy/src/rules/**/*.ts': { lines: 100, branches: 100, functions: 100 },
        'packages/ownership/src/denylist.ts': { lines: 100, branches: 100, functions: 100 },
        'packages/ownership/src/dns.ts': { lines: 100, branches: 100, functions: 100 },
        'packages/ownership/src/tiers.ts': { lines: 100, branches: 100, functions: 100 },
        'packages/ownership/src/challenge.ts': { lines: 100, branches: 100, functions: 100 },
        'packages/runner/src/egress-guard.ts': { lines: 100, branches: 100, functions: 100 },
        'packages/nlp/src/sanitize.ts': { lines: 100, branches: 100, functions: 100 },
      },
    },
  },
});
