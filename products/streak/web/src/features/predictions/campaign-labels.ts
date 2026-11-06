import type { CampaignSummary } from '../../../../shared/campaign-wire';
import type { Pick } from './draft';
import type { SlipCampaignLabel } from './slip-source';

/** Labels describe registered fixture membership, never an accepted payment or score. */
export function slipCampaignLabels(
  picks: readonly Pick[],
  campaigns: readonly CampaignSummary[],
): SlipCampaignLabel[] {
  return campaigns.flatMap((campaign) => {
    if (
      !campaign.joined ||
      campaign.kind !== 'predictions' ||
      !['open', 'live'].includes(campaign.state)
    )
      return [];
    const fixtures = new Set(campaign.joinedFixtureIds ?? []);
    const counted = new Set(campaign.qualifyingFixtureIds ?? []);
    const matches = picks.filter((pick) => fixtures.has(pick.matchId));
    return matches.length
      ? [
          {
            id: campaign.id,
            name: campaign.name,
            lineIds: matches.map((pick) => pick.lineId),
            alreadyCountedLineIds: matches
              .filter((pick) => counted.has(pick.matchId))
              .map((pick) => pick.lineId),
          },
        ]
      : [];
  });
}
