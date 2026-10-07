import { expect, test } from '@playwright/test';
import { dmcHeading, signInAsDmcOfficer, waitForServiceWorker } from './support';

test.describe('offline (master plan §6, §7.1.8)', () => {
  test('the app opens with no connection once it has been visited', async ({ page, context }) => {
    await page.goto('/login');
    await waitForServiceWorker(page);

    await context.setOffline(true);
    await page.reload();

    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('the landing page opens with no connection too, photo and all', async ({
    page,
    context,
  }) => {
    const hero = page.locator('img[src="/images/safezone-hero.webp"]');
    const title = page.getByRole('heading', {
      level: 1,
      name: 'Warnings that reach every district, in time.',
    });
    const photoShown = () =>
      hero.evaluate(
        (img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth,
      );

    await page.goto('/');
    await waitForServiceWorker(page); // the reload under the worker is what stores the photos
    await expect(title).toBeVisible();
    await expect.poll(photoShown).toBeGreaterThan(0);
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const cache = await caches.open('site-images');
          return (await cache.keys()).length;
        }),
      )
      .toBeGreaterThan(0);

    await context.setOffline(true);
    await page.reload();

    await expect(title).toBeVisible();
    await expect.poll(photoShown).toBeGreaterThan(0);
  });

  test('a signed-in officer reopens the app offline, sees who they are, and recovers when back online', async ({
    page,
    context,
  }) => {
    await signInAsDmcOfficer(page);
    await waitForServiceWorker(page);
    await expect(dmcHeading(page)).toBeVisible();

    await context.setOffline(true);
    await page.reload();

    await expect(dmcHeading(page)).toBeVisible();
    await expect(page.getByText('You are offline. Showing saved data.')).toBeVisible();
    await expect(page.getByText('Offline – signed in as DMC Officer (demo)')).toBeVisible();

    await context.setOffline(false);
    await expect(page.getByText('You are offline. Showing saved data.')).toBeHidden();
  });

  test('signing out offline signs the device out at once and leaves nothing behind', async ({
    page,
    context,
  }) => {
    await signInAsDmcOfficer(page);
    await waitForServiceWorker(page);

    await context.setOffline(true);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

    await page.reload(); // still offline: the cached identity must not come back
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByText('DMC Officer (demo)')).toBeHidden();
  });
});
