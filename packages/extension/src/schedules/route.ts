/** Where the side panel is told to show a run: a `#run=<id>` hash, or this session key. */
export const RUN_ROUTE_KEY = 'route.run';

export const runHash = (runId: string): string => `#run=${encodeURIComponent(runId)}`;

/** The run id in a URL hash such as `#run=abc`, or undefined. */
export function runIdFromHash(hash: string): string | undefined {
  const value = new URLSearchParams(hash.replace(/^#/, '')).get('run');
  return value ? value : undefined;
}
