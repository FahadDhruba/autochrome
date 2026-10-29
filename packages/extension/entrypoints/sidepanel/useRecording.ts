import { useEffect, useState } from 'react';
import {
  RECORDING_KEY,
  type RecordControl,
  type RecordControlResult,
  type RecordingState,
} from '@/src/workflows/recording';

/** The recording in progress, live; undefined when there is none. */
export function useRecording(): RecordingState | undefined {
  const [recording, setRecording] = useState<RecordingState>();

  useEffect(() => {
    const refresh = () =>
      void browser.storage.session
        .get(RECORDING_KEY)
        .then((stored) => setRecording(stored[RECORDING_KEY] as RecordingState | undefined));
    refresh();
    const listener = (changes: Record<string, unknown>, area: string) => {
      if (area === 'session' && RECORDING_KEY in changes) refresh();
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, []);

  return recording;
}

export async function controlRecording(
  action: RecordControl['action'],
): Promise<RecordControlResult> {
  const message: RecordControl = { type: 'autochrome:record', action };
  const result = (await browser.runtime.sendMessage(message)) as RecordControlResult | undefined;
  return result ?? { ok: false, error: 'The background worker did not answer.' };
}
