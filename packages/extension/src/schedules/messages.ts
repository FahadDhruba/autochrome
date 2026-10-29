/** Side panel to background: the "Run now" button. Only extension pages may send it. */
export const RUN_NOW_MESSAGE = 'autochrome:run-schedule';

export type RunNowMessage = { type: typeof RUN_NOW_MESSAGE; id: string };
export type RunNowResponse =
  { ran: true; runId: string; status: string } | { ran: false; reason: string };

export const isRunNowMessage = (message: unknown): message is RunNowMessage => {
  const m = message as Partial<RunNowMessage> | null;
  return m?.type === RUN_NOW_MESSAGE && typeof m.id === 'string';
};
