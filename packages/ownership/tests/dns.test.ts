import { describe, expect, test, vi } from 'vitest';
import {
  challengeExpired, createChallenge, tokenMatches, verifyDnsChallenge,
  type FetchLike, type OwnershipChallenge, type Resolver,
} from '../src/index';

const KEY = 'test-server-key';
const NOW = new Date('2026-08-20T12:00:00.000Z');

const RESOLVERS: Resolver[] = [
  { name: 'cloudflare', url: 'https://cloudflare-dns.com/dns-query' },
  { name: 'google', url: 'https://dns.google/resolve' },
];

function challenge(): OwnershipChallenge {
  return createChallenge('example.com', 'org_1', KEY, NOW);
}

/** Builds a fetch stub returning per-resolver TXT answers. */
function fetchReturning(byResolver: Record<string, string[] | Error>): FetchLike {
  return vi.fn(async (url: string) => {
    const name = url.includes('cloudflare') ? 'cloudflare' : 'google';
    const result = byResolver[name];

    if (result instanceof Error) throw result;

    return {
      ok: true,
      status: 200,
      json: async () => ({ Answer: (result ?? []).map((data) => ({ type: 16, data })) }),
    };
  });
}

describe('createChallenge', () => {
  test('produces the documented record name and value prefix', () => {
    const c = challenge();
    expect(c.recordName).toBe('_webtest-scanner.example.com');
    expect(c.recordValue.startsWith('webtest-scanner-site-verification=')).toBe(true);
  });

  test('binds the token to the organisation so proofs are not transferable', () => {
    const a = createChallenge('example.com', 'org_1', KEY, NOW);
    const b = createChallenge('example.com', 'org_2', KEY, NOW);

    // Different orgs must not be able to satisfy each other's challenge.
    expect(a.recordValue).not.toBe(b.recordValue);
  });

  test('produces a distinct nonce each time', () => {
    expect(challenge().nonce).not.toBe(challenge().nonce);
  });

  test('normalises the domain', () => {
    expect(createChallenge('EXAMPLE.com.', 'org_1', KEY, NOW).apexDomain).toBe('example.com');
  });

  test('expires 30 days out', () => {
    const c = challenge();
    const days = (Date.parse(c.expiresAt) - Date.parse(c.createdAt)) / 86_400_000;
    expect(days).toBe(30);
  });
});

describe('tokenMatches', () => {
  test('matches identical tokens', () => {
    expect(tokenMatches('abc', 'abc')).toBe(true);
  });

  test('rejects different tokens of equal length', () => {
    expect(tokenMatches('abc', 'abd')).toBe(false);
  });

  test('rejects tokens of differing length without throwing', () => {
    expect(tokenMatches('abc', 'abcd')).toBe(false);
  });
});

describe('challengeExpired', () => {
  test('is false before the expiry', () => {
    expect(challengeExpired(challenge(), NOW)).toBe(false);
  });

  test('is true after the expiry', () => {
    expect(challengeExpired(challenge(), new Date('2026-10-20T12:00:00.000Z'))).toBe(true);
  });
});

describe('verifyDnsChallenge', () => {
  test('verifies when every resolver observes the record', async () => {
    const c = challenge();
    const result = await verifyDnsChallenge(c, fetchReturning({
      cloudflare: [c.recordValue],
      google: [c.recordValue],
    }), { resolvers: RESOLVERS, now: NOW });

    expect(result.verified).toBe(true);
    expect(result.verified && result.method).toBe('dns-txt');
    expect(result.evidence.every((e) => e.matched)).toBe(true);
  });

  test('sets a 90-day verification window', async () => {
    const c = challenge();
    const result = await verifyDnsChallenge(c, fetchReturning({ cloudflare: [c.recordValue], google: [c.recordValue] }), { resolvers: RESOLVERS, now: NOW });

    expect(result.verified).toBe(true);
    if (!result.verified) return;
    expect((Date.parse(result.expiresAt) - Date.parse(result.verifiedAt)) / 86_400_000).toBe(90);
  });

  test('refuses when only one resolver sees the record', async () => {
    // Single-resolver agreement would let a poisoned or stale cache grant
    // ownership of a domain the operator does not control.
    const c = challenge();
    const result = await verifyDnsChallenge(c, fetchReturning({
      cloudflare: [c.recordValue],
      google: [],
    }), { resolvers: RESOLVERS, now: NOW });

    expect(result.verified).toBe(false);
    expect(result.verified === false && result.reason).toContain('google');
  });

  test('refuses when the published token belongs to another organisation', async () => {
    const ours = createChallenge('example.com', 'org_1', KEY, NOW);
    const theirs = createChallenge('example.com', 'org_2', KEY, NOW);

    const result = await verifyDnsChallenge(ours, fetchReturning({
      cloudflare: [theirs.recordValue],
      google: [theirs.recordValue],
    }), { resolvers: RESOLVERS, now: NOW });

    expect(result.verified).toBe(false);
  });

  test('strips surrounding quotes that resolvers add to TXT data', async () => {
    const c = challenge();
    const result = await verifyDnsChallenge(c, fetchReturning({
      cloudflare: [`"${c.recordValue}"`],
      google: [`"${c.recordValue}"`],
    }), { resolvers: RESOLVERS, now: NOW });

    expect(result.verified).toBe(true);
  });

  test('ignores unrelated TXT records on the same name', async () => {
    const c = challenge();
    const result = await verifyDnsChallenge(c, fetchReturning({
      cloudflare: ['v=spf1 include:_spf.example.com ~all', c.recordValue],
      google: ['google-site-verification=abc', c.recordValue],
    }), { resolvers: RESOLVERS, now: NOW });

    expect(result.verified).toBe(true);
  });

  test('reports a network failure rather than failing open', async () => {
    const c = challenge();
    const result = await verifyDnsChallenge(c, fetchReturning({
      cloudflare: new Error('ECONNREFUSED'),
      google: new Error('ETIMEDOUT'),
    }), { resolvers: RESOLVERS, now: NOW });

    expect(result.verified).toBe(false);
    expect(result.verified === false && result.reason).toContain('No resolver could be reached');
  });

  test('records an HTTP error status as evidence', async () => {
    const c = challenge();
    const failing: FetchLike = async () => ({ ok: false, status: 503, json: async () => ({}) });

    const result = await verifyDnsChallenge(c, failing, { resolvers: RESOLVERS, now: NOW });

    expect(result.verified).toBe(false);
    expect(result.evidence.every((e) => e.error === 'HTTP 503')).toBe(true);
  });

  test('handles a non-Error thrown value', async () => {
    const c = challenge();
    const throwing: FetchLike = async () => { throw 'boom'; };

    const result = await verifyDnsChallenge(c, throwing, { resolvers: RESOLVERS, now: NOW });
    expect(result.evidence[0]!.error).toBe('boom');
  });

  test('refuses an expired challenge without querying DNS at all', async () => {
    const spy = vi.fn();
    const result = await verifyDnsChallenge(challenge(), spy as unknown as FetchLike, {
      resolvers: RESOLVERS,
      now: new Date('2026-12-01T00:00:00.000Z'),
    });

    expect(result.verified).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  test('filters out non-TXT answers', async () => {
    const c = challenge();
    const mixed: FetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ Answer: [{ type: 5, data: 'cname.example.com' }, { type: 16, data: c.recordValue }] }),
    });

    expect((await verifyDnsChallenge(c, mixed, { resolvers: RESOLVERS, now: NOW })).verified).toBe(true);
  });

  test('handles a response with no Answer section', async () => {
    const empty: FetchLike = async () => ({ ok: true, status: 200, json: async () => ({}) });
    const result = await verifyDnsChallenge(challenge(), empty, { resolvers: RESOLVERS, now: NOW });

    expect(result.verified).toBe(false);
  });

  test('defaults to the built-in resolver pair and the current clock', async () => {
    const c = createChallenge('example.com', 'org_1', KEY);
    const result = await verifyDnsChallenge(c, fetchReturning({ cloudflare: [c.recordValue], google: [c.recordValue] }));

    expect(result.verified).toBe(true);
    expect(result.evidence).toHaveLength(2);
  });
});
