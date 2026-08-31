import { parseScenario } from '@wts/nlp';

const result = parseScenario({
  naturalLanguage: 'click sign up button and show me the page after that',
  targetId: 'github.com',
  environment: 'QA',
  initialPath: '/'
});

console.log(JSON.stringify(result, null, 2));
