import { expect, test } from '@playwright/test';

test('home empty state is visible', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: "You're not following anyone yet" }),
  ).toBeVisible();
});

test('five nav targets are reachable', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' }).first();

  await nav.getByRole('link', { name: 'Discover', exact: true }).click();
  await expect(page.getByText('Phase 8 — Organisation & audiences')).toBeVisible();

  await nav.getByRole('link', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'What are you making?' })).toBeVisible();

  await nav.getByRole('link', { name: 'Inbox', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible();

  await nav.getByRole('link', { name: 'Me', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your mosaic' })).toBeVisible();

  await nav.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: "You're not following anyone yet" }),
  ).toBeVisible();
});
