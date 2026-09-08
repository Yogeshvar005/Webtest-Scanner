import { executeScenario } from './packages/runner/src/execute';

async function run() {
  console.log('Starting crawler test...');
  const result = await executeScenario({
    scenario: {
      id: 'test-scenario',
      name: 'Test Scenario',
      steps: [
        {
          id: 'step-0',
          index: 0,
          intent: 'Navigate to target',
          action: { type: 'navigate', path: '/' },
          assertions: [],
          preWaits: [],
          timeoutMs: 30000,
          onFailure: 'abort',
          provenance: { source: 'user', confidence: 1 },
        },
        {
          id: 'step-1',
          index: 1,
          intent: 'Explore the site',
          action: {
            type: 'explore',
            maxDepth: 2
          },
          assertions: [],
          preWaits: [],
          timeoutMs: 60000,
          onFailure: 'abort',
          provenance: { source: 'user', confidence: 1 },
        }
      ]
    },
    targetUrl: 'https://www.etihad.com/en-in/',
    policyRequest: {
      target: { targetId: 'test', ownershipTier: 1, url: 'https://www.etihad.com/en-in/' },
      subject: { id: 'test-user', roles: ['tester'] },
      policyClass: 'passive',
      environment: 'DEV',
      dataLineage: 'test-created',
      budget: { requestsAllowedToday: 100, requestsUsedToday: 0 }
    },
    artifactDir: './artifacts',
    artifactUrlPrefix: '/artifacts',
    runId: 'test-run-123',
    headless: false,
  });

  console.log('Finished crawler test:');
  console.log('Steps:', JSON.stringify(result.steps, null, 2));
  console.log('Findings:', JSON.stringify(result.findings, null, 2));
}

run().catch(console.error);
