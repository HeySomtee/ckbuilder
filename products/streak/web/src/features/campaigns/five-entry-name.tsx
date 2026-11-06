import { useEffect, useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CellLoader } from '../../components/cell-loader';
import { loadFiveProfile, saveFiveProfile } from '../five/api';
import { fplNameProblem, normalizeFplName } from '../five/name';

/** Mounted per account and competition; a name save never submits a squad. */
export function FiveEntryName({
  accountId,
  pending,
  disabled,
  onJoin,
}: {
  accountId: string;
  pending: boolean;
  disabled: boolean;
  onJoin: () => Promise<void>;
}) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  const live = useRef(true),
    id = useId(),
    hint = useId();
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const key = ['private', 'five-profile', accountId];
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => loadFiveProfile(accountId, signal),
    staleTime: 0,
    retry: 1,
  });
  const name = normalizeFplName(draft ?? query.data?.displayName ?? '');
  const problem = fplNameProblem(name),
    busy = saving || pending;
  if (query.isPending)
    return (
      <p role="status">
        <CellLoader /> Loading your FPL name
      </p>
    );
  if (query.isError)
    return (
      <div role="alert">
        <p>Your FPL name could not be loaded. {query.error.message}</p>
        <button
          type="button"
          className="btn"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          {query.isFetching && <CellLoader />} Retry name
        </button>
      </div>
    );
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (problem || busy || disabled) return;
        setSaving(true);
        setError('');
        try {
          if (name !== query.data?.displayName) {
            const profile = await saveFiveProfile(name, accountId);
            if (!live.current) return;
            client.setQueryData(key, profile);
            void client.invalidateQueries({ queryKey: ['private', 'five', accountId] });
          }
          if (live.current) await onJoin();
        } catch (failure) {
          if (live.current)
            setError(
              failure instanceof Error
                ? failure.message
                : 'Your name could not be saved. Please try again.',
            );
        } finally {
          if (live.current) setSaving(false);
        }
      }}
    >
      <label htmlFor={id}>
        Your FPL name <small>Required</small>
      </label>
      <input
        id={id}
        value={draft ?? query.data?.displayName ?? ''}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="e.g. The Final Whistle"
        autoComplete="off"
        maxLength={96}
        aria-describedby={hint}
        disabled={busy}
      />
      <p id={hint}>
        {problem || 'Your public manager name, 3–24 characters. No FPL account needed.'}
      </p>
      <button className="btn primary" disabled={busy || disabled || !!problem} aria-busy={busy}>
        {busy && <CellLoader />} Agree & join competition
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
