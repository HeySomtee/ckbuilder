import { useEffect, useId, useState } from 'react';
import { Icon } from '../../components/icon';
import { CellLoader } from '../../components/cell-loader';
import type { CampaignSummary } from './api';

export type ArtworkSlot = 'icon' | 'banner';
export type ArtworkChanges = Partial<Record<ArtworkSlot, File | null>>;
export type ArtworkApplied = (slot: ArtworkSlot) => void;
type Artwork = CampaignSummary['artwork'];

export function CampaignIcon({
  kind,
  url,
  className = '',
}: {
  kind: CampaignSummary['kind'];
  url?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => setFailed(null), [url]);
  return (
    <span className={`campaign-art-icon ${className}`} aria-hidden="true">
      {url && failed !== url ? (
        <img
          src={url}
          alt=""
          width="128"
          height="128"
          decoding="async"
          onError={() => setFailed(url)}
        />
      ) : (
        <Icon name={kind === 'five' ? 'five' : 'markets'} />
      )}
    </span>
  );
}

export function CampaignBanner({
  url,
  className = '',
}: {
  url?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => setFailed(null), [url]);
  if (!url || failed === url) return null;
  return (
    <div className={`campaign-art-banner ${className}`} aria-hidden="true">
      <img
        src={url}
        alt=""
        width="1440"
        height="480"
        loading="lazy"
        decoding="async"
        onError={() => setFailed(url)}
      />
    </div>
  );
}

function useFileUrl(file: File | null | undefined) {
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return file && preview?.file === file ? preview.url : null;
}

export function useArtworkPreview(artwork: Artwork, changes: ArtworkChanges) {
  const icon = useFileUrl(changes.icon),
    banner = useFileUrl(changes.banner);
  return {
    icon: changes.icon === undefined ? artwork?.icon?.url : changes.icon === null ? null : icon,
    banner:
      changes.banner === undefined ? artwork?.banner?.url : changes.banner === null ? null : banner,
  };
}

function ArtworkSlotField({
  slot,
  url,
  kind,
  pending,
  changed,
  onChange,
  onError,
}: {
  slot: ArtworkSlot;
  url?: string | null;
  kind: CampaignSummary['kind'];
  pending: boolean;
  changed: boolean;
  onChange: (file: File | null) => void;
  onError: (message: string) => void;
}) {
  const id = useId();
  const label = slot === 'icon' ? 'Competition icon' : 'Competition banner';
  const maxMiB = slot === 'icon' ? 3 : 5;
  return (
    <div className={`campaign-art-slot campaign-art-slot-${slot}`}>
      <div className="campaign-art-slot-preview">
        {slot === 'icon' ? (
          <CampaignIcon kind={kind} url={url} />
        ) : url ? (
          <CampaignBanner url={url} />
        ) : (
          <span className="campaign-art-placeholder">
            <Icon name="markets" />
            <small>No banner</small>
          </span>
        )}
      </div>
      <div className="campaign-art-slot-controls">
        <label htmlFor={id}>
          <strong>{slot === 'icon' ? 'Icon' : 'Banner'}</strong>
          <span>Optional</span>
        </label>
        <p id={`${id}-hint`}>
          {slot === 'icon' ? 'Square image' : 'Wide image, 3:1 works best'}. PNG, JPG or WebP, up to{' '}
          {maxMiB} MB.
        </p>
        <div className="campaign-art-actions">
          <label className={`btn campaign-file-picker ${pending ? 'is-disabled' : ''}`}>
            {url ? 'Change image' : 'Choose image'}
            <input
              id={id}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label={label}
              aria-describedby={`${id}-hint`}
              disabled={pending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
                  onError('Choose a PNG, JPG or WebP image.');
                  return;
                }
                if (file.size === 0 || file.size > maxMiB * 1024 * 1024) {
                  onError(`Choose an image smaller than ${maxMiB} MB.`);
                  return;
                }
                onError('');
                onChange(file);
              }}
            />
          </label>
          {(url || changed) && (
            <button
              className="btn campaign-quiet"
              type="button"
              disabled={pending}
              onClick={() => {
                onError('');
                onChange(null);
              }}
              aria-label={`Remove ${slot}`}
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ArtworkFields({
  artwork,
  changes,
  kind,
  pending,
  onChange,
  onError,
}: {
  artwork?: Artwork;
  changes: ArtworkChanges;
  kind: CampaignSummary['kind'];
  pending: boolean;
  onChange: (slot: ArtworkSlot, file: File | null) => void;
  onError: (message: string) => void;
}) {
  const preview = useArtworkPreview(artwork, changes);
  return (
    <section className="campaign-art-fields" aria-label="Optional competition artwork">
      <div className="campaign-art-heading">
        <div>
          <h3>Make it yours</h3>
          <p>Add an icon, a banner or both. You can change them later.</p>
        </div>
        <span className="campaign-art-optional">Optional</span>
      </div>
      <div className="campaign-art-slots">
        {(['icon', 'banner'] as const).map((slot) => (
          <ArtworkSlotField
            key={slot}
            slot={slot}
            url={preview[slot]}
            kind={kind}
            pending={pending}
            changed={changes[slot] !== undefined}
            onChange={(file) => onChange(slot, file)}
            onError={onError}
          />
        ))}
      </div>
    </section>
  );
}

export function ArtworkEditor({
  campaign,
  pending,
  onSave,
  onError,
}: {
  campaign: CampaignSummary;
  pending: boolean;
  onSave: (changes: ArtworkChanges, onApplied: ArtworkApplied) => Promise<boolean>;
  onError: (message: string) => void;
}) {
  const [changes, setChanges] = useState<ArtworkChanges>({});
  const changed = Object.keys(changes).length > 0;
  return (
    <section className="campaign-art-editor">
      <ArtworkFields
        artwork={campaign.artwork}
        changes={changes}
        kind={campaign.kind}
        pending={pending}
        onChange={(slot, file) => setChanges((previous) => ({ ...previous, [slot]: file }))}
        onError={onError}
      />
      <div className="campaign-art-save">
        <p>
          {changed
            ? 'Your changes are previewed above. Save to make them visible.'
            : 'Artwork is separate from prizes, rules and player entries.'}
        </p>
        <button
          className="btn primary"
          type="button"
          disabled={pending || !changed}
          onClick={() =>
            void onSave(changes, (slot) =>
              setChanges((previous) => {
                const next = { ...previous };
                delete next[slot];
                return next;
              }),
            )
          }
        >
          {pending && <CellLoader />}Save artwork
        </button>
      </div>
    </section>
  );
}
