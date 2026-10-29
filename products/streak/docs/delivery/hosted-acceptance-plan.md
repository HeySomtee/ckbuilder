# Production test plan: after release freeze

Test on **[streakpitch.com](https://streakpitch.com)** with regular data and **testnet tCKB**. These tests are unperformed; the 28 October bets were missed. Finish the agreed development scope, verify and deploy the candidate, then choose fresh fixtures and gameweeks. Record times in **Lagos (UTC+1)**.

## Before scheduling

- [x] Finish the splash refinement and local PostgreSQL Activity launcher setup. Verified locally on 29 October.
- [ ] Decide whether the pending linked-cell loading preview belongs in this release.
- [ ] Pass the final candidate's required checks, deploy it and record the revision. Verify API, sponsor, settlement, Activity and Five rewards operation.
- [ ] Freeze feature work during acceptance. Fix blocking defects when needed, then repeat affected tests on the replacement revision.

## 1. Prepare six wallets

Use separate addresses/browser profiles. Fund each with **5,000 tCKB**.

| Wallet | Role                                                  |
| ------ | ----------------------------------------------------- |
| A      | MetaMask admin: Home bets, sponsorship, host Survivor |
| B      | MetaMask: Draw bets, sponsor refund                   |
| C      | Zerion: Away bets                                     |
| D      | Zerion: mixed slip/retry                              |
| E      | UTXO Global, or another MetaMask address              |
| F      | MetaMask mobile                                       |

The operator pays new-market setup. Planned payments including D: **7,131 tCKB plus fees**. Game entries are free.

## 2. Predictions: test wins and losses

On **each** match: A stakes **100 Home**, B **100 Draw**, C **100 Away**. Submit three picks per wallet; A first.

Choose **three open fixtures** after the release is ready. Record their names and kickoffs, use the same matches for A/B/C, and recheck availability before paying.

- [ ] Check each three-pick invoice: **300 stake + 963 refundable storage**, plus fees. All picks must become accepted.
- [ ] Compare B/C's preparation speed with A's.
- [ ] Optional D: 100 on an existing market and 100 on a new one. Reject/retry once. Invoice: **200 + 642 storage**, plus fees.
- [ ] Collect a winning return and a loser's **321 storage**. Leave one claim overnight, reload, collect and check duplicate collection is blocked.

Three accepted outcomes give one winner/two losers on normal settlement. Voids or missing reports may leave cases untested. Investigate unresolved games within the six-hour reporting window from kickoff.

## 3. Streak Five: teams, auction and prizes

- [ ] Choose an open gameweek and record its official FPL deadline. Save teams early, within 40 credits, with captains. A/B use identical squads; others differ.
- [ ] A bids **500**, B bids **1,000**, A adds **1,000**. A's combined bid should be **1,500**. Add sponsor details/logo for A; omit B's branding.
- [ ] Picks and new bids must lock at that deadline. Bid early; confirmation checks can continue during the published reconciliation window.
- [ ] Without higher eligible bids, A wins and B receives its **1,000 refund**. Verify the wallet transaction and approved sponsor display.
- [ ] After official results and the round's finalization window, check points/captain doubling and prizes. Collect, reload, check duplicate-payment prevention and automatic next-gameweek opening.

Six entries at the current top-5% rule normally produce one qualifying place, plus ties.

## 4. Survivor: progression and elimination

Choose a future complete round. Create **QA Progression** with that round and the next; **QA Finish** with the first round only. All wallets join both, free. Record the displayed pick deadlines.

| Wallet | Pick                              |
| ------ | --------------------------------- |
| A / B  | Opposing teams in one fixture     |
| C / D  | Opposing teams in another fixture |
| E      | Another eligible team             |
| F      | Deliberately leave the pick empty |

- [ ] Verify picks lock at each displayed deadline. Check progression once that round's results are finalized.
- [ ] Compare survivors, eliminations and F's missed pick with the published rules. Check used teams are disabled. Progression should open its next round when applicable; Finish should record its winners.

If every actual pick loses, the rescue rule can advance those pickers. Paid entry and automatic Survivor prize payments are not implemented.

## 5. Check and record

- [ ] Desktop/mobile: navigate, reload and switch accounts. Login, entries and payment progress should persist; private data must not cross accounts. Check wallet warnings on the final domain and record any warning without bypassing it.

Record failures with **wallet letter, match/page, expected result, screenshot and transaction hash**. Never resend an uncertain signed payment. Mark unseen cases as **Not exercised**. Local results do not count as production evidence.
