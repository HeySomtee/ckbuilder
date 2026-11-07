/* Isolated browser continuation. Actual React components, synthetic transport only. */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const image = path.resolve(__dirname, '../public/brand/on-form-icon-512.png');
const replacement = path.resolve(__dirname, '../public/brand/on-form-touch-180.png');

async function artworkJourney({
  page,
  base,
  campaigns,
  writes,
  artworkState,
  width,
  engineName,
  output,
}) {
  const finished = campaigns[0];
  // The preceding archive journey is complete. Inspect an editable finished
  // rehearsal here; deleted competitions intentionally have no artwork editor.
  finished.state = 'finished';
  finished.deletedAt = null;
  const frozen = JSON.stringify({
    draft: finished.draft,
    termsHash: finished.termsHash,
    leaderboard: finished.leaderboard,
    awards: finished.awards,
  });
  await page.goto(base + '/season/?view=competitions&campaign=calls');
  await page.getByRole('heading', { name: finished.name, exact: true, level: 1 }).waitFor();
  assert.equal(
    await page.locator('img[src*="/media/competitions/"]').count(),
    0,
    'Existing rehearsal receives no art automatically',
  );
  assert.equal(await page.locator('.campaign-detail-banner').count(), 0);
  if (width < 768) {
    const dock = page.getByRole('navigation', { name: 'Mobile navigation', exact: true });
    await dock.getByRole('link', { name: 'Compete', exact: true }).waitFor();
    await dock.getByRole('button', { name: 'More pages', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'More pages', exact: true });
    await sheet.waitFor();
    await sheet.getByRole('link', { name: 'My Account', exact: true }).waitFor();
    await page.screenshot({
      path: path.join(output, `${engineName}-${width}-navigation-artwork.png`),
    });
    await page.keyboard.press('Escape');
    assert.equal(
      await dock
        .getByRole('button', { name: 'More pages', exact: true })
        .evaluate((e) => e === document.activeElement),
      true,
    );
  }
  await page.getByRole('button', { name: 'Manage competitions', exact: true }).click();
  await page.getByLabel('Competition icon', { exact: true }).setInputFiles({
    name: 'unsafe.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg/>'),
  });
  await page.getByText('Choose a PNG, JPG or WebP image.', { exact: true }).waitFor();
  assert.equal(artworkState.uploads.length, 0);
  await page.getByLabel('Competition icon', { exact: true }).setInputFiles(image);
  await page.getByLabel('Competition banner', { exact: true }).setInputFiles(image);
  await page.getByRole('button', { name: 'Save artwork', exact: true }).click();
  await page.getByText('Competition artwork saved.', { exact: true }).waitFor();
  assert.ok(finished.artwork.icon && finished.artwork.banner);
  assert.equal(
    JSON.stringify({
      draft: finished.draft,
      termsHash: finished.termsHash,
      leaderboard: finished.leaderboard,
      awards: finished.awards,
    }),
    frozen,
  );
  await page.screenshot({
    path: path.join(output, `${engineName}-${width}-artwork-admin.png`),
    fullPage: true,
  });
  const before = finished.artwork.icon.url;
  await page.getByLabel('Competition icon', { exact: true }).setInputFiles(replacement);
  const savedResponse = page.waitForResponse(
    (r) => r.url().includes('action=upload-artwork') && r.status() === 200,
  );
  await page.getByRole('button', { name: 'Save artwork', exact: true }).click();
  await savedResponse;
  await page.waitForFunction(
    () => document.querySelector('.campaign-art-save button')?.disabled === true,
  );
  assert.notEqual(finished.artwork.icon.url, before, 'Existing artwork can be replaced');
  await page.goto(base + '/season/?view=competitions&campaign=calls');
  await page.locator('.campaign-detail-banner img').waitFor();
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    true,
  );
  await page.screenshot({
    path: path.join(output, `${engineName}-${width}-artwork-finished.png`),
    fullPage: true,
  });
  artworkState.broken = true;
  await page.reload();
  await page.waitForFunction(
    () =>
      document.querySelector('h1')?.textContent === 'Fixture Challenge' &&
      !document.querySelector('.campaign-detail-banner'),
  );
  artworkState.broken = false;
  await page.getByRole('button', { name: 'Manage competitions', exact: true }).click();
  await page.getByRole('button', { name: 'Remove icon', exact: true }).click();
  await page.getByRole('button', { name: 'Remove banner', exact: true }).click();
  await page.getByRole('button', { name: 'Save artwork', exact: true }).click();
  await page.getByText('Competition artwork saved.', { exact: true }).waitFor();
  assert.deepEqual(finished.artwork, { icon: null, banner: null });
  await page.reload();
  assert.equal(await page.locator('img[src*="/media/competitions/"]').count(), 0);

  // Switching competition during the first upload must not start a second upload
  // or apply its result to the newly selected competition.
  await page.getByRole('button', { name: 'Manage competitions', exact: true }).click();
  await page.getByLabel('Competition icon', { exact: true }).setInputFiles(image);
  await page.getByLabel('Competition banner', { exact: true }).setInputFiles(image);
  const beforeSwitch = artworkState.uploads.length;
  artworkState.holdNext = true;
  const held = new Promise((resolve) => {
    artworkState.onHeld = resolve;
  });
  const completed = new Promise((resolve) => {
    artworkState.onCompleted = resolve;
  });
  await page.getByRole('button', { name: 'Save artwork', exact: true }).click();
  await Promise.race([
    held,
    new Promise((_, reject) => setTimeout(() => reject(Error('Upload did not start')), 5000)),
  ]);
  assert.equal(typeof artworkState.release, 'function');
  if (width < 768) await page.getByRole('button', { name: 'More pages', exact: true }).click();
  const navigation =
    width < 768
      ? page.getByRole('dialog', { name: 'More pages' })
      : page.getByRole('navigation', { name: 'Main navigation' });
  await navigation.locator('a.campaign-nav-link[href*="campaign=five"]').click();
  await page.getByRole('heading', { name: 'Five Challenge', exact: true, level: 1 }).waitFor();
  artworkState.release();
  await Promise.race([
    completed,
    new Promise((_, reject) =>
      setTimeout(() => reject(Error('Held upload did not complete')), 5000),
    ),
  ]);
  await page.waitForTimeout(100);
  assert.equal(artworkState.uploads.length, beforeSwitch + 1);
  assert.equal(campaigns[1].artwork, undefined);
  assert.equal(await page.locator('.campaign-detail-banner').count(), 0);

  await page.goto(base + '/season/?view=competitions');
  await page.getByRole('button', { name: 'Create competition', exact: true }).click();
  await page.getByLabel('Competition name', { exact: true }).fill('Optional artwork retry');
  await page.getByLabel('Competition icon', { exact: true }).setInputFiles(image);
  await page.getByLabel('Competition banner', { exact: true }).setInputFiles(image);
  artworkState.failNext = true;
  const createsBefore = writes.filter((w) => w.action === 'create').length;
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.getByText(/Your draft is saved.*Synthetic upload unavailable/).waitFor();
  await page.getByRole('button', { name: 'Dismiss Check these details', exact: true }).click();
  assert.equal(writes.filter((w) => w.action === 'create').length, createsBefore + 1);
  const created = campaigns.at(-1);
  assert.equal(created.state, 'draft');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page
    .getByRole('heading', { name: 'Optional artwork retry', exact: true, level: 1 })
    .waitFor();
  assert.equal(
    writes.filter((w) => w.action === 'create').length,
    createsBefore + 1,
    'Retry resumes the same draft',
  );
  assert.ok(created.artwork.icon && created.artwork.banner);
  assert.equal(created.state, 'draft');
  assert.equal('artwork' in created.draft, false, 'Presentation is not frozen terms');
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    true,
  );
  assert.ok(fs.existsSync(image), 'The upload was an isolated checked-in image fixture');
}
module.exports = { artworkJourney };
