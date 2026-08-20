# Webtest Scanner

Paste a URL, describe a test in plain English, and a real browser works through
it — capturing a screenshot after every step.

```
go to /
search for laptop
verify results are visible
check accessibility
```

The sentence above becomes a validated, structured test scenario, runs in
Chromium, and produces a step-by-step report with screenshot evidence.

---

## What it does

Pick which kinds of testing to run; the report covers exactly those and nothing
else.

| Category | What it checks | Needs |
|---|---|---|
| **Functional** | Your scenario: navigation, forms, clicks, assertions | — |
| **UI / visual** | Broken images, horizontal overflow, clipped text, tap targets, obscured controls | — |
| **Design & assets** | Colour palette, type scale, spacing rhythm, layout, component and asset inventory | — |
| **Accessibility** | axe-core, WCAG 2.1 AA | — |
| **Security (passive)** | Headers, cookie flags, TLS, mixed content, insecure form actions | — |
| **Security (active)** | Reflected-input encoding, error verbosity, exposed `.git`/`.env` | Tier 2 |
| **Performance** | Paint, TTFB, DOM ready, transfer weight, request count | — |
| **API / contract** | Status codes, latency, content types on observed XHR | — |
| **Unit tests** | Reports not-applicable against a URL, and says why | Repo access |

**Strict mode** promotes every warning to a failure. Heuristic checks (overlap,
clipped text, tap targets) only warn by default, because they produce false
positives on real sites and a report that cries wolf gets ignored.

---

## Architecture

The keystone is a **structured Test DSL** sitting between the natural-language
layer and execution. The AI never executes anything; it emits data that is
validated, linted and policy-checked first.

```
plain English
   ↓
NLP parser ──────────────► Structured Test DSL (Zod)
   ↓                              ↓
                            lint (semantic rules)
                                  ↓
                            policy engine  ── deny / approve / allow
                                  ↓
                            Playwright runner ── egress guard
                                  ↓
                       screenshots · findings · category report
```

### Packages

| Package | Role |
|---|---|
| `@wts/dsl` | Zod schemas for scenarios, steps, semantic targets, assertions + lint rules |
| `@wts/policy` | Deny-by-default authorization: environment × policy class × tier × data lineage |
| `@wts/ownership` | DNS TXT domain verification, capability tiers, denylist, attestation |
| `@wts/nlp` | Sanitisation, injection detection, deterministic scenario parser |
| `@wts/semantic` | Page observation and element modelling |
| `@wts/analyzers` | Per-category analyzers and the category registry |
| `@wts/runner` | Playwright execution, egress guard, semantic resolution |
| `@wts/web` | Next.js UI and orchestration API |

### Three design decisions worth knowing

**The DSL has no escape hatch.** There is no `evaluateJs`, no `rawSelector`, no
shell access, and `navigate` takes a *path* plus a reference into a verified
origin allowlist — it cannot express an arbitrary URL. This absence, not prompt
wording, is what bounds prompt injection. Page content can only ever populate
fields of a fixed schema whose action vocabulary is closed.

**There is no `sleep` action.** Only real wait conditions exist — element
visible, network quiescent, DOM stable, navigation complete. Condition-based
waiting is enforced by omission rather than convention.

**Secrets are references, never values.** A credential is
`{kind: 'secret', name: 'ADMIN_PASSWORD'}`, resolved inside the worker at fill
time and immediately registered with the redactor. Nothing sensitive reaches
model context, so there is nothing to exfiltrate.

---

## Authorization model

Testing a site you do not control can be unlawful. Capability is tied to proven
ownership:

| Tier | Proof | Permits |
|---|---|---|
| **0** | none | Observation only — GET/HEAD, ≤1 rps, screenshots, accessibility, passive inspection |
| **1** | DNS TXT record | Forms, CRUD, authenticated journeys, API tests, asset capture |
| **2** | DNS + signed attestation | Active security probing, authorization matrix, IDOR, session probes |

A **hard denylist** outranks verification entirely — government and military
domains, cloud control planes, and any host resolving to a private, loopback or
cloud-metadata address are refused before a browser is even launched.

Inventory and capture are deliberately separated. Reading what a browser
rendered copies nothing and runs at tier 0. Downloading the actual image and
font files reproduces copyrighted work, so it requires tier 1.

---

## Running it

```bash
npm install
npx playwright install chromium
npm run dev --workspace @wts/web
```

Then open http://localhost:3000.

```bash
npm test                        # 352 unit tests
npm run test:coverage           # with thresholds
npm run e2e --workspace @wts/web  # 11 browser tests
```

Coverage is 100% lines and functions, with **100% branch coverage enforced** on
every security-critical module: the DSL linter, the policy engine, DNS
verification, the denylist, the tier logic, the egress guard and the sanitiser.

---

## Honest limitations

- **Unit testing a site you only have a URL for is impossible.** Unit tests
  exercise functions in source you possess. Everything here is black-box. The
  category exists so the answer is explicit rather than silently missing.
- **Real Safari cannot run on Linux.** Playwright's WebKit is an approximation,
  and the report says so.
- **A category where nothing ran never reports as passing.** axe cannot inject
  under a strict CSP; that reports *skipped* with the exact reason. Absence of
  evidence is never rendered as evidence of absence.
- **Prompt injection is bounded, not solved.** The architecture limits an
  injection's blast radius to the DSL's expressive power plus the egress
  allowlist. That is a real guarantee, not an elimination.
- **Heuristic UI checks produce false positives.** Overlap and clipping warn
  rather than fail by default, deliberately.
- **The NLP layer is currently a deterministic rule-based parser.** It handles a
  fixed verb vocabulary and turns anything else into an open question rather
  than guessing. The Claude-backed path is not wired up yet.
- **No PDF export yet.**

## Status

Working locally end to end. Firebase, Cloud Run and Vercel deployment are
planned but not yet provisioned.
