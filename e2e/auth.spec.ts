import { expect, test } from '@playwright/test';
import { dmcHeading, signInAs, signInAsDmcOfficer } from './support';

test.describe('authentication', () => {
  test('a DMC Officer signs in, stays signed in across a reload, and signs out', async ({
    page,
  }) => {
    await page.goto('/warnings');
    await expect(page).toHaveURL(/\/login$/); // protected pages send visitors to sign in

    await signInAsDmcOfficer(page);
    await expect(page).toHaveURL(/\/warnings$/);
    await expect(page.locator('#sidebar').getByText('DMC Officer (demo)')).toBeVisible();

    await page.reload();
    await expect(dmcHeading(page)).toBeVisible(); // the cookie session survives

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await page.goto('/warnings');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('a wrong password gets one generic message', async ({ page }) => {
    await signInAs(page, 'dmc.officer@safezone.lk', 'definitely not the password');

    await expect(page.getByRole('alert')).toHaveText(/Invalid credentials\./);
    await expect(page.getByLabel('Password')).toHaveValue('');
  });

  test('an officer only sees the screens their role may open', async ({ page }) => {
    await signInAs(page, 'district.gampaha@safezone.lk');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Resource Allocation' }),
    ).toBeVisible();

    await page.goto('/warnings');
    await expect(
      page.getByRole('heading', { name: 'You do not have access to this page' }),
    ).toBeVisible();
  });

  test('a visitor starts on the landing page and reaches sign-in and registration from it', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Warnings that reach every district, in time.' }),
    ).toBeVisible();

    await page.getByRole('banner').getByRole('link', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();

    await page.getByRole('link', { name: 'Back to home' }).click();
    await page.getByRole('banner').getByRole('link', { name: 'Register' }).click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.getByRole('heading', { level: 1, name: 'About you' })).toBeVisible();
  });

  test('someone who is signed in never sees the landing page, and is sent to their own screen', async ({
    page,
  }) => {
    await signInAsDmcOfficer(page);

    await page.goto('/');

    await expect(page).toHaveURL(/\/warnings$/);
    await expect(dmcHeading(page)).toBeVisible();
  });

  test('a citizen registers in three steps, confirms their district, and lands on their home screen', async ({
    page,
  }) => {
    const stamp = String(Date.now());
    await page.goto('/register');

    // Step 1: the phone box already shows "+94", so the number is typed without it.
    await page.getByLabel('Full name').fill('E2E Citizen');
    await page.getByLabel('National Identity Card number').fill(`1992100${stamp.slice(-4)}7`);
    await page.getByLabel('Mobile phone number').fill(`77${stamp.slice(-7)}`);
    await page.getByLabel('Create a password').fill('a long e2e passphrase');
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 2: a district and a spot on the map that do not agree, on purpose.
    await expect(page.getByRole('heading', { level: 1, name: 'Where you live' })).toBeVisible();
    await page.getByLabel('District').selectOption('JAFFNA');
    await page.getByText('Enter coordinates by hand').click();
    await page.getByLabel('Latitude').fill('6.9271');
    await page.getByLabel('Longitude').fill('79.8612'); // Colombo, deliberately not Jaffna
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 3: alerts, then the server asks whether the district is right.
    await expect(page.getByRole('heading', { level: 1, name: 'How we alert you' })).toBeVisible();
    await page.getByRole('button', { name: 'Create account' }).click();
    const dialog = page.getByRole('dialog', { name: 'Is your district correct?' });
    await expect(dialog).toContainText('closer to Colombo than to Jaffna');
    await dialog.getByRole('button', { name: 'Use Colombo' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Hazard Reports' })).toBeVisible();
    await expect(page.getByText('E2E Citizen')).toBeVisible();
  });

  test('"Continue" will not move past a step with a mistake, and says what to fix', async ({
    page,
  }) => {
    await page.goto('/register');

    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'About you' })).toBeVisible();
    await expect(page.getByText('Enter your full name.')).toBeVisible();
    await expect(page.getByLabel('Full name')).toBeFocused();
  });
});
