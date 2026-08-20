import type { NextConfig } from 'next';

const config: NextConfig = {
  // Workspace packages ship TypeScript source, so Next must compile them.
  transpilePackages: ['@wts/dsl', '@wts/policy', '@wts/ownership', '@wts/nlp', '@wts/runner'],
  serverExternalPackages: ['playwright', 'playwright-core'],
};

export default config;
