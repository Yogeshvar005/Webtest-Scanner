import { describe, expect, test } from 'vitest';
import { capabilitiesFor, effectiveTier, methodAllowed } from '../src/index';

const NOW = new Date('2026-08-20T12:00:00.000Z');
const FUTURE = '2026-12-01T00:00:00.000Z';
const PAST = '2026-01-01T00:00:00.000Z';

describe('tier capabilities', () => {
  test('an unverified target is read-only and honours robots.txt', () => {
    const t0 = capabilitiesFor(0);
    expect(t0.allowedHttpMethods).toEqual(['GET', 'HEAD']);
    expect(t0.honorRobotsTxt).toBe(true);
    expect(t0.allowActiveSecurityProbes).toBe(false);
    expect(t0.allowFormSubmission).toBe(false);
  });

  test('only tier 2 permits active security probing', () => {
    expect(capabilitiesFor(0).allowActiveSecurityProbes).toBe(false);
    expect(capabilitiesFor(1).allowActiveSecurityProbes).toBe(false);
    expect(capabilitiesFor(2).allowActiveSecurityProbes).toBe(true);
  });

  test('request ceilings increase with proven ownership', () => {
    expect(capabilitiesFor(0).maxRequestsPerRun).toBeLessThan(capabilitiesFor(1).maxRequestsPerRun);
    expect(capabilitiesFor(1).maxRequestsPerRun).toBeLessThan(capabilitiesFor(2).maxRequestsPerRun);
  });
});

describe('methodAllowed', () => {
  test('refuses writes on an unverified target', () => {
    expect(methodAllowed(0, 'POST')).toBe(false);
    expect(methodAllowed(0, 'DELETE')).toBe(false);
  });

  test('permits reads on an unverified target, case-insensitively', () => {
    expect(methodAllowed(0, 'get')).toBe(true);
  });

  test('permits writes once the domain is verified', () => {
    expect(methodAllowed(1, 'POST')).toBe(true);
  });
});

describe('effectiveTier', () => {
  test('keeps a current tier as-is', () => {
    expect(effectiveTier(2, { ownershipExpiresAt: FUTURE, attestationExpiresAt: FUTURE, now: NOW })).toBe(2);
  });

  test('drops to 0 when domain verification has lapsed', () => {
    expect(effectiveTier(2, { ownershipExpiresAt: PAST, attestationExpiresAt: FUTURE, now: NOW })).toBe(0);
  });

  test('degrades tier 2 to tier 1 when only the attestation has lapsed', () => {
    // A lapsed attestation must remove active-security rights without also
    // discarding the still-valid proof of domain control.
    expect(effectiveTier(2, { ownershipExpiresAt: FUTURE, attestationExpiresAt: PAST, now: NOW })).toBe(1);
  });

  test('leaves tier 1 alone when its attestation is absent', () => {
    expect(effectiveTier(1, { ownershipExpiresAt: FUTURE, now: NOW })).toBe(1);
  });

  test('an unverified target stays unverified', () => {
    expect(effectiveTier(0, { now: NOW })).toBe(0);
  });

  test('treats an unparseable expiry as expired', () => {
    expect(effectiveTier(2, { ownershipExpiresAt: 'nonsense', now: NOW })).toBe(0);
  });

  test('treats a missing expiry as non-expiring', () => {
    expect(effectiveTier(2, { now: NOW })).toBe(2);
  });

  test('defaults to the current clock', () => {
    expect(effectiveTier(1, { ownershipExpiresAt: '2099-01-01T00:00:00.000Z' })).toBe(1);
  });
});
