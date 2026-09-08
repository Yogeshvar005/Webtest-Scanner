import type { Scenario, Severity } from '@wts/dsl';
import type { PolicyDecision } from '@wts/policy';
import type { InjectionSignal } from '@wts/nlp';
import type { CategoryResult } from '@wts/analyzers';
import type { BlockedRequest, ThirdPartyContact } from './egress-guard';

export type StepStatus = 'passed' | 'failed' | 'blocked' | 'skipped';

export interface AssertionResult {
  description: string;
  passed: boolean;
  severity: Severity;
  detail?: string;
}

export interface StepResult {
  id: string;
  index: number;
  intent: string;
  status: StepStatus;
  durationMs: number;
  /** Public URL of the screenshot captured after this step. */
  screenshot?: string;
  /** Which resolution signal actually matched, and how strong it was. */
  resolvedBy?: string;
  resolutionConfidence?: number;
  assertions: AssertionResult[];
  error?: string;
  /** Why the policy engine refused, when status is 'blocked'. */
  policyReason?: string;
  consoleErrors: string[];
  provenanceSource: string;
  provenanceConfidence: number;
  /** AI-style Self-healing locator metadata when primary selector drifted or broke. */
  selfHealed?: {
    healed: boolean;
    originalTarget: string;
    strategy: string;
    healedSelector?: string;
    reason?: string;
  };
}

export type FindingType =
  | 'prompt_injection_attempt'
  | 'blocked_egress'
  | 'third_party_contact'
  | 'accessibility'
  | 'console_error'
  | 'policy_denial'
  | 'assertion_failure'
  | 'accessibility'
  | 'security'
  | 'performance'
  | 'api'
  | 'ui';

export interface Finding {
  type: FindingType;
  severity: Severity;
  title: string;
  detail: string;
  evidence?: string;
}

export interface RunResult {
  runId: string;
  scenario: Scenario;
  targetUrl: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  status: 'passed' | 'failed' | 'blocked' | 'warning';
  /** One entry per selected category. Unselected categories are absent. */
  categories: CategoryResult[];
  strict: boolean;
  steps: StepResult[];
  findings: Finding[];
  blockedRequests: BlockedRequest[];
  thirdParties: ThirdPartyContact[];
  injectionSignals: InjectionSignal[];
  policyDecision: PolicyDecision;
  totals: { total: number; passed: number; failed: number; blocked: number; skipped: number };
  siteScreenshot?: string;
  siteNavLinks?: Array<{ text: string; href: string; screenshot?: string }>;
  siteButtons?: string[];
}
