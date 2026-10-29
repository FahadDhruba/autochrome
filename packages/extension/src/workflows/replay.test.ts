import type { Step, TargetHint, ToolCall, ToolResult, Workflow } from '@autochrome/shared';
import { describe, expect, it, vi } from 'vitest';
import { resolveVariables, runWorkflow, summarizeRun, type ReplayDeps } from './replay';
import type { RunEvent } from './types';

const signIn: TargetHint = { role: 'button', name: 'Sign in' };
const email: TargetHint = { role: 'textbox', name: 'Email' };

const ok = (id: string, text = 'done'): ToolResult => ({
  id,
  ok: true,
  content: [{ type: 'text', text }],
});
const fail = (id: string, text: string): ToolResult => ({
  id,
  ok: false,
  content: [{ type: 'text', text }],
});

const workflow = (steps: Step[], patch: Partial<Workflow> = {}): Workflow => ({
  id: 'w1',
  name: 'Sign in',
  variables: [],
  steps,
  createdFrom: 'recording',
  updatedAt: 1,
  ...patch,
});

/** Fake browser pieces: tools succeed unless `failures` says otherwise. */
function setup(overrides: Partial<ReplayDeps> = {}) {
  let clock = 0;
  const calls: ToolCall[] = [];
  const saved: unknown[] = [];
  const deps: Partial<ReplayDeps> = {
    execute: vi.fn(async (call: ToolCall) => {
      calls.push(call);
      return ok(call.id);
    }),
    resolve: vi.fn(async () => ({ ref: 'e7', kind: 'name' as const })),
    repair: vi.fn(async () => ({ ok: false as const, reason: 'No AI provider.' })),
    currentTab: async () => 1,
    openTab: vi.fn(async () => ok('tab')),
    setTab: vi.fn(),
    screenshot: async () => ({ data: 'AAAA', mimeType: 'image/jpeg' }),
    save: async (run) => void saved.push(run),
    now: () => (clock += 10),
    sleep: async () => void (clock += 250),
    resolveTimeoutMs: 1000,
    ...overrides,
  };
  return { deps, calls, saved };
}

const click = (target: TargetHint = signIn): Step => ({ tool: 'click', input: {}, target });

describe('resolveVariables', () => {
  const wf = workflow([], {
    variables: [
      { name: 'user', label: 'User', default: 'ada' },
      { name: 'password', label: 'Password' },
    ],
  });

  it('uses given values over defaults and reports the missing ones', () => {
    expect(resolveVariables(wf, { user: 'bob' })).toEqual({
      values: { user: 'bob' },
      missing: ['password'],
    });
    expect(resolveVariables(wf, { password: '' })).toEqual({
      values: { user: 'ada', password: '' },
      missing: [],
    });
  });

  it('asks for placeholders used in a step but never declared', () => {
    const undeclared = workflow([{ tool: 'type', input: { text: '{{city}}' } }]);
    expect(resolveVariables(undeclared, {}).missing).toEqual(['city']);
    expect(resolveVariables(undeclared, { city: 'Oslo' }).values).toEqual({ city: 'Oslo' });
  });
});

describe('runWorkflow', () => {
  it('opens a tab, runs every step and saves the run', async () => {
    const { deps, calls, saved } = setup();
    const events: RunEvent[] = [];
    const run = await runWorkflow(
      workflow([
        { tool: 'navigate', input: { url: 'https://example.com' }, note: 'Go to the site' },
        click(),
      ]),
      {},
      { source: 'workflow', onEvent: (e) => events.push(e) },
      deps,
    );

    expect(run).toMatchObject({
      status: 'ok',
      source: 'workflow',
      workflowName: 'Sign in',
      totalSteps: 2,
    });
    expect(run.steps.map((s) => [s.index, s.status, s.note])).toEqual([
      [0, 'ok', 'Go to the site'],
      [1, 'ok', 'Click "Sign in"'],
    ]);
    expect(run.steps.every((s) => s.durationMs > 0)).toBe(true);
    expect(deps.openTab).toHaveBeenCalledOnce();
    expect(calls.map((c) => c.name)).toEqual(['navigate', 'click']);
    expect(saved).toEqual([run]);
    expect(events.map((e) => e.type)).toEqual([
      'run_started',
      'step_started',
      'step_finished',
      'step_started',
      'step_finished',
      'run_finished',
    ]);
  });

  it('records who started the run, and which schedule when there is one', async () => {
    const wf = workflow([click()]);
    const run = async (
      source: 'workflow' | 'bridge' | 'scheduled',
      schedule?: { id: string; name: string },
    ) => runWorkflow(wf, {}, { source, schedule }, setup().deps);

    expect(await run('workflow')).toMatchObject({ trigger: 'manual', kind: 'workflow' });
    expect(await run('bridge')).toMatchObject({ trigger: 'bridge' });
    const scheduled = await run('scheduled', { id: 's1', name: 'Nightly' });
    expect(scheduled).toMatchObject({
      trigger: 'schedule',
      source: 'scheduled',
      scheduleId: 's1',
      scheduleName: 'Nightly',
    });
  });

  it('runs every step as the given source', async () => {
    const { deps } = setup();
    await runWorkflow(workflow([click()]), {}, { source: 'bridge' }, deps);
    const sources = (deps.execute as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[1]);
    expect(sources).toEqual(['bridge']);
    expect(deps.openTab).toHaveBeenCalledWith('bridge', undefined);
  });

  it('opens no tab when the first step opens one, or when given a tab', async () => {
    const first = setup();
    await runWorkflow(
      workflow([{ tool: 'tab_open', input: { url: 'https://example.com' } }]),
      {},
      { source: 'workflow' },
      first.deps,
    );
    expect(first.deps.openTab).not.toHaveBeenCalled();

    const second = setup();
    await runWorkflow(workflow([click()]), {}, { source: 'workflow', tabId: 42 }, second.deps);
    expect(second.deps.openTab).not.toHaveBeenCalled();
    expect(second.deps.setTab).toHaveBeenCalledWith(42);
  });

  it('fails the run when the tab cannot be opened', async () => {
    const { deps } = setup({ openTab: async () => fail('t', 'Not allowed.') });
    const run = await runWorkflow(workflow([click()]), {}, { source: 'workflow' }, deps);
    expect(run).toMatchObject({ status: 'failed', error: 'Not allowed.', steps: [] });
  });

  describe('targets', () => {
    it('resolves the target into a ref and drops points', async () => {
      const { deps, calls } = setup();
      await runWorkflow(
        workflow([{ tool: 'click', input: { x: 1, y: 2, button: 'left' }, target: signIn }]),
        {},
        { source: 'workflow' },
        deps,
      );
      expect(calls[0]!.input).toEqual({ button: 'left', ref: 'e7' });
      expect(deps.resolve).toHaveBeenCalledWith(1, signIn);
    });

    it('does not look for a target for tools that take none', async () => {
      const { deps } = setup();
      await runWorkflow(
        workflow([{ tool: 'key', input: { keys: 'Enter' }, target: email }]),
        {},
        { source: 'workflow' },
        deps,
      );
      expect(deps.resolve).not.toHaveBeenCalled();
    });

    it('keeps trying while the page loads', async () => {
      let attempts = 0;
      const { deps } = setup({
        resolve: async () => {
          if (++attempts < 3) throw new Error('Frame was removed');
          return { ref: 'e1', kind: 'text' as const };
        },
      });
      const run = await runWorkflow(workflow([click()]), {}, { source: 'workflow' }, deps);
      expect(run.status).toBe('ok');
      expect(attempts).toBe(3);
    });
  });

  describe('variables', () => {
    it('fills them into the inputs, without storing the values', async () => {
      const { deps, calls, saved } = setup();
      const wf = workflow(
        [{ tool: 'form_input', input: { value: '{{password}}' }, target: email }],
        { variables: [{ name: 'password', label: 'Password' }] },
      );
      const run = await runWorkflow(wf, { password: 'hunter2' }, { source: 'workflow' }, deps);
      expect(calls[0]!.input).toEqual({ value: 'hunter2', ref: 'e7' });
      expect(run.variableNames).toEqual(['password']);
      expect(JSON.stringify(saved)).not.toContain('hunter2');
      expect(JSON.stringify(run.steps)).not.toContain('hunter2');
    });

    it('fails before doing anything when a value is missing', async () => {
      const { deps, calls } = setup();
      const wf = workflow([click()], { variables: [{ name: 'user', label: 'User' }] });
      const run = await runWorkflow(wf, {}, { source: 'workflow' }, deps);
      expect(run).toMatchObject({ status: 'failed', error: 'Missing value for {{user}}.' });
      expect(calls).toEqual([]);
      expect(deps.openTab).not.toHaveBeenCalled();
    });
  });

  describe('AI fallback', () => {
    it('repairs a step whose element cannot be found and carries on', async () => {
      const repaired: Step = {
        tool: 'click',
        input: {},
        target: { role: 'button', name: 'Log in' },
      };
      const { deps, calls } = setup({
        resolve: vi.fn(async (_tab, target) =>
          target.name === 'Sign in' ? undefined : { ref: 'e2', kind: 'name' as const },
        ),
        repair: vi.fn(async () => ({
          ok: true as const,
          steps: [repaired],
          summary: 'Clicked Log in.',
        })),
      });
      const run = await runWorkflow(
        workflow([click(), { tool: 'key', input: { keys: 'Enter' } }]),
        {},
        { source: 'workflow' },
        deps,
      );

      expect(run.status).toBe('repaired');
      expect(run.steps.map((s) => s.status)).toEqual(['repaired', 'ok']);
      expect(run.steps[0]).toMatchObject({
        error: 'Could not find button "Sign in" on the page.',
        repair: { steps: [repaired], summary: 'Clicked Log in.' },
      });
      expect(run.steps[0]!.screenshot).toBeUndefined();
      expect(calls.map((c) => c.name)).toEqual(['key']);
      expect(deps.repair).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 0,
          error: 'Could not find button "Sign in" on the page.',
          source: 'workflow',
        }),
      );
    });

    it('repairs a step whose tool failed', async () => {
      const { deps } = setup({
        execute: vi.fn(async (call: ToolCall) =>
          fail(call.id, 'Unknown ref e7. Call read_page again.'),
        ),
        repair: async () => ({ ok: true as const, steps: [], summary: 'Already done.' }),
      });
      const run = await runWorkflow(workflow([click()]), {}, { source: 'workflow' }, deps);
      expect(run.steps[0]).toMatchObject({
        status: 'repaired',
        error: 'Unknown ref e7. Call read_page again.',
      });
    });

    it('stops at a step the AI cannot repair, with a screenshot and the reason', async () => {
      const { deps, calls, saved } = setup({
        resolve: async () => undefined,
        repair: async () => ({ ok: false as const, reason: 'No AI provider is set up.' }),
      });
      const run = await runWorkflow(
        workflow([click(), { tool: 'key', input: { keys: 'Enter' } }]),
        {},
        { source: 'workflow' },
        deps,
      );
      expect(run.status).toBe('failed');
      expect(run.steps).toHaveLength(1);
      expect(run.steps[0]).toMatchObject({
        status: 'failed',
        screenshot: { data: 'AAAA', mimeType: 'image/jpeg' },
      });
      expect(run.steps[0]!.error).toBe(
        'Could not find button "Sign in" on the page. No AI provider is set up.',
      );
      expect(calls).toEqual([]);
      expect(saved).toEqual([run]);
    });
  });

  describe('stopping', () => {
    it('stops between steps', async () => {
      const controller = new AbortController();
      const { deps } = setup({
        execute: vi.fn(async (call: ToolCall) => {
          controller.abort();
          return ok(call.id);
        }),
      });
      const run = await runWorkflow(
        workflow([click(), click()]),
        {},
        { source: 'workflow', signal: controller.signal },
        deps,
      );
      expect(run).toMatchObject({ status: 'stopped', error: 'Stopped by the user.' });
      expect(run.steps).toHaveLength(1);
    });

    it('does not ask the AI to repair a step that was stopped', async () => {
      const controller = new AbortController();
      const { deps } = setup({
        execute: vi.fn(async (call: ToolCall) => {
          controller.abort();
          return fail(call.id, 'The user denied this action.');
        }),
      });
      const run = await runWorkflow(
        workflow([click()]),
        {},
        { source: 'workflow', signal: controller.signal },
        deps,
      );
      expect(run.status).toBe('stopped');
      expect(deps.repair).not.toHaveBeenCalled();
    });
  });

  it('runs one workflow at a time', async () => {
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow = setup({
      execute: vi.fn(async (call: ToolCall) => {
        order.push('first start');
        await gate;
        order.push('first end');
        return ok(call.id);
      }),
    });
    const quick = setup({
      execute: vi.fn(async (call: ToolCall) => {
        order.push('second');
        return ok(call.id);
      }),
    });
    const first = runWorkflow(workflow([click()]), {}, { source: 'workflow' }, slow.deps);
    const second = runWorkflow(workflow([click()]), {}, { source: 'workflow' }, quick.deps);
    await new Promise((resolve) => setTimeout(resolve, 20));
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(['first start', 'first end', 'second']);
  });
});

describe('summarizeRun', () => {
  it('lists each step with its status and what went wrong', async () => {
    const { deps } = setup({ resolve: async () => undefined });
    const run = await runWorkflow(
      workflow([{ tool: 'key', input: { keys: 'Tab' } }, click(), click()]),
      {},
      { source: 'bridge' },
      deps,
    );
    const lines = summarizeRun(run).split('\n');
    expect(lines[0]).toMatch(/^Workflow "Sign in": failed \(/);
    expect(lines[1]).toMatch(/^1\. Press Tab: ok \(\d+ ms\)$/);
    expect(lines[2]).toContain('2. Click "Sign in": failed');
    expect(lines[2]).toContain('Could not find button "Sign in"');
    expect(lines.at(-1)).toBe('1 step(s) not run.');
  });
});
