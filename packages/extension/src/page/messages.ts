export type Point = { x: number; y: number };

export type PageRequests = {
  read: { filter: 'all' | 'interactive' };
  find: { query: string };
  text: Record<string, never>;
  locate: { ref: string; focus?: boolean };
  set_value: { ref: string; value: string | boolean };
  has_text: { text: string };
};

export type PageResults = {
  read: string;
  find: string;
  text: { title: string; url: string; text: string };
  locate: Point;
  set_value: string;
  has_text: boolean;
};

export type PageOp = keyof PageRequests;

/** Sent from the background worker to the content script of a tab. */
export type PageMessage<Op extends PageOp = PageOp> = {
  type: 'autochrome:page';
  op: Op;
  args: PageRequests[Op];
};

export type PageResponse<T> = { ok: true; value: T } | { ok: false; error: string };
