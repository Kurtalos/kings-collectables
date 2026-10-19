import 'dotenv/config';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));

try {
  // 1. Search a card, then click the title link to reach the card page.
  await page.goto(`${base}/cards?q=Sol%20Ring`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Results for “Sol Ring”' }).waitFor();
  const firstTitle = page.locator('.product-title').first();
  assert.ok(await firstTitle.isVisible());
  const href = await firstTitle.getAttribute('href');
  assert.match(href, /^\/cards\/[0-9a-f-]{36}$/, `title should link to a card page, got ${href}`);

  await firstTitle.click();
  await page.waitForURL('**/cards/*', { timeout: 15000 });
  await page.getByRole('heading', { level: 1, name: 'Sol Ring' }).waitFor();
  assert.match(page.url(), /\/cards\/[0-9a-f-]{36}$/, 'should land on the card detail page');

  // 2. The card page shows the hero and a printings list grouped by set.
  assert.ok(await page.locator('.card-detail-image img').first().isVisible(), 'hero image should render');
  assert.ok(await page.locator('.printing-row').count() >= 1, 'printings should be listed');
  const printingCount = await page.locator('.printing-row').count();
  assert.ok(printingCount >= 2, `expected multiple printings, got ${printingCount}`);
  const setHeaders = await page.locator('.printing-set h3').count();
  assert.ok(setHeaders >= 1, 'printings should be grouped by set');
  console.log(`Card page: ${printingCount} printings across ${setHeaders} set(s).`);

  // 3. Clicking a printing thumbnail opens the quick-view dialog.
  await page.locator('.printing-thumb').first().click();
  await page.getByRole('dialog', { name: 'A closer look' }).waitFor();
  assert.ok(await page.getByRole('dialog', { name: 'A closer look' }).getByRole('heading').first().isVisible());
  await page.getByRole('button', { name: 'Close dialog' }).click();

  // 4. Clicking the hero image also opens the quick-view dialog.
  await page.locator('.card-detail-image').first().click();
  await page.getByRole('dialog', { name: 'A closer look' }).waitFor();
  await page.getByRole('button', { name: 'Close dialog' }).click();

  // 5. Add an in-stock printing to the cart from the printings list.
  const inStock = page.locator('.printing-row').filter({ hasNotText: 'Out of stock' }).first();
  if (await inStock.count()) {
    await inStock.locator('.add-card-button').click();
    await page.getByRole('button', { name: 'Open cart, 1 cards' }).waitFor();
  }

  // 6. Mobile: page renders without horizontal overflow.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('heading', { level: 1, name: 'Sol Ring' }).waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert.equal(overflow, false, 'card page must not overflow horizontally on mobile');
  await page.screenshot({ path: 'artifacts/card-detail-mobile.png', fullPage: false });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${base}/cards?q=Black%20Lotus`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Results for “Black Lotus”' }).waitFor();
  // Exact-name match (a Planechase set also matches the search, so target the card itself).
  const outTitle = page.getByRole('link', { name: 'Black Lotus', exact: true }).first();
  await outTitle.waitFor();
  await outTitle.click();
  await page.waitForURL('**/cards/*', { timeout: 15000 });
  await page.getByRole('heading', { level: 1, name: 'Black Lotus' }).waitFor();
  assert.ok(await page.locator('.printing-row').count() >= 1, 'out-of-stock card page should still list printings');
  assert.ok(await page.locator('.printing-row').first().getByText(/Out of stock/i).isVisible(), 'unstocked printings show Out of stock');
  await page.screenshot({ path: 'artifacts/card-detail-oos.png', fullPage: false });

  // Relevance ordering: back on the search page, exact name matches rank before set-name matches.
  await page.goto(`${base}/cards?q=Black%20Lotus`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Results for “Black Lotus”' }).waitFor();
  const titles = await page.locator('.product-title').allInnerTexts();
  assert.equal(titles[0], 'Black Lotus', 'exact name match should rank first');
  assert.equal(titles.slice(0, 13).filter(t => t === 'Black Lotus').length, 13, 'all Black Lotus printings should precede set-name matches');

  assert.deepEqual(errors, [], 'card page should not throw client errors');
  console.log('PASS: title navigates to card page; image and thumbnail open quick view; printings grouped by set; add to cart; mobile fits.');
} finally {
  await browser.close();
}
