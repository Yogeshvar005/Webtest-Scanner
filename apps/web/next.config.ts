import type { NextConfig } from 'next';

const config: NextConfig = {
  // Workspace packages ship TypeScript source, so Next must compile them.
  transpilePackages: ['@wts/dsl', '@wts/policy', '@wts/ownership', '@wts/nlp', '@wts/runner', '@wts/analyzers'],
  serverExternalPackages: ['playwright', 'playwright-core', 'axe-core'],
};

export default config;
