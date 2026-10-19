import 'dotenv/config';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { Pool } from 'pg';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
const email = `account-regression-${Date.now()}@example.com`;
const migratedEmail = `guest-wishlist-regression-${Date.now()}@example.com`;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));

try {
  const guest = await page.goto(`${base}/account`, { waitUntil: 'networkidle' });
  assert.equal(guest.status(), 200);
  await page.getByRole('heading', { name: 'Join Kings Collectables.' }).waitFor();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByLabel('Full name').fill('Account Regression');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill('RegressionPass123');
  await page.getByRole('button', { name: 'Create my account' }).click();
  await page.getByRole('heading', { name: 'Hey Account.' }).waitFor({ timeout: 20000 });

  const initial = await page.evaluate(async () => (await (await fetch('/api/cards')).json()).products.slice(0, 48).map(card => card.id));
  await page.goto(`${base}/cards?q=Black%20Lotus`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Results for “Black Lotus”' }).waitFor();
  await page.getByRole('button', { name: 'Watch Black Lotus' }).first().click();
  await page.getByRole('button', { name: 'Stop watching Black Lotus' }).first().waitFor({ timeout: 20000 });
  const watched = await page.evaluate(async () => (await (await fetch('/api/account')).json()).watchlist);
  assert.equal(watched.length, 1, 'watch choice should persist to the account');
  assert.ok(!initial.includes(watched[0].productId), 'watch choice must be outside the account page’s initial 48 cards');

  const response = await page.goto(`${base}/account`, { waitUntil: 'domcontentloaded' });
  assert.equal(response.status(), 200);
  const html = await response.text();
  assert.match(html, /class="account-hub"/, 'server should render the signed-in profile on the first response');
  assert.doesNotMatch(html, /class="account-auth"/, 'the first response should not include the login screen');
  await page.getByRole('heading', { name: 'Hey Account.' }).waitFor();
  const watchTab = page.locator('.account-stats button').filter({ hasText: 'Watch list' });
  assert.match(await watchTab.innerText(), /1/);
  await watchTab.click();
  await page.locator('.watch-list .watch-card').first().waitFor();
  assert.match(await page.locator('.watch-list .watch-card').first().innerText(), /Black Lotus/);
  assert.match(await page.locator('.watch-list .watch-card').first().innerText(), /Watching for restock/);

  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('.account-auth').count(), 0, 'the login form must not flash on reload');
  await page.locator('.account-stats button').filter({ hasText: 'Watch list' }).click();
  await page.locator('.watch-list .watch-card').first().waitFor();
  assert.match(await page.locator('.watch-list .watch-card').first().innerText(), /Black Lotus/);

  await page.goto(`${base}/cards?q=Black%20Lotus`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Save Black Lotus to wishlist' }).first().click();
  await page.getByRole('button', { name: 'Remove Black Lotus from wishlist' }).first().waitFor({ timeout: 20000 });
  await page.goto(`${base}/account`, { waitUntil: 'networkidle' });
  await page.locator('.account-stats button').filter({ hasText: 'Wishlist' }).click();
  await page.locator('.account-grid .product-card').first().waitFor();
  assert.match(await page.locator('.account-grid .product-card').first().innerText(), /Black Lotus/);
  await page.getByRole('button', { name: /Wishlist, 1 saved cards/ }).click();
  await page.getByRole('dialog', { name: 'Your wishlist (1)' }).getByText('Black Lotus').first().waitFor();
  await page.getByRole('button', { name: 'Close dialog' }).click();

  await page.locator('.account-grid').getByRole('button', { name: 'Remove Black Lotus from wishlist' }).click();
  await page.locator('.account-stats button').filter({ hasText: 'Wishlist' }).getByText('0').waitFor({ timeout: 20000 });
  await page.reload({ waitUntil: 'networkidle' });
  const afterRemove = await page.evaluate(async () => (await (await fetch('/api/account')).json()).wishlistIds);
  assert.equal(afterRemove.length, 0, 'a removed card must not return from stale device storage');
  await page.locator('.account-stats button').filter({ hasText: 'Watch list' }).click();
  await page.getByRole('button', { name: 'Stop watching' }).click();
  await page.locator('.account-stats button').filter({ hasText: 'Watch list' }).getByText('0').waitFor({ timeout: 20000 });
  await page.reload({ waitUntil: 'networkidle' });
  const afterUnwatch = await page.evaluate(async () => (await (await fetch('/api/account')).json()).watchlist);
  assert.equal(afterUnwatch.length, 0, 'an unwatched card must stay unwatched after reload');

  await page.goto(`${base}/cards?q=Sol%20Ring`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Add to cart', exact: true }).first().click();
  await page.getByRole('button', { name: 'Open cart, 1 cards' }).waitFor();
  await page.goto(`${base}/cards?q=Black%20Lotus`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Open cart, 1 cards' }).click();
  assert.match(await page.locator('.cart-line-info').innerText(), /Sol Ring/, 'a card outside this search page must stay in the cart');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.goto(`${base}/account`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Open cart, 1 cards' }).waitFor();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('heading', { name: 'Join Kings Collectables.' }).waitFor();
  await page.goto(`${base}/cards?q=Black%20Lotus`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Save Black Lotus to wishlist' }).first().click();
  await page.getByRole('button', { name: 'Wishlist, 1 saved cards' }).waitFor();
  await page.goto(`${base}/account`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByLabel('Full name').fill('Guest Migration');
  await page.getByLabel('Email address').fill(migratedEmail);
  await page.getByLabel('Password').fill('RegressionPass123');
  await page.getByRole('button', { name: 'Create my account' }).click();
  await page.getByRole('heading', { name: 'Hey Guest.' }).waitFor({ timeout: 20000 });
  const migrated = await page.evaluate(async () => ({
    ids: (await (await fetch('/api/account')).json()).wishlistIds,
    leftover: localStorage.getItem('kings-wishlist'),
  }));
  assert.equal(migrated.ids.length, 1, 'a guest wishlist should transfer to the newly registered account');
  assert.equal(migrated.leftover, null, 'migrated guest wishlist must not be re-imported repeatedly');
  await page.locator('.account-stats button').filter({ hasText: 'Wishlist' }).click();
  await page.locator('.account-grid .product-card').first().waitFor();
  assert.match(await page.locator('.account-grid .product-card').first().innerText(), /Black Lotus/);
  await page.locator('.account-grid').getByRole('button', { name: 'Remove Black Lotus from wishlist' }).click();
  await page.locator('.account-stats button').filter({ hasText: 'Wishlist' }).getByText('0').waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  const noReimport = await page.evaluate(async () => (await (await fetch('/api/account')).json()).wishlistIds);
  assert.equal(noReimport.length, 0, 'the migrated card must stay removed after reload');
  assert.deepEqual(errors, [], 'account and watch-list pages should not throw client errors');
  console.log('PASS: signed-in profile on first response; off-page watch/wishlist persists; removal persists; guest wishlist imports once.');
} finally {
  await browser.close();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query('DELETE FROM customers WHERE email = ANY($1::text[])', [[email, migratedEmail]]);
    console.log(`Cleaned up ${result.rowCount} temporary accounts.`);
  } finally { await pool.end(); }
}
