import { rankedEntries, type Campaign } from './domain';

/** Explicit allowlist: never export signatures, sessions, raw transactions or testnet private keys. */
export function campaignEvidenceExport(c: Campaign) {
  const positions = c.entries.flatMap((e) =>
    e.evidence.map((p) => ({ publicId: e.publicId, ...p })),
  );
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    campaign: {
      id: c.id,
      name: c.draft.name,
      kind: c.draft.kind,
      rehearsal: c.draft.rehearsal,
      state: c.state,
      deletedAt: c.deletedAt,
      termsHash: c.termsHash,
      terms: c.draft,
      scoreStatus: c.scoreStatus,
      verifiedAt: c.verifiedAt,
      finalAt: c.finalAt,
      evidenceRevision: c.evidenceRevision,
    },
    metrics: {
      registeredAccounts: c.entries.length,
      activeAccounts: c.entries.filter((e) => e.participated).length,
      distinctParticipantLocks: new Set(positions.map((p) => p.ownerHash)).size,
      qualifyingPositions: positions.length,
      distinctQualifyingPaymentTransactions: new Set(positions.map((p) => p.transactionHash)).size,
      qualifyingTestnetPrincipalShannons: positions
        .reduce((n, p) => n + BigInt(p.principalShannons), 0n)
        .toString(),
      confirmedMainnetAwardShannons: Object.values(c.payouts)
        .reduce((n, p) => n + BigInt(p.amountShannons), 0n)
        .toString(),
      includedInCommunityEvidence: !c.draft.rehearsal,
    },
    definitions: {
      accounts: 'Registered accounts and owner locks are not proof of unique people.',
      positions:
        'Only the first qualifying admitted prediction per registered entrant and selected fixture. Not total application volume.',
      testnetPrincipal:
        'Testnet tCKB stake only. Excludes recoverable storage, sponsor reserve, fees and mainnet awards.',
      awards:
        'Separate mainnet outputs verified when recorded. Check canonicality again before relying on old exports.',
    },
    entries: rankedEntries(c).map((e, index) => ({
      publicId: e.publicId,
      rank: index + 1,
      name: e.name,
      joinedAt: e.joinedAt,
      participated: e.participated,
      points: e.points,
      qualifyingEntries: e.qualifyingEntries,
      tieBreakAt: e.tieBreakAt,
      five: e.five
        ? {
            roundId: c.draft.fiveRoundId,
            players: e.five.players,
            captain: e.five.captain,
            meaningfulSavedAt: e.five.meaningfulSavedAt,
            final: e.five.final,
          }
        : null,
    })),
    positions,
    operatorAttestations: c.absenceProofs ?? [],
    awards: c.awards.map((a) => ({
      ...a,
      proof:
        a.publicId && Object.prototype.hasOwnProperty.call(c.payouts, a.publicId)
          ? c.payouts[a.publicId]
          : null,
    })),
  };
}

function csvValue(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
/** Whole campaign export, independent of the leaderboard's display pagination. */
export function campaignEvidenceCsv(c: Campaign): string {
  const rows: unknown[][] = [
    [
      'campaign_id',
      'mode',
      'rank',
      'public_id',
      'name',
      'joined_at',
      'participated',
      'points',
      'qualifying_entries',
      'tie_break_at',
      'award_shannons',
      'mainnet_receiving_address',
      'award_status',
      'award_transaction',
    ],
  ];
  rankedEntries(c).forEach((e, index) => {
    const award = c.awards.find((a) => a.publicId === e.publicId);
    rows.push([
      c.id,
      c.draft.rehearsal ? 'rehearsal' : 'community',
      index + 1,
      e.publicId,
      e.name,
      e.joinedAt,
      e.participated,
      e.points,
      e.qualifyingEntries,
      e.tieBreakAt,
      award?.amountShannons,
      award?.receivingAddress,
      award?.status,
      award?.transactionHash,
    ]);
  });
  return rows.map((r) => r.map(csvValue).join(',')).join('\r\n');
}
