import { challengeExpired, tokenMatches, type OwnershipChallenge } from './challenge';

export interface Resolver {
  name: string;
  url: string;
}

/**
 * Two independent DNS-over-HTTPS resolvers. Both must agree before a domain is
 * considered verified, so a single poisoned or stale resolver cannot grant
 * ownership of a domain the operator does not control.
 */
export const DEFAULT_RESOLVERS: Resolver[] = [
  { name: 'cloudflare', url: 'https://cloudflare-dns.com/dns-query' },
  { name: 'google', url: 'https://dns.google/resolve' },
];

export interface ResolverEvidence {
  resolver: string;
  records: string[];
  matched: boolean;
  error?: string;
}

export type VerificationOutcome =
  | { verified: true; method: 'dns-txt'; verifiedAt: string; expiresAt: string; evidence: ResolverEvidence[] }
  | { verified: false; reason: string; evidence: ResolverEvidence[] };

/** Verified ownership must be renewed quarterly. */
const VERIFICATION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

interface DohAnswer { type?: number; data?: string }
interface DohResponse { Answer?: DohAnswer[] }

/** DNS-over-HTTPS JSON API; TXT is record type 16. */
async function queryTxt(resolver: Resolver, name: string, fetchImpl: FetchLike): Promise<ResolverEvidence> {
  try {
    const url = `${resolver.url}?name=${encodeURIComponent(name)}&type=TXT`;
    const response = await fetchImpl(url, { headers: { accept: 'application/dns-json' } });

    if (!response.ok) {
      return { resolver: resolver.name, records: [], matched: false, error: `HTTP ${response.status}` };
    }

    const body = (await response.json()) as DohResponse;
    const records = (body.Answer ?? [])
      .filter((a) => a.type === 16 && typeof a.data === 'string')
      .map((a) => a.data!.replace(/^"|"$/g, '').replace(/"\s+"/g, ''));

    return { resolver: resolver.name, records, matched: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { resolver: resolver.name, records: [], matched: false, error: message };
  }
}

/**
 * Verifies a domain-ownership challenge by requiring every configured resolver
 * to independently observe the expected TXT record.
 *
 * Verification is the technical control only. It establishes that whoever
 * requested the challenge controls the domain's DNS; it does not by itself
 * establish legal authorization to test the application, which is what the
 * separate signed attestation records.
 */
export async function verifyDnsChallenge(
  challenge: OwnershipChallenge,
  fetchImpl: FetchLike,
  opts: { resolvers?: Resolver[]; now?: Date } = {},
): Promise<VerificationOutcome> {
  const now = opts.now ?? new Date();
  const resolvers = opts.resolvers ?? DEFAULT_RESOLVERS;

  if (challengeExpired(challenge, now)) {
    return { verified: false, reason: 'The verification challenge has expired. Generate a new one and republish the TXT record.', evidence: [] };
  }

  const evidence = await Promise.all(resolvers.map((r) => queryTxt(r, challenge.recordName, fetchImpl)));

  for (const item of evidence) {
    item.matched = item.records.some((record) => tokenMatches(challenge.recordValue, record.trim()));
  }

  const failed = evidence.filter((e) => !e.matched);
  if (failed.length > 0) {
    const withErrors = failed.filter((e) => e.error !== undefined);
    const reason =
      withErrors.length === evidence.length
        ? `No resolver could be reached (${withErrors.map((e) => `${e.resolver}: ${e.error}`).join('; ')}).`
        : `The expected TXT record was not observed by: ${failed.map((e) => e.resolver).join(', ')}. DNS changes can take time to propagate — wait for the record's TTL and retry.`;

    return { verified: false, reason, evidence };
  }

  return {
    verified: true,
    method: 'dns-txt',
    verifiedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + VERIFICATION_TTL_MS).toISOString(),
    evidence,
  };
}
