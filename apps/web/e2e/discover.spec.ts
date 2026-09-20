import { expect, test } from '@playwright/test';

test('seeded Discover ranks public posts and explains why', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('asha@tessera.test');
  await page.getByLabel('Password').fill('Seedpass1!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Asha' })).toBeVisible({ timeout: 20_000 });

  await page.goto('/discover');
  await expect(page.getByText('Phase 8 — Organisation & audiences')).toBeVisible();
  await expect(page.getByText('Why am I seeing this?').first()).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Why am I seeing this?' }).first().click();
  await expect(page.getByRole('heading', { name: 'Why this tile' })).toBeVisible();
  await expect(page.getByText('contribution').first()).toBeVisible();

  await page.goto('/discover/tune');
  await expect(page.getByRole('heading', { name: 'Tune my Discover' })).toBeVisible();
  await expect(page.getByText('Each slider is a real weight')).toBeVisible();

  await page.goto('/h/clay');
  await expect(page.getByRole('heading', { name: '#clay' })).toBeVisible({ timeout: 20_000 });

  await page.goto('/places/hampi-boulders');
  await expect(page.getByRole('heading', { name: 'Hampi boulders' })).toBeVisible({ timeout: 20_000 });

  await page.goto('/u/omar_maps');
  await expect(page.getByRole('heading', { name: 'Memory Map' })).toBeVisible({ timeout: 20_000 });
});
