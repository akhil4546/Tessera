import { expect, test } from '@playwright/test';

test('sign in with a seeded account and open Me', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('asha@tessera.test');
  await page.getByLabel('Password').fill('Seedpass1!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Asha' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('@asha_climbs')).toBeVisible();
});

test('sessions screen lists this device', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('asha@tessera.test');
  await page.getByLabel('Password').fill('Seedpass1!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Asha' })).toBeVisible({ timeout: 15_000 });
  await page.goto('/settings/sessions');
  await expect(page.getByText('This device')).toBeVisible();
});
