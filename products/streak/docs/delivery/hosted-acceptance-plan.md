# Production test plan: Friday, 30 October 2026

Historical plan. Use the [31 October FPL-first checklist](hosted-acceptance-2026-10-31.md)
for today's funded-wallet campaign and noon Five deadline.

Use **[streakpitch.com](https://streakpitch.com/season/)**, regular data and **testnet tCKB**. All times are **Lagos (UTC+1)**. Tests are not yet performed. Local review does not count as production acceptance.

**Campaign started, 30 October at 09:51 Lagos.** Read-only preflight: production
returns HTTP 200; entry asset filenames match the local build of published
`b7511ec`. Batch payments report enabled and all three target fixtures report
available. Five GW9 is open with funding available, regular data and the expected
31 October noon deadline. These checks do not prove settlement or payouts work,
or independently identify the hosted backend revision. Next: Wallet A's three
Home picks. No wallet submission or acceptance has been reported yet.

**Wallet checkpoint:** The owner confirms Zerion Android sign-in works after
updating the wallet app. Navigation, reload and payment acceptance remain open.
A separate Disconnect/account-switching correction is being verified locally;
after publication, check A to B in MetaMask and C to D in Zerion, then F on
mobile. The displayed address and private Activity must match the new account.
Do not mark these checks passed from synthetic browser evidence.

## 1. Get ready today

- [ ] Review the local Five layout, then approve its push. After deployment, record the Render commit and confirm the new layout on production. Pause feature changes during testing.
- [ ] Confirm hosted payments, settlement, Activity and Five rewards are working. Five currently reports funding available; that does not prove a payout completed.
- [ ] Prepare six separate wallets/browser profiles with **5,000 tCKB each**. Keep the operator funded for market creation.

| Wallet | Use                                                             |
| ------ | --------------------------------------------------------------- |
| A      | MetaMask admin; Home picks; sponsor; create Survivor            |
| B      | Another MetaMask address; Draw picks; losing sponsor bid        |
| C      | Zerion; Away picks                                              |
| D      | Another Zerion address; mixed slip and rejected-signature retry |
| E      | Another MetaMask address; games and login                       |
| F      | Zerion mobile, distinct address; mobile flows and missed pick   |

## 2. Place tonight's predictions by 20:00

These fixtures are in the [hosted catalogue](https://streakpitch.com/api/direct/fixtures), checked on 30 October. Recheck that each is open before signing.

| Match today            | Kickoff | A: 100 Home | B: 100 Draw | C: 100 Away |
| ---------------------- | ------- | ----------- | ----------- | ----------- |
| Elversberg vs Mainz    | 20:30   | Elversberg  | Draw        | Mainz       |
| Villarreal vs Espanyol | 21:00   | Villarreal  | Draw        | Espanyol    |
| Lille vs Lens          | 21:05   | Lille       | Draw        | Lens        |

- [ ] A submits first, then B/C. Each three-pick invoice: **300 stake + 963 refundable storage**, plus fees. Wait for every pick to be accepted.
- [ ] D: **100 on Elversberg** plus **100 on Chelsea vs Manchester United**, tomorrow at **13:30**. Check the latter has no existing market if testing first-bettor deployment. Reject before signing once, then retry. Invoice: **200 + 642 storage**, plus fees.
- [ ] Close the slip, navigate, reload and check Activity. Signed payment progress must persist. Never resend an uncertain signed payment.
- [ ] Check the first result from about **22:30**, later games from **23:00**. After actual settlement, collect a winning return and a losing pick's **321 tCKB storage**, less applicable fees. Leave another claim until tomorrow, reload and collect; duplicate collection must be blocked.

All three outcomes give one winner and two losers per normally settled match. Voids do not count as win/loss coverage. Investigate unresolved reporting before **02:30 / 03:00 / 03:05 on 31 October**, respectively, under the six-hour reporting window.

Backups today: **Nice vs Rennes** and **Le Havre vs PSG**, both **19:00**, if still open. If tonight's games have closed, use tomorrow's Chelsea vs Manchester United and Manchester City vs Brighton (**16:00**). Kickoffs cross-checked with [LiveScore](https://www.livescore.mobi/football/2026-10-30/?tz=1) and [Lille's announcement](https://www.losc.fr/actualites/2026-10-28/arrete-prefectoral-avant-losc-rcl).

## 3. Save Five teams and sponsor GW9 today

**Picks and bids close Saturday, 31 October at 12:00 noon**, matching the [official FPL feed](https://fantasy.premierleague.com/api/bootstrap-static/) and [hosted Five round](https://streakpitch.com/api/five). Finish today.

- [ ] All six wallets save five eligible players within **40 credits**, with a captain. A/B use identical squads and captains; others differ. Edit a saved team, use Save changes and reload. Check player info and upcoming fixtures.
- [ ] A bids **500**, B bids **1,000**, A adds **1,000**. A's total must be **1,500**. Add A's logo, website and description; leave B anonymous. Wait for confirmed bids.
- [ ] Tomorrow at **12:00**, verify picks/new bids lock. The **12:30 confirmation cutoff** is not extra bidding time.
- [ ] After auction resolution, absent a higher eligible bid, A wins and B receives **1,000 back**. Verify the refund transaction and approved sponsor display.
- [ ] During **31 October to 2 November**, check points/captain doubling against the scoring rules. After finalization, verify qualifying awards, collect, reload and check duplicate-payment prevention.

The hosted round cannot finalize before **4 November at 03:00**, and may wait longer for final provider data. Six entries at top 5% usually produce one qualifying place, plus ties. A/B only test a reward tie if they finish at the qualifying boundary. Check automatic next-gameweek opening; FPL currently lists GW10's deadline as **6 November, 19:30**.

## 4. Create and join Survivor today

Create two **free** competitions: **QA Progression** with complete EPL GW9 and GW10 rounds; **QA Finish** with GW9 only. Save each draft, then publish it to open entries. Select the supplied rounds; deadlines are automatic. GW9's expected lock is **31 October, 13:29**, one minute before the first kickoff. This differs from Five's noon deadline. Verify the displayed deadlines/rules as admin; the public logged-out endpoint intentionally hides available rounds.

All six wallets join both:

| Wallet | GW9 pick                        | Match in Lagos time                |
| ------ | ------------------------------- | ---------------------------------- |
| A      | Chelsea                         | 31 Oct, 13:30 vs Manchester United |
| B      | Manchester United               | Same match, opposing pick          |
| C      | Manchester City                 | 31 Oct, 16:00 vs Brighton          |
| D      | Brighton                        | Same match, opposing pick          |
| E      | Brentford                       | 31 Oct, 16:00 vs Nottingham Forest |
| F      | Join, deliberately make no pick | Missed-pick elimination            |

- [ ] Tomorrow at the deadline, verify picks lock. After GW9 results finish, verify survival/elimination and F's missed pick against the rules.
- [ ] Progression should offer its next round if multiple survivors remain; used teams must be disabled. Finish should declare winner(s). A sole survivor can finish early; an all-picked-teams-lose rescue can change progression. Record the branch that happened.

GW9's last EPL fixture is Newcastle vs Everton on **2 November at 21:00**; the scheduled six-hour result window ends **3 November at 03:00**. Check progression then. Full-round progression is not a same-day test. Fixtures match the [Premier League schedule](https://www.premierleague.com/en/news/4675097/all-380-fixtures-for-season-202627-premier-league-season). Survivor paid entry and automatic prize payouts are not implemented.

## 5. Keep a short result log

- [ ] Desktop/mobile: navigate, reload and switch wallets. Login and entries should persist; another account's private data must not appear. Check cell loaders, visible failures and retry.
- [ ] Record issues: **wallet letter, match/page, expected vs actual, screenshot, transaction hash and deployed revision**. Mark unseen branches **Not exercised**.

Planned payments including D and the auction: **7,131 tCKB plus fees**, including refundable storage and B's refundable bid. Game entries are free. Today's public read-only checks do not prove any production transaction succeeded.
