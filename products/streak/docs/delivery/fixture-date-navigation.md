# Daily fixture navigation

20 October 2026. The owner requested LiveScore-style date navigation using the supplied desktop calendar and mobile day-strip references.

Markets now opens on Today. Previous/next arrows move exactly one local calendar day; nearby dates use Today, Yesterday and Tomorrow labels. The month calendar supports adjacent-month days, month arrows, keyboard arrows, Home/End, Page Up/Down, Escape and focus restoration. The selected date is retained in the URL and through match-detail/back navigation.

On phones, the date strip scrolls horizontally without widening the page. Live and the calendar remain outside that strip. Selection is centered when changing dates, returning to Markets or resizing the window. The Weekend shortcut retains Friday through Monday. The landing page's editorial weekend lineup remains unchanged.

Owner refinement: desktop now has a single arrow/date bar capped at 460px. Below 641px that center control is replaced by the horizontal date strip, with Today centered initially and each newly selected date centered thereafter. Dates fade progressively toward both edges; the strip remains swipeable without a visible scrollbar. Forced-colors mode removes the fade for legibility. Weekend is available inside the calendar, alongside Back to today.

The League selector combines configured competitions from the existing `/api/status` snapshot with competitions present in the provider's available catalogue, including UEFA Champions League when supplied. The API applies the selected competition before pagination and combines it with date, Live/status, search and sort. The public competition query is cached for five minutes independently of fixture filters, so other leagues remain selectable when the current league or day has no matches. No competitions are hardcoded and no external provider requests are added for the selector.

20 October empty-options correction: the owner's running local API returned market rows but omitted the newly added `competitions` metadata. Rebuilding frontend assets had not restarted that older server process. The selector previously treated missing metadata as an empty league list. It now uses the already supported status endpoint and merges catalogue metadata when available. Loading and failure have explicit labels; a failed options read has a Retry leagues action. Fixture browsing remains independent.

A read-only browser check against the running local app showed all six configured leagues and returned nine UEFA Champions League fixtures after selecting that league, with HTTP 200 and only competition ID `2` rows. This check used no wallet, signature or operator restart. It verifies the running local app, not Render deployment. The synthetic 390px browser journeys also remove the new metadata from market responses to cover the older-server case.

The correction passed all 26 Chromium/WebKit browser groups, production build, lint, formatting and static checks. Evidence: `.quality-artifacts/league-options-{build,browser,lint,format,static}.log` and `league-options-local.png`. Earlier full-suite receipts remain historical; no commit or deployment is claimed.

Live uses the fixture's provider status, not legacy market settlement. Its bounded window includes yesterday and today so games crossing midnight are not lost. Other date selections use local midnight boundaries, including 23-hour and 25-hour daylight-saving days. Calendar month browsing does not fetch fixtures until a date is selected.

Dates outside the loaded provider schedule retain the existing unavailable-schedule state. No scores, fixtures, market availability or results are invented. Existing ranking, paging, search and prediction-slip behavior remain in place. No dependencies, wallet rules, operator processes or contract economics changed.

## Verification

The frontend/backend build, strict frontend lint, four calendar/weekend tests and catalogue lifecycle-filter regression passed. The calendar tests cover invalid dates, leap years, year rollover, Monday-first month grids and daylight-saving boundaries.

All **26 integrated Season browser groups passed in Chromium and WebKit**. Added checks cover daily arrows, Live filtering, calendar month/keyboard selection, Escape/focus restoration, horizontal scrolling, 320x568 dialog bounds and selected-date centering after resize. Existing market, account and eight-pick recovery journeys continue to run, with their fixed-week fixtures explicitly selecting Weekend or a dated URL. Calendar and phone navigation screenshots were visually reviewed.

Evidence: `.quality-artifacts/calendar-build.log`, `calendar-lint.log`, `calendar-unit.log`, `calendar-filter.log` and `calendar-season-browser.log`. Browser screenshots include `.quality-artifacts/browser/calendar-{engine}-{width}.png`.

Responsive refinement evidence uses `.quality-artifacts/calendar-refinement-{build,lint,unit,browser,format,static}.log`. The browser checks additionally assert mutually exclusive desktop/mobile controls, the 460px desktop cap, centered Today, hidden scrollbars, edge masking, league filtering beyond the first page, retained league options, combined team search and clearing filters from the empty state. Cropped visual evidence is in `.quality-artifacts/browser/date-navigation-{engine}-{width}.png`.

The final refinement run passed all 26 Chromium/WebKit groups, the frontend/backend build, lint, two calendar tests, formatting and static policies. Desktop and centered-Today phone screenshots were visually reviewed.

These are scoped navigation checks. The preceding wallet/Activity pass's 60-check receipt is historical evidence for that earlier candidate, not a new full-suite receipt for this change. No commit, push or hosted deployment was performed.
