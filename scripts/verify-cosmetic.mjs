import 'dotenv/config';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1152, height: 820 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));

try {
  await page.goto(`${base}/cards?q=Sol%20Ring`, { waitUntil: 'networkidle' });
  const filters = page.locator('.colour-filters .mana-color');
  assert.equal(await filters.count(), 6, 'all six mana colours should be shown');
  for (const code of ['W', 'U', 'B', 'R', 'G', 'C']) {
    const pip = page.locator(`.colour-filters .mana-${code} img`);
    assert.equal(await pip.getAttribute('src'), `/images/mana/${code}.svg`);
    assert.equal(await pip.evaluate(img => img.complete && img.naturalWidth > 0), true, `${code} SVG should load`);
  }
  await page.getByRole('button', { name: 'Filter Blue cards' }).click();
  assert.equal(await page.getByRole('button', { name: 'Filter Blue cards' }).getAttribute('aria-pressed'), 'true');
  await page.screenshot({ path: 'artifacts/mana-pips.png', fullPage: false });

  await page.goto(`${base}/admin`, { waitUntil: 'networkidle' });
  const password = page.getByLabel('Owner password');
  if (await password.isVisible().catch(() => false)) {
    assert.ok(process.env.ADMIN_PASSWORD, 'ADMIN_PASSWORD is needed for browser owner test');
    await password.fill(process.env.ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Open workspace' }).click();
    await page.getByRole('heading', { name: 'Your inventory' }).waitFor();
  }
  const sidebar = page.locator('.admin-sidebar');
  assert.equal(await sidebar.getByText('A guide to your store').count(), 0);
  assert.equal(await sidebar.getByText('Your shop is open').count(), 0);
  await sidebar.getByText('NEEDS ATTENTION').waitFor();
  await sidebar.getByRole('button', { name: /Awaiting payment/ }).click();
  await page.getByRole('heading', { name: 'From your vault to theirs.' }).waitFor();
  await sidebar.getByRole('button', { name: /Low stock/ }).click();
  await page.getByRole('heading', { name: 'Your inventory' }).waitFor();
  assert.equal(await page.getByRole('combobox', { name: 'Filter inventory by stock' }).inputValue(), 'low');
  await page.screenshot({ path: 'artifacts/sidebar-priorities.png', fullPage: false });

  await page.goto(`${base}/admin/pos`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Current sale' }).waitFor();
  const basket = page.locator('.pos-basket');
  const box = await basket.boundingBox();
  assert.ok(box && box.width >= 460, `register column should be at least 460px wide at 1152px (got ${box?.width})`);
  const customerPanel = page.locator('.pos-customer-panel');
  assert.equal(await customerPanel.getAttribute('open'), '', 'customer search should start open');
  await page.getByRole('textbox', { name: 'Search customers' }).waitFor();
  for (let i = 0; i < 5; i++) await page.locator('.pos-result').nth(i).click();
  await page.locator('.pos-panel').nth(1).locator('summary').click();
  await page.locator('.pos-panel').nth(2).locator('summary').click();
  await page.getByLabel('Discount value').fill('10');
  assert.equal(await page.locator('.pos-panel').nth(2).getAttribute('open'), '', 'discount should stay open while editing');
  const geometry = await basket.evaluate(el => ({ client: el.clientHeight, scroll: el.scrollHeight, overflowY: getComputedStyle(el).overflowY }));
  assert.equal(geometry.overflowY, 'auto', 'entire sale panel should scroll instead of clipping');
  assert.ok(geometry.scroll > geometry.client, 'large basket should have reachable overflow');
  await page.getByRole('textbox', { name: 'Search customers' }).fill('test');
  await page.getByRole('textbox', { name: 'Search customers' }).waitFor();
  await basket.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await page.getByRole('button', { name: /Complete sale/ }).waitFor();
  await page.screenshot({ path: 'artifacts/pos-wider-basket.png', fullPage: false });

  await page.setViewportSize({ width: 980, height: 820 });
  await page.goto(`${base}/admin/pos`, { waitUntil: 'networkidle' });
  const mobile = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth, columns: getComputedStyle(document.querySelector('.pos-main')).gridTemplateColumns }));
  assert.ok(mobile.page <= mobile.viewport + 1, `980px register should not overflow (${mobile.page} > ${mobile.viewport})`);
  assert.equal(mobile.columns.split(' ').length, 1, 'register should stack below 1021px');
  assert.deepEqual(errors, [], 'no client-side errors');
  console.log('PASS: six mana pip images, filter toggle, actionable sidebar alerts, wider POS basket, accessible customer/discount controls, scrollable sale, stacked layout at 980px.');
} finally {
  await browser.close();
}
