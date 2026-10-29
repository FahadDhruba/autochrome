import { z } from 'zod';
import { isToolName } from './bridge';
import type { ToolName } from './tools';

/** The tools that start workflows; a step may not call them, so workflows cannot nest. */
export const WORKFLOW_TOOLS: readonly ToolName[] = ['workflows_list', 'workflow_run'];

/** How to find an element again on a later visit to the page. */
export const targetHint = z.object({
  /** Accessibility role; empty when the element has none. */
  role: z.string(),
  name: z.string(),
  /** Visible text, matched when the role and name no longer fit. */
  text: z.string().optional(),
  selector: z.string().optional(),
  /** The page the step happened on. */
  url: z.string().optional(),
});

export const workflowVariable = z.object({
  name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Use letters, digits and underscores.'),
  label: z.string(),
  default: z.string().optional(),
});

export const workflowStep = z.object({
  tool: z.custom<ToolName>(
    (value) => typeof value === 'string' && isToolName(value) && !WORKFLOW_TOOLS.includes(value),
    'Unknown tool.',
  ),
  /** The tool input; string fields may contain `{{variable}}`. A ref is added at replay time. */
  input: z.record(z.string(), z.unknown()),
  target: targetHint.optional(),
  /** Human-readable, e.g. `Click "Sign in"`. */
  note: z.string().optional(),
});

export const workflow = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  description: z.string().optional(),
  variables: z.array(workflowVariable),
  steps: z.array(workflowStep),
  createdFrom: z.enum(['recording', 'chat']),
  updatedAt: z.number(),
});

export type TargetHint = z.infer<typeof targetHint>;
export type WorkflowVariable = z.infer<typeof workflowVariable>;
export type Step = z.infer<typeof workflowStep>;
export type Workflow = z.infer<typeof workflow>;

const VARIABLE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

/** Names of the `{{variables}}` used in any string inside the value, in order of first use. */
export function variableNames(value: unknown): string[] {
  const names = new Set<string>();
  const walk = (item: unknown): void => {
    if (typeof item === 'string') {
      for (const match of item.matchAll(VARIABLE)) names.add(match[1]!);
    } else if (Array.isArray(item)) {
      item.forEach(walk);
    } else if (typeof item === 'object' && item !== null) {
      Object.values(item).forEach(walk);
    }
  };
  walk(value);
  return [...names];
}

/** Copies the value with every `{{name}}` in its strings replaced; unknown names stay as they are. */
export function substituteVariables<T>(value: T, values: Record<string, string>): T {
  const replace = (item: unknown): unknown => {
    if (typeof item === 'string') {
      return item.replace(VARIABLE, (whole, name: string) =>
        Object.hasOwn(values, name) ? values[name]! : whole,
      );
    }
    if (Array.isArray(item)) return item.map(replace);
    if (typeof item === 'object' && item !== null) {
      return Object.fromEntries(Object.entries(item).map(([key, v]) => [key, replace(v)]));
    }
    return item;
  };
  return replace(value) as T;
}

export type ParsedWorkflow = { ok: true; workflow: Workflow } | { ok: false; error: string };

/** Validates exported workflow JSON (a file the user picked), with a readable error. */
export function parseWorkflowJson(text: string): ParsedWorkflow {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' };
  }
  const parsed = workflow.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: `Not a workflow: ${z.prettifyError(parsed.error)}` };
  }
  return { ok: true, workflow: parsed.data };
}
