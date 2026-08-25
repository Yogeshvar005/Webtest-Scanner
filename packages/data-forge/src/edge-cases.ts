/**
 * A collection of SQL injection payloads for testing
 */
export const sqlInjectionPayloads = [
  "' OR '1'='1",
  "' OR 1=1--",
  "admin' --",
  "\" OR \"1\"=\"1",
  "'; DROP TABLE users--",
  "1; DROP TABLE users",
  "1'1"
];

/**
 * A collection of Cross-Site Scripting (XSS) payloads for testing
 */
export const xssPayloads = [
  "<script>alert(1)</script>",
  "\"><script>alert(1)</script>",
  "<img src=x onerror=alert(1)>",
  "javascript:alert(1)",
  "'-prompt(1)-'",
  "<svg onload=alert(1)>"
];

/**
 * A collection of boundary strings for testing input limits and Unicode handling
 */
export const boundaryStrings = [
  "",
  " ",
  "a".repeat(255),
  "a".repeat(256),
  "a".repeat(1024),
  "null\u0000byte",
  "¡¢£¤¥¦§¨©ª",
  "🤷‍♂️🤷‍♀️",
  "﷽",
  "1234567890"
];

/**
 * Get a random element from an array
 */
export function getRandomElement<T>(array: T[]): T {
  if (array.length === 0) throw new Error('Cannot get random element from an empty array');
  return array[Math.floor(Math.random() * array.length)] as T;
}

/**
 * Get a random SQL injection payload
 */
export function getRandomSqlInjection(): string {
  return getRandomElement(sqlInjectionPayloads);
}

/**
 * Get a random XSS payload
 */
export function getRandomXssPayload(): string {
  return getRandomElement(xssPayloads);
}

/**
 * Get a random boundary string
 */
export function getRandomBoundaryString(): string {
  return getRandomElement(boundaryStrings);
}
