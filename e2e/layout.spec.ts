import { expect, test, type Locator, type Page } from '@playwright/test';

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

async function centreOf(link: Locator): Promise<number> {
  const box = await link.boundingBox();
  if (!box) throw new Error('A link the header should show is not on the page');
  return box.y + box.height / 2;
}

/**
 * On a laptop screen the landing header is one row in every language. Tamil words are the longest,
 * so Tamil wraps first; its section links wait until 1160px for that reason (the middle width here).
 */
test.describe('the landing header stays on one row', () => {
  for (const language of LANGUAGES) {
    for (const width of [1024, 1160, 1440] as const) {
      test(`${language} at ${width}px wide`, async ({ page }) => {
        await page.addInitScript(
          (code) => localStorage.setItem('safezone.language', code),
          language,
        );
        await page.setViewportSize({ width, height: 800 });
        await page.goto('/');
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await page.evaluate(() => document.fonts.ready);

        const header = page.locator('header');
        const rows = await Promise.all(
          ['a[href="/"]', 'a[href="/login"]', 'a[href="/register"]'].map((selector) =>
            centreOf(header.locator(selector).first()),
          ),
        );

        expect(Math.max(...rows) - Math.min(...rows), 'the header wrapped').toBeLessThanOrEqual(2);
      });
    }
  }
});
