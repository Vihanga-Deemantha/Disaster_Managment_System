import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { DEMO_PASSWORD, dmcHeading, signInAs } from './support';

/**
 * Not a test: it takes the UC-1 screenshots for report section 3.3 (and for a quick look at the layout).
 *   UC1_SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
 * The pictures go to `reports/uc1-screenshots/` (git-ignored). Skipped in a normal run, because it
 * issues three of the five demo warnings and would use up the data other specs expect.
 */
const OUT = 'reports/uc1-screenshots';
test.skip(!process.env.UC1_SCREENSHOTS, 'only when UC1_SCREENSHOTS=1');
test.use({ viewport: { width: 1280, height: 900 } });

const shot = (page: Page, name: string, fullPage = true) =>
  page.screenshot({ path: `${OUT}/${name}.png`, fullPage });

const reviewLink = (page: Page, hazard: string, area: string) =>
  page.getByRole('link', { name: `Review the ${hazard} warning for ${area}` });

async function setGateway(page: Page, channel: string, mode: string) {
  const panel = page.locator('details', { hasText: 'Demo controls: simulated gateways' });
  if (!(await panel.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await panel.locator('summary').click();
  }
  await panel.getByLabel(`${channel} gateway`).selectOption({ label: mode });
}

async function issue(page: Page) {
  await page.getByRole('button', { name: 'Approve & Issue' }).click();
  const dialog = page.getByRole('dialog', { name: 'Issue this warning?' });
  await dialog.getByLabel('Your password').fill(DEMO_PASSWORD);
  await dialog.getByRole('button', { name: 'Issue warning now' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Warning issued' })).toBeVisible();
  await expect(page.getByText('Citizens alerted')).toBeVisible();
}

test('UC-1 screenshots', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await signInAs(page, 'dmc.officer2@safezone.lk');
  await expect(dmcHeading(page)).toBeVisible();
  await expect(reviewLink(page, 'Flood', 'Gampaha')).toBeVisible();
  await shot(page, '1-pending-approvals');

  await reviewLink(page, 'Flood', 'Gampaha').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Review warning' })).toBeVisible();
  await expect(page.getByTestId('map').or(page.locator('.leaflet-container'))).toBeVisible();
  await page.waitForTimeout(1500); // let the map tiles arrive
  await shot(page, '2-review-warning');

  await page.getByRole('tab', { name: 'தமிழ்' }).click();
  await shot(page, '2b-review-tamil-text', false);

  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('textbox', { name: 'Text in தமிழ்' }).fill('');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await shot(page, '3-edit-warning-with-error');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Reject' }).click();
  await shot(page, '4-reject-dialog', false);
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('checkbox', { name: /WhatsApp/ }).check();
  await page.getByRole('button', { name: 'Approve & Issue' }).click();
  await page.getByRole('dialog').getByLabel('Your password').fill(DEMO_PASSWORD);
  await shot(page, '5-confirm-issue-dialog', false);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('checkbox', { name: /WhatsApp/ }).uncheck();

  await issue(page);
  await shot(page, '6-delivery-summary');

  await page.getByRole('link', { name: 'Back to Pending Approvals' }).click();
  await reviewLink(page, 'Landslide', 'Ratnapura').click();
  await setGateway(page, 'Push notification', 'Some sends fail');
  await issue(page);
  await shot(page, '7-delivery-summary-partial');
  await setGateway(page, 'Push notification', 'Working');

  await page.getByRole('link', { name: 'Back to Pending Approvals' }).click();
  await reviewLink(page, 'Landslide', 'Kegalle').click();
  await setGateway(page, 'Push notification', 'Down');
  await setGateway(page, 'SMS', 'Down');
  await issue(page);
  await shot(page, '8-delivery-summary-outage');
  await setGateway(page, 'Push notification', 'Working');
  await setGateway(page, 'SMS', 'Working');

  await page.getByRole('link', { name: 'Back to Pending Approvals' }).click();
  await shot(page, '9-pending-approvals-after');
  await reviewLink(page, 'Flood', 'Kalu Ganga basin').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Review warning' })).toBeVisible();
  await page.waitForTimeout(1000);
  await page.context().setOffline(true);
  await expect(page.getByText('You are offline. Showing saved data.')).toBeVisible();
  await shot(page, '10-review-offline');
  await page.context().setOffline(false);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'Back to Pending Approvals' }).click();
  await expect(dmcHeading(page)).toBeVisible();
  await shot(page, '11-pending-approvals-phone');
});
