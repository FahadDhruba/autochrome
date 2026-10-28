import type { ApprovalChoice, ApprovalRequest } from './types';

export const APPROVAL_TIMEOUT_MS = 2 * 60_000;

/** Shows and withdraws prompts. `present` is called for one request at a time. */
export type Presenter = {
  present: (request: ApprovalRequest) => void;
  dismiss: (request: ApprovalRequest) => void;
};

type Entry = {
  request: ApprovalRequest;
  settle: (choice: ApprovalChoice) => void;
  timer?: ReturnType<typeof setTimeout>;
};

/** Pending approval requests. Only the first is shown; it is denied after the timeout. */
export class ApprovalQueue {
  private entries: Entry[] = [];
  private presenter: Presenter | undefined;

  constructor(private readonly timeoutMs = APPROVAL_TIMEOUT_MS) {}

  setPresenter(presenter: Presenter | undefined): void {
    this.presenter = presenter;
  }

  /** The request being shown. */
  current(): ApprovalRequest | undefined {
    return this.entries[0]?.request;
  }

  get(id: string): ApprovalRequest | undefined {
    return this.entries.find((entry) => entry.request.id === id)?.request;
  }

  /** Resolves with the user's choice; a timeout or an aborted signal counts as a deny. */
  request(request: Omit<ApprovalRequest, 'id'>, signal?: AbortSignal): Promise<ApprovalChoice> {
    if (signal?.aborted) return Promise.resolve('deny');
    return new Promise((resolve) => {
      const entry: Entry = {
        request: { ...request, id: crypto.randomUUID() },
        settle: (choice) => {
          clearTimeout(entry.timer);
          signal?.removeEventListener('abort', onAbort);
          const wasCurrent = this.entries[0] === entry;
          this.entries = this.entries.filter((e) => e !== entry);
          this.presenter?.dismiss(entry.request);
          resolve(choice);
          if (wasCurrent) this.presentNext();
        },
      };
      const onAbort = () => entry.settle('deny');
      signal?.addEventListener('abort', onAbort);
      this.entries.push(entry);
      if (this.entries.length === 1) this.presentNext();
    });
  }

  /** The user's answer. False when the request is not pending (answered, expired or stopped). */
  answer(id: string, choice: ApprovalChoice): boolean {
    const entry = this.entries.find((e) => e.request.id === id);
    entry?.settle(choice);
    return entry !== undefined;
  }

  private presentNext(): void {
    const entry = this.entries[0];
    if (!entry) return;
    // The clock starts when the user can see the prompt, not while it waits in line.
    entry.timer = setTimeout(() => entry.settle('deny'), this.timeoutMs);
    this.presenter?.present(entry.request);
  }
}

export const approvals = new ApprovalQueue();
