import Anthropic from '@anthropic-ai/sdk';

/** Short, readable messages for the failures users actually hit. */
export function describeError(error: unknown): string {
  if (error instanceof Anthropic.APIUserAbortError) return 'Stopped.';
  if (error instanceof Anthropic.APIError) {
    if (error.status === 401) return 'The API key was rejected. Check it in Settings.';
    if (error.status === 403) return 'The API key is not allowed to use this model or endpoint.';
    if (error.status === 429) return 'Rate limit reached. Wait a moment and try again.';
    if (error.status === 529) return 'Anthropic is overloaded right now. Try again shortly.';
    if (error.status === undefined) return `Could not reach the API: ${error.message}`;
    return `API error ${error.status}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
