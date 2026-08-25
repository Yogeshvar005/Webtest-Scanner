# Webtest Scanner

> **Automated, intelligent web application testing and auditing driven by plain English.**
> Paste a URL, describe what to test, and a real Chromium browser executes every step — capturing screenshot evidence, auditing accessibility, inspecting network security, and extracting design tokens.

---

## 🚀 How It Works

```mermaid
flowchart TD
    User([User / Tester]) -->|Plain English Scenario| NLP[NLP & Dynamic Mocking Engine]
    NLP -->|Parse & Sanitize| DSL[Structured Test DSL - Zod]
    DSL -->|Validate & Lint| Policy[Deny-by-Default Policy Engine]
    Policy -->|Ownership Tier Verification| Runner[Playwright / Serverless Chromium Runner]
    Runner -->|Egress Guard Filter| Browser[Live Target Website]
    Browser -->|Screenshots & DOM Snapshots| Runner
    Browser -->|Network & Performance Traces| Analyzers[Multi-Category Analyzers]
    Analyzers -->|WCAG, Visual, Security, Design| Report[Interactive Report & PDF Engine]
    Report -->|Render| Dashboard[Web Dashboard / Exported PDF]
```

### The 6-Stage Execution Pipeline

1. **Natural Language Translation & Data Mocking (`@wts/nlp`, `@wts/data-forge`)**:
   - Accepts freeform English instructions (e.g., `go to /`, `search for shoes`, `fill Email with {{random.email}}`).
   - Dynamically evaluates mock data placeholders (`{{random.uuid}}`, `{{random.email}}`, `{{random.string}}`, and security edge case payloads).
   - Sanitizes input and checks for prompt injection attempts before compilation.

2. **Strict Test DSL Compilation & Linting (`@wts/dsl`)**:
   - Compiles user intent into a closed, strongly-typed schema validated with **Zod**.
   - No arbitrary code execution or raw selector injections — actions are strictly bounded to verbs like `navigate`, `click`, `fill`, `assert`, and `wait`.
   - Runs semantic lint rules to detect impossible steps or missing prerequisites.

3. **Deny-by-Default Policy & Ownership Guard (`@wts/policy`, `@wts/ownership`)**:
   - Evaluates target ownership tiers (Tier 0: Observation, Tier 1: DNS Verified, Tier 2: Signed Attestation).
   - Blocks forbidden domains (government, military, cloud metadata, private/internal IP ranges) before launching a browser.
   - Enforces rate limits, allowed HTTP methods, and data lineage tracking.

4. **Real Headless Browser Automation (`@wts/runner`)**:
   - Launches a real Chromium browser via **Playwright** (or `@sparticuz/chromium` in serverless cloud environments like Vercel).
   - Traverses user journeys with resilient retry strategies, timeout handling, and automatic mitigation of hanging background requests (`window.stop()`).
   - Enforces an **Egress Guard** on network traffic to block unauthorized origin leakages.

5. **Multi-Category Auditing & Verification (`@wts/analyzers`)**:
   - **Functional**: Validates DOM state, assertions, forms, and journey outcomes.
   - **UI / Visual**: Identifies broken images, horizontal overflows, clipped text containers, small tap targets, and overlapping elements.
   - **Design & Assets**: Extracts typography scale, color palettes, spacing rhythm, and layout structures.
   - **Accessibility**: Audits WCAG 2.1 AA compliance using **axe-core**.
   - **Passive Security**: Inspects HTTPS enforcement, CSP, security response headers, cookie flags, mixed content, and insecure form actions.
   - **Performance**: Records TTFB, First Paint, DOM Ready time, request counts, and resource transfer weight.

6. **Interactive Reporting & Server PDF Generation (`@wts/web`)**:
   - Renders a real-time, tabbed results dashboard with step-by-step screenshot timelines.
   - Generates downloadable, print-optimized **PDF reports** on demand.

---

## 🛠️ Tech Stack

### Frontend & Application Layer
* **Framework**: [Next.js 15](https://nextjs.org/) (App Router, Turbopack compatible)
* **UI Library**: [React 19](https://react.dev/)
* **Language**: [TypeScript 5](https://www.typescriptlang.org/) (Strict Mode)
* **Styling**: Pure Modern CSS with Glassmorphism, CSS Custom Properties Design Tokens, and Micro-animations
* **Authentication**: [Firebase Authentication v12](https://firebase.google.com/products/auth) (Google Sign-In, Email/Password, AuthContext Provider)

### Automation & Testing Engines
* **Browser Automation**: [Playwright](https://playwright.dev/) & `playwright-core`
* **Serverless Browser Runtime**: [`@sparticuz/chromium`](https://github.com/Sparticuz/chromium) (Vercel & AWS Lambda execution)
* **Accessibility Auditor**: [`axe-core`](https://github.com/dequelabs/axe-core)
* **Schema Validation & Typing**: [Zod 3](https://zod.dev/)

### Monorepo & Tooling
* **Build System**: [Turborepo 2](https://turbo.build/repo)
* **Package Manager**: npm workspaces
* **Unit Testing**: [Vitest](https://vitest.dev/) (353 unit tests, 100% security critical branch coverage)
* **Deployment & Cloud**: [Vercel](https://vercel.com/) + Google Firebase (`webtest-scanner-7989`)

---

## 📦 Monorepo Package Architecture

```
Webtest Scanner/
├── apps/
│   └── web/                 # Next.js 15 Web Application & Serverless API Routes
│       ├── src/app/         # Dashboard UI, /login authentication, and /api/run endpoint
│       └── src/lib/         # Firebase SDK client and React AuthContext
├── packages/
│   ├── analyzers/           # WCAG, UI, Design, Security, and Performance analyzers
│   ├── data-forge/          # Mock data generator (UUID, Strings, Emails, Security Payloads)
│   ├── dsl/                 # Zod schemas for Test DSL, semantic targets, assertions, and linter
│   ├── nlp/                 # Rule-based natural language parser & injection sanitization
│   ├── ownership/           # DNS TXT verification, capability tiers, and domain denylists
│   ├── policy/              # Deny-by-default policy matrix engine
│   └── runner/              # Playwright execution engine, egress guard, and serverless chromium
├── firebase.json            # Firebase Authentication provider deployment configuration
└── vercel.json              # Monorepo build and serverless deployment configuration
```

---

## 🛡️ Authorization & Capability Tiers

Testing a website you do not own must be handled responsibly. Capabilities are gated by proven ownership:

| Tier | Proof Required | Permitted Capabilities |
|---|---|---|
| **Tier 0** | None (Public) | Observation only: GET/HEAD requests, ≤1 rps, screenshots, accessibility audit, passive security header checks |
| **Tier 1** | DNS TXT Record | Form submissions, CRUD operations, authenticated user journeys, API contract inspection, asset downloads |
| **Tier 2** | DNS TXT + Signed Attestation | Active security probing, authorization matrices, IDOR detection, session token audits |

> **Hard Denylist**: Critical infrastructure, military/government domains (`.gov`, `.mil`), and internal/private IP ranges (`10.0.0.0/8`, `192.168.0.0/16`, `169.254.169.254`) are permanently blocked regardless of tier.

---

## ⚡ Quick Start

### 1. Prerequisites
* Node.js 20+
* npm 10+

### 2. Installation & Setup
```bash
# Clone repository
git clone https://github.com/Yogeshvar005/Webtest-Scanner.git
cd Webtest-Scanner

# Install all workspace dependencies
npm install

# Install local Playwright Chromium browser
npx playwright install chromium

# Copy environment variables template
cp .env.example apps/web/.env.local
```

### 3. Run Locally
```bash
# Start development server
npm run dev

# Open in browser: http://localhost:3000
```

### 4. Running Test Suites
```bash
# Run all 353 unit tests
npm test

# Run tests with coverage reporting
npm run test:coverage

# Run TypeScript typechecks across all 8 packages
npm run typecheck
```

---

## ☁️ Deployment (Vercel + Firebase)

1. **Fork or Push** this repository to your GitHub account.
2. Import the project in [**Vercel**](https://vercel.com/new).
3. Add the following **Environment Variables** in Vercel project settings:
   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY="AIzaSyBQsk5zYBjIg4gM4GoAk6_sVag4KiYh-mw"
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="webtest-scanner-7989.firebaseapp.com"
   NEXT_PUBLIC_FIREBASE_PROJECT_ID="webtest-scanner-7989"
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="webtest-scanner-7989.firebasestorage.app"
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="691795827516"
   NEXT_PUBLIC_FIREBASE_APP_ID="1:691795827516:web:c48bede0a7b991cd11dc39"
   ```
4. Click **Deploy**.
5. Once live, add your Vercel URL (e.g. `your-app.vercel.app`) to your [**Firebase Authorized Domains**](https://console.firebase.google.com/project/webtest-scanner-7989/authentication/settings).

---

## 📄 License

MIT License. Designed and built with strict security-first principles.
