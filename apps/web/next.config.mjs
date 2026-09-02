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
  serverExternalPackages: [
    'playwright',
    'playwright-core',
    '@sparticuz/chromium',
    'axe-core',
    'rebrowser-playwright',
    'puppeteer-extra-plugin-stealth',
    'clone-deep',
  ],
  outputFileTracingIncludes: {
    '/api/**/*': [
      './node_modules/@sparticuz/chromium/bin/**',
      './node_modules/@sparticuz/chromium/**',
    ],
  },
};

export default nextConfig;
