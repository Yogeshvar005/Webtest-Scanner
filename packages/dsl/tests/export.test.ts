import { describe, expect, test } from 'vitest';
import {
  exportToPlaywrightTS,
  exportToPlaywrightPython,
  exportToCypress,
  exportToSeleniumPython,
  exportCode,
} from '../src/export';
import { scenario, step, target } from './factories';

describe('Multi-Framework Code Export (KaneAI Engine)', () => {
  const sampleScenario = scenario({
    title: 'User Login Journey',
    steps: [
      step({
        id: 's0',
        index: 0,
        intent: 'Open login page',
        action: { type: 'navigate', path: '/login', originRef: 'primary' },
      }),
      step({
        id: 's1',
        index: 1,
        intent: 'Enter username',
        action: {
          type: 'fill',
          target: target({ name: 'username', selector: 'input[name="username"]' }),
          value: { kind: 'literal', value: 'testuser' },
        },
      }),
      step({
        id: 's2',
        index: 2,
        intent: 'Click submit button',
        action: {
          type: 'click',
          target: target({ name: 'Sign in', selector: 'button[type="submit"]' }),
        },
      }),
      step({
        id: 's3',
        index: 3,
        intent: 'Capture dashboard screenshot',
        action: { type: 'screenshot', label: 'Dashboard' },
      }),
    ],
  });

  const targetUrl = 'https://example.com';

  test('generates valid Playwright TypeScript code', () => {
    const code = exportToPlaywrightTS(sampleScenario, targetUrl);
    expect(code).toContain("import { test, expect } from '@playwright/test';");
    expect(code).toContain('page.goto("https://example.com/login"');
    expect(code).toContain('fill("testuser")');
    expect(code).toContain('click()');
    expect(code).toContain("screenshot({ path: 'screenshot-3.png', fullPage: true })");
  });

  test('generates valid Playwright Python code', () => {
    const code = exportToPlaywrightPython(sampleScenario, targetUrl);
    expect(code).toContain('import pytest');
    expect(code).toContain('from playwright.sync_api import Page, expect');
    expect(code).toContain('page.goto("https://example.com/login"');
    expect(code).toContain('fill("testuser")');
    expect(code).toContain('click()');
    expect(code).toContain("screenshot(path='screenshot-3.png')");
  });

  test('generates valid Cypress JavaScript code', () => {
    const code = exportToCypress(sampleScenario, targetUrl);
    expect(code).toContain('describe("User Login Journey"');
    expect(code).toContain('cy.visit("https://example.com/login")');
    expect(code).toContain('type("testuser")');
    expect(code).toContain('click()');
    expect(code).toContain("cy.screenshot('step-3')");
  });

  test('generates valid Selenium Python code', () => {
    const code = exportToSeleniumPython(sampleScenario, targetUrl);
    expect(code).toContain('from selenium import webdriver');
    expect(code).toContain('driver.get("https://example.com/login")');
    expect(code).toContain('send_keys("testuser")');
    expect(code).toContain('click()');
    expect(code).toContain("driver.save_screenshot('screenshot-3.png')");
  });

  test('exportCode dispatches to selected framework', () => {
    const tsCode = exportCode(sampleScenario, targetUrl, 'playwright-ts');
    expect(tsCode).toContain('@playwright/test');

    const pyCode = exportCode(sampleScenario, targetUrl, 'playwright-python');
    expect(pyCode).toContain('playwright.sync_api');

    const cyCode = exportCode(sampleScenario, targetUrl, 'cypress');
    expect(cyCode).toContain('cy.visit');

    const seCode = exportCode(sampleScenario, targetUrl, 'selenium-python');
    expect(seCode).toContain('from selenium import webdriver');
  });
});
