import { describe } from './describe';
import { hasText, locate, setValue } from './interact';
import type { PageMessage, PageOp, PageRequests, PageResponse, PageResults } from './messages';
import { findElements, pageText, readPage } from './snapshot';

const operations: { [Op in PageOp]: (args: PageRequests[Op]) => PageResults[Op] } = {
  read: ({ filter }) => readPage(filter),
  find: ({ query }) => findElements(query),
  text: () => pageText(),
  locate: ({ ref, focus }) => locate(ref, focus),
  set_value: ({ ref, value }) => setValue(ref, value),
  has_text: ({ text }) => hasText(text),
  describe: (target) => describe(target),
};

export function handlePageMessage(message: PageMessage): PageResponse<unknown> {
  try {
    const operation = operations[message.op] as (args: unknown) => unknown;
    return { ok: true, value: operation(message.args) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
