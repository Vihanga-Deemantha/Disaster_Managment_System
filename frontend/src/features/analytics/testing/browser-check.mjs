/* global URL, process, navigator, document, window */
import { chromium, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const evidence = fileURLToPath(new URL('../evidence/', import.meta.url));
await mkdir(`${evidence}/screenshots`, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.UC4_CHROMIUM_EXECUTABLE,
});
const failures = [];
const origin = 'http://localhost:4184';
async function signIn(context, email) {
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(error.message));
  await page.goto(`${origin}/analytics`);
  await page.getByLabel('Phone number or email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('SafeZone#Demo2026');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Citizens reached', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate Analytics' })).toBeEnabled();
  return page;
}
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
try {
  const page = await signIn(context, 'dmc.officer@safezone.lk');
  expect(
    (
      await page.request.put(`${origin}/api/dev/pdf-exporter`, {
        headers: { 'X-Requested-With': 'SafeZone' },
        data: { mode: 'OK' },
      })
    ).status(),
  ).toBe(200);
  await page.screenshot({ path: `${evidence}/screenshots/01-dashboard.png`, fullPage: true });
  await page.getByRole('button', { name: 'Export Audit Report' }).click();
  await page.screenshot({ path: `${evidence}/screenshots/02-export-options.png` });
  const [pdf] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Confirm & Download' }).click(),
  ]);
  await pdf.saveAs(`${evidence}/impact-report.pdf`);
  const pdfBytes = await readFile(`${evidence}/impact-report.pdf`);
  expect(pdfBytes.subarray(0, 4).toString()).toBe('%PDF');
  await expect(page.locator('.uc4-success code')).toHaveText(
    createHash('sha256').update(pdfBytes).digest('hex'),
  );
  await page.screenshot({ path: `${evidence}/screenshots/03-export-success.png` });
  await page.getByRole('button', { name: 'Close', exact: true }).first().click();
  await page.getByText('View daily reach and event logs').click();
  await page.locator('.uc4-log-link').first().click();
  await expect(page.getByRole('dialog')).toContainText('matching records');
  await page.screenshot({ path: `${evidence}/screenshots/04-event-log.png` });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  const toggle = await page.request.put(`${origin}/api/dev/pdf-exporter`, {
    headers: { 'X-Requested-With': 'SafeZone' },
    data: { mode: 'FAIL_ALWAYS' },
  });
  expect(toggle.status()).toBe(200);
  await page.getByRole('button', { name: 'Export Audit Report' }).click();
  await page.getByRole('button', { name: 'Confirm & Download' }).click();
  await expect(page.getByRole('button', { name: 'Export CSV instead' })).toBeVisible();
  const [csv] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export CSV instead' }).click(),
  ]);
  await csv.saveAs(`${evidence}/impact-report.csv`);
  expect(await page.locator('.uc4-success code').innerText()).toBe(
    createHash('sha256')
      .update(await readFile(`${evidence}/impact-report.csv`))
      .digest('hex'),
  );
  await page.getByRole('button', { name: 'Close', exact: true }).first().click();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText(/Cached results as of/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate Analytics' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Export Audit Report' })).toBeDisabled();
  await page.screenshot({ path: `${evidence}/screenshots/05-offline.png`, fullPage: true });
  await context.setOffline(false);
  await context.close();
  for (const [role, email, organization] of [
    ['ngo', 'ngo.manager@safezone.lk', 'org-red-cross'],
    ['donor', 'donor@safezone.lk', 'org-relief-foundation'],
  ]) {
    const scopedContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    });
    const scoped = await signIn(scopedContext, email);
    await expect(scoped.locator('.uc4-scope')).toContainText('Showing:');
    const response = await scoped.request.get(`${origin}/api/analytics/summary`);
    const summary = await response.json();
    expect(summary.metrics.allocations.every((row) => row.organizationId === organization)).toBe(
      true,
    );
    const denied = await scoped.request.post(`${origin}/api/analytics/query`, {
      headers: { 'X-Requested-With': 'SafeZone' },
      data: { ...summary.filter, organizationId: 'other' },
    });
    expect(denied.status()).toBe(403);
    await scoped.screenshot({
      path: `${evidence}/screenshots/06-${role}-scope.png`,
      fullPage: true,
    });
    await scoped.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() => scoped.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    await scoped.screenshot({
      path: `${evidence}/screenshots/07-${role}-mobile.png`,
      fullPage: true,
    });
    const width = await scoped.evaluate(() => ({
      width: window.innerWidth,
      scroll: document.documentElement.scrollWidth,
      overflow: [...document.querySelectorAll('*')]
        .filter(
          (el) =>
            el.getBoundingClientRect().right > window.innerWidth + 2 &&
            el.getBoundingClientRect().width > 50,
        )
        .map((el) => ({
          tag: el.tagName,
          class: el.className,
          width: el.getBoundingClientRect().width,
        }))
        .slice(0, 12),
    }));
    if (width.scroll > width.width) process.stdout.write(JSON.stringify(width) + '\n');
    expect(width.scroll <= width.width).toBe(true);
    await scopedContext.close();
  }
  expect(failures).toEqual([]);
  process.stdout.write(
    'UC-4 browser checks passed: PDF checksum, CSV fallback, log, offline reload, NGO/Donor scopes, mobile width.\n',
  );
} finally {
  await browser.close();
}
