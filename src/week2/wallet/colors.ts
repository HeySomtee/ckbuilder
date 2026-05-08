/**
 * Tiny ANSI color helpers — zero dependencies.
 *
 * Auto-disables when stdout is not a TTY (piped output, CI logs) or when
 * `NO_COLOR` is set, so the output stays clean in non-interactive contexts.
 */

const enabled =
  process.stdout.isTTY === true && !("NO_COLOR" in process.env);

const wrap = (open: number, close: number) => (s: string | number | bigint) =>
  enabled ? `\x1b[${open}m${s}\x1b[${close}m` : String(s);

export const c = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
  gray: wrap(90, 39),
};

/** Common semantic styles — keep colors consistent across the CLI. */
export const style = {
  label: c.dim,
  address: c.cyan,
  amount: (s: string | bigint) => c.bold(c.green(s)),
  hash: c.yellow,
  url: c.blue,
  ok: c.green,
  warn: c.yellow,
  err: c.red,
  heading: (s: string) => c.bold(c.magenta(s)),
};
