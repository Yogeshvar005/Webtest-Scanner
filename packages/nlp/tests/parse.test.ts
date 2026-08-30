import { describe, expect, test } from 'vitest';
import { Scenario } from '@wts/dsl';
import { parseLine, parseScenario, splitInstructions } from '../src/index';

const base = { targetId: 'example.com', environment: 'QA' as const };

function stepsFor(instructions: string) {
  return parseScenario({ ...base, naturalLanguage: instructions }).scenario.steps;
}

describe('splitInstructions', () => {
  test('splits on newlines', () => {
    expect(splitInstructions('go to /\nclick Login')).toEqual(['go to /', 'click Login']);
  });

  test('strips list markers and numbering', () => {
    expect(splitInstructions('1. go to /\n- click Login\n* verify Home')).toEqual([
      'go to /', 'click Login', 'verify Home',
    ]);
  });

  test('splits on "then"', () => {
    expect(splitInstructions('click Login then verify Dashboard')).toEqual(['click Login', 'verify Dashboard']);
  });

  test('drops blank lines', () => {
    expect(splitInstructions('go to /\n\n   \nclick Login')).toHaveLength(2);
  });
});

describe('rule ordering', () => {
  test('"check accessibility" is an audit, not a text assertion', () => {
    // `verify-text` also matches this phrasing, so it must be tried last.
    expect(parseLine('check accessibility', 0).step?.action.type).toBe('a11yAudit');
  });

  test('"check" followed by anything else is still a text assertion', () => {
    expect(parseLine('check the order total', 0).step?.assertions[0]?.type).toBe('textPresent');
  });

  test('"verify X" is still a text assertion', () => {
    const steps = stepsFor('go to /\nverify Welcome');
    const verify = steps[1]!;
    expect(verify.assertions[0]!.type).toBe('textPresent');
  });
});

describe('action parsing', () => {
  test.each([
    ['go to /checkout', 'navigate'],
    ['open /cart', 'navigate'],
    ['navigate to /login', 'navigate'],
    ['click Sign in', 'click'],
    ['press Submit', 'click'],
    ['enter alice into Username', 'fill'],
    ['fill Email with a@b.com', 'fill'],
    ['search for laptop', 'fill'],
    ['wait for the results to load', 'waitFor'],
    ['take a screenshot', 'screenshot'],
  ])('%s parses as %s', (line, expected) => {
    const parsed = parseLine(line, 0);
    expect(parsed.step?.action.type).toBe(expected);
  });

  test('normalises a bare word into a path', () => {
    const parsed = parseLine('go to checkout', 0);
    expect(parsed.step?.action).toMatchObject({ type: 'navigate', path: '/checkout' });
  });

  test('strips an absolute URL down to its path, so the origin stays ours', () => {
    const parsed = parseLine('go to https://evil.example/steal', 0);
    // The DSL cannot express a foreign origin; only the path survives.
    expect(parsed.step?.action).toMatchObject({ type: 'navigate', path: '/steal', originRef: 'primary' });
  });

  test('infers a password role from the field name', () => {
    const parsed = parseLine('enter hunter2 into the Password field', 0);
    expect(parsed.step?.action).toMatchObject({ target: { role: 'password' } });
  });

  test('infers a link role', () => {
    const parsed = parseLine('click the Docs link', 0);
    expect(parsed.step?.action).toMatchObject({ target: { role: 'link', name: 'Docs' } });
  });

  test('strips articles and trailing nouns from a target name', () => {
    const parsed = parseLine('click the Login button', 0);
    expect(parsed.step?.action).toMatchObject({ target: { name: 'Login' } });
  });

  test('strips conversational trailing clauses like "and show next page"', () => {
    const parsed1 = parseLine('Click sign up and show next page', 0);
    expect(parsed1.step?.action).toMatchObject({
      type: 'click',
      target: { name: 'sign up' },
    });

    const parsed2 = parseLine('Click sign up and show me what comes', 0);
    expect(parsed2.step?.action).toMatchObject({
      type: 'click',
      target: { name: 'sign up' },
    });

    const parsed3 = parseLine('Click sign up and see what happens', 0);
    expect(parsed3.step?.action).toMatchObject({
      type: 'click',
      target: { name: 'sign up' },
    });
  });

  test('splits compound instructions with "and click/verify/take"', () => {
    expect(splitInstructions('Click sign up and take a screenshot')).toEqual([
      'Click sign up',
      'take a screenshot',
    ]);
  });

  test('returns an open question rather than guessing at gibberish', () => {
    const parsed = parseLine('flurble the wibbly', 0);
    expect(parsed.step).toBeUndefined();
    expect(parsed.question?.question).toContain('Could not interpret');
  });
});

describe('parseScenario', () => {
  test('produces a schema-valid scenario', () => {
    const { scenario } = parseScenario({ ...base, naturalLanguage: 'go to /\nclick Login' });
    expect(Scenario.safeParse(scenario).success).toBe(true);
  });

  test('preserves the tester\'s original wording for the audit trail', () => {
    const text = 'go to /\nclick Login';
    const { scenario } = parseScenario({ ...base, naturalLanguage: text });
    expect(scenario.originalNaturalLanguage).toBe(text);
  });

  test('prepends a navigation step when the tester did not start with one', () => {
    const steps = stepsFor('click Login');
    expect(steps[0]!.action.type).toBe('navigate');
    expect(steps[0]!.provenance.source).toBe('generated');
  });

  test('does not prepend when the tester already navigated', () => {
    const steps = stepsFor('go to /\nclick Login');
    expect(steps.filter((s) => s.action.type === 'navigate')).toHaveLength(1);
  });

  test('records unparsed lines as open questions rather than dropping them', () => {
    const { scenario, unparsed } = parseScenario({ ...base, naturalLanguage: 'go to /\nfrobnicate the widget' });
    expect(unparsed).toEqual(['frobnicate the widget']);
    expect(scenario.openQuestions[0]!.question).toContain('frobnicate');
  });

  test('falls back to opening the target when nothing is understood', () => {
    const { scenario } = parseScenario({ ...base, naturalLanguage: 'asdf qwer' });
    expect(scenario.steps).toHaveLength(1);
    expect(scenario.steps[0]!.action.type).toBe('navigate');
  });

  test('handles empty input without throwing', () => {
    expect(() => parseScenario({ ...base, naturalLanguage: '' })).not.toThrow();
  });

  test('classifies a read-only scenario as passive', () => {
    const { scenario } = parseScenario({ ...base, naturalLanguage: 'go to /\nverify Welcome' });
    expect(scenario.policyClass).toBe('passive');
  });

  test('classifies a scenario containing input as mutating', () => {
    // Typing into a field may change server state, so it cannot be passive.
    const { scenario } = parseScenario({ ...base, naturalLanguage: 'go to /\nenter alice into Username' });
    expect(scenario.policyClass).toBe('mutating');
  });

  test('marks generated scenarios for review rather than as approved', () => {
    const { scenario } = parseScenario({ ...base, naturalLanguage: 'go to /' });
    expect(scenario.lifecycle).toBe('ai_generated');
  });

  test('numbers steps consecutively from zero', () => {
    const steps = stepsFor('click Login\nverify Dashboard\ntake a screenshot');
    expect(steps.map((s) => s.index)).toEqual([0, 1, 2, 3]);
    expect(steps.map((s) => s.id)).toEqual(['s0', 's1', 's2', 's3']);
  });

  test('reports mean confidence across the inferred steps', () => {
    const { meanConfidence } = parseScenario({ ...base, naturalLanguage: 'go to /\nclick Login' });
    expect(meanConfidence).toBeGreaterThan(0);
    expect(meanConfidence).toBeLessThanOrEqual(1);
  });

  test('uses a supplied title when given one', () => {
    const { scenario } = parseScenario({ ...base, naturalLanguage: 'go to /', title: 'Smoke test' });
    expect(scenario.title).toBe('Smoke test');
  });

  test('falls back to the first step intent for the title', () => {
    const { scenario } = parseScenario({ ...base, naturalLanguage: 'go to /pricing' });
    expect(scenario.title).toBe('Open /pricing');
  });
});

describe('data-forge integration', () => {
  test('resolves {{random.email}} in fill actions', () => {
    const { step } = parseLine('fill Email with {{random.email}}', 0);
    const action = step?.action as any;
    expect(action.type).toBe('fill');
    expect(action.value.value).toMatch(/^[a-z0-9]+@example\.com$/);
    expect(action.value.value).not.toBe('{{random.email}}');
  });
});
