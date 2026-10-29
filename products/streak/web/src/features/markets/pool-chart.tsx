import { useState } from 'react';
import { CellLoader } from '../../components/cell-loader';
import type { KeyboardEvent, PointerEvent } from 'react';
import { outcomes } from './api';
import type { Market } from './api';
import { poolShares } from './pools';
import type { DirectPool } from './pools';

const ranges = ['1H', '6H', 'ALL'] as const;
export function PoolChart({
  market,
  pool,
  loading,
}: {
  market: Market;
  pool?: DirectPool;
  loading: boolean;
}) {
  const [range, setRange] = useState<(typeof ranges)[number]>('ALL');
  const [cursor, setCursor] = useState<number | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const all = pool?.history ?? [];
  const lastTime = all.at(-1)?.t ?? 0;
  const cutoff = range === 'ALL' ? 0 : lastTime - (range === '1H' ? 1 : 6) * 3_600_000;
  const points = all
    .filter((point) => point.t >= cutoff)
    .flatMap((point) => {
      const shares = poolShares(point.totals);
      return shares ? [{ t: point.t, shares }] : [];
    });
  const selectedIndex = Math.min(cursor ?? points.length - 1, points.length - 1);
  const selected = points[selectedIndex];
  const first = points[0]?.t ?? lastTime;
  const duration = Math.max(1, lastTime - first);
  const x = (t: number) => (points.length === 1 ? 305 : 12 + ((t - first) / duration) * 574);
  const y = (percent: number) => 230 - percent * 2.02;
  const names = { home: market.home, draw: 'Draw', away: market.away };
  const time = (t: number) =>
    new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const inspectedTime = selected
    ? new Date(selected.t).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '';
  function inspect(event: PointerEvent<HTMLDivElement>) {
    if (!points.length) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const target = Math.max(
      0,
      Math.min(1, (((event.clientX - bounds.left) / bounds.width) * 640 - 12) / 574),
    );
    const timestamp = first + target * duration;
    let index = 0;
    for (let i = 1; i < points.length; i++)
      if (Math.abs(points[i].t - timestamp) < Math.abs(points[index].t - timestamp)) index = i;
    setCursor(index);
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (!points.length) return;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    setCursor(
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? points.length - 1
          : Math.max(
              0,
              Math.min(points.length - 1, selectedIndex + (event.key === 'ArrowLeft' ? -1 : 1)),
            ),
    );
  }
  const isWaiting = loading || pool?.state === 'loading';
  return (
    <section className="glass market-chart prediction-chart" aria-label="Pool history chart">
      <header className="chart-heading">
        <div>
          <p className="eyebrow">MARKET SENTIMENT</p>
          <h2>Where the crowd stands</h2>
        </div>
        <span className={`chart-source ${pool?.state === 'ready' ? 'is-current' : ''}`}>
          <i />
          {pool?.state === 'stale' ? 'Update delayed' : 'On-chain pool'}
        </span>
      </header>
      <div className="chart-legend">
        {outcomes.map((side) => (
          <button
            key={side}
            data-outcome={side}
            aria-pressed={highlight === side}
            onClick={() => setHighlight(highlight === side ? null : side)}
          >
            <span>
              <i />
              {names[side]}
            </span>
            <strong>{selected ? `${Number(selected.shares[side].toFixed(1))}%` : '-'}</strong>
          </button>
        ))}
      </div>
      <div className="chart-time-readout" aria-live="polite">
        {cursor !== null && selected
          ? inspectedTime
          : pool?.observedAtMs
            ? `Last observed ${time(pool.observedAtMs)}`
            : 'Pool share over time'}
      </div>
      <div
        className="chart-plot"
        role="slider"
        tabIndex={0}
        aria-label="Explore recorded activity"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, points.length - 1)}
        aria-valuenow={Math.max(0, selectedIndex)}
        aria-valuetext={
          selected
            ? `${inspectedTime}: Home ${selected.shares.home}%, Draw ${selected.shares.draw}%, Away ${selected.shares.away}%`
            : 'No pool observations yet'
        }
        onPointerMove={inspect}
        onPointerDown={inspect}
        onPointerLeave={() => setCursor(null)}
        onKeyDown={keyboard}
      >
        <svg viewBox="0 0 640 270" role="img" aria-label="Home, draw and away pool share over time">
          {[0, 25, 50, 75, 100].map((value) => (
            <g key={value} className="chart-grid">
              <line x1="12" x2="586" y1={y(value)} y2={y(value)} />
              <text x="600" y={y(value) + 4}>
                {value}%
              </text>
            </g>
          ))}
          {outcomes.map((side) => (
            <g
              key={side}
              data-outcome={side}
              className="chart-series"
              opacity={highlight && highlight !== side ? 0.15 : 1}
            >
              <polyline
                points={points.map((point) => `${x(point.t)},${y(point.shares[side])}`).join(' ')}
              />
              {selected && (
                <circle
                  cx={x(selected.t)}
                  cy={y(selected.shares[side])}
                  r={cursor === null ? 3 : 4.5}
                />
              )}
            </g>
          ))}
          {cursor !== null && selected && (
            <line className="chart-cursor" x1={x(selected.t)} x2={x(selected.t)} y1="16" y2="232" />
          )}
          {points.length > 0 && (
            <g className="chart-grid chart-times">
              <text x="12" y="262">
                {time(first)}
              </text>
              {points.length > 1 && (
                <text x="300" y="262" textAnchor="middle">
                  {time(first + duration / 2)}
                </text>
              )}
              <text x="586" y="262" textAnchor="end">
                {points.length > 1 ? time(lastTime) : ''}
              </text>
            </g>
          )}
        </svg>
        {!points.length && (
          <div className="chart-empty">
            {isWaiting && <CellLoader variant="wave" />}
            <strong>
              {isWaiting
                ? 'Reading the pool...'
                : !pool || pool.state === 'unavailable'
                  ? 'Pool data is taking a moment'
                  : 'The first call sets the pace.'}
            </strong>
            <span>
              {isWaiting
                ? 'Checking confirmed market cells.'
                : !pool || pool.state === 'unavailable'
                  ? 'Your predictions remain available. We will retry shortly.'
                  : 'Movement appears as confirmed predictions arrive.'}
            </span>
          </div>
        )}
        {cursor !== null && selected && (
          <div
            className="chart-tooltip"
            style={{ left: `${Math.max(18, Math.min(76, (x(selected.t) / 640) * 100))}%` }}
          >
            <time>{inspectedTime}</time>
            {outcomes.map((side) => (
              <span key={side} data-outcome={side}>
                <i />
                {side === 'home' ? 'Home' : side === 'draw' ? 'Draw' : 'Away'}
                <b>{Number(selected.shares[side].toFixed(1))}%</b>
              </span>
            ))}
          </div>
        )}
      </div>
      <footer className="chart-footer">
        <div className="chart-ranges" aria-label="Chart time range">
          {ranges.map((value) => (
            <button
              key={value}
              aria-pressed={range === value}
              onClick={() => {
                setRange(value);
                setCursor(null);
              }}
            >
              {value}
            </button>
          ))}
        </div>
        <span>CKB TESTNET</span>
      </footer>
      <p className="chart-caption">
        Share of the total stake, not fixed odds.{' '}
        {points.length === 1 ? 'One observation so far. ' : ''}History starts at the first recorded
        observation.
        {pool?.state === 'stale'
          ? ' Showing the last successful observation while updates retry.'
          : ''}
      </p>
    </section>
  );
}
