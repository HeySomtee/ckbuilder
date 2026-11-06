# GW10 production test checklist

Use [production](https://streakpitch.com/season/?view=competitions) after deployment.
Your six wallets are funded. These checks are not yet performed. All times: **Lagos**.

**Finish setup, teams and bids by Friday, 6 November, 18:30. Five locks at 19:30.**
Verified against [FPL](https://fantasy.premierleague.com/api/bootstrap-static/) on
5 November. GW11 closes **21 November at noon**. Recheck the app's deadline.

## 1. Set up as Wallet A

- [ ] Confirm the deployed revision and [hosted settings/services](competitions.md#configuration-and-rehearsal).
      Use ordinary API data, not dummy mode.
- [ ] **Competitions → Manage competitions → Create competition**: create
      **GW10 Five Test** and **GW10 Predictions Test**. Enable **Rehearsal competition**
      for both. Set registration to close **6 November, 19:00**; awards **300 / 200 / 100**.
- [ ] Select GW10 for Five. For Predictions, choose these if open in Streak:

| Match                    | Kickoff, Lagos   |
| ------------------------ | ---------------- |
| Everton vs Coventry City | Fri 6 Nov, 21:00 |
| Leeds vs Spurs           | Sat 7 Nov, 13:30 |
| Fulham vs Newcastle      | Sat 7 Nov, 16:00 |

Dates verified from [FPL fixtures](https://fantasy.premierleague.com/api/fixtures/?event=10).
Hosted availability is unverified; substitute an open match if needed.

- [ ] Review both and **Publish competition**. Terms freeze when published.

Rehearsal awards pay no mainnet CKB. Predictions/sponsorship use real **tCKB** and
the shared GW10 round. Survivor is excluded.

## 2. Use these wallet roles

First, **E places 100 tCKB on Home in all three matches before joining**. This
creates the markets. Those predictions must not earn campaign points. E also
saves a Five squad before joining, which should qualify after registration.

Register all six in both competitions. Check immediate leaderboard entries.
**Disconnect** between wallets and confirm the new address.

| Wallet | Provider       | Predictions after joining  | Five                                        |
| ------ | -------------- | -------------------------- | ------------------------------------------- |
| A      | MetaMask admin | Home on all three          | Save first; sponsor                         |
| B      | MetaMask       | Draw on all three          | Copy A's squad and captain; save later      |
| C      | Zerion         | Away on all three          | Different squad                             |
| D      | Zerion         | Home on all three, after A | Save, edit a player, Save changes           |
| E      | MetaMask       | None; remain inactive      | Save before registering; check it qualifies |
| F      | Zerion mobile  | One match only             | Register but leave squad unsaved            |

Use **100 tCKB per pick**, starting from competition match cards. Three picks cost
**1,263 tCKB plus fees**, including refundable storage.

## 3. Check normal play before the deadline

- [ ] Five: check budget, captain requirement, player details, upcoming fixtures,
      **Save changes** and saved teams after reload. B's unchanged save must not
      reset the tie-break time. Keep A/B's final squads identical.
- [ ] D rejects wallet approval, then retries: picks remain saved.
- [ ] D repeats one paid pick at 200 tCKB: only the first qualifying pick counts;
      the larger stake adds no campaign points.
- [ ] Try B/C payments together: success or clear retry, no duplicate charges.
- [ ] F tests mobile dropdowns, slip close/reopen and draggable pending blob.
      Reload after submission; payment progress and Activity must remain.
- [ ] Switch accounts and pages: correct team, Activity and admin access.
      Join twice: no duplicate entry. Recover uncertain payments instead of paying again.

## 4. Test Five sponsorship

Open **Streak Five → Sponsors**. If no larger bid already exists:

1. A bids **500 tCKB**, with optional name, logo, website and description.
2. B bids **1,000 tCKB**, without branding.
3. A adds **1,000 tCKB**. A's total should become **1,500**.

Wait for each confirmation. Check editable amounts and rejection of lower bids.
If someone already leads, review the required amount before funding it.

## 5. At the deadlines and during matches

- [ ] **Friday 19:00:** new campaign registrations close.
- [ ] **Friday 19:30:** squads and new bids lock. Saved teams remain visible.
- [ ] After auction resolution: winning branding appears; B gets **1,000 tCKB back**
      if A won. Check the refund transaction.
- [ ] During matches: player points/captain scoring update. **Pick next team**
      opens a separate week without changing GW10.
- [ ] Predictions close at their own market cutoff. After settlement: **3 points
      per correct qualifying pick**, 0 otherwise. E stays inactive at the bottom.
- [ ] Collect a winning return and a losing pick's storage refund. Reload and
      collect another later. Duplicate collection must be blocked.

Home/Draw/Away coverage guarantees win/loss coverage only for normally settled matches.

## 6. Finish and inspect

- [ ] Once results are verified: **Review final standings → Finalize verified
      standings**. Check finished results, ties and no awards for inactive entrants.
      Five finalization can take longer than the matches.
- [ ] A ranks ahead of D for identical predictions and B for identical Five scores.
- [ ] Any Five sponsor-pool winner tests **Collect rewards** and no duplicate payment.
- [ ] **Export entrants** and **Evidence → Download verified JSON**: check six entries,
      points, timestamps and hashes. Keep rehearsal evidence separate from community stats.
- [ ] Create a spare rehearsal; E joins and saves its link. Test deletion: Cancel,
      wrong name, then exact name. Listing disappears; E's archive and payments remain.

**Mainnet payouts need a separate funded normal competition:** winner confirms
address → you send the exact award → **Verify payment** with hash/output index
after 24 confirmations. Rehearsals cannot test this; sending is not automatic.

Log: **wallet · action · pass/fail · screenshot/hash**. Mark unseen branches
**Not exercised**; do not force outages or fill public markets to trigger errors.
