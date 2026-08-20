import { describe, expect, test } from 'vitest';
import { checkDenylist, isPrivateAddress, requiresManualReview } from '../src/index';

describe('isPrivateAddress', () => {
  test.each([
    'localhost', 'app.localhost', 'db.internal', 'printer.local',
    '10.0.0.5', '127.0.0.1', '192.168.1.1', '172.16.0.1', '172.31.255.255',
    '0.0.0.0', '::1', '[::1]', 'fd00::1', 'fe80::1',
  ])('treats %s as private', (host) => {
    expect(isPrivateAddress(host)).toBe(true);
  });

  test('blocks the cloud metadata address specifically', () => {
    // 169.254.169.254 is the credential-stealing target on every major cloud.
    expect(isPrivateAddress('169.254.169.254')).toBe(true);
  });

  test.each(['example.com', '8.8.8.8', '172.32.0.1', '11.0.0.1'])('treats %s as public', (host) => {
    expect(isPrivateAddress(host)).toBe(false);
  });
});

describe('checkDenylist', () => {
  test.each([
    ['whitehouse.gov', 'government'],
    ['service.gov.uk', 'government'],
    ['army.mil', 'military'],
    ['defence.mod.uk', 'military'],
  ])('blocks %s as %s', (host, category) => {
    expect(checkDenylist(host)?.category).toBe(category);
  });

  test.each([
    'console.aws.amazon.com',
    'console.cloud.google.com',
    'portal.azure.com',
    'metadata.google.internal',
  ])('blocks the cloud control plane %s', (host) => {
    expect(checkDenylist(host)).toBeDefined();
  });

  test.each([
    ['chase.com', 'financial'],
    ['api.stripe.com', 'financial'],
    ['nhs.uk', 'healthcare'],
  ])('blocks the curated regulated domain %s as %s', (host, category) => {
    expect(checkDenylist(host)?.category).toBe(category);
  });

  test('does not hard-block a domain that merely contains a regulated keyword', () => {
    // burbank.com is a city, not a bank. Keyword matching would over-block it
    // while still missing chase.com, so it is a review signal, not a block.
    expect(checkDenylist('burbank.com')).toBeUndefined();
  });

  test('blocks a private address before any other category is considered', () => {
    expect(checkDenylist('192.168.0.10')?.category).toBe('private-network');
  });

  test('blocks hosts on the operator-supplied abuse blocklist', () => {
    expect(checkDenylist('abuser.example', ['abuser.example'])?.category).toBe('platform-abuse');
    expect(checkDenylist('sub.abuser.example', ['abuser.example'])?.category).toBe('platform-abuse');
  });

  test('allows an ordinary commercial domain', () => {
    expect(checkDenylist('shop.example.com')).toBeUndefined();
  });

  test('is case-insensitive and tolerates a trailing dot', () => {
    expect(checkDenylist('WhiteHouse.GOV.')).toBeDefined();
  });

  test('matches a bare suffix used as a whole hostname', () => {
    expect(checkDenylist('gov')).toBeDefined();
  });
});

describe('requiresManualReview', () => {
  test.each([
    ['mybank.com', 'financial'],
    ['cityhospital.org', 'healthcare'],
    ['scada-controller.net', 'critical-infrastructure'],
  ])('flags %s as possibly %s', (host, category) => {
    expect(requiresManualReview(host)).toBe(category);
  });

  test('does not flag an ordinary commercial domain', () => {
    expect(requiresManualReview('shop.example.com')).toBeUndefined();
  });

  test('is a soft signal that does not block on its own', () => {
    expect(requiresManualReview('mybank.com')).toBeDefined();
    expect(checkDenylist('mybank.com')).toBeUndefined();
  });

  test('tolerates a trailing dot', () => {
    expect(requiresManualReview('MyBank.com.')).toBe('financial');
  });
});
