/** Minimal ANSI colours, disabled when NO_COLOR is set or output is not a TTY. */
const enabled = !process.env.NO_COLOR && (process.stdout.isTTY ?? false) && process.env.TERM !== 'dumb';

const wrap = (open: number, close: number) => (s: string) => (enabled ? `\x1b[${open}m${s}\x1b[${close}m` : s);

export const c = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  cyan: wrap(36, 39),
  magenta: wrap(35, 39),
};
