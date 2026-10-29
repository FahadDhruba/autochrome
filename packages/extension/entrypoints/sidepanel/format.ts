import type { RunTrigger } from '@/src/workflows/types';

export const formatTime = (time: number): string =>
  new Date(time).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });

export const TRIGGER_LABEL: Record<RunTrigger, string> = {
  manual: 'Manual',
  schedule: 'Schedule',
  bridge: 'Bridge',
};
