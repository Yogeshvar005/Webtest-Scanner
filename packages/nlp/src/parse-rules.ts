import type { Action, ElementRole, Provenance, SemanticTarget, Step } from '@wts/dsl';
import { generateRandomEmail, generateRandomString, generateRandomNumber, generateUUID } from '@wts/data-forge';

/**
 * A deterministic, rule-based natural-language parser.
 *
 * This is the fallback used when no model is configured, and the reference
 * implementation of what the model is asked to produce. It is deliberately
 * conservative: a line it cannot confidently interpret becomes an open
 * question rather than a guessed step, so the report never presents an
 * invented action as if the tester had asked for it.
 */

export interface ParsedLine {
  step?: Step;
  question?: { question: string; assumedAnswer: string };
}

function provenance(confidence: number, rationale: string): Provenance {
  return { source: 'inferred', confidence, rationale };
}

function target(role: ElementRole, name: string, origin: Provenance): SemanticTarget {
  return { kind: 'semantic', role, name, nameMatch: 'contains', origin };
}

/** Strips articles and quoting so "the \"Login\" button" becomes "Login". */
function cleanName(raw: string): string {
  return raw
    .trim()
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/\s+(button|link|field|box|input|tab|menu item|checkbox)$/i, '')
    .replace(/^["'“”‘’]|["'“”‘’]$/g, '')
    .replace(/[.,;:!?]+$/, '')
    .trim();
}

/** Guesses an ARIA role from the noun the tester used. */
function roleFromPhrase(phrase: string, fallback: ElementRole): ElementRole {
  if (/\blink\b/i.test(phrase)) return 'link';
  if (/\bcheckbox\b/i.test(phrase)) return 'checkbox';
  if (/\btab\b/i.test(phrase)) return 'tab';
  if (/\bmenu\s?item\b/i.test(phrase)) return 'menuitem';
  if (/\b(search)\b/i.test(phrase)) return 'searchbox';
  if (/\bpassword\b/i.test(phrase)) return 'password';
  if (/\b(field|box|input)\b/i.test(phrase)) return 'textbox';
  return fallback;
}

/** Resolves tags like {{random.email}} using data-forge */
function resolveTags(value: string): string {
  return value.replace(/\{\{random\.([a-zA-Z]+)\}\}/g, (match, tag) => {
    switch (tag.toLowerCase()) {
      case 'email': return generateRandomEmail();
      case 'uuid': return generateUUID();
      case 'number': return generateRandomNumber().toString();
      case 'string': return generateRandomString();
      default: return match; // Leave unrecognized tags alone
    }
  });
}

type Rule = {
  name: string;
  pattern: RegExp;
  confidence: number;
  build: (m: RegExpMatchArray, origin: Provenance) => { action: Action; intent: string; assertText?: string };
};

const RULES: Rule[] = [
  // Ordered most-specific first. `verify-text` is a catch-all whose pattern
  // also matches phrases like "check accessibility", so it must be tried last.
  {
    name: 'health-check',
    pattern: /^(?:verify|check|ensure|confirm|test)\s+(?:that\s+)?(?:the\s+)?(?:site|website|page|app|application|server)\s+(?:is\s+)?(?:running|working|up|online|alive|loaded|ok|healthy)$/i,
    confidence: 0.95,
    build: () => ({
      action: { type: 'screenshot', label: 'Health check' },
      intent: 'Verify website is online and responsive',
    }),
  },
  {
    name: 'bare-url',
    pattern: /^(?:https?:\/\/|www\.)[^\s]+$/i,
    confidence: 0.95,
    build: (m) => {
      const raw = cleanName(m[0]);
      const path = raw.startsWith('/') ? raw : `/${raw.replace(/^https?:\/\/[^/]+/i, '').replace(/^www\.[^/]+/i, '').replace(/^\/+/, '')}`;
      return {
        action: { type: 'navigate', path: path === '/' ? '/' : path, originRef: 'primary' },
        intent: `Open ${raw}`,
      };
    },
  },
  {
    name: 'navigate',
    pattern: /^(?:go to|open|navigate to|visit|browse to)\s+(.+)$/i,
    confidence: 0.95,
    build: (m, origin) => {
      const raw = cleanName(m[1]!);
      // A bare word like "checkout" is treated as a path segment.
      const path = raw.startsWith('/') ? raw : `/${raw.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+/, '')}`;
      return {
        action: { type: 'navigate', path: path === '/' ? '/' : path, originRef: 'primary' },
        intent: `Open ${path}`,
      };
    },
  },
  {
    name: 'screenshot',
    pattern: /^(?:take a |capture a |)screenshot(?:\s+of\s+(.+))?$/i,
    confidence: 0.95,
    build: (m) => ({
      action: { type: 'screenshot', label: m[1] ? cleanName(m[1]) : 'Page' },
      intent: m[1] ? `Screenshot ${cleanName(m[1])}` : 'Take a screenshot',
    }),
  },
  {
    name: 'a11y',
    pattern: /^(?:check |run |audit |)accessibility(?:\s+audit)?$/i,
    confidence: 0.95,
    build: () => ({
      action: { type: 'a11yAudit', ruleset: 'wcag21aa' },
      intent: 'Run accessibility audit',
    }),
  },
  {
    name: 'search',
    pattern: /^search (?:for|)\s*(?:["'“”]?)(.+?)(?:["'“”]?)$/i,
    confidence: 0.8,
    build: (m, origin) => {
      const value = resolveTags(cleanName(m[1]!));
      return {
        action: { type: 'fill', target: target('searchbox', 'search', origin), value: { kind: 'literal', value } },
        intent: `Search for "${value}"`,
      };
    },
  },
  {
    name: 'fill-into',
    pattern: /^(?:type|enter|input)\s+(?:["'“”]?)(.+?)(?:["'“”]?)\s+(?:in|into|in the|into the)\s+(.+)$/i,
    confidence: 0.9,
    build: (m, origin) => {
      const value = resolveTags(cleanName(m[1]!));
      const field = cleanName(m[2]!);
      return {
        action: { type: 'fill', target: target(roleFromPhrase(m[2]!, 'textbox'), field, origin), value: { kind: 'literal', value } },
        intent: `Enter "${value}" into ${field}`,
      };
    },
  },
  {
    name: 'fill-with',
    pattern: /^fill\s+(?:in\s+)?(.+?)\s+with\s+(?:["'“”]?)(.+?)(?:["'“”]?)$/i,
    confidence: 0.9,
    build: (m, origin) => {
      const field = cleanName(m[1]!);
      const value = resolveTags(cleanName(m[2]!));
      return {
        action: { type: 'fill', target: target(roleFromPhrase(m[1]!, 'textbox'), field, origin), value: { kind: 'literal', value } },
        intent: `Fill ${field} with "${value}"`,
      };
    },
  },
  {
    name: 'wait',
    pattern: /^wait (?:for|until)\s+(.+?)(?:\s+to\s+(?:load|appear|finish))?$/i,
    confidence: 0.7,
    build: (m, origin) => ({
      action: {
        type: 'waitFor',
        condition: { type: 'elementVisible', target: target('region', cleanName(m[1]!), origin), timeoutMs: 15_000 },
      },
      intent: `Wait for ${cleanName(m[1]!)}`,
    }),
  },
  {
    name: 'click',
    pattern: /^(?:click|press|tap|select|choose)\s+(?:on\s+)?(.+)$/i,
    confidence: 0.9,
    build: (m, origin) => {
      const name = cleanName(m[1]!);
      return {
        action: { type: 'click', target: target(roleFromPhrase(m[1]!, 'button'), name, origin) },
        intent: `Click ${name}`,
      };
    },
  },
  {
    name: 'verify-text',
    pattern: /^(?:verify|check|confirm|ensure|expect|assert)\s+(?:that\s+)?(.+?)(?:\s+(?:is|are)\s+(?:visible|shown|displayed|present))?$/i,
    confidence: 0.75,
    build: (m, origin) => {
      const text = cleanName(m[1]!.replace(/\s+appears?$/i, '').replace(/^(the|a|an)\s+/i, ''));
      return {
        action: { type: 'screenshot', label: `Verify ${text}` },
        intent: `Verify "${text}" is present`,
        assertText: text,
      };
    },
  },
];

/** Splits free text into candidate instruction lines. */
export function splitInstructions(text: string): string[] {
  return text
    .split(/\r?\n|(?<=[.;])\s+(?=[A-Z])|\s+then\s+/i)
    .map((line) => line.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim())
    .filter((line) => line.length > 0);
}

export function parseLine(line: string, index: number): ParsedLine {
  for (const rule of RULES) {
    const match = line.match(rule.pattern);
    if (!match) continue;

    const origin = provenance(rule.confidence, `Matched the "${rule.name}" phrasing rule.`);
    const { action, intent, assertText } = rule.build(match, origin);

    const step: Step = {
      id: `s${index}`,
      index,
      intent,
      action,
      preWaits: [],
      postWaits: action.type === 'click' || action.type === 'navigate' ? [{ type: 'networkQuiescent', idleMs: 500, ignorePatterns: [] }] : [],
      assertions: assertText
        ? [{
            type: 'textPresent',
            text: { kind: 'literal', value: assertText },
            match: 'contains',
            negate: false,
            origin,
            severity: 'high',
            describe: `Expected to find "${assertText}" on the page.`,
          }]
        : [],
      expected: assertText ? `"${assertText}" is visible` : undefined,
      evidence: { screenshot: 'always', fullPage: false, console: true, network: true, domSnapshot: 'on-failure' },
      onFailure: 'continue',
      timeoutMs: 30_000,
      riskTags: ['read-only'],
      provenance: origin,
    };

    return { step };
  }

  return {
    question: {
      question: `Could not interpret: "${line}"`,
      assumedAnswer: 'Skipped — no matching instruction pattern. Rephrase using verbs like go to, click, enter … into, verify, or wait for.',
    },
  };
}
