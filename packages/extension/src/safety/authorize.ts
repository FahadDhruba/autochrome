import type { ToolCall } from '@autochrome/shared';
import { approvals as defaultApprovals, type ApprovalQueue } from './approvals';
import { checkPermission, type GateEnv } from './gate';
import { addSite } from './settings';
import { DENIED_TEXT, type ToolSource } from './types';

export type AuthorizeDeps = {
  env: GateEnv;
  approvals?: ApprovalQueue;
  addSite?: (site: string) => Promise<void>;
};

/**
 * Runs the permission gate and, when it needs the user, the approval prompt.
 * Returns why the call must not run, or undefined when it may.
 */
export async function authorize(
  call: ToolCall,
  source: ToolSource,
  signal: AbortSignal | undefined,
  deps: AuthorizeDeps,
): Promise<string | undefined> {
  const verdict = await checkPermission(call, source, deps.env);
  if (verdict.decision === 'allow') return undefined;
  if (verdict.decision === 'deny') return verdict.reason;

  const { request } = verdict;
  const choice = await (deps.approvals ?? defaultApprovals).request(request, signal);
  if (choice === 'deny') return DENIED_TEXT;
  // Risky actions are only ever allowed once, whatever the answer says.
  if (choice === 'site' && request.site && !request.risk) {
    await (deps.addSite ?? addSite)(request.site);
  }
  return undefined;
}
