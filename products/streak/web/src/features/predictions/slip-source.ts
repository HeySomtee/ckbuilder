/** Verified presentation metadata supplied by the signed-in owner's campaign projection. */
export interface SlipCampaignLabel {
  id: string;
  name: string;
  lineIds: readonly string[];
  alreadyCountedLineIds?: readonly string[];
}

const campaignId = (value: string | null): value is string =>
  !!value && /^[a-zA-Z0-9:_-]{1,120}$/.test(value);

/** Navigation preferences only. Labels and scoring never trust this local hint. */
export class SlipSource {
  private scope: string | null = null;
  private sources = new Map<string, Set<string>>();

  clear() {
    this.scope = null;
    this.sources.clear();
  }

  selected(
    scope: string,
    selectedCampaign: string | null,
    lineId: string,
    currentLineIds: string[],
  ) {
    if (this.scope !== scope) {
      this.clear();
      this.scope = scope;
    }
    for (const [id, lines] of this.sources) {
      const retained = new Set(currentLineIds.filter((line) => lines.has(line)));
      if (retained.size) this.sources.set(id, retained);
      else this.sources.delete(id);
    }
    // A regular pick can coexist with competition picks without losing their return paths.
    if (!campaignId(selectedCampaign)) return;
    const lines = this.sources.get(selectedCampaign) ?? new Set<string>();
    lines.add(lineId);
    this.sources.delete(selectedCampaign);
    this.sources.set(selectedCampaign, lines);
    // Keep navigation memory bounded to the latest eight competition preferences.
    while (this.sources.size > 8) this.sources.delete(this.sources.keys().next().value!);
  }

  campaign(
    scope: string,
    currentLineIds: string[],
    activeCampaign: string | null = null,
    verifiedCampaignIds?: readonly string[],
  ): string | null {
    if (this.scope === scope)
      for (const [id, lines] of [...this.sources].reverse())
        if (
          (!verifiedCampaignIds || verifiedCampaignIds.includes(id)) &&
          currentLineIds.some((line) => lines.has(line))
        )
          return id;
    // Reloads can recover destinations from the owner's verified whitelist projection.
    // An active competition remains useful for an empty slip without asserting membership.
    if (campaignId(activeCampaign)) return activeCampaign;
    return verifiedCampaignIds?.find((id) => campaignId(id)) ?? null;
  }
}
