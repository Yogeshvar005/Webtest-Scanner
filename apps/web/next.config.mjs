/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace packages ship TypeScript source, so Next must compile them.
  transpilePackages: [
    '@wts/dsl',
    '@wts/policy',
    '@wts/ownership',
    '@wts/nlp',
    '@wts/runner',
    '@wts/analyzers',
    '@wts/data-forge',
  ],
  serverExternalPackages: ['playwright', 'playwright-core', '@sparticuz/chromium', 'axe-core'],
};

export default nextConfig;
