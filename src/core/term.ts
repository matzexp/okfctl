const ESC = String.fromCharCode(27);
const enabled = process.env.NO_COLOR === undefined && process.stdout.isTTY === true;

const wrap = (code: string) => (text: string) =>
  enabled ? ESC + '[' + code + 'm' + text + ESC + '[0m' : text;

export const dim = wrap('2');
export const bold = wrap('1');
export const red = wrap('31');
export const yellow = wrap('33');
export const green = wrap('32');
export const cyan = wrap('36');

const ANSI = new RegExp(ESC + '\\[\\d+m', 'g');

/** Render rows as a left-aligned plain table. */
export function table(rows: string[][]): string {
  if (rows.length === 0) return '';
  const columns = Math.max(...rows.map((row) => row.length));
  const widths = Array.from({ length: columns }, (_, column) =>
    Math.max(...rows.map((row) => visibleLength(row[column] ?? ''))),
  );
  return rows
    .map((row) =>
      row
        .map((cell, column) => (column === row.length - 1 ? cell : pad(cell, widths[column])))
        .join('  ')
        .trimEnd(),
    )
    .join('\n');
}

function visibleLength(text: string): number {
  return text.replace(ANSI, '').length;
}

function pad(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - visibleLength(text)));
}
