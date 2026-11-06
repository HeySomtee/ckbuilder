# Five standings and squad preview

6 November 2026. Design preview for owner review. The production Five UI, identity,
database and payment flows are unchanged by this preview.

Run `node products/streak/design/five-standings-review/serve.cjs` from the repository
root, then open [the preview](http://127.0.0.1:4199/). The server is loopback-only,
serves allowlisted local assets and makes no API or wallet requests.

## Review

- [Finished standings](http://127.0.0.1:4199/): FPL display names, short wallet
  labels, rank, points, allocation and your highlighted entry. Search by name or
  wallet label, or jump to your position.
- [Squad pitch](http://127.0.0.1:4199/?squad=0): select a manager to see one forward,
  two midfielders, a defender and goalkeeper. Points sit below each shirt; the
  captain has a C badge and doubled points. Tap a shirt for its scoring breakdown.
  Desktop uses a centered dialog; phones use the screen with Back to standings
  and Close. Previous/Next moves between managers.
- [First-entry name step](http://127.0.0.1:4199/?state=join): a required public
  FPL name, proposed at 3–24 characters including spaces. The row preview updates
  while typing. A visible explanation accompanies the disabled Continue button.
  Saving the name opens the example own squad. An external FPL account is not
  required. The preview stores the name in memory only.
- [Live points](http://127.0.0.1:4199/?state=live&squad=0): partial totals are
  labelled provisional; missing scores say Awaiting points rather than zero.
- [Before the deadline](http://127.0.0.1:4199/?state=private&squad=0): another
  manager's squad stays private. Your own example squad remains accessible.

The scenario selector belongs to the review toolbar, not the proposed product.
Names, wallet labels, scores, allocation and gameweek are synthetic examples.
Allocation is shown separately from payment confirmation. There is no entry,
profile update, financial transaction or provider result behind a preview action.

## Implementation boundary after approval

The current app falls back to `Player` when an account has no username. A dedicated
FPL display name needs server validation and authenticated persistence before
first Five participation. It should preserve a drafted squad while the user adds
a name. Existing entries and reward recovery must remain accessible. Name-only
edits must not change the final squad's tie-breaking save timestamp.

Keep names with spaces separate from the current restricted account username.
Expose only the requested shortened wallet label in the public projection; the
preview does not justify sending full private entry records. Retain server-owned
deadline privacy and current payout rules. Reuse the existing `LiveTeam` pitch
and scoring presentation where practical rather than creating a second scoring
controller. None of those runtime changes are implemented here.

## Verification

Focused browser inspection passed in Chromium at 1440×1000, 390×844 and 320×740,
and WebKit at 390×844. It covered the actual custom dropdown, required name and
escaping, row selection, pitch positioning, captain totals, player details,
pending scores, private picks, horizontal overflow and close/Escape focus return.
No page errors or outbound requests occurred. The WebKit pointer-focus issue
found during review was fixed using explicit trigger restoration.

Screenshots and the isolated check result are in the ignored
`.quality-artifacts/five-standings-review/` directory. Desktop and mobile captures
were visually reviewed. This is preview evidence, not production acceptance or
physical-wallet testing. No commit, push or deployment was performed.
