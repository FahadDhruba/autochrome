import type { Workflow } from '@autochrome/shared';
import type { RunResult, RunSummary } from './types';

export const MAX_STORED_RUNS = 200;

/** Items under `<name>:<id>` plus an index of summaries, newest first, optionally capped. */
export function createStore<T extends { id: string }, S extends { id: string }>(
  name: string,
  summarize: (item: T) => S,
  limit = Infinity,
) {
  const indexKey = `${name}:index`;
  const key = (id: string) => `${name}:${id}`;

  const list = async (): Promise<S[]> => {
    const stored = await browser.storage.local.get(indexKey);
    return (stored[indexKey] as S[] | undefined) ?? [];
  };

  return {
    list,

    async load(id: string): Promise<T | undefined> {
      const stored = await browser.storage.local.get(key(id));
      return stored[key(id)] as T | undefined;
    },

    /** Saves the item and moves it to the front of the index; the oldest beyond the cap go. */
    async save(item: T): Promise<void> {
      const rest = (await list()).filter((entry) => entry.id !== item.id);
      const index = [summarize(item), ...rest];
      const dropped = index.slice(limit);
      await browser.storage.local.set({ [key(item.id)]: item, [indexKey]: index.slice(0, limit) });
      if (dropped.length > 0) await browser.storage.local.remove(dropped.map((e) => key(e.id)));
    },

    async remove(id: string): Promise<void> {
      const index = (await list()).filter((entry) => entry.id !== id);
      await browser.storage.local.set({ [indexKey]: index });
      await browser.storage.local.remove(key(id));
    },
  };
}

export type WorkflowSummary = Pick<Workflow, 'id' | 'name' | 'updatedAt'> & { steps: number };

export const workflowStore = createStore<Workflow, WorkflowSummary>(
  'workflow',
  ({ id, name, updatedAt, steps }) => ({ id, name, updatedAt, steps: steps.length }),
);

export const runStore = createStore<RunResult, RunSummary>(
  'run',
  ({ id, workflowId, workflowName, source, startedAt, finishedAt, status, error }) => ({
    id,
    workflowId,
    workflowName,
    source,
    startedAt,
    finishedAt,
    status,
    error,
  }),
  MAX_STORED_RUNS,
);

export const saveWorkflow = (workflow: Workflow): Promise<void> =>
  workflowStore.save({ ...workflow, updatedAt: Date.now() });

/** The workflow with this id, else the one with this name (case-insensitive); throws if unclear. */
export async function findWorkflow(query: { id?: string; name?: string }): Promise<Workflow> {
  if (query.id !== undefined) {
    const found = await workflowStore.load(query.id);
    if (found) return found;
    if (query.name === undefined) throw new Error(`No workflow with id "${query.id}".`);
  }
  const wanted = (query.name ?? '').trim().toLowerCase();
  const matches = (await workflowStore.list()).filter(
    (entry) => entry.name.trim().toLowerCase() === wanted,
  );
  if (matches.length === 0) throw new Error(`No workflow named "${query.name}".`);
  if (matches.length > 1) {
    throw new Error(`${matches.length} workflows are named "${query.name}"; use the id.`);
  }
  return (await workflowStore.load(matches[0]!.id))!;
}
