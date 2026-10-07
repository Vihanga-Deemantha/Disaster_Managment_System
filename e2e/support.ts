import { expect, type Page } from '@playwright/test';
import { DEFAULT_DEMO_PASSWORD } from '../backend/src/shared/auth/seed/demoAccounts';

/** The seeded demo password (override with SEED_PASSWORD when you seeded with your own). */
export const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? DEFAULT_DEMO_PASSWORD;

export async function signInAs(page: Page, identifier: string, password = DEMO_PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Phone number or email').fill(identifier);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

export const dmcHeading = (page: Page) =>
  page.getByRole('heading', { level: 1, name: 'Pending Approvals' });

export async function signInAsDmcOfficer(page: Page) {
  await signInAs(page, 'dmc.officer@safezone.lk');
  await expect(dmcHeading(page)).toBeVisible();
}

/** Wait until the service worker controls the page, so a later offline reload is served from its cache. */
export async function waitForServiceWorker(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
}
