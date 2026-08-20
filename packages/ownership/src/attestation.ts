/**
 * The signed authorization attestation.
 *
 * DNS verification proves control of a domain. It does not prove the operator
 * is permitted to run intrusive tests against the application behind it. This
 * record is the legal control: a named human, with an identity the platform
 * can produce on demand, affirming a specific scope for a specific period.
 */
export interface Attestation {
  targetId: string;
  orgId: string;
  /** The Firebase uid of the Project Admin who signed. */
  actorUid: string;
  actorEmail: string;
  actorIp: string;
  actorUserAgent: string;
  /** Exact origins the attestation covers — never a wildcard. */
  scope: string[];
  authorizedTestClasses: Array<'functional' | 'security-active' | 'load'>;
  /** Version of the attestation text the signer actually agreed to. */
  textVersion: string;
  signedAt: string;
  expiresAt: string;
}

/** Attestations lapse after a year so authorization is re-affirmed deliberately. */
const ATTESTATION_TTL_MS = 365 * 24 * 60 * 60 * 1000;

export const ATTESTATION_TEXT_VERSION = '2026-08-20.1';

export const ATTESTATION_TEXT = `I confirm that I am authorised to commission automated testing, including active security testing, against the systems listed in this scope. I confirm that I either own these systems or hold documented written permission from their owner. I understand that testing systems without authorisation may be unlawful, that this platform records my identity and the time of this affirmation, and that this record may be disclosed in response to an abuse report or a lawful request.`;

export interface AttestationInput {
  targetId: string;
  orgId: string;
  actorUid: string;
  actorEmail: string;
  actorIp: string;
  actorUserAgent: string;
  scope: string[];
  authorizedTestClasses: Attestation['authorizedTestClasses'];
}

export function createAttestation(input: AttestationInput, now: Date = new Date()): Attestation {
  if (input.scope.length === 0) {
    throw new Error('An attestation must name at least one origin. Wildcard scopes are not accepted.');
  }
  if (input.scope.some((origin) => origin.includes('*'))) {
    throw new Error('Wildcard origins are not accepted in an attestation scope.');
  }

  return {
    ...input,
    textVersion: ATTESTATION_TEXT_VERSION,
    signedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ATTESTATION_TTL_MS).toISOString(),
  };
}

export function attestationCovers(
  attestation: Attestation,
  origin: string,
  testClass: Attestation['authorizedTestClasses'][number],
  now: Date = new Date(),
): boolean {
  if (Date.parse(attestation.expiresAt) <= now.getTime()) return false;
  if (!attestation.authorizedTestClasses.includes(testClass)) return false;
  return attestation.scope.includes(origin);
}
