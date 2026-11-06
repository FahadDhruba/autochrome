/**
 * JavaScript dialogs (alert, confirm, prompt, "leave this page?") per tab, from the debugger's
 * Page events. While one is open the page is frozen: content scripts and most commands hang.
 */
export type OpenDialog = {
  type: 'alert' | 'confirm' | 'prompt' | 'beforeunload';
  message: string;
  defaultPrompt?: string;
};

const open = new Map<number, OpenDialog>();
const waiters = new Map<number, Set<(dialog: OpenDialog) => void>>();

export function handleDialogEvent(tabId: number, method: string, params: unknown): void {
  if (method === 'Page.javascriptDialogOpening') {
    const { type, message, defaultPrompt } = params as OpenDialog;
    const dialog: OpenDialog = { type, message, ...(defaultPrompt && { defaultPrompt }) };
    open.set(tabId, dialog);
    for (const notify of waiters.get(tabId) ?? []) notify(dialog);
  } else if (method === 'Page.javascriptDialogClosed') {
    open.delete(tabId);
  }
}

export const openDialog = (tabId: number): OpenDialog | undefined => open.get(tabId);

export function forgetDialog(tabId: number): void {
  open.delete(tabId);
}

/** Resolves when a dialog opens on the tab; call `cancel` once it no longer matters. */
export function whenDialogOpens(tabId: number): {
  opened: Promise<OpenDialog>;
  cancel: () => void;
} {
  let notify!: (dialog: OpenDialog) => void;
  const opened = new Promise<OpenDialog>((resolve) => (notify = resolve));
  const set = waiters.get(tabId) ?? new Set();
  set.add(notify);
  waiters.set(tabId, set);
  return { opened, cancel: () => set.delete(notify) };
}

const KIND: Record<OpenDialog['type'], string> = {
  alert: 'An alert',
  confirm: 'A confirm dialog',
  prompt: 'A prompt dialog',
  beforeunload: 'A "leave this page?" dialog',
};

/** What the model is told about an open dialog. */
export function describeDialog(dialog: OpenDialog): string {
  const text = dialog.message ? `: “${dialog.message}”` : '';
  return `${KIND[dialog.type]} is open on this tab${text}. Answer it with the dialog tool (accept true for OK, false for Cancel) before doing anything else on this tab.`;
}
