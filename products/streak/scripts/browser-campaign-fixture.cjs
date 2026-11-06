/* Empty navigation discovery for suites exercising other features.
 * Competition HTTP, scoring and UI use their own real/fault fixtures. */
const assert = require('node:assert/strict');
module.exports = async function emptyCampaignList(context, origin) {
  assert.equal(new URL(origin).hostname, '127.0.0.1');
  const viewers = new WeakMap();
  // Observe the suite's existing account response; do not introduce a second auth fixture.
  context.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin !== origin || !['/api/me', '/api/logout'].includes(url.pathname)) return;
    const page = response.request().frame().page();
    if (url.pathname === '/api/logout') {
      if (response.ok()) viewers.set(page, Promise.resolve(null));
      return;
    }
    viewers.set(
      page,
      response
        .json()
        .then((body) => body.user?.id ?? null)
        .catch(() => null),
    );
  });
  await context.route(`${origin}/api/campaigns`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const viewerId = await (viewers.get(route.request().frame().page()) ?? Promise.resolve(null));
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        now: new Date().toISOString(),
        admin: false,
        viewerId,
        campaigns: [],
        detail: null,
      }),
    });
  });
};
