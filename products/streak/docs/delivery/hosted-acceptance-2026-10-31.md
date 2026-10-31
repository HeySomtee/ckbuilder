# Production test plan: Saturday, 31 October 2026

Use [production Streak Five](https://streakpitch.com/season/?view=five), regular
data and testnet tCKB. All times below are Lagos (UTC+1).
The owner confirms all six wallets are created and funded. Skip setup.

**Five GW9 picks and sponsorship bids close TODAY at 12:00 noon.** Both the
[hosted round](https://streakpitch.com/api/five) and
[official FPL feed](https://fantasy.premierleague.com/api/bootstrap-static/)
confirmed this at 10:44. The round was open, with no confirmed sponsor bids.
Aim to finish entries and bids by **11:30**.

## 1. Save the teams first: 10:45 to 11:10

| Wallet | Device/provider | Five task |
| --- | --- | --- |
| A | MetaMask admin | Save five players and a captain; note the squad |
| B | Second MetaMask address | Copy A's five and captain to exercise equal scoring |
| C | Zerion | Save a different squad and captain |
| D | Second Zerion address | Save a squad, change one player, then Save changes |
| E | Another MetaMask address | Save a different squad; navigate away and return |
| F | Zerion mobile | Save five and a captain; reload and check they remain |

- [ ] Use eligible players within **40 credits** and fill all required positions.
- [ ] Save every wallet's team before spending time on optional UI checks.
- [ ] On each wallet, reload once and confirm the saved team and correct address.
- [ ] Disconnect before switching accounts. Confirm the new address before saving.
- [ ] If the new build is still deploying, save teams on the current production app first.

## 2. Sponsor auction: finish by 11:30

- [ ] A bids **500 tCKB** in Sponsors. Wait for confirmed status.
- [ ] B bids **1,000 tCKB**. Wait for confirmed status.
- [ ] A adds **1,000 tCKB**. Check A's combined bid is **1,500 tCKB**.
- [ ] Add A's optional name, website, description and logo if time permits; leave B unbranded.
- [ ] Keep transaction hashes. Do not resend an uncertain signed payment.

Planned contributions total **2,500 tCKB plus fees**. With no higher eligible bid,
A should win and B should receive **1,000 tCKB back**. Confirm actual refunds;
the public funding-enabled flag does not prove payouts work.

## 3. At noon

- [ ] Confirm both squad edits and new sponsorship bids are locked.
- [ ] Check saved teams still display after reload.
- [ ] The **12:30 confirmation cutoff is not extra bidding time**.
- [ ] After auction resolution, check the winning sponsor and B's refund hash.

## 4. Survivor next, then match predictions

- [ ] A creates and publishes **QA Progression** with two available rounds and
  **QA Finish** with one round. Check the actual displayed lock time before joining.
- [ ] A through E join and select teams; use opposing teams from the same fixtures
  to cover different outcomes. F joins but deliberately leaves its Survivor pick empty.
  F must still save a Five team in step 1.
- [ ] Recheck today's open Markets. A takes Home, B Draw and C Away on the same
  available match, **100 tCKB each**, to cover every normal result. Budget each pick
  at **100 stake + 321 refundable storage**, plus fees. Voids do not cover win/loss.
- [ ] D rejects an unsigned payment once, then retries. Check pending progress,
  mobile minimization and Activity after confirmation.

## 5. Follow through

- [ ] During matches: compare player points and captain scoring with the published rules.
- [ ] After settlement: collect a winning return and a losing pick's storage refund.
- [ ] After Survivor results: check elimination, F's missed pick, progression and disabled used teams.
- [ ] Five cannot finalize before **Wednesday, 4 November at 03:00** and may await
  final provider data. Then verify awards, ties if qualifying, and no duplicate payment.

Log only: **wallet, action, result, screenshot/hash**. Record the deployed revision.
Two identical teams test equal scoring; they only test a reward tie if they qualify.
No production entry, bid, refund or award is marked passed until observed.
