import { parseScenario } from '@wts/nlp';
import { EnvName } from '@wts/dsl';

async function main() {
  const result = await parseScenario({
    naturalLanguage: 'Click all buttons available in this website',
    targetId: 'etihad.com',
    environment: 'QA' as EnvName,
    initialPath: '/'
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
