/** Parse the pipe-table subset of GitHub-flavored Markdown. */
export function tableCells(line: string): string[] {
  let value = line.trim();
  if (value.startsWith('|')) value = value.slice(1);
  if (value.endsWith('|') && !value.endsWith('\\|')) value = value.slice(0, -1);
  return value.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

export function parseTable(text: string) {
  const lines = text.split('\n');
  if (lines.length < 2 || !lines[0].includes('|')) return null;
  const header = tableCells(lines[0]);
  const separators = tableCells(lines[1]);
  if (header.length !== separators.length || !separators.every((cell) => /^:?-{3,}:?$/.test(cell))) return null;
  const align = separators.map((cell) => cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : 'left');
  const rows = lines.slice(2).map((line) => {
    const cells = tableCells(line).slice(0, header.length);
    while (cells.length < header.length) cells.push('');
    return cells;
  });
  return { header, align, rows };
}
