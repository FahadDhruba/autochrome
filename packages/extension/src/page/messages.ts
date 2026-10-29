export type Point = { x: number; y: number };

/** What the safety checks need to know about an element; see `describe`. */
export type ElementDescription = {
  tag: string;
  /** Empty when the element has no role. */
  role: string;
  name: string;
  ariaLabel: string;
  inputType: string;
  autocomplete: string;
  /** The element's `id` and `name` attributes. */
  fieldId: string;
  inForm: boolean;
  formHasPassword: boolean;
  formHasPayment: boolean;
};

/** A ref, a viewport point, or neither (the focused element). */
export type DescribeTarget = { ref?: string; point?: Point };

export type PageRequests = {
  read: { filter: 'all' | 'interactive' };
  find: { query: string };
  text: Record<string, never>;
  locate: { ref: string; focus?: boolean };
  set_value: { ref: string; value: string | boolean };
  has_text: { text: string };
  describe: DescribeTarget;
};

export type PageResults = {
  read: string;
  find: string;
  text: { title: string; url: string; text: string };
  locate: Point;
  set_value: string;
  has_text: boolean;
  describe: ElementDescription | undefined;
};

export type PageOp = keyof PageRequests;

/** Sent from the background worker to the content script of a tab. */
export type PageMessage<Op extends PageOp = PageOp> = {
  type: 'autochrome:page';
  op: Op;
  args: PageRequests[Op];
};

export type PageResponse<T> = { ok: true; value: T } | { ok: false; error: string };
