export interface AssertionResult { description: string; passed: boolean; severity: string; detail?: string }

export interface StepResult {
  id: string; index: number; intent: string; status: string; durationMs: number;
  screenshot?: string; resolvedBy?: string; resolutionConfidence?: number;
  assertions: AssertionResult[]; error?: string; policyReason?: string;
  consoleErrors: string[]; provenanceSource: string; provenanceConfidence: number;
}

export interface CheckResult { id: string; name: string; status: string; severity: string; detail: string; evidence?: string[] }

export interface CategoryResult {
  category: string; label: string; status: string; skippedReason?: string;
  checks: CheckResult[]; totals: { passed: number; failed: number; warning: number; skipped: number };
}

export interface Finding { type: string; severity: string; title: string; detail: string; evidence?: string }

export interface CategoryDescriptor { id: string; label: string; description: string; minTier: number }

export interface RunResponse {
  runId: string; targetUrl: string; status: string; durationMs: number; strict: boolean;
  steps: StepResult[]; findings: Finding[]; categories: CategoryResult[];
  totals: { total: number; passed: number; failed: number; blocked: number; skipped: number };
  policyDecision: { effect: string; reason?: string; remediation?: string; code?: string; conditions?: Array<{ detail: string }> };
  unparsed: string[]; meanConfidence: number;
  ownership: { recordedTier: number; effectiveTier: number };
  error?: string; detail?: string; hint?: string; issues?: Array<{ rule: string; message: string }>;
}
