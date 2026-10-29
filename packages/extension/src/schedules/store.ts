import { createStore } from '../workflows/store';
import type { Schedule } from './types';

/** Schedules are small, so the index holds them whole and the list needs no extra reads. */
export const scheduleStore = createStore<Schedule, Schedule>('schedule', (schedule) => schedule);

/** Changes the saved schedule in place (a run finished, the alarm fired); undefined if it is gone. */
export async function patchSchedule(
  id: string,
  patch: Partial<Omit<Schedule, 'id'>>,
): Promise<Schedule | undefined> {
  const current = await scheduleStore.load(id);
  if (!current) return undefined;
  const next = { ...current, ...patch };
  await scheduleStore.save(next);
  return next;
}
