import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APPROVAL_TIMEOUT_MS, ApprovalQueue } from './approvals';
import type { ApprovalRequest } from './types';

const request = (summary = 'ref: e1'): Omit<ApprovalRequest, 'id'> => ({
  source: 'agent',
  tool: 'click',
  summary,
  site: 'https://example.com',
  tabTitle: 'Example',
});

function setup(timeoutMs?: number) {
  const queue = new ApprovalQueue(timeoutMs);
  const shown: ApprovalRequest[] = [];
  const dismissed: string[] = [];
  queue.setPresenter({
    present: (r) => shown.push(r),
    dismiss: (r) => dismissed.push(r.id),
  });
  return { queue, shown, dismissed };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('ApprovalQueue', () => {
  it('shows a request and resolves with the answer', async () => {
    const { queue, shown, dismissed } = setup();
    const pending = queue.request(request());
    expect(shown).toHaveLength(1);
    expect(queue.current()).toEqual(shown[0]);
    expect(queue.get(shown[0]!.id)).toEqual(shown[0]);

    expect(queue.answer(shown[0]!.id, 'site')).toBe(true);
    await expect(pending).resolves.toBe('site');
    expect(dismissed).toEqual([shown[0]!.id]);
    expect(queue.current()).toBeUndefined();
  });

  it('shows one prompt at a time, in order', async () => {
    const { queue, shown } = setup();
    const first = queue.request(request('first'));
    const second = queue.request(request('second'));
    const third = queue.request(request('third'));
    expect(shown.map((r) => r.summary)).toEqual(['first']);

    queue.answer(shown[0]!.id, 'once');
    await expect(first).resolves.toBe('once');
    expect(shown.map((r) => r.summary)).toEqual(['first', 'second']);

    queue.answer(shown[1]!.id, 'deny');
    await expect(second).resolves.toBe('deny');
    expect(shown.map((r) => r.summary)).toEqual(['first', 'second', 'third']);

    queue.answer(shown[2]!.id, 'once');
    await expect(third).resolves.toBe('once');
    expect(shown).toHaveLength(3);
  });

  it('denies after two minutes and moves on', async () => {
    expect(APPROVAL_TIMEOUT_MS).toBe(120_000);
    const { queue, shown } = setup();
    const first = queue.request(request('first'));
    const second = queue.request(request('second'));

    await vi.advanceTimersByTimeAsync(APPROVAL_TIMEOUT_MS - 1);
    expect(shown).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(first).resolves.toBe('deny');
    // The second request only starts its own two minutes when it is shown.
    expect(shown.map((r) => r.summary)).toEqual(['first', 'second']);
    await vi.advanceTimersByTimeAsync(APPROVAL_TIMEOUT_MS - 1);
    expect(queue.current()?.summary).toBe('second');
    await vi.advanceTimersByTimeAsync(1);
    await expect(second).resolves.toBe('deny');
  });

  it('does not time out once answered', async () => {
    const { queue, shown } = setup();
    const pending = queue.request(request());
    queue.answer(shown[0]!.id, 'once');
    await expect(pending).resolves.toBe('once');
    await vi.advanceTimersByTimeAsync(APPROVAL_TIMEOUT_MS * 2);
    expect(shown).toHaveLength(1);
  });

  it('denies a request that is shown when Stop is pressed, and shows the next', async () => {
    const { queue, shown, dismissed } = setup();
    const stop = new AbortController();
    const first = queue.request(request('first'), stop.signal);
    const second = queue.request(request('second'));

    stop.abort();
    await expect(first).resolves.toBe('deny');
    expect(dismissed).toEqual([shown[0]!.id]);
    expect(shown.map((r) => r.summary)).toEqual(['first', 'second']);
    queue.answer(shown[1]!.id, 'once');
    await expect(second).resolves.toBe('once');
  });

  it('drops a waiting request when Stop is pressed without showing it', async () => {
    const { queue, shown } = setup();
    const stop = new AbortController();
    const first = queue.request(request('first'));
    const waiting = queue.request(request('waiting'), stop.signal);

    stop.abort();
    await expect(waiting).resolves.toBe('deny');
    queue.answer(shown[0]!.id, 'once');
    await expect(first).resolves.toBe('once');
    expect(shown.map((r) => r.summary)).toEqual(['first']);
  });

  it('denies straight away when already stopped', async () => {
    const { queue, shown } = setup();
    const stop = new AbortController();
    stop.abort();
    await expect(queue.request(request(), stop.signal)).resolves.toBe('deny');
    expect(shown).toHaveLength(0);
  });

  it('ignores answers for unknown or finished requests', async () => {
    const { queue, shown } = setup();
    const pending = queue.request(request());
    expect(queue.answer('nope', 'once')).toBe(false);
    queue.answer(shown[0]!.id, 'deny');
    await pending;
    expect(queue.answer(shown[0]!.id, 'once')).toBe(false);
  });

  it('works without a presenter', async () => {
    const queue = new ApprovalQueue(10);
    const pending = queue.request(request());
    await vi.advanceTimersByTimeAsync(10);
    await expect(pending).resolves.toBe('deny');
  });
});
