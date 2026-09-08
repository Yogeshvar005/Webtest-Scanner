import { executeScenario } from './packages/runner/src/execute';

async function run() {
  const targetUrl = process.argv[2] || 'https://www.etihad.com/en-in/';
  console.log(`Starting crawler test on ${targetUrl}...`);
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
    targetUrl: targetUrl,
    policyRequest: {
      target: { targetId: 'test', ownershipTier: 1, url: targetUrl },
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

  if (result) {
    console.log('Finished crawler test:');
    console.log('Steps:', JSON.stringify(result.steps, null, 2));
    console.log('Findings:', JSON.stringify(result.findings, null, 2));
  } else {
    console.log('Crawler test failed: No result returned.');
  }
}

run().catch(error => {
  console.error('Crawler execution encountered a fatal error:', error);
  process.exit(1);
});
