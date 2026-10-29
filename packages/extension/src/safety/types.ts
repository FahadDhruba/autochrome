import type { ToolName } from '@autochrome/shared';

/**
 * Who asked for a tool call. `debug` is the user's own click on the tool debugger page; `workflow`
 * is a replay started from the side panel and is gated like the agent.
 */
export type ToolSource = 'agent' | 'workflow' | 'bridge' | 'debug';

export type ApprovalChoice = 'once' | 'site' | 'deny';

export type ApprovalRequest = {
  id: string;
  source: Exclude<ToolSource, 'debug'>;
  tool: ToolName;
  /** Short preview of the tool input. */
  summary: string;
  /** The element the action targets, e.g. `button "Place order"`. */
  target?: string;
  /** Origin of the page the action is for; missing when no site is involved. */
  site?: string;
  /** Why the action is risky. Risky actions can only be allowed once. */
  risk?: string;
  /** The full text being approved, such as the code `js_eval` will run. */
  detail?: string;
  tabTitle: string;
};

export const canAllowSite = (request: ApprovalRequest): boolean =>
  request.site !== undefined && request.risk === undefined;

/** Shown to the AI when an action is refused or not answered. */
export const DENIED_TEXT = 'The user denied this action.';
