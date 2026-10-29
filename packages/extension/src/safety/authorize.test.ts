import type { ToolCall } from '@autochrome/shared';
import { describe, expect, it, vi } from 'vitest';
import { ApprovalQueue } from './approvals';
import { authorize } from './authorize';
import type { GateEnv } from './gate';
import type { ApprovalChoice, ApprovalRequest } from './types';

const env = (element?: { name: string }): GateEnv => ({
  loadSafety: async () => ({ mode: 'per-site', sites: [] }),
  tab: async () => ({ id: 1, url: 'https://example.com/', title: 'Example', inAgentGroup: false }),
  describe: async () =>
    element && {
      tag: 'button',
      role: 'button',
      name: element.name,
      ariaLabel: '',
      inputType: '',
      autocomplete: '',
      fieldId: '',
      inForm: false,
      formHasPassword: false,
      formHasPayment: false,
    },
});

function setup(choice: ApprovalChoice | 'never', element?: { name: string }) {
  const approvals = new ApprovalQueue();
  const shown: ApprovalRequest[] = [];
  approvals.setPresenter({
    present: (request) => {
      shown.push(request);
      if (choice !== 'never') approvals.answer(request.id, choice);
    },
    dismiss: () => {},
  });
  const addSite = vi.fn(async () => {});
  const run = (call: ToolCall, signal?: AbortSignal) =>
    authorize(call, 'agent', signal, { env: env(element), approvals, addSite });
  return { run, shown, addSite };
}

const scroll: ToolCall = { id: '1', name: 'scroll', input: { direction: 'down', amount: 600 } };

describe('authorize', () => {
  it('lets allowed calls through without asking', async () => {
    const { run, shown } = setup('deny');
    expect(await run({ id: '1', name: 'tabs_list', input: {} })).toBeUndefined();
    expect(shown).toHaveLength(0);
  });

  it('refuses with the gate reason', async () => {
    const { run } = setup('once');
    const call: ToolCall = { id: '1', name: 'navigate', input: { url: 'chrome://settings' } };
    expect(await run(call)).toBe('autochrome cannot control chrome:// pages.');
  });

  it('allows once without remembering the site', async () => {
    const { run, addSite } = setup('once');
    expect(await run(scroll)).toBeUndefined();
    expect(addSite).not.toHaveBeenCalled();
  });

  it('remembers the site when the user allows it', async () => {
    const { run, addSite } = setup('site');
    expect(await run(scroll)).toBeUndefined();
    expect(addSite).toHaveBeenCalledWith('https://example.com');
  });

  it('never remembers a site for a risky action', async () => {
    const { run, addSite, shown } = setup('site', { name: 'Place order' });
    expect(await run({ id: '1', name: 'click', input: { ref: 'e1' } })).toBeUndefined();
    expect(shown[0]?.risk).toBe('Clicks "Place order" (purchase)');
    expect(addSite).not.toHaveBeenCalled();
  });

  it('tells the AI when the user denies', async () => {
    const { run, addSite } = setup('deny');
    expect(await run(scroll)).toBe('The user denied this action.');
    expect(addSite).not.toHaveBeenCalled();
  });

  it('denies when Stop is pressed while waiting', async () => {
    const { run, shown } = setup('never');
    const stop = new AbortController();
    const pending = run(scroll, stop.signal);
    await vi.waitFor(() => expect(shown).toHaveLength(1));
    stop.abort();
    expect(await pending).toBe('The user denied this action.');
  });
});

describe('authorize js_eval', () => {
  const evalCall: ToolCall = { id: '1', name: 'js_eval', input: { code: 'document.title = "x"' } };

  function setupAuto(choice: ApprovalChoice, source: 'agent' | 'bridge' | 'debug' = 'agent') {
    const approvals = new ApprovalQueue();
    const shown: ApprovalRequest[] = [];
    approvals.setPresenter({
      present: (request) => {
        shown.push(request);
        approvals.answer(request.id, choice);
      },
      dismiss: () => {},
    });
    const addSite = vi.fn(async () => {});
    const autoEnv: GateEnv = { ...env(), loadSafety: async () => ({ mode: 'auto', sites: [] }) };
    const run = () => authorize(evalCall, source, undefined, { env: autoEnv, approvals, addSite });
    return { run, shown, addSite };
  }

  it.each(['agent', 'bridge'] as const)('still asks in auto mode for %s calls', async (source) => {
    const { run, shown } = setupAuto('once', source);
    expect(await run()).toBeUndefined();
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ tool: 'js_eval', detail: 'document.title = "x"', source });
  });

  it('refuses in auto mode when the user denies', async () => {
    const { run } = setupAuto('deny');
    expect(await run()).toBe('The user denied this action.');
  });

  it('never remembers the site', async () => {
    const { run, addSite } = setupAuto('site');
    expect(await run()).toBeUndefined();
    expect(addSite).not.toHaveBeenCalled();
  });

  it('does not ask for the debug page', async () => {
    const { run, shown } = setupAuto('deny', 'debug');
    expect(await run()).toBeUndefined();
    expect(shown).toHaveLength(0);
  });
});
