const MAX_LENGTH = 80;

/** One-line preview of a tool input for the collapsed tool card, e.g. `url: https://…`. */
export function summarizeInput(input: unknown): string {
  if (typeof input !== 'object' || input === null) return '';
  const summary = Object.entries(input)
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(', ');
  return summary.length > MAX_LENGTH ? `${summary.slice(0, MAX_LENGTH - 1)}…` : summary;
}
