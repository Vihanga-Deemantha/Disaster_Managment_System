import { expect, test, type Page } from '@playwright/test';
import { DEMO_PASSWORD, dmcHeading, signInAs, waitForServiceWorker } from './support';

/**
 * UC-1 Issue Warning through a real browser, the real API and the seeded database: the five pending
 * warnings of the wireframe and 200 citizens. Each test uses its own warning, so they never meet.
 *   Gampaha: the main flow · Ratnapura: some pushes fail (A1) · Kegalle: every gateway down (E2)
 *   Colombo: rejected (A3) · Kalu Ganga basin: four-eyes (BR2) and offline (BR6)
 */
const FIRST_OFFICER = 'dmc.officer@safezone.lk'; // submitted the Kalu Ganga warning
const SECOND_OFFICER = 'dmc.officer2@safezone.lk';

const reviewLink = (page: Page, hazard: string, area: string) =>
  page.getByRole('link', { name: `Review the ${hazard} warning for ${area}` });

/** The sidebar entry; its description is the live count ("5 waiting"). */
const pendingLink = (page: Page) =>
  page.getByRole('link', { name: 'Pending Approvals', exact: true });

async function openReview(page: Page, hazard: string, area: string) {
  await reviewLink(page, hazard, area).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Review Warning' })).toBeVisible();
  await expect(page.getByText('Warning Information')).toBeVisible();
}

async function signInAndOpen(page: Page, officer: string, hazard: string, area: string) {
  await signInAs(page, officer);
  await expect(dmcHeading(page)).toBeVisible();
  await openReview(page, hazard, area);
}

async function confirmIssue(page: Page, password = DEMO_PASSWORD) {
  await page.getByRole('button', { name: 'Approve & Issue' }).click();
  const dialog = page.getByRole('dialog', { name: 'Issue this warning?' });
  await dialog.getByLabel('Your password').fill(password);
  await dialog.getByRole('button', { name: 'Issue warning now' }).click();
  return dialog;
}

/** The demo controls: flip a simulated gateway before or after issuing. */
async function setGateway(
  page: Page,
  channel: string,
  mode: 'Working' | 'Some sends fail' | 'Down',
) {
  const panel = page.locator('details', { hasText: 'Demo controls: simulated gateways' });
  if (!(await panel.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await panel.locator('summary').click();
  }
  await panel.getByLabel(`${channel} gateway`).selectOption({ label: mode });
}

/** One channel's line in the Notification Summary: its name, then what it delivered and what failed. */
const channelRow = (page: Page, channel: string) =>
  page.getByRole('listitem').filter({ hasText: channel });

/** The bar under "Citizens Reached". Its name carries the percentage, rounded down. */
const reachedBar = (page: Page, percent: number) =>
  page.getByRole('progressbar', { name: `${percent}% of citizens reached`, exact: true });

test.afterEach(async ({ page }) => {
  // The API keeps the gateway modes in memory; leave them as the next test expects them.
  if (page.url().includes('/warnings')) {
    for (const channel of ['PUSH', 'SMS']) {
      await page.request.put(`/api/dev/gateways/${channel}`, {
        data: { mode: 'OK' },
        headers: { 'X-Requested-With': 'SafeZone' },
      });
    }
  }
});

test.describe('UC-1 Issue Warning', () => {
  test('main flow: review, edit, cancel, confirm with the password, and read the delivery summary', async ({
    page,
  }) => {
    await signInAs(page, SECOND_OFFICER);
    await expect(dmcHeading(page)).toBeVisible();
    await expect(page.getByRole('row')).toHaveCount(6);
    await expect(page.getByRole('group', { name: 'High Priority' })).toBeVisible();
    await expect(pendingLink(page)).toHaveAccessibleDescription('5 waiting');

    await openReview(page, 'Flood', 'Gampaha');
    await expect(page.getByText(/registered citizens live in the target area/)).toBeVisible();
    await expect(page.getByRole('group', { name: 'Map of the target area' })).toBeVisible();
    await page.getByRole('tab', { name: 'සිංහල' }).click();
    await expect(page.getByRole('tabpanel')).toContainText('ගම්පහ');

    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByRole('combobox', { name: 'Severity' }).selectOption('CRITICAL');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('form', { name: 'Edit warning' })).toBeHidden();
    await expect(page.getByText('Critical', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Approve & Issue' }).click();
    const dialog = page.getByRole('dialog', { name: 'Issue this warning?' });
    await expect(dialog).toContainText('Gampaha');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Approve & Issue' })).toBeEnabled();

    await confirmIssue(page);

    await expect(page.getByRole('heading', { level: 1, name: 'Warning Issued' })).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Warning Issued Successfully' }),
    ).toBeVisible();
    await expect(reachedBar(page, 100)).toBeVisible();
    await expect(channelRow(page, 'SMS Notification')).toContainText('delivered');
    await expect(channelRow(page, 'SMS Notification')).not.toContainText('failed');
    await expect(channelRow(page, 'WhatsApp Notification')).toContainText('Not sent');
    await expect(
      page.getByText('All notifications have been delivered successfully.'),
    ).toBeVisible();
    await expect(pendingLink(page)).toHaveAccessibleDescription('4 waiting');
    await page.getByRole('link', { name: 'Back to Pending Approvals' }).click();
    await expect(reviewLink(page, 'Flood', 'Gampaha')).toHaveCount(0);
    await expect(page.getByRole('row')).toHaveCount(5);

    await page.getByRole('link', { name: 'Issued Warnings' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Issued Warnings' })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Delivery summary of the Flood warning for Gampaha' }),
    ).toBeVisible();
  });

  test('BR3: a wrong password stops the issue, and nothing is sent', async ({ page }) => {
    await signInAndOpen(page, SECOND_OFFICER, 'Landslide', 'Ratnapura');

    const dialog = await confirmIssue(page, 'not the password at all');

    await expect(dialog.getByRole('alert')).toContainText('Invalid credentials.');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Review Warning' })).toBeVisible();
    await expect(page.getByText('Pending Approval', { exact: true })).toBeVisible();
  });

  test('A1: with some pushes failing SMS still reaches everyone, and Retry failed clears the failures', async ({
    page,
  }) => {
    await signInAndOpen(page, SECOND_OFFICER, 'Landslide', 'Ratnapura');
    await setGateway(page, 'Push notification', 'Some sends fail');

    await confirmIssue(page);

    await expect(page.getByRole('heading', { level: 1, name: 'Warning Issued' })).toBeVisible();
    await expect(reachedBar(page, 100)).toBeVisible();
    await expect(channelRow(page, 'Push Notification')).toContainText('failed');
    await expect(channelRow(page, 'SMS Notification')).not.toContainText('failed');

    await page.getByRole('button', { name: 'Retry failed' }).click();

    await expect(channelRow(page, 'Push Notification')).not.toContainText('failed');
    await expect(page.getByRole('button', { name: 'Retry failed' })).toBeHidden();
  });

  test('E2: with every gateway down the warning is still issued, the list of citizens to visit is offered, and recovery works', async ({
    page,
  }) => {
    await signInAndOpen(page, SECOND_OFFICER, 'Landslide', 'Kegalle');
    await setGateway(page, 'Push notification', 'Down');
    await setGateway(page, 'SMS', 'Down');

    await confirmIssue(page);

    await expect(page.getByRole('heading', { level: 1, name: 'Warning Issued' })).toBeVisible();
    await expect(page.getByText('Every delivery channel is unavailable')).toBeVisible();
    await expect(channelRow(page, 'Push Notification')).toContainText('Not sent');
    await expect(reachedBar(page, 0)).toBeVisible();
    const download = page.getByRole('link', { name: /Download the list of citizens not reached/ });
    await expect(download).toBeVisible();
    const csv = await page.request.get((await download.getAttribute('href')) as string);
    expect(csv.status()).toBe(200);
    expect(csv.headers()['content-type']).toContain('text/csv');
    expect(await csv.text()).toContain('"Citizen ID","Name","Phone","Address"');

    await setGateway(page, 'Push notification', 'Working');
    await setGateway(page, 'SMS', 'Working');
    await page.getByRole('button', { name: 'Retry failed' }).click();

    await expect(reachedBar(page, 100)).toBeVisible();
    await expect(page.getByText('Every delivery channel is unavailable')).toBeHidden();
    await expect(download).toBeHidden();
  });

  test('A3: a warning is rejected with a reason, and leaves the list', async ({ page }) => {
    await signInAndOpen(page, SECOND_OFFICER, 'Flood', 'Kelani Ganga basin');

    await page.getByRole('button', { name: 'Reject' }).click();
    const dialog = page.getByRole('dialog', { name: 'Reject this warning?' });
    await expect(dialog.getByRole('button', { name: 'Reject warning' })).toBeDisabled();
    await dialog.getByLabel('Reason for rejecting').fill('Duplicate of the Gampaha warning');
    await dialog.getByRole('button', { name: 'Reject warning' }).click();

    await expect(
      page.getByText('This warning was rejected. Reason: Duplicate of the Gampaha warning'),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Back to pending list' }).click();
    await expect(reviewLink(page, 'Flood', 'Kelani Ganga basin')).toHaveCount(0);

    await page.getByRole('link', { name: 'Rejected Warnings' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Rejected Warnings' })).toBeVisible();
    await expect(page.getByRole('row', { name: /Kelani Ganga basin/ })).toContainText(
      'Duplicate of the Gampaha warning',
    );
  });

  test('BR2: the officer who submitted a warning cannot approve it', async ({ page }) => {
    await signInAndOpen(page, FIRST_OFFICER, 'Flood', 'Kalu Ganga basin');

    const dialog = await confirmIssue(page);

    await expect(dialog.getByRole('alert')).toContainText(
      'You submitted this warning, so a different DMC Officer must approve it.',
    );
  });

  test('BR6: offline, the list and the warning open from the saved copy, and Approve & Issue is off', async ({
    page,
    context,
  }) => {
    await signInAndOpen(page, SECOND_OFFICER, 'Flood', 'Kalu Ganga basin');
    await waitForServiceWorker(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Review Warning' })).toBeVisible();
    await expect(page.getByText('Warning Information')).toBeVisible();

    await context.setOffline(true);
    await page.reload();

    await expect(page.getByRole('heading', { level: 1, name: 'Review Warning' })).toBeVisible();
    await expect(page.getByText('You are offline. Showing saved data.')).toBeVisible();
    const approve = page.getByRole('button', { name: 'Approve & Issue' });
    await expect(approve).toBeDisabled();
    await expect(approve).toHaveAttribute(
      'title',
      'Issuing needs a connection so you can see delivery results',
    );
    await page.getByRole('link', { name: 'Back to pending list' }).click();
    await expect(dmcHeading(page)).toBeVisible();
    await expect(reviewLink(page, 'Flood', 'Kalu Ganga basin')).toBeVisible();

    await context.setOffline(false);
    await openReview(page, 'Flood', 'Kalu Ganga basin');
    await expect(page.getByRole('button', { name: 'Approve & Issue' })).toBeEnabled();
  });
});
