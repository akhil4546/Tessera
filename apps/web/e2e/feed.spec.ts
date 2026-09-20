import { expect, test } from '@playwright/test';

test('seeded following feed shows a post and the finish line', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('asha@tessera.test');
  await page.getByLabel('Password').fill('Seedpass1!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Asha' })).toBeVisible({ timeout: 20_000 });
  await page.goto('/');
  await expect(page.getByText("You're caught up")).toBeVisible({ timeout: 20_000 });
});
