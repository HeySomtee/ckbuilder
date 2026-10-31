export function Icon({
  name,
}: {
  name:
    | 'markets'
    | 'wallet'
    | 'activity'
    | 'arrow'
    | 'search'
    | 'shield'
    | 'home'
    | 'five'
    | 'matchday'
    | 'community'
    | 'account'
    | 'more'
    | 'close'
    | 'chevron-down'
    | 'chevron-up';
}) {
  const paths = {
    markets: 'M4 20V10m8 10V4m8 16V8M2 20h20',
    wallet: 'M3 6h17v15H3zM3 6V3h14v3m-1 7h5v4h-5z',
    activity: 'M4 5h16v16H4zM8 2v6m8-6v6M4 10h16m-12 5h3m3 0h3',
    arrow: 'M6 18 18 6M6 6h12v12',
    search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    shield: 'm12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6zM8 12l3 3 5-6',
    home: 'm3 10 9-8 9 8v11h-6v-8H9v8H3z',
    five: 'm8 3-6 4 3 5 3-2v11h8V10l3 2 3-5-6-4c0 4-8 4-8 0z',
    matchday: 'M3 5h18v14H3z m7 4 6 3-6 3V9z',
    community:
      'M3 21v-4a5 5 0 0 1 10 0v4 M17 12a5 5 0 0 1 4 5v4 M8 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6 M17 3a3 3 0 0 1 0 6',
    account: 'M4 21a8 8 0 0 1 16 0 M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
    more: 'M5 11v2 M12 11v2 M19 11v2',
    close: 'm6 6 12 12M6 18 18 6',
    'chevron-down': 'm6 9 6 6 6-6',
    'chevron-up': 'm6 15 6-6 6 6',
  };
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
