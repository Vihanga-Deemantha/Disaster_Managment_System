import { expect, test, type Page } from '@playwright/test';
import { signInAsDmcOfficer } from './support';

/**
 * The frame every signed-in screen sits in (the dark sidebar, the thin top bar, the phone menu) and the
 * Pending Approvals list inside it. One test with steps and ONE sign-in: the API allows 20 sign-ins per
 * 15 minutes per address, and the whole suite shares that budget. It runs before `warnings.spec.ts`
 * (files run alphabetically), so the five demo warnings are all still waiting. It changes no data.
 */
const nav = (page: Page) => page.getByRole('navigation', { name: 'Main navigation' });
const pendingLink = (page: Page) => nav(page).getByRole('link', { name: 'Pending Approvals' });

async function overflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test('the sidebar, the top bar, the phone menu and the Pending Approvals list', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signInAsDmcOfficer(page);

  await test.step('the sidebar names the product, lists the officer’s screens and counts what is waiting', async () => {
    await expect(nav(page).getByRole('link')).toHaveText([
      /^Pending Approvals/,
      'Issued Warnings',
      'Rejected Warnings',
      'Dashboard',
      'Review reports',
      'Report history',
      'Impact Analytics',
    ]);
    await expect(pendingLink(page)).toHaveAttribute('aria-current', 'page');
    await expect(pendingLink(page)).toHaveAccessibleDescription('5 waiting');
    await expect(page.getByText('DMC Officer console')).toBeVisible();
    await expect(page.locator('#sidebar').getByText('DMC Officer (demo)')).toBeVisible();
    await expect(page.getByText('Online', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeHidden();
  });

  await test.step('the list: four cards, a tab for each hazard, a search box and the order of the rows', async () => {
    await expect(page.getByRole('row')).toHaveCount(6);
    await expect(page.getByRole('group', { name: 'Pending Approvals' })).toHaveText(
      /^5\s*Pending Approvals/,
    );
    await expect(page.getByRole('group', { name: 'High Priority' })).toHaveText(
      /^4\s*High Priority/,
    );
    await expect(page.getByRole('group', { name: 'Submitters' })).toHaveText(/^2\s*Submitters/);
    await expect(page.getByText('Showing 1–5 of 5 warnings')).toBeVisible();

    await page.getByRole('button', { name: 'Landslide (2)' }).click();
    await expect(page.getByRole('row')).toHaveCount(3);
    await page.getByRole('button', { name: 'All (5)' }).click();
    await expect(page.getByRole('row')).toHaveCount(6);

    const search = page.getByRole('searchbox', { name: 'Search warnings' });
    await search.fill('kegalle');
    await expect(page.getByRole('row')).toHaveCount(2);
    await search.fill('duty officer');
    await expect(page.getByRole('row')).toHaveCount(5);
    await search.fill('nothing like this');
    await expect(page.getByText('No warnings match what you searched for.')).toBeVisible();
    await search.fill('');

    await page.getByRole('combobox', { name: 'Sort by' }).selectOption({ label: 'Severity' });
    await expect(page.getByRole('row').nth(1)).toContainText('Ratnapura');
  });

  await test.step('choosing Rejected, then Issued, then Pending in the sidebar moves the highlight and the page', async () => {
    await nav(page).getByRole('link', { name: 'Rejected Warnings' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Rejected Warnings' })).toBeVisible();
    await expect(page.getByText('No warnings have been rejected.')).toBeVisible();
    await expect(nav(page).getByRole('link', { name: 'Rejected Warnings' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(pendingLink(page)).not.toHaveAttribute('aria-current', 'page');

    await nav(page).getByRole('link', { name: 'Issued Warnings' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Issued Warnings' })).toBeVisible();
    await expect(page.getByText('No warnings have been issued yet.')).toBeVisible();

    await pendingLink(page).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Pending Approvals' })).toBeVisible();
    await expect(page.getByRole('row')).toHaveCount(6);
    await expect(page.getByRole('searchbox', { name: 'Search warnings' })).toHaveValue('');
  });

  await test.step('the three lists never scroll the whole page sideways, on any width', async () => {
    for (const width of [320, 375, 768, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      for (const path of ['/warnings', '/warnings/issued', '/warnings/rejected']) {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await page.waitForLoadState('networkidle');

        expect(await overflow(page), `${path} overflows at ${width}px`).toBeLessThanOrEqual(0);
      }
    }
  });

  await test.step('on a phone the sidebar is a menu: opened with a button, closed with Escape or by choosing a page', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/warnings');
    await expect(nav(page)).toBeHidden();

    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(nav(page)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(nav(page)).toBeHidden();
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeFocused();

    await page.getByRole('button', { name: 'Open menu' }).click();
    await nav(page).getByRole('link', { name: 'Issued Warnings' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Issued Warnings' })).toBeVisible();
    await expect(nav(page)).toBeHidden();
  });
});
