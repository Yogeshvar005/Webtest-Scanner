import { describe, expect, test } from 'vitest';
import {
  ATTESTATION_TEXT, ATTESTATION_TEXT_VERSION, attestationCovers, createAttestation,
  type AttestationInput,
} from '../src/index';

const NOW = new Date('2026-08-20T12:00:00.000Z');

function input(over: Partial<AttestationInput> = {}): AttestationInput {
  return {
    targetId: 'tgt_1',
    orgId: 'org_1',
    actorUid: 'uid_admin',
    actorEmail: 'admin@example.com',
    actorIp: '203.0.113.10',
    actorUserAgent: 'Mozilla/5.0',
    scope: ['https://app.example.com'],
    authorizedTestClasses: ['functional', 'security-active'],
    ...over,
  };
}

describe('createAttestation', () => {
  test('records who signed, from where, and when', () => {
    const a = createAttestation(input(), NOW);

    expect(a.actorUid).toBe('uid_admin');
    expect(a.actorIp).toBe('203.0.113.10');
    expect(a.signedAt).toBe(NOW.toISOString());
  });

  test('pins the exact text version the signer agreed to', () => {
    expect(createAttestation(input(), NOW).textVersion).toBe(ATTESTATION_TEXT_VERSION);
  });

  test('expires after a year so authorization is re-affirmed deliberately', () => {
    const a = createAttestation(input(), NOW);
    expect((Date.parse(a.expiresAt) - Date.parse(a.signedAt)) / 86_400_000).toBe(365);
  });

  test('refuses an empty scope', () => {
    expect(() => createAttestation(input({ scope: [] }), NOW)).toThrow(/at least one origin/);
  });

  test('refuses a wildcard scope', () => {
    // A wildcard would let one signature authorize testing of hosts the signer
    // never actually named, which defeats the purpose of the record.
    expect(() => createAttestation(input({ scope: ['https://*.example.com'] }), NOW)).toThrow(/Wildcard/);
  });

  test('defaults to the current clock', () => {
    expect(createAttestation(input()).signedAt).toBeDefined();
  });

  test('the attestation text names the legal risk explicitly', () => {
    expect(ATTESTATION_TEXT).toContain('unlawful');
    expect(ATTESTATION_TEXT).toContain('written permission');
  });
});

describe('attestationCovers', () => {
  const a = createAttestation(input(), NOW);

  test('covers a named origin for an authorized class', () => {
    expect(attestationCovers(a, 'https://app.example.com', 'security-active', NOW)).toBe(true);
  });

  test('does not cover an origin outside the named scope', () => {
    expect(attestationCovers(a, 'https://other.example.com', 'security-active', NOW)).toBe(false);
  });

  test('does not cover a test class that was not authorized', () => {
    expect(attestationCovers(a, 'https://app.example.com', 'load', NOW)).toBe(false);
  });

  test('does not cover anything once expired', () => {
    expect(attestationCovers(a, 'https://app.example.com', 'security-active', new Date('2028-01-01T00:00:00.000Z'))).toBe(false);
  });

  test('defaults to the current clock', () => {
    expect(attestationCovers(a, 'https://app.example.com', 'functional')).toBe(true);
  });
});
