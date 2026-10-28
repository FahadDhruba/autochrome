export const MAX_OUTPUT_CHARS = 20_000;

/** Cut text at the limit and say how much was left out. */
export function truncate(value: string, limit = MAX_OUTPUT_CHARS): string {
  return value.length > limit
    ? `${value.slice(0, limit)}\n… (truncated, ${value.length - limit} more characters)`
    : value;
}
