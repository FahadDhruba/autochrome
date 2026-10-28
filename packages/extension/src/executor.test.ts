import type { ToolHandlers } from './tools/types';
import { describe, expect, it, vi } from 'vitest';
import { executeTool } from './executor';

function fakeHandlers(overrides: Partial<ToolHandlers> = {}): ToolHandlers {
  const unused = async () => {
    throw new Error('unused');
  };
  return new Proxy(overrides, {
    get: (target, name: string) => target[name as keyof ToolHandlers] ?? unused,
  }) as ToolHandlers;
}

describe('executeTool', () => {
  it('passes parsed input with defaults to the handler', async () => {
    const read_page = vi.fn(async () => [{ type: 'text' as const, text: 'tree' }]);
    const result = await executeTool(
      { id: '1', name: 'read_page', input: {} },
      fakeHandlers({ read_page }),
    );
    expect(read_page).toHaveBeenCalledWith({ filter: 'interactive' });
    expect(result).toEqual({ id: '1', ok: true, content: [{ type: 'text', text: 'tree' }] });
  });

  it('turns invalid input into a readable failure without calling the handler', async () => {
    const tab_switch = vi.fn();
    const result = await executeTool(
      { id: '2', name: 'tab_switch', input: { tabId: 'abc' } },
      fakeHandlers({ tab_switch }),
    );
    expect(result.ok).toBe(false);
    expect(result.content[0]).toMatchObject({ type: 'text' });
    expect(JSON.stringify(result.content)).toContain('Invalid input for tab_switch');
    expect(JSON.stringify(result.content)).toContain('tabId');
    expect(tab_switch).not.toHaveBeenCalled();
  });

  it('reports refine failures', async () => {
    const result = await executeTool({ id: '3', name: 'click', input: {} }, fakeHandlers());
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result.content)).toContain('Provide ref, or both x and y.');
  });

  it('catches handler errors', async () => {
    const result = await executeTool(
      { id: '4', name: 'tabs_list', input: undefined },
      fakeHandlers({
        tabs_list: async () => {
          throw new Error('boom');
        },
      }),
    );
    expect(result).toEqual({ id: '4', ok: false, content: [{ type: 'text', text: 'boom' }] });
  });

  it('rejects unknown tools', async () => {
    const result = await executeTool({ id: '5', name: 'nope' as never, input: {} }, fakeHandlers());
    expect(result).toEqual({
      id: '5',
      ok: false,
      content: [{ type: 'text', text: 'Unknown tool "nope".' }],
    });
  });
});
