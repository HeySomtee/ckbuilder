const assert = require('node:assert/strict');

async function openSelect(page, name, { touch } = {}) {
  touch ??= await page.evaluate(() => navigator.maxTouchPoints > 0);
  const trigger = page.getByRole('combobox', { name, exact: true });
  if (touch) await trigger.tap();
  else await trigger.click();
  assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
  const menu = page.getByRole('listbox');
  await menu.waitFor();
  const bounds = await menu.boundingBox();
  const viewport = page.viewportSize();
  assert.ok(bounds.x >= -1 && bounds.x + bounds.width <= viewport.width + 1);
  assert.ok(bounds.y >= -1 && bounds.y + bounds.height <= viewport.height + 1);
  return { trigger, menu, touch };
}

async function chooseOption(page, name, option, options = {}) {
  const { trigger, menu, touch } = await openSelect(page, name, options);
  const row = menu.getByRole('option', { name: option, exact: typeof option === 'string' });
  if (touch) await row.tap();
  else await row.click();
  await menu.waitFor({ state: 'hidden' });
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
}

module.exports = { openSelect, chooseOption };
