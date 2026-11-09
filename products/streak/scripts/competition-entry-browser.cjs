/* Built app only, synthetic joined competitions and existing payment UI. */
const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async function competitionEntryJourney({
  page,
  base,
  campaigns,
  createCampaign,
  account,
  fixtures,
  navigate,
  reload,
  width,
  engineName,
  output,
}) {
  const original = structuredClone(campaigns);
  try {
    const a = createCampaign('choice-a'),
      b = createCampaign('choice-b');
    for (const [index, c] of [a, b].entries()) {
      c.name = c.draft.name = index ? 'Weekend Cup' : 'Matchday Challenge';
      c.predictionEntryPolicy = 'explicit-entry-v3';
      c.joined = true;
      c.registeredCount = 1;
      c.joinedFixtureIds = c.fixtures.map((f) => f.fixtureId);
      c.pendingFixtureIds = [];
      c.own = {
        publicId: 'synthetic-own',
        name: 'Synthetic player',
        rank: 1,
        points: 0,
        participated: false,
        qualifyingEntries: 0,
        tieBreakAt: null,
        joinedAt: new Date().toISOString(),
        calls: [],
        fiveRoundId: null,
      };
      c.leaderboard = [{ ...c.own, own: true, awardShannons: null }];
      c.leaderboardTotal = 1;
    }
    campaigns.splice(0, campaigns.length, a, b);
    await page.evaluate(() => localStorage.removeItem('streak.predictionDraft.v1'));
    await navigate(base + '/season/?view=competitions&campaign=choice-a');
    await page.getByRole('button', { name: 'Home 1 to win', exact: true }).click();
    const slip = page.locator('dialog[open]').filter({ has: page.locator('#slip-title') });
    await slip
      .locator('.competition-choice-trigger')
      .getByText('Matchday Challenge', { exact: true })
      .waitFor();
    const readChoices = () =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('streak.predictionDraft.v1')).picks[0].competition,
      );
    assert.deepEqual(await readChoices(), { accountId: account.id, ids: ['choice-a'] });
    await slip
      .getByRole('button', { name: 'Where this pick counts: Home 1 vs Away 1', exact: true })
      .click();
    const sheet = page.locator('.competition-choice-dialog[open]');
    await sheet.getByRole('heading', { name: 'Where should it count?' }).waitFor();
    await sheet.getByRole('checkbox', { name: /Weekend Cup/ }).check();
    await sheet.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.deepEqual((await readChoices()).ids, ['choice-a'], 'Cancel preserves the saved choices');
    await slip.locator('.competition-choice-trigger').click();
    await sheet.getByRole('checkbox', { name: /Weekend Cup/ }).check();
    assert.equal(
      await sheet.getByRole('checkbox', { name: /Regular prediction/ }).isChecked(),
      false,
    );
    await page.screenshot({ path: path.join(output, `${engineName}-${width}-entry-multiple.png`) });
    await sheet.getByRole('button', { name: 'Save choices', exact: true }).click();
    assert.deepEqual((await readChoices()).ids, ['choice-a', 'choice-b']);
    await slip
      .locator('.competition-choice-trigger')
      .getByText('2 competitions', { exact: true })
      .waitFor();
    await page.getByRole('button', { name: 'Close prediction slip', exact: true }).click();
    await reload();
    await page.locator('.prediction-dock').click();
    await slip
      .locator('.competition-choice-trigger')
      .getByText('2 competitions', { exact: true })
      .waitFor();
    await slip.locator('.competition-choice-trigger').click();
    await sheet.getByRole('checkbox', { name: /Regular prediction/ }).check();
    await sheet.getByRole('button', { name: 'Save choices', exact: true }).click();
    assert.deepEqual((await readChoices()).ids, []);
    assert.equal(
      await slip.locator('.slip-campaign-context').count(),
      0,
      'Opt-out removes competition labels everywhere',
    );
    await page.getByRole('button', { name: 'Close prediction slip', exact: true }).click();
    await navigate(base + '/season/?market=market-0');
    await page.locator('.detail-outcomes button[data-outcome="away"]').click();
    await page.locator('.prediction-dock').click();
    await slip
      .locator('.competition-choice-trigger')
      .getByText('Regular prediction', { exact: true })
      .waitFor();
    assert.deepEqual(
      (await readChoices()).ids,
      [],
      'Regular remains regular after navigation and outcome edit',
    );
    a.own.calls = [
      {
        fixtureId: fixtures[0].fixtureId,
        outcome: 0,
        points: 0,
        status: 'pending',
        transactionHash: '0x' + 'a'.repeat(64),
      },
    ];
    b.pendingFixtureIds = [fixtures[0].fixtureId];
    await page.getByRole('button', { name: 'Close prediction slip', exact: true }).click();
    await reload();
    await page.locator('.prediction-dock').click();
    await slip.getByText('Earlier entry pending', { exact: true }).waitFor();
    assert.equal(
      await slip.locator('.competition-choice-trigger').count(),
      0,
      'No selector when all slots are used or pending',
    );
    assert.equal(await slip.locator('.slip-campaign-context').count(), 0);
    await page.screenshot({
      path: path.join(output, `${engineName}-${width}-entry-used-pending.png`),
    });
    b.pendingFixtureIds = [];
    await page.getByRole('button', { name: 'Close prediction slip', exact: true }).click();
    await reload();
    await page.locator('.prediction-dock').click();
    await slip.locator('.competition-choice-trigger').click();
    assert.equal(
      await sheet.getByRole('checkbox', { name: /Matchday Challenge/ }).isDisabled(),
      true,
    );
    assert.equal(await sheet.getByRole('checkbox', { name: /Weekend Cup/ }).isDisabled(), false);
    await sheet.getByRole('checkbox', { name: /Weekend Cup/ }).check();
    await sheet.getByRole('button', { name: 'Save choices', exact: true }).click();
    assert.deepEqual((await readChoices()).ids, ['choice-b']);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
    );
    await page.screenshot({ path: path.join(output, `${engineName}-${width}-entry-mixed.png`) });
    await page.getByRole('button', { name: 'Close prediction slip', exact: true }).click();
    console.log(
      `${engineName} ${width}: explicit selection, cancel, multi-entry, opt-out, reload, used/pending slots and normal picks passed.`,
    );
  } finally {
    campaigns.splice(0, campaigns.length, ...original);
  }
};
