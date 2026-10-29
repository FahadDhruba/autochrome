import type { Workflow } from '@autochrome/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore, findWorkflow, saveWorkflow, workflowStore } from './store';

let data: Record<string, unknown>;

beforeEach(() => {
  data = {};
  vi.stubGlobal('browser', {
    storage: {
      local: {
        get: async (keys: string | string[]) =>
          Object.fromEntries([keys].flat().flatMap((k) => (k in data ? [[k, data[k]]] : []))),
        set: async (items: Record<string, unknown>) => void Object.assign(data, items),
        remove: async (keys: string | string[]) =>
          void [keys].flat().forEach((k) => delete data[k]),
      },
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

const workflow = (id: string, name: string): Workflow => ({
  id,
  name,
  variables: [],
  steps: [{ tool: 'go_back', input: {} }],
  createdFrom: 'recording',
  updatedAt: 1,
});

describe('createStore', () => {
  type Item = { id: string; value: number };
  const items = (limit?: number) =>
    createStore<Item, { id: string }>('item', ({ id }) => ({ id }), limit);

  it('saves, loads, lists the newest first and removes', async () => {
    const store = items();
    await store.save({ id: 'a', value: 1 });
    await store.save({ id: 'b', value: 2 });
    await store.save({ id: 'a', value: 3 });
    expect(await store.list()).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(await store.load('a')).toEqual({ id: 'a', value: 3 });
    await store.remove('a');
    expect(await store.list()).toEqual([{ id: 'b' }]);
    expect(await store.load('a')).toBeUndefined();
  });

  it('drops the oldest items beyond the cap, with their data', async () => {
    const store = items(3);
    for (const id of ['a', 'b', 'c', 'd', 'e']) await store.save({ id, value: 0 });
    expect((await store.list()).map((entry) => entry.id)).toEqual(['e', 'd', 'c']);
    expect(await store.load('a')).toBeUndefined();
    expect(await store.load('b')).toBeUndefined();
    expect(Object.keys(data).sort()).toEqual(['item:c', 'item:d', 'item:e', 'item:index']);
  });
});

describe('workflows', () => {
  it('summarize with the number of steps and stamp the save time', async () => {
    await saveWorkflow(workflow('w1', 'Sign in'));
    const [summary] = await workflowStore.list();
    expect(summary).toMatchObject({ id: 'w1', name: 'Sign in', steps: 1 });
    expect(summary!.updatedAt).toBeGreaterThan(1);
  });

  describe('findWorkflow', () => {
    beforeEach(async () => {
      await saveWorkflow(workflow('w1', 'Sign in'));
      await saveWorkflow(workflow('w2', 'Checkout'));
      await saveWorkflow(workflow('w3', 'checkout'));
    });

    it('finds by id', async () => {
      expect((await findWorkflow({ id: 'w1' })).name).toBe('Sign in');
    });

    it('finds by name, ignoring case and spaces at the ends', async () => {
      expect((await findWorkflow({ name: '  sign IN ' })).id).toBe('w1');
    });

    it('falls back to the name when the id is unknown', async () => {
      expect((await findWorkflow({ id: 'gone', name: 'Sign in' })).id).toBe('w1');
    });

    it('explains what went wrong', async () => {
      await expect(findWorkflow({ id: 'gone' })).rejects.toThrow('No workflow with id "gone"');
      await expect(findWorkflow({ name: 'Nope' })).rejects.toThrow('No workflow named "Nope"');
      await expect(findWorkflow({ name: 'Checkout' })).rejects.toThrow('use the id');
    });
  });
});
