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
    await expect(page.getByText('DMC Officer (demo)')).toBeVisible();

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

  test('a citizen registers, confirms their district, and lands on their home screen', async ({
    page,
  }) => {
    const stamp = String(Date.now());
    await page.goto('/register');
    await page.getByLabel('National Identity Card number').fill(`1992100${stamp.slice(-4)}7`);
    await page.getByLabel('Full name').fill('E2E Citizen');
    await page.getByLabel('Mobile phone number').fill(`077${stamp.slice(-7)}`);
    await page.getByLabel('Password').fill('a long e2e passphrase');
    await page.getByLabel('District').selectOption('JAFFNA');
    await page.getByLabel('Latitude').fill('6.9271');
    await page.getByLabel('Longitude').fill('79.8612'); // Colombo, deliberately not Jaffna

    await page.getByRole('button', { name: 'Register' }).click();
    const dialog = page.getByRole('dialog', { name: 'Is your district correct?' });
    await expect(dialog).toContainText('closer to Colombo than to Jaffna');
    await dialog.getByRole('button', { name: 'Use Colombo' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Hazard Reports' })).toBeVisible();
    await expect(page.getByText('E2E Citizen')).toBeVisible();
  });
});
