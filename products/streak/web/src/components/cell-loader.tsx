import { useEffect, useRef } from 'react';
import { cellLoaderMarkup, registerCellLoader } from '../../../public/cell-loader.js';
import type { CellLoaderVariant } from '../../../public/cell-loader.js';
import '../../../public/cell-loader.css';

export function CellLoader({
  variant = 'orbit',
  className = '',
  label,
}: {
  variant?: CellLoaderVariant;
  className?: string;
  label?: string;
}) {
  const host = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const svg = host.current?.querySelector('svg');
    if (svg) return registerCellLoader(svg);
  }, [variant]);
  return (
    <span
      ref={host}
      className={`cell-loader-host ${className}`.trim()}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: cellLoaderMarkup(variant) }}
    />
  );
}
