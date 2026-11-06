import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { Icon } from '../../components/icon';
import { CellLoader } from '../../components/cell-loader';
import type { CampaignState, CampaignStanding } from './api';

export function ckb(value: string): string {
  const n = BigInt(value);
  const fraction = (n % 100000000n).toString().padStart(8, '0').replace(/0+$/, '');
  return (n / 100000000n).toLocaleString('en-GB') + (fraction ? `.${fraction}` : '');
}
export function shannons(value: string): string | null {
  if (!/^\d{1,20}(?:\.\d{1,8})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return (BigInt(whole) * 100000000n + BigInt(fraction.padEnd(8, '0'))).toString();
}
export function plainCkb(value: string): string {
  return ckb(value).replaceAll(',', '');
}
export function dateTime(value: string | null): string {
  return value
    ? new Date(value).toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Not yet recorded';
}
export function localDateInput(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
export function label(state: CampaignState): string {
  return {
    draft: 'Draft',
    open: 'Open for entries',
    live: 'Live',
    finalizing: 'Finalizing',
    finished: 'Finished',
    deleted: 'Archived',
  }[state];
}
export function Badge({ children, tone = '' }: { children: ReactNode; tone?: string }) {
  return <span className={`campaign-badge ${tone}`}>{children}</span>;
}
export function Trophy() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 3h8v5a4 4 0 0 1-8 0V3ZM8 5H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 1v6m-4 3h8" />
    </svg>
  );
}
export function Plus() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
export function Busy({ text = 'Loading competition' }: { text?: string }) {
  return (
    <div className="campaign-loading" role="status">
      <CellLoader variant="wave" />
      <span>{text}</span>
    </div>
  );
}
export function Dialog({
  title,
  children,
  onClose,
  pending = false,
  className = '',
  eyebrow,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  pending?: boolean;
  className?: string;
  eyebrow?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    const origin = document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (origin instanceof HTMLElement && origin.isConnected) origin.focus();
    };
  }, []);
  return (
    <dialog
      className={`campaign-dialog ${className}`.trim()}
      ref={ref}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        if (!pending) onClose();
      }}
    >
      <header>
        <div className="campaign-dialog-title">
          {eyebrow && <span className="campaign-eyebrow">{eyebrow}</span>}
          <h2 id={id}>{title}</h2>
        </div>
        <button
          type="button"
          className="campaign-icon-button"
          aria-label="Close dialog"
          onClick={onClose}
          disabled={pending}
        >
          <Icon name="close" />
        </button>
      </header>
      <div className="campaign-dialog-body">{children}</div>
    </dialog>
  );
}
export function Standings({
  entries,
  onSelect,
  compact = false,
}: {
  entries: CampaignStanding[];
  onSelect?: (entry: CampaignStanding) => void;
  compact?: boolean;
}) {
  if (!entries.length)
    return (
      <div className="campaign-empty">
        <Trophy />
        <h3>The table starts with you.</h3>
        <p>Everyone who registers appears here, even before their first pick.</p>
      </div>
    );
  return (
    <div className="campaign-table-scroll">
      <table className="campaign-table">
        <thead>
          <tr>
            <th scope="col">Rank</th>
            <th scope="col">Player</th>
            <th scope="col">Points</th>
            {!compact && <th scope="col">Entry</th>}
            <th scope="col">Prize</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.publicId} className={entry.own ? 'is-own' : ''}>
              <td>{entry.rank}</td>
              <td>
                {onSelect ? (
                  <button
                    type="button"
                    className="campaign-player-link"
                    onClick={() => onSelect(entry)}
                  >
                    {entry.name}
                    {entry.own && <small>You</small>}
                  </button>
                ) : (
                  <span>
                    {entry.name}
                    {entry.own && <small className="campaign-you">You</small>}
                  </span>
                )}
              </td>
              <td>
                <strong>{entry.points}</strong>
              </td>
              {!compact && (
                <td>
                  {entry.participated
                    ? `${entry.qualifyingEntries} qualifying`
                    : 'Registered · no entry'}
                </td>
              )}
              <td>
                {entry.awardShannons ? (
                  <span className="campaign-mint">{ckb(entry.awardShannons)} CKB</span>
                ) : (
                  'None'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function exportCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const cell = (value: string | number) => {
    let text = String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const csv = [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
