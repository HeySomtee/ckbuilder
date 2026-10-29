/* Export the owner-approved chart-r identity to the application's stable asset URLs. */
const fs = require('node:fs');
const path = require('node:path');

// The original concept studio is archived. Its generator must not replace this revision.
require('../splash-review/build.cjs');
const source = path.resolve(__dirname, '../splash-review/assets');
const destination = path.resolve(__dirname, '../../public/brand');
// Keep recognisable first-frame artwork, then give both cuts, the chart and
// connected cells a readable sequence within the two-second startup reveal.
const startupMotion = `<style>
.s-letter{animation:solidify .45s ease-out both}
.cut{transform-box:fill-box;transform-origin:left center;animation:cut .18s ease-out both}
.cut-one{animation-delay:.25s}.cut-two{transform-origin:right center;animation-delay:.65s}
.letters{animation:solidify .45s ease-out .65s both}
.chart-r{stroke-dasharray:100;animation:chart .65s ease-out .85s both}
.r-cell,.cell-links,.cell-dot{animation:solidify .3s ease-out both}
.r-cell-one{animation-delay:1.05s}.r-cell-two{animation-delay:1.2s}.r-cell-three{animation-delay:1.35s}
.cell-links{animation-delay:1.4s}.cell-dot{animation-delay:1.45s}
.strike{stroke-dasharray:100;fill:none;stroke-linecap:round;opacity:0;animation:strike .4s ease-in-out both}
.strike.one{animation-delay:.1s}.strike.two{animation-delay:.5s}
.seed{fill:none;stroke-width:1;opacity:0;animation:seed .55s ease-out both}
.seed.b{animation-delay:.08s}.seed.c{animation-delay:.16s}
@keyframes solidify{from{opacity:.8}to{opacity:1}}
@keyframes cut{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes chart{from{stroke-dashoffset:18;stroke:#ff986f}to{stroke-dashoffset:0;stroke:#f1f3ed}}
@keyframes strike{0%{opacity:0;stroke-dashoffset:100}20%{opacity:1}65%{opacity:1;stroke-dashoffset:0}100%{opacity:0;stroke-dashoffset:-100}}
@keyframes seed{0%{opacity:0;transform:translateX(-12px)}25%{opacity:.8}100%{opacity:0;transform:translateX(16px)}}
@media(prefers-reduced-motion:reduce){*{animation:none!important}.strike,.seed{display:none}.chart-r{stroke-dashoffset:0}}
</style>`;
const assets = [
  ['wordmark.svg', 'on-form-wordmark.svg'],
  ['wordmark-light.svg', 'on-form-wordmark-light.svg'],
  ['wordmark-mono.svg', 'on-form-wordmark-mono.svg'],
  ['animated.svg', 'on-form-splash.svg'],
  ['final.svg', 'on-form-splash-final.svg'],
].map(([from, to]) => {
  const svg = fs.readFileSync(path.join(source, from), 'utf8');
  if (!svg.includes('class="chart-r"') || !svg.includes('class="r-cells"')) {
    throw new Error(`Approved chart-r and connected cells are missing from ${from}`);
  }
  return {
    to,
    svg: from === 'animated.svg' ? svg.replace(/<style>[\s\S]*?<\/style>/, startupMotion) : svg,
  };
});

fs.mkdirSync(destination, { recursive: true });
for (const { to, svg } of assets) fs.writeFileSync(path.join(destination, to), svg);
console.log(
  'Exported five approved wordmark and splash SVGs. Standalone s and favicons unchanged.',
);
