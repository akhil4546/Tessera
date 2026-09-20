import { expect, test } from '@playwright/test';

test('seeded Inbox shows Messages, a thread, and Requests', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('asha@tessera.test');
  await page.getByLabel('Password').fill('Seedpass1!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Asha' })).toBeVisible({ timeout: 20_000 });

  await page.goto('/inbox');
  await expect(page.getByText('Phase 8 — Organisation & audiences')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible();
  await expect(page.getByText('All')).toBeVisible();
  await expect(page.getByText('Ravi').first()).toBeVisible({ timeout: 20_000 });

  await page.getByText('Ravi').first().click();
  await expect(page.getByText('Slow light on oak')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('plaintext').first()).toBeVisible();

  await page.goto('/inbox?filter=requests');
  await expect(page.getByText('Omar').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible();

  await page.goto('/inbox?filter=appreciations');
  await expect(page.getByText('appreciated').first()).toBeVisible({ timeout: 20_000 });
});
