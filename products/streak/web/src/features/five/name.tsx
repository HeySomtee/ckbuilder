import { useEffect, useId, useRef, useState } from 'react';
import { CellLoader } from '../../components/cell-loader';
import { Modal } from './presentation';
import './standings.css';

export function normalizeFplName(value: string) {
  return value
    .normalize('NFC')
    .replace(/[\p{Zs}]+/gu, ' ')
    .trim();
}
export function fplNameProblem(value: string) {
  if (/[\p{Cc}\p{Cf}]/u.test(value)) return 'Use visible letters and spaces in your FPL name.';
  const normalized = normalizeFplName(value),
    length = Array.from(normalized).length;
  if (length < 3) return 'Add at least 3 characters to continue.';
  if (length > 24) return 'Keep your FPL name to 24 characters or fewer.';
  if (!/^[\p{L}\p{N}][\p{L}\p{N}\p{M} ._'’-]*[\p{L}\p{N}\p{M}]$/u.test(normalized))
    return 'Start and end with a letter or number. Use letters, numbers, spaces, apostrophes, dots, underscores or hyphens.';
  return '';
}

export function FplNameDialog({
  initialName = '',
  walletLabel,
  onSave,
  onSaved,
  onClose,
  continueToSquad = false,
}: {
  initialName?: string;
  walletLabel: string;
  onSave: (name: string) => Promise<void>;
  onSaved: () => void;
  onClose: () => void;
  continueToSquad?: boolean;
}) {
  const [value, setValue] = useState(initialName),
    [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const inputId = useId(),
    hintId = useId();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const name = normalizeFplName(value),
    problem = fplNameProblem(value);
  return (
    <Modal
      title={initialName ? 'Your FPL name' : 'Put your name on the team sheet.'}
      onClose={onClose}
      className="five-name-dialog"
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (problem || pending) return;
          setPending(true);
          setError('');
          try {
            await onSave(name);
            if (mounted.current) onSaved();
          } catch (failure) {
            if (mounted.current)
              setError(
                failure instanceof Error
                  ? failure.message
                  : 'Unable to save your name. Please try again.',
              );
          } finally {
            if (mounted.current) setPending(false);
          }
        }}
      >
        <p>
          Choose the public name other managers will see beside your squad. No FPL account is
          needed.
        </p>
        <label htmlFor={inputId}>
          FPL name <span>Required</span>
        </label>
        <input
          id={inputId}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError('');
          }}
          placeholder="e.g. The Final Whistle"
          autoComplete="off"
          autoCapitalize="words"
          maxLength={96}
          aria-describedby={hintId}
          disabled={pending}
        />
        <div className="five-name-caption">
          <span>3–24 characters, including spaces.</span>
          <span>{Array.from(name).length}/24</span>
        </div>
        <p className="eyebrow">ON THE LEADERBOARD</p>
        <div className="five-name-preview">
          <span>–</span>
          <div>
            <strong>
              {name || 'Your FPL name'} <em>You</em>
            </strong>
            <small>{walletLabel || 'Your shortened wallet address'}</small>
          </div>
          <span>– pts</span>
        </div>
        <p id={hintId} role="status">
          {problem ||
            (continueToSquad
              ? 'Your drafted five is safe. Continue to review it after saving your name.'
              : 'Changing your name does not change your squad or its save time.')}
        </p>
        <button className="btn primary" disabled={!!problem || pending} aria-busy={pending}>
          {pending && <CellLoader variant="orbit" />}
          {pending ? 'Saving name' : continueToSquad ? 'Save name and continue' : 'Save name'}
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
    </Modal>
  );
}
