import type { ApprovalChoice, ApprovalRequest } from './types';

/** Extension page to background: the pending request with this id (the approve popup). */
export type ApprovalGet = { type: 'autochrome:approval-get'; id: string };
/** Extension page to background: the user's answer. */
export type ApprovalAnswer = {
  type: 'autochrome:approval-answer';
  id: string;
  choice: ApprovalChoice;
};

/** Background to side panel, over the chat port. */
export type ApprovalEvent =
  { type: 'approval_request'; request: ApprovalRequest } | { type: 'approval_done'; id: string };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const isApprovalGet = (message: unknown): message is ApprovalGet =>
  isObject(message) && message.type === 'autochrome:approval-get' && typeof message.id === 'string';

export const isApprovalAnswer = (message: unknown): message is ApprovalAnswer =>
  isObject(message) &&
  message.type === 'autochrome:approval-answer' &&
  typeof message.id === 'string' &&
  (message.choice === 'once' || message.choice === 'site' || message.choice === 'deny');

export const isApprovalEvent = (event: unknown): event is ApprovalEvent =>
  isObject(event) && (event.type === 'approval_request' || event.type === 'approval_done');
