import { expect, test } from '@playwright/test';

test('seeded home shows a Moment tray and a Reel Shelf on Mara', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('asha@tessera.test');
  await page.getByLabel('Password').fill('Seedpass1!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Asha' })).toBeVisible({ timeout: 20_000 });
  await page.goto('/');
  await expect(page.getByText('Moments', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: /ravi_makes|You|nia_notes|mara_tiles/ })).toBeVisible();
  await page.goto('/u/mara_tiles');
  await expect(page.getByRole('heading', { name: 'Reel Shelves' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Studio light')).toBeVisible();
});
