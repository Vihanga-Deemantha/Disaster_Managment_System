import { expect, test, type Page } from '@playwright/test';

/**
 * The public pages must never scroll sideways: not on the smallest phone, and not in Sinhala or
 * Tamil, whose words are longer and break differently from English.
 */
const PAGES = ['/', '/login', '/register'] as const;
const WIDTHS = [320, 375, 768, 1280] as const;
const LANGUAGES = ['EN', 'SI', 'TA'] as const;

async function overflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe('the public pages fit every screen', () => {
  for (const language of LANGUAGES) {
    for (const width of WIDTHS) {
      test(`${language} at ${width}px wide has no sideways scrolling`, async ({ page }) => {
        await page.addInitScript(
          (code) => localStorage.setItem('safezone.language', code),
          language,
        );
        await page.setViewportSize({ width, height: 800 });

        for (const path of PAGES) {
          await page.goto(path);
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
          await page.waitForLoadState('networkidle');

          expect(await overflow(page), `${path} overflows`).toBeLessThanOrEqual(0);
        }
      });
    }
  }

  test('the photo panel appears with enough room, and gives way to the form on a phone', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/login');
    await expect(page.getByRole('img', { name: /responding to a flood at dusk/ })).toBeVisible();

    await page.setViewportSize({ width: 600, height: 800 });
    await expect(page.getByRole('img', { name: /responding to a flood at dusk/ })).toBeHidden();
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  });
});
