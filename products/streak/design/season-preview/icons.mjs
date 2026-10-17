const paths = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
  five: '<path d="m8 3-5 4 3 5 2-1v10h8V11l2 1 3-5-5-4-4 2Z"/><path d="M10 12h4l-4 5h4"/>',
  markets: '<path d="M4 20V10m8 10V4m8 16V7M2 20h20"/>',
  live: '<rect x="3" y="5" width="18" height="14" rx="4"/><path d="m10 9 5 3-5 3Z"/>',
  activity: '<path d="M3 5h18v16H3zM7 2v6m10-6v6M3 10h18m-13 5h3m3 0h3"/>',
  club: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v3"/>',
  wallet:
    '<rect x="3" y="6" width="18" height="15" rx="3"/><path d="M3 9V5a2 2 0 0 1 2-2h13m3 9h-6v5h6m-3-2.5h.01"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  up: '<path d="M5 19 19 5M5 5h14v14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  trophy:
    '<path d="M8 3h8v7a4 4 0 0 1-8 0ZM8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 2v6m-5 1h10"/>',
  spark: '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  shield:
    '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  minus: '<path d="M5 12h14"/>',
  settings:
    '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  fire: '<path d="M12 2c2 6 6 7 6 12a6 6 0 0 1-12 0c0-3 2-6 4-7 0 3 1 4 2 4 2-2 1-5 0-9Z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  bell: '<path d="M5 16h14l-2-4V8a5 5 0 0 0-10 0v4Zm5 4h4"/>',
  back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
  logout: '<path d="M9 3H4v18h5m0-9h12m-5-5 5 5-5 5"/>',
  star: '<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  link: '<path d="m10 13 4-4m-6 6-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m4 2 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 0)"/>',
};
export const icon = (name, cls = "") =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.spark}</svg>`;
export function shirt(p, cls = "") {
  const gradient = `shine-${p.id}-${cls.replace(/[^a-z0-9-]/gi, "-")}`;
  return `<svg class="shirt ${cls}" viewBox="0 0 120 130" aria-hidden="true"><defs><linearGradient id="${gradient}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="white" stop-opacity=".24"/><stop offset=".45" stop-color="white" stop-opacity="0"/><stop offset="1" stop-color="black" stop-opacity=".3"/></linearGradient></defs><path d="m38 13-24 13-11 26 19 10 12-17-3 72q29 12 58 0l-3-72 12 17 19-10-11-26-24-13q-22 13-44 0Z" fill="${p.color}" stroke="#ffffff35"/><path d="m38 13-24 13-11 26 19 10 12-17-3 72q29 12 58 0l-3-72 12 17 19-10-11-26-24-13q-22 13-44 0Z" fill="url(#${gradient})"/><path d="M38 13q22 25 44 0" fill="none" stroke="#f5f2e9" stroke-width="4"/><path d="m29 25-7 25m69-25 7 25" stroke="#fff" stroke-opacity=".2" stroke-width="2"/><text x="60" y="76" fill="#fff" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" font-weight="800">${p.club}</text><path d="M42 93h36" stroke="#fff" stroke-opacity=".4" stroke-width="2"/></svg>`;
}
