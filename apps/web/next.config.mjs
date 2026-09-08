import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.join(__dirname, '../../'),
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
    'playwright-extra',
    'puppeteer-extra-plugin',
    'puppeteer-extra-plugin-stealth',
    'puppeteer-extra-plugin-user-preferences',
    'puppeteer-extra-plugin-user-data-dir',
    'clone-deep',
    'fsevents',
    'chromium-bidi'
  ],
  outputFileTracingIncludes: {
    '/api/**/*': [
      './node_modules/@sparticuz/chromium/bin/**',
      './node_modules/@sparticuz/chromium/**',
    ],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push(
        'playwright',
        'playwright-core',
        '@sparticuz/chromium',
        'axe-core',
        'rebrowser-playwright',
        'playwright-extra',
        'puppeteer-extra-plugin',
        'puppeteer-extra-plugin-stealth',
        'puppeteer-extra-plugin-user-preferences',
        'puppeteer-extra-plugin-user-data-dir',
        'clone-deep',
        'fsevents',
        'chromium-bidi'
      );
    }
    return config;
  },
};

export default nextConfig;
