import type { ToolCall, ToolName } from '@autochrome/shared';
import type { DescribeTarget, ElementDescription } from '../page/messages';
import { summarizeInput } from '../toolSummary';
import { checkUrl } from './origin';
import { assessRisk } from './risk';
import type { SafetyMode, SafetySettings } from './settings';
import type { ApprovalRequest, ToolSource } from './types';

/**
 * - free: never needs permission.
 * - read: reads a page.
 * - action: changes a page or the browser.
 * - always_ask: runs arbitrary code; asks in every mode, including auto.
 */
export type ToolGroup = 'free' | 'read' | 'action' | 'always_ask';

// Typed over every tool name, so a new tool cannot ship without being classified.
export const TOOL_GROUPS: Record<ToolName, ToolGroup> = {
  tabs_list: 'free',
  wait: 'free',
  read_page: 'read',
  find: 'read',
  get_text: 'read',
  screenshot: 'read',
  click: 'action',
  type: 'action',
  key: 'action',
  scroll: 'action',
  form_input: 'action',
  navigate: 'action',
  go_back: 'action',
  go_forward: 'action',
  tab_open: 'action',
  tab_switch: 'action',
  tab_close: 'action',
  workflows_list: 'free',
  workflow_run: 'action',
  console_logs: 'read',
  network_requests: 'read',
  network_response: 'read',
  js_eval: 'always_ask',
};

const ALWAYS_ASK_RISK: Partial<Record<ToolName, string>> = {
  js_eval: 'Runs JavaScript in the page',
};

export type TabInfo = { id: number; url: string; title: string; inAgentGroup: boolean };

/** What the gate needs from the browser. */
export type GateEnv = {
  loadSafety: () => Promise<SafetySettings>;
  /** The tab with this id, or the default target tab; throws when there is none. */
  tab: (tabId: number | undefined) => Promise<TabInfo>;
  describe: (tabId: number, target: DescribeTarget) => Promise<ElementDescription | undefined>;
};

export type Verdict =
  | { decision: 'allow' }
  | { decision: 'deny'; reason: string }
  | { decision: 'ask'; request: Omit<ApprovalRequest, 'id'> };

const ALLOW: Verdict = { decision: 'allow' };
const deny = (reason: string): Verdict => ({ decision: 'deny', reason });

export type Decision = { mode: SafetyMode; group: ToolGroup; siteAllowed: boolean; risky: boolean };

/** The permission table: whether an action runs straight away or needs the user's answer. */
export function decide({ mode, group, siteAllowed, risky }: Decision): 'allow' | 'ask' {
  if (group === 'always_ask') return 'ask';
  if (group === 'free' || mode === 'auto') return 'allow';
  if (risky) return 'ask';
  if (group === 'action' && mode === 'ask') return 'ask';
  return siteAllowed ? 'allow' : 'ask';
}

export type Input = {
  tabId?: number;
  url?: string;
  ref?: string;
  x?: number;
  y?: number;
  code?: string;
};

/** What the call acts on: the tab it targets, and the URL whose site gets checked. */
type Target = { tab?: TabInfo; url?: string };

async function tabOrUndefined(env: GateEnv, tabId?: number): Promise<TabInfo | undefined> {
  return env.tab(tabId).catch(() => undefined);
}

async function targetOf(call: ToolCall, input: Input, env: GateEnv): Promise<Target> {
  switch (call.name) {
    case 'navigate':
      // The destination is what is being visited; the current page may be anything.
      return { tab: await tabOrUndefined(env, input.tabId), url: input.url };
    case 'tab_open':
      // A blank tab involves no site.
      return { url: input.url };
    case 'workflow_run':
      // The run's own steps are gated one by one, each on its own tab and site.
      return {};
    case 'tab_close': {
      const tab = await env.tab(input.tabId);
      // Closing a tab the agent opened needs no site check.
      return tab.inAgentGroup ? { tab } : { tab, url: tab.url };
    }
    default: {
      const tab = await env.tab(input.tabId);
      return { tab, url: tab.url };
    }
  }
}

/** Which element the call acts on, as the content script's `describe` wants it. */
export function describeTargetOf(call: ToolCall, input: Input): DescribeTarget | undefined {
  switch (call.name) {
    case 'click':
      if (input.ref !== undefined) return { ref: input.ref };
      return input.x !== undefined && input.y !== undefined
        ? { point: { x: input.x, y: input.y } }
        : undefined;
    case 'form_input':
      return { ref: input.ref };
    case 'type':
      return input.ref === undefined ? {} : { ref: input.ref };
    case 'key':
      return {};
    default:
      return undefined;
  }
}

const elementLabel = (el: ElementDescription | undefined): string | undefined => {
  if (!el) return undefined;
  const kind = el.role || el.tag;
  return el.name ? `${kind} "${el.name}"` : kind;
};

/** Decides whether a tool call may run, needs the user's answer, or is refused. */
export async function checkPermission(
  call: ToolCall,
  source: ToolSource,
  env: GateEnv,
): Promise<Verdict> {
  const group = TOOL_GROUPS[call.name];
  // The debug page is the user's own click.
  if (source === 'debug' || group === 'free') return ALLOW;

  const input = (call.input ?? {}) as Input;
  const { mode, sites } = await env.loadSafety();

  let target: Target;
  try {
    target = await targetOf(call, input, env);
  } catch (error) {
    return deny(error instanceof Error ? error.message : String(error));
  }

  let site: string | undefined;
  if (target.url !== undefined) {
    const checked = checkUrl(target.url);
    if ('reason' in checked) return deny(checked.reason);
    site = checked.site;
  }
  if (mode === 'auto' && group !== 'always_ask') return ALLOW;

  const describeTarget = describeTargetOf(call, input);
  let element: ElementDescription | undefined;
  let uninspectable = false;
  if (describeTarget && target.tab) {
    try {
      element = await env.describe(target.tab.id, describeTarget);
    } catch (error) {
      // Fail closed: an element we cannot inspect might be a "Place order" button. A stale ref is
      // the exception, since the tool itself then fails without acting.
      uninspectable = !(error instanceof Error && error.message.startsWith('Unknown ref'));
    }
  }
  const risk =
    group === 'always_ask'
      ? ALWAYS_ASK_RISK[call.name]
      : group !== 'action'
        ? undefined
        : uninspectable
          ? 'Could not inspect the element this acts on'
          : assessRisk(call, element);

  const decision = decide({
    mode,
    group,
    siteAllowed: site === undefined || sites.includes(site),
    risky: risk !== undefined,
  });
  if (decision === 'allow') return ALLOW;

  return {
    decision: 'ask',
    request: {
      source,
      tool: call.name,
      summary: summarizeInput(call.input),
      target: elementLabel(element),
      site,
      risk,
      detail: call.name === 'js_eval' ? input.code : undefined,
      tabTitle: target.tab?.title ?? '',
    },
  };
}
