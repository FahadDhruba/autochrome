/** Failure with a message that is already fit to show the user. */
export class ProviderError extends Error {}

const STATUS_MESSAGES: Record<number, string> = {
  401: 'The API key was rejected. Check it in Settings.',
  403: 'The API key is not allowed to use this model or endpoint.',
  404: 'Model or endpoint not found. Check the model name and base URL.',
  429: 'Rate limit reached. Wait a moment and try again.',
};

/** The provider's own explanation from an error body, when it sent one. */
function providerMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: unknown } | string;
      message?: unknown;
    };
    const message = typeof parsed.error === 'string' ? parsed.error : parsed.error?.message;
    return typeof message === 'string'
      ? message
      : typeof parsed.message === 'string'
        ? parsed.message
        : '';
  } catch {
    return body.trim().slice(0, 200);
  }
}

export function describeHttpError(label: string, status: number, body: string): string {
  const short =
    STATUS_MESSAGES[status] ??
    (status >= 500
      ? `${label} is unavailable right now (HTTP ${status}). Try again shortly.`
      : `${label} returned HTTP ${status}.`);
  const detail = providerMessage(body);
  return detail ? `${short} ${label} said: ${detail}` : short;
}

type Target = { label: string; baseUrl: string; signal: AbortSignal; fetchImpl?: typeof fetch };

/** fetch that throws a `ProviderError` with a readable message on network and HTTP failures. */
export async function providerFetch(
  target: Target,
  url: string,
  init: RequestInit,
): Promise<Response> {
  let response: Response;
  try {
    response = await (target.fetchImpl ?? fetch)(url, { ...init, signal: target.signal });
  } catch {
    throw new ProviderError(
      target.signal.aborted
        ? 'Stopped.'
        : `Could not reach ${target.label} at ${target.baseUrl}. Is it running and reachable?`,
    );
  }
  if (!response.ok) {
    throw new ProviderError(
      describeHttpError(target.label, response.status, await response.text().catch(() => '')),
    );
  }
  return response;
}

export function describeFailure(error: unknown, signal: AbortSignal): string {
  if (signal.aborted) return 'Stopped.';
  return error instanceof Error ? error.message : String(error);
}
