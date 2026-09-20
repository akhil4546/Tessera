import { expect, test } from '@playwright/test';

test('create offers Loops and the player is reachable', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('asha@tessera.test');
  await page.getByLabel('Password').fill('Seedpass1!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Asha' })).toBeVisible({ timeout: 20_000 });

  await page.goto('/create');
  await expect(page.getByRole('heading', { name: 'What are you making?' })).toBeVisible();
  await expect(page.getByText('Vertical video up to 90 seconds, original audio only')).toBeVisible();

  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Loops' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('link', { name: 'Loops' }).click();
  await expect(page.getByText('Phase 8 — Organisation & audiences')).toBeVisible({ timeout: 20_000 });
});
