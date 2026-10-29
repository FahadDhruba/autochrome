import { beforeEach, describe, expect, it, vi } from 'vitest';

const run = vi.hoisted(() => vi.fn());

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: { id: 'self', getURL: (path: string) => `chrome-extension://self${path}` },
  },
}));
vi.mock('./runner', () => ({ createRunner: () => ({ run }) }));

const { handleScheduleMessage } = await import('./start');
const { handleTestMessage } = await import('./testHook');

const sender = (url: string, id = 'self') => ({ id, url }) as Browser.runtime.MessageSender;
const panel = sender('chrome-extension://self/sidepanel.html');
const webPage = sender('https://evil.example/', undefined);
const contentScript = { id: 'self', url: 'https://evil.example/' } as Browser.runtime.MessageSender;

beforeEach(() => run.mockReset());

describe('the Run now message', () => {
  const message = { type: 'autochrome:run-schedule', id: 's1' };

  it('starts the run for an extension page and answers with the outcome', async () => {
    run.mockResolvedValue({ ran: true, run: { id: 'r1', status: 'ok' } });
    const answered = new Promise((resolve) => handleScheduleMessage(message, panel, resolve));
    expect(await answered).toEqual({ ran: true, runId: 'r1', status: 'ok' });
    expect(run).toHaveBeenCalledWith('s1', 'now');
  });

  it.each([
    ['a web page', webPage],
    ['a content script', contentScript],
  ])('never starts a run for %s', (_name, from) => {
    const respond = vi.fn();
    expect(handleScheduleMessage(message, from, respond)).toBe(true);
    expect(respond).toHaveBeenCalledWith({
      ran: false,
      reason: 'Only extension pages may run schedules.',
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('ignores other messages', () => {
    expect(handleScheduleMessage({ type: 'other' }, panel, vi.fn())).toBe(false);
  });
});

describe('the test hooks', () => {
  it('fire the alarm handler for extension pages only', async () => {
    run.mockResolvedValue({ ran: false, reason: 'The schedule is disabled.' });
    const message = { type: 'autochrome:test-fire-schedule', id: 's1' };
    const answered = new Promise((resolve) => handleTestMessage(message, panel, resolve));
    expect(await answered).toEqual({ ran: false, reason: 'The schedule is disabled.' });
    expect(run).toHaveBeenCalledWith('s1', 'test-alarm');

    run.mockClear();
    const respond = vi.fn();
    handleTestMessage(message, contentScript, respond);
    expect(respond).toHaveBeenCalledWith(undefined);
    expect(run).not.toHaveBeenCalled();
  });
});
