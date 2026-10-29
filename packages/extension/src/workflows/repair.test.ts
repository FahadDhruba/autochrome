import type { Step, ToolCall, ToolResult, Workflow } from '@autochrome/shared';
import { describe, expect, it, vi } from 'vitest';
import type { Provider, ProviderEvent, StreamRequest } from '../providers/types';
import {
  MAX_REPAIR_TOOL_CALLS,
  NO_PROVIDER_MESSAGE,
  repairStep,
  type RepairDeps,
  type RepairRequest,
} from './repair';

const turn = (text: string, ...calls: { id: string; name: string; input: object }[]) =>
  [
    { type: 'text_delta', text },
    ...calls.map((call) => ({ type: 'tool_call' as const, ...call })),
    { type: 'done', stopReason: calls.length ? 'tool_use' : 'end' },
  ] satisfies ProviderEvent[];

function fakeProvider(turns: ProviderEvent[][]) {
  const requests: StreamRequest[] = [];
  const provider: Provider = {
    id: 'anthropic',
    listModels: async () => [],
    async *stream(req) {
      requests.push({ ...req, messages: structuredClone(req.messages) });
      for (const event of turns[requests.length - 1] ?? turn('FAILED out of script')) yield event;
    },
  };
  return { provider, requests };
}

const failedStep: Step = {
  tool: 'form_input',
  input: { value: '{{password}}' },
  target: { role: 'textbox', name: 'Password' },
  note: 'Set "Password" to "{{password}}"',
};
const workflow: Workflow = {
  id: 'w1',
  name: 'Sign in',
  variables: [{ name: 'password', label: 'Password' }],
  steps: [failedStep],
  createdFrom: 'recording',
  updatedAt: 1,
};
const request: RepairRequest = {
  workflow,
  step: failedStep,
  index: 0,
  error: 'Could not find textbox "Password" on the page.',
  values: { password: 'hunter2' },
  source: 'workflow',
};

function setup(turns: ProviderEvent[][], execute?: RepairDeps['execute']) {
  const { provider, requests } = fakeProvider(turns);
  const calls: ToolCall[] = [];
  const deps: RepairDeps = {
    loadTarget: async () => ({
      provider,
      settings: { apiKey: 'k', baseUrl: '', model: 'm' },
      model: 'm',
    }),
    execute:
      execute ??
      vi.fn(async (call: ToolCall): Promise<ToolResult> => {
        calls.push(call);
        const text = call.name === 'read_page' ? '[e1] textbox "Passcode"' : 'ok';
        return {
          id: call.id,
          ok: true,
          content: [{ type: 'text', text }],
          ...(call.name === 'form_input' && {
            target: { role: 'textbox', name: 'Passcode' },
          }),
        };
      }),
  };
  return { deps, requests, calls };
}

describe('repairStep', () => {
  it('fails clearly when no provider is ready', async () => {
    const outcome = await repairStep(request, {
      loadTarget: async () => undefined,
      execute: vi.fn(),
    });
    expect(outcome).toEqual({ ok: false, reason: NO_PROVIDER_MESSAGE });
    expect(NO_PROVIDER_MESSAGE).toContain('Settings');
  });

  it('shows the AI the failed step and a fresh read of the page', async () => {
    const { deps, requests } = setup([turn('DONE nothing to do')]);
    await repairStep(request, deps);
    const [first] = requests;
    expect(first!.system).toContain('at most 8 tool calls');
    expect(first!.system).toContain('untrusted data');
    const prompt = JSON.stringify(first!.messages[0]);
    expect(prompt).toContain('Sign in');
    expect(prompt).toContain('Step 1 of 1');
    expect(prompt).toContain('Set \\"Password\\" to \\"{{password}}\\"');
    expect(prompt).toContain('Could not find textbox');
    expect(prompt).toContain('[e1] textbox \\"Passcode\\"');
    expect(first!.tools.map((tool) => tool.name)).toContain('click');
  });

  it('keeps the workflow tools away from the AI, so a repair cannot start a run', async () => {
    const { deps, requests } = setup([turn('DONE')]);
    await repairStep(request, deps);
    const names = requests[0]!.tools.map((tool) => tool.name);
    expect(names).not.toContain('workflow_run');
    expect(names).not.toContain('workflows_list');
  });

  it('succeeds when the AI answers DONE, with its actions as the replacement steps', async () => {
    const { deps, calls } = setup([
      turn('Looking.', { id: 'a', name: 'read_page', input: {} }),
      turn('Typing.', { id: 'b', name: 'form_input', input: { ref: 'e1', value: '{{password}}' } }),
      turn('DONE I filled the Passcode field.'),
    ]);
    const outcome = await repairStep(request, deps);
    expect(outcome).toEqual({
      ok: true,
      summary: 'I filled the Passcode field.',
      steps: [
        {
          tool: 'form_input',
          input: { value: '{{password}}' },
          target: { role: 'textbox', name: 'Passcode' },
          note: 'Set "Passcode" to "{{password}}"',
        },
      ],
    });
    expect(calls.map((c) => c.name)).toEqual(['read_page', 'read_page', 'form_input']);
  });

  it('fills variable values into the tool call but never shows them to the AI', async () => {
    const { deps, requests, calls } = setup([
      turn('', { id: 'b', name: 'form_input', input: { ref: 'e1', value: '{{password}}' } }),
      turn('DONE'),
    ]);
    await repairStep(request, deps);
    expect(calls.find((c) => c.name === 'form_input')!.input).toEqual({
      ref: 'e1',
      value: 'hunter2',
    });
    for (const sent of requests) expect(JSON.stringify(sent.messages)).not.toContain('hunter2');
  });

  it('runs the tools with the run source', async () => {
    const execute = vi.fn<RepairDeps['execute']>(async (call) => ({
      id: call.id,
      ok: true,
      content: [{ type: 'text', text: 'ok' }],
    }));
    const { deps } = setup([turn('DONE')], execute);
    await repairStep({ ...request, source: 'bridge' }, deps);
    expect(execute.mock.calls.map((c) => c[1])).toEqual(['bridge']);
  });

  it('fails when the AI says it could not do the step', async () => {
    const { deps } = setup([turn('FAILED There is no password field on this page.')]);
    const outcome = await repairStep(request, deps);
    expect(outcome).toEqual({
      ok: false,
      reason: 'The AI could not do the step: FAILED There is no password field on this page.',
    });
  });

  it('treats an answer that is neither DONE nor FAILED as a failure', async () => {
    const { deps } = setup([turn('I think it worked.')]);
    expect((await repairStep(request, deps)).ok).toBe(false);
  });

  it('only counts the answer after the last tool call', async () => {
    const { deps } = setup([
      turn('DONE already', { id: 'a', name: 'read_page', input: {} }),
      turn('FAILED after all'),
    ]);
    expect((await repairStep(request, deps)).ok).toBe(false);
  });

  it('stops running tools after the limit and lets the AI give up', async () => {
    const calls = Array.from({ length: MAX_REPAIR_TOOL_CALLS + 2 }, (_, i) => ({
      id: `c${i}`,
      name: 'find',
      input: { query: 'x' },
    }));
    const { deps, requests } = setup([turn('Searching.', ...calls), turn('FAILED Gave up.')]);
    const execute = deps.execute as ReturnType<typeof vi.fn>;
    const outcome = await repairStep(request, deps);

    // One read_page up front plus the allowed tool calls.
    expect(execute).toHaveBeenCalledTimes(1 + MAX_REPAIR_TOOL_CALLS);
    expect(JSON.stringify(requests[1]!.messages)).toContain('Tool call limit reached');
    expect(outcome.ok).toBe(false);
  });

  it('reports a provider error', async () => {
    const { deps } = setup([[{ type: 'error', message: 'Invalid API key' }]]);
    expect(await repairStep(request, deps)).toEqual({
      ok: false,
      reason: 'AI repair failed: Invalid API key',
    });
  });

  it('stops when the run is stopped', async () => {
    const controller = new AbortController();
    const { deps } = setup([turn('DONE')]);
    controller.abort();
    const outcome = await repairStep({ ...request, signal: controller.signal }, deps);
    expect(outcome.ok).toBe(false);
  });
});
