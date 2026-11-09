/* Actual Home, existing isolated campaign transport. Never uses a live provider or wallet. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function homeProductsJourney({
  page,
  base,
  campaigns,
  artworkState,
  width,
  engineName,
  output,
}) {
  const context = page.context(),
    home = base + '/season/?view=overview';
  const original = structuredClone(campaigns);
  const listUrl = base + '/api/campaigns';
  async function openHome(reload = false) {
    // Let the shell's independent Activity prefetch finish before a test-only
    // full-document navigation tears down WebKit's intercepted network context.
    const activity = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/activity',
    );
    if (reload) await page.reload();
    else await page.goto(home);
    await (await activity).finished();
  }
  let fail = false,
    hold = false,
    release,
    holdTimeout,
    reads = 0;
  const held = Promise.withResolvers();
  const campaignRoute = async (route) => {
    reads++;
    if (hold)
      await new Promise((resolve) => {
        release = resolve;
        held.resolve();
      });
    if (fail)
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Synthetic campaign outage' }),
      });
    return route.fallback();
  };
  const marketRoute = (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        markets: [],
        total: 0,
        nextOffset: null,
        coverage: { complete: true, from: '2029-01-01T00:00:00Z', to: '2031-01-01T00:00:00Z' },
      }),
    });
  await context.route(listUrl, campaignRoute);
  await context.route(base + '/api/markets?**', marketRoute);
  const track = page.getByRole('list', { name: 'Active competitions' });
  const cards = page.locator('.home-product');
  const competitionCards = page.locator('[data-home-carousel=competitions] .home-product');
  const featureTrack = page.getByRole('list', { name: 'Streak features', exact: true });
  const atStart = () =>
    page.waitForFunction(
      () =>
        document.querySelector('[data-home-carousel=competitions] .home-products-track')
          ?.scrollLeft < 3,
    );
  const atEnd = () =>
    page.waitForFunction(() => {
      const el = document.querySelector('[data-home-carousel=competitions] .home-products-track');
      return el && el.scrollLeft + el.clientWidth >= el.scrollWidth - 3;
    });
  try {
    for (const state of ['draft', 'finished', 'deleted', 'live', 'finalizing'])
      campaigns.push({
        ...structuredClone(original[0]),
        id: 'home-' + state,
        name: 'Home ' + state,
        state,
      });
    hold = true;
    await openHome();
    await page.getByRole('heading', { name: 'Good to have you here.' }).waitFor();
    await page.getByText('Loading competitions', { exact: true }).waitFor();
    await Promise.race([
      held.promise,
      new Promise((_, reject) => {
        holdTimeout = setTimeout(
          () => reject(new Error('Competition request did not arrive')),
          30_000,
        );
      }),
    ]);
    clearTimeout(holdTimeout);
    assert.equal(await cards.count(), 3, 'Games remain usable while competitions load');
    assert.equal(
      await page.getByText('Watch out for competitions coming soon.', { exact: true }).count(),
      0,
    );
    assert.ok(release);
    hold = false;
    release();
    await page.waitForFunction(() => document.querySelectorAll('.home-product').length === 7);
    await atStart();
    assert.equal(reads, 1, 'Home and navigation share one competition request');
    const labels = await cards.locator('h3').allTextContents();
    assert.ok(
      labels.includes('Streak Five') &&
        labels.includes('Streak Survivor') &&
        labels.includes('Predictions'),
    );
    for (const state of ['draft', 'finished', 'deleted'])
      assert.ok(!labels.includes('Home ' + state));
    assert.ok(labels.includes('Home live') && labels.includes('Home finalizing'));
    const nav = page.getByRole('navigation', {
      name: width < 700 ? 'Mobile navigation' : 'Main navigation',
      exact: true,
    });
    assert.equal(
      await nav.getByRole('link', { name: 'Home', exact: true }).getAttribute('aria-current'),
      'page',
    );
    assert.equal(await nav.getByRole('link', { name: 'Overview', exact: true }).count(), 0);
    assert.equal(await featureTrack.locator('.home-product').count(), 3);
    assert.equal(await competitionCards.count(), 4);
    const geometry = await page.locator('.home-discovery').evaluate((e) => ({
      height: e.getBoundingClientRect().height,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
    }));
    assert.ok(geometry.height < 600 && !geometry.overflow, JSON.stringify(geometry));
    await page.screenshot({ path: path.join(output, `${engineName}-${width}-home-products.png`) });

    const featuresBefore = await featureTrack.evaluate((e) => e.scrollLeft);
    await page.getByRole('button', { name: 'Next competition', exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-home-carousel=competitions] .home-products-track')
          ?.scrollLeft > 20,
    );
    const afterNext = await track.evaluate((e) => e.scrollLeft);
    assert.equal(
      await featureTrack.evaluate((e) => e.scrollLeft),
      featuresBefore,
      'Competition navigation leaves features unchanged',
    );
    await page.clock.runFor(35_000);
    assert.equal(
      await track.evaluate((e) => e.scrollLeft),
      afterNext,
      'No automatic carousel rotation',
    );
    assert.equal(reads, 1, 'Home does not add a competition polling loop');
    await track.focus();
    await track.press('End');
    await atEnd();
    await page.waitForFunction(
      () => document.querySelector('button[aria-label="Next competition"]')?.disabled,
    );
    assert.equal(
      await page.getByRole('button', { name: 'Next competition', exact: true }).isDisabled(),
      true,
    );
    await track.press('Home');
    await atStart();
    await page.waitForFunction(
      () => document.querySelector('button[aria-label="Previous competition"]')?.disabled,
    );
    assert.equal(
      await page.getByRole('button', { name: 'Previous competition', exact: true }).isDisabled(),
      true,
    );
    await track.press('ArrowRight');
    await page.waitForFunction(
      () =>
        document.querySelector('[data-home-carousel=competitions] .home-products-track')
          ?.scrollLeft > 20,
    );
    await track.press('Home');
    await atStart();

    // The browser's native horizontal scrolling is the touch/trackpad path.
    await track.evaluate((e) => e.scrollTo({ left: e.scrollWidth, behavior: 'instant' }));
    await atEnd();
    await track.press('Home');
    await atStart();
    const campaignCard = cards.filter({
      has: page.getByRole('heading', { name: 'Fixture Challenge', exact: true }),
    });
    assert.equal(
      await campaignCard.getAttribute('href'),
      '/season/?view=competitions&campaign=calls',
    );
    await campaignCard.click();
    await page.getByRole('heading', { name: 'Fixture Challenge', exact: true, level: 1 }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('campaign'), 'calls');
    for (const [name, view] of [
      ['Streak Five', 'five'],
      ['Streak Survivor', 'survivor'],
      ['Predictions', null],
    ]) {
      await openHome();
      await cards.filter({ has: page.getByRole('heading', { name, exact: true }) }).click();
      await page.waitForFunction(
        (expected) => new URL(location.href).searchParams.get('view') === expected,
        view,
      );
    }

    // Long names and same-origin custom artwork retain the compact layout.
    const imageUrl = '/media/competitions/' + 'c'.repeat(64) + '.webp';
    artworkState.images.set(
      imageUrl,
      fs.readFileSync(
        path.resolve(
          __dirname,
          '../design/navigation-artwork-review/assets/predictions-banner.png',
        ),
      ),
    );
    campaigns[0].artwork = { icon: null, banner: { url: imageUrl, width: 1440, height: 480 } };
    campaigns[0].name =
      'The community prediction challenge with a deliberately long competition name';
    campaigns[0].description = 'Follow your matchweek with the community. '.repeat(25);
    campaigns[0].rehearsal = true;
    await openHome();
    await page.locator(`.home-product img[src="${imageUrl}"]`).waitFor();
    assert.equal(await competitionCards.first().getByText('Rehearsal', { exact: true }).count(), 1);
    assert.match(await competitionCards.first().innerText(), /test awards/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({
      path: path.join(output, `${engineName}-${width}-home-custom-art.png`),
    });
    artworkState.broken = true;
    await openHome(true);
    await competitionCards.first().locator('img[src="/brand/on-form-icon-512.png"]').waitFor();
    artworkState.broken = false;

    fail = true;
    await openHome();
    await page.getByText('Competitions unavailable', { exact: false }).waitFor();
    assert.equal(await cards.count(), 3);
    assert.equal(
      await page.getByText('Watch out for competitions coming soon.', { exact: true }).count(),
      0,
    );
    fail = false;
    await page
      .locator('.home-products-empty')
      .getByRole('button', { name: 'Retry', exact: true })
      .click();
    await page.waitForFunction(() => document.querySelectorAll('.home-product').length === 7);
    const wrongViewer = (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          now: new Date().toISOString(),
          admin: true,
          viewerId: 'stale-other-account',
          campaigns,
          detail: null,
        }),
      });
    await context.route(listUrl, wrongViewer);
    await openHome(true);
    await page.getByText('Competitions unavailable', { exact: false }).waitFor();
    assert.equal(await cards.count(), 3, 'A stale account response cannot reveal its competitions');
    await context.unroute(listUrl, wrongViewer);
    campaigns.splice(0, campaigns.length);
    await openHome(true);
    await page.getByText('Watch out for competitions coming soon.', { exact: true }).waitFor();
    assert.equal(await cards.count(), 3, 'No active competitions still shows every core product');
    assert.equal(
      await page.getByRole('button', { name: 'Next competition', exact: true }).count(),
      0,
    );
    await page.screenshot({ path: path.join(output, `${engineName}-${width}-home-empty.png`) });
    if (width < 700) {
      await page.getByRole('button', { name: 'Next feature', exact: true }).click();
      await page.waitForFunction(
        () =>
          document.querySelector('[data-home-carousel=features] .home-products-track')?.scrollLeft >
          20,
      );
    }
    console.log(
      `${engineName} ${width}: Home carousel, shared query, active states, keyboard/scroll, links, artwork and failure recovery passed.`,
    );
  } finally {
    clearTimeout(holdTimeout);
    release?.();
    campaigns.splice(0, campaigns.length, ...original);
    artworkState.broken = false;
    await context.unroute(listUrl, campaignRoute);
    await context.unroute(base + '/api/markets?**', marketRoute);
  }
}
module.exports = { homeProductsJourney };
