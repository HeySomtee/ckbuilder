export function Icon({
  name,
}: {
  name: 'markets' | 'wallet' | 'activity' | 'arrow' | 'search' | 'shield';
}) {
  const paths = {
    markets: 'M4 20V10m8 10V4m8 16V8M2 20h20',
    wallet: 'M3 6h17v15H3zM3 6V3h14v3m-1 7h5v4h-5z',
    activity: 'M4 5h16v16H4zM8 2v6m8-6v6M4 10h16m-12 5h3m3 0h3',
    arrow: 'M6 18 18 6M6 6h12v12',
    search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    shield: 'm12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6zM8 12l3 3 5-6',
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
