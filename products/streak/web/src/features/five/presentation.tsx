import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Player } from './api';
import { Icon } from '../../components/icon';
export const positions = ['FWD', 'MID', 'MID', 'DEF', 'GK'];
export function Jersey({ player }: { player: Player }) {
  const palette = ['#a4c9d9', '#d87b77', '#aca1ce', '#7eaf99', '#d1bb82'];
  const color =
    palette[Array.from(player.teamId).reduce((n, c) => n + c.charCodeAt(0), 0) % palette.length];
  return (
    <svg className="five-jersey" viewBox="0 0 80 80" aria-hidden="true">
      <path
        d="M24 7L7 20 17 38 26 33 23 72Q40 78 57 72L54 33 63 38 73 20 56 7Q40 19 24 7Z"
        fill={color}
      />
      <path d="M24 7Q40 25 56 7" fill="none" stroke="#eef0e8" strokeWidth="3" />
      <image href="/ckb-mark.png" x="46" y="24" width="9" height="9" />
      <text x="40" y="51" textAnchor="middle" fill="white" fontSize="12" fontWeight="700">
        {player.team.slice(0, 3).toUpperCase()}
      </text>
    </svg>
  );
}
export function Modal({
  title,
  onClose,
  children,
  className = '',
  returnFocus,
  backLabel,
  onBack,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  returnFocus?: HTMLElement | null;
  backLabel?: string;
  onBack?: () => void;
}) {
  const ref = useRef<HTMLDialogElement | null>(null),
    titleId = useId();
  useEffect(() => {
    const origin = returnFocus ?? document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (origin instanceof HTMLElement && origin.isConnected) origin.focus();
    };
  }, [returnFocus]);
  return (
    <dialog
      className={`five-dialog ${className}`}
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        {backLabel && onBack && (
          <button className="five-dialog-back" onClick={onBack}>
            <span className="five-chevron-back">
              <Icon name="chevron-down" />
            </span>
            {backLabel}
          </button>
        )}
        <h2 id={titleId}>{title}</h2>
        <button aria-label="Close" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      {children}
    </dialog>
  );
}
