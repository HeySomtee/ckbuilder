# Week 18: Streak contract lab

An isolated Rust prototype for stake admission, oracle submission deadlines and
refunds on CKB. This is a local experiment, not the deployed Streak treasury or
a complete betting protocol. Do not use these scripts with real funds.

## Run

From the repository root, the wrappers select Linux tools directly or your
default WSL distribution on Windows:

```bash
npm run test:week18
npm run devnet:week18
npm run evidence:week18
```

The evidence command requires the Streak package's Playwright Chromium install.
It publishes the completed run records and a static evidence page to
`reports/assets/week-18`, then takes desktop and mobile screenshots. This is
a view of actual test evidence, not a new betting application screen.

Install Node.js 20+ and the root repository's npm dependencies. The contract
tools require Linux or WSL, Rustup, Clang, GNU ar and Python 3.12+.
`rust-toolchain.toml` pins Rust 1.97.1 and the RISC-V target. The build uses
`passes=lower-atomic`, as recommended by ckb-std for current Rust compilers.

```bash
cd src/week18/contract-lab
bash scripts/test.sh
python3 scripts/prepare-devnet.py
python3 scripts/devnet.py
```

On Windows, use an installed Ubuntu WSL distribution:

```powershell
wsl -d Ubuntu -- bash /mnt/c/Users/HP/Desktop/ckb/src/week18/contract-lab/scripts/test.sh
wsl -d Ubuntu -- python3 /mnt/c/Users/HP/Desktop/ckb/src/week18/contract-lab/scripts/prepare-devnet.py
wsl -d Ubuntu -- python3 /mnt/c/Users/HP/Desktop/ckb/src/week18/contract-lab/scripts/devnet.py
```

Adjust the workspace path for your machine. The runner uses Linux Node.js if
available, otherwise Windows `node.exe`. The devnet binds RPC to 127.0.0.1:8218
and P2P to 127.0.0.1:8219. It creates a new ignored directory per run and shuts
down its own node in a `finally` block. Those ports must be free.

The devnet uses the public fixture keys bundled with CKB's dev chain. It never
loads the application's `.env`, treasury key or user database. RPC fallback
servers are disabled. Transactions use normal `send_transaction`; mined blocks
use the verified `generate_block_with_template` path. No verification-bypass RPC
is used. Historical block timestamps let the tests span six hours without a
six-hour wall-clock wait. Each mined timestamp is checked against the request.

Outputs are `artifacts/vm-tests.txt` and `artifacts/devnet.json`. Build products,
downloaded tools, node state and generated evidence are ignored. The report
contains a checked-in snapshot of the measured evidence.

## Scripts and responsibility

`streak-protocol` is a type script with two cell kinds: market and stake.
`streak-guard` is their lock. The lock permits consumption only when the input
has the exact type hash in its lock args. The type script enforces the allowed
transition. Every continuation also checks the configured guard code hash and
preserves the type identity, including all immutable terms.

Authorization requires a consumed input whose lock hash equals the pinned
admin or owner identity. That input's lock executes normally. Merely adding
an admin cell as a dependency cannot authorize an action. VM fixtures use mock
wallet locks; the devnet suite uses actual secp256k1 signatures and the built-in
signature lock.

## Market flow

1. **Open:** creation authenticates the admin named in the market args and
   commits kickoff, a deadline exactly six hours later, and the reward amount.
2. **ResultPending:** that admin consumes the canonical open market cell and
   records one outcome. The result is provisional and cannot be changed.
3. **Resolved:** anyone consumes ResultPending and loads its actual creation
   header through `Source::GroupInput`. Its timestamp must be at or after kickoff
   and strictly before the result deadline. The unused reward returns to admin.
4. **Void:** anyone can consume Open after the deadline, or consume ResultPending
   after the deadline when its creation timestamp was outside the allowed window.
   The same transaction marks Void and pays the reward. A timely ResultPending
   cannot be voided. Resolved and Void are terminal in this experiment.

The timeout input must have an absolute timestamp `since` at least the deadline,
rounded up to seconds. The node enforces maturity against its consensus median
time. Header admission instead uses the actual creation block's timestamp in
milliseconds. These are different clocks and are not precise wall-clock UTC
guarantees. A prebuilt admin transaction can still enter ResultPending late;
it cannot become Resolved and does not block the cancellation path.

This is an explicit refinement of the earlier proposal: the deadline bounds
**on-chain result commitment**, with verification allowed later. It does not
require the Resolved transaction itself to commit before the deadline. The
final production policy still needs review. A timely but dishonest result is
still possible because football truth remains an admin/API trust assumption.

The canonical result transition prevents cancellation from overlooking a report
in an unrelated cell. It also means two conflicting result/cancellation
transactions cannot both consume the same market version. Only one outcome can
be recorded, and no oracle correction mechanism is provided in this lab.

## Stake flow

1. The owner funds a new **Pending** stake cell while referencing an Open market.
   The output pins market identity, owner, outcome, principal and kickoff cutoff.
2. Anyone can admit it as **Accepted** if its actual creation block precedes
   kickoff. All data except the phase and all capacity must be preserved. The
   referenced market may be Open, ResultPending or Resolved, but not Void.
3. A Pending cell created at or after kickoff can be refunded to its owner.
4. A timely Pending or Accepted cell can be refunded against a Void market.

Refunds return the full stake cell capacity to its pinned owner. Separate wallet
inputs pay transaction fees and prove owner authorization. Users therefore need
an additional spendable owner cell for refunds in this prototype. Timely stakes
cannot simply be withdrawn from an unresolved market after seeing the score.

Accepted cells are admission receipts, not a completed fungible share standard.
Each cell holds one indivisible stake. The prototype does not calculate winning
payouts, aggregate pool totals, transfer shares or consume a shared pool on each
deposit. Admission after result commitment is only an experiment in checking
historical eligibility; a final settlement design must account for all eligible
stakes before calculating payouts.

## Encoding

Integers are unsigned little-endian. Amounts are shannons; timestamps are
milliseconds. Scripts use `data2`. Every script argument includes a 36-byte
seed outpoint that must equal the first input's outpoint on creation. Each
transaction may contain only one identity from this protocol binary, with at
most one input and one output of that identity. This establishes singleton
continuity and avoids counting one refund output for several claims.

| Cell | Args offsets | Data |
| --- | --- | --- |
| Market | kind `0` at 0; seed 1..37; admin lock hash 37..69; kickoff 69..77; deadline 77..85; reward 85..93; guard code hash 93..125 | Two bytes: phase 0/1/2/3 for Open/ResultPending/Resolved/Void; outcome 0/1/2 for Home/Draw/Away or 255 when unset |
| Stake | kind `1` at 0; seed 1..37; market type hash 37..69; owner lock hash 69..101; kickoff 101..109; guard code hash 109..141 | Ten bytes: Pending/Accepted 0/1, outcome 0/1/2, principal u64 |

The protocol output is index 0. On terminal market transitions the reward is
index 1. On a refund the owner output is index 0 and must have no type script.
Remaining outputs can carry ordinary wallet change. Stake principal must fit
after the cell's occupied storage capacity. Arithmetic overflow is checked.
Market creation also reserves enough capacity to retain the market cell after
paying the reward, and requires the reward to fit an untyped admin-lock output.

The fixtures use an 800 CKB stake cell with 100 CKB wagering principal and
700 CKB additional capacity. A refund returns all 800 CKB. Separately, the
operator supplies an 800 CKB market cell including a 100 CKB cancellation
reward. This intentionally overfunds storage for clarity; it is not a minimum
stake or production cost estimate.

| Exit code | Meaning |
| --- | --- |
| 5 | Invalid shape, identity, encoding or guard |
| 6 | Missing authorized input |
| 7 | Invalid timing or since metric |
| 8 | Invalid lifecycle transition |
| 9 | Incorrect funding, recipient or capacity |
| 10 | Missing creation header for the actual input |
| 11 | Missing, mismatched or ineligible market dependency |

## Review boundaries

- The deployed app remains custodial. Nothing here migrates its balances.
- Market authorization is pinned per market. A production catalogue must pin
  the approved admin and script deployment; global market registration is absent.
- Market metadata and remaining storage stay locked in terminal cells. Cleanup
  and unclaimed liability handling are not implemented.
- Owner signatures, refunds and result timing are exercised, but there is no
  complete winning redemption path. Test cells must never receive real funds.
- Shards and sequential round-robin routing remain a proposed next step.
  Aggregation, sealing, complete admission accounting and payout funding must be
  specified before connecting this prototype to a betting pool.
- No reorg/finality stress test, load benchmark, audit or mainnet deployment is
  claimed. Block timestamps are consensus-constrained miner timestamps.

The design borrows explicit authorization and outcome-claim ideas from the EVM
references already recorded in the Streak design notes. It does not import
OpenZeppelin, implement ERC-4626, or claim ERC-1155 compatibility.
