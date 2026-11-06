/** A table cell as plain text: markdown links keep their text, emphasis and code marks go. */
export function plainCell(cell: string): string {
  return cell
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|`)/g, '')
    .replace(/(^|\W)[*_](\S.*?\S|\S)[*_](?=\W|$)/g, '$1$2')
    .trim();
}

const csvField = (value: string) =>
  /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export function toCsv(header: string[], rows: string[][]): string {
  return [header, ...rows]
    .map((row) => row.map((c) => csvField(plainCell(c))).join(','))
    .join('\n');
}

/** One object per row, keyed by the header (blank or repeated headers get a number). */
export function toJson(header: string[], rows: string[][]): string {
  const keys = header.map((h, i) => {
    const key = plainCell(h) || `column ${i + 1}`;
    return header.slice(0, i).some((other) => plainCell(other) === plainCell(h))
      ? `${key} ${i + 1}`
      : key;
  });
  const records = rows.map((row) =>
    Object.fromEntries(keys.map((key, i) => [key, plainCell(row[i] ?? '')])),
  );
  return JSON.stringify(records, null, 2);
}

export function download(name: string, type: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
