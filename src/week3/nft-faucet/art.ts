/**
 * Tiny on-chain SVG generator.
 *
 * Each NFT's appearance is deterministic from its sporeId so re-rendering
 * always matches what the network sees. The "art" is intentionally trivial
 * — coloured circles on a coloured background — because the point of week 3
 * is the mint+display loop, not the art.
 */

import { createHash } from "crypto";

export function randomSvg(seedSource: string): string {
  // Stable 32-byte seed from any string (recipient address + nonce).
  const seed = createHash("sha256").update(seedSource).digest();
  const byte = (i: number) => seed[i % seed.length];

  const hue = (b: number) => Math.floor((b / 255) * 360);
  const bg = `hsl(${hue(byte(0))}, 70%, 88%)`;
  const fg1 = `hsl(${hue(byte(1))}, 80%, 50%)`;
  const fg2 = `hsl(${hue(byte(2))}, 80%, 45%)`;
  const fg3 = `hsl(${hue(byte(3))}, 80%, 55%)`;

  // Three circles placed deterministically in a 200x200 box.
  const c = (cx: number, cy: number, r: number, fill: string) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;

  const circles = [
    c(40 + (byte(4) % 120), 40 + (byte(5) % 120), 30 + (byte(6) % 30), fg1),
    c(40 + (byte(7) % 120), 40 + (byte(8) % 120), 25 + (byte(9) % 25), fg2),
    c(40 + (byte(10) % 120), 40 + (byte(11) % 120), 20 + (byte(12) % 20), fg3),
  ].join("");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">` +
    `<rect width="200" height="200" fill="${bg}"/>` +
    circles +
    `</svg>`
  );
}
