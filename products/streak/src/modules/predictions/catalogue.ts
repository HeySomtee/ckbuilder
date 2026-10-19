/** Season filters describe fixtures, not the legacy custodial ledger. */
export function catalogueStatusMatches(
  match: { status: string; kickoff: string },
  status: string | null,
  now: number,
) {
  const terminal = match.status === 'final' || match.status === 'cancelled';
  const upcoming = match.status === 'scheduled' && Date.parse(match.kickoff) > now;
  if (status === 'open') return upcoming;
  if (status === 'closed') return !terminal && !upcoming;
  if (status === 'resolved') return terminal;
  if (status === 'void') return match.status === 'cancelled';
  return true;
}
