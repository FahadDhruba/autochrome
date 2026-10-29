# v2 — Workflows and schedules

Status: **Planned, awaiting approval.** Two milestones, one PR each, same loop as v1 (Opus plans →
`executor` builds → `reviewer` checks → PR).

## Decisions

| Topic           | Decision                                                                                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recording       | Both: record your own browser actions, and save a finished AI chat task as a workflow                                                                                            |
| Replay          | Fast replay of recorded steps (no AI); when a step fails, the AI repairs that step, then replay continues                                                                        |
| Inputs          | Variables (`{{name}}`) filled at run time — by you, a schedule, or a bridge/MCP caller                                                                                           |
| Schedules       | Run via `chrome.alarms` while Chrome is open; missed runs catch up once on next start                                                                                            |
| Schedule safety | **Full auto**: scheduled runs act like Auto mode, including risky actions (your choice). `js_eval` still always asks, so a scheduled run that needs it stops and reports instead |
| What runs       | A saved workflow or a plain AI prompt                                                                                                                                            |
| Results         | Runs log in the side panel + a Chrome notification per run                                                                                                                       |
| Bridge/MCP      | Workflows are exposed as tools (`workflows_list`, `workflow_run`), so Claude Code can run them                                                                                   |

## M8 — Workflows (record, save, replay)

### Workflow format (`packages/shared/src/workflow.ts`, zod)

```ts
type Workflow = {
  id: string;
  name: string;
  description?: string;
  variables: { name: string; label: string; default?: string }[];
  steps: Step[];
  createdFrom: 'recording' | 'chat';
  updatedAt: number;
};
type Step = {
  tool: ToolName; // the same tools the agent uses
  input: object; // may contain {{variable}} in string fields
  target?: TargetHint; // how to find the element again (see below)
  note?: string; // human-readable: 'Click "Sign in"'
};
type TargetHint = {
  role: string;
  name: string; // accessibility role + name (primary match)
  text?: string;
  selector?: string; // fallbacks
  url?: string; // page the step happened on
};
```

Steps reuse the existing tools, so replay goes through `executeTool` and the M5 safety gate like
everything else.

### Recording your own actions

- Side panel **Record** button → content script listens on the recorded tab(s) for clicks, input
  changes (debounced into one `type`/`form_input` step per field), Enter/submit, select changes and
  navigations (via `tabs.onUpdated`). Each event becomes a `Step` with a `TargetHint` built from the
  element's role/name (same code as `read_page`), visible text and a stable CSS selector.
- Password fields are recorded as a variable placeholder (`{{password}}`), never the typed value.
- A recording bar in the panel shows steps live; **Stop** opens the editor.

### Saving an AI task

- Each finished chat gets **Save as workflow**: its successful action tool calls (reads like
  `read_page`/`find`/`screenshot` dropped) become steps. Refs from the chat (`e12`) are turned into
  `TargetHint`s using the element description captured when the call ran (add that capture to the
  executor result metadata, not to what the model sees).

### Editor (side panel)

- List of workflows; open one to see steps as readable notes, reorder/delete steps, edit inputs,
  rename, and turn a typed value into a variable (select text → "Make variable").
- Export/import as JSON (share workflows).

### Replay

- Run from the panel (asks for variables), from a schedule (M9), or from the bridge.
- Each step: resolve the target by `TargetHint` (role+name via the snapshot code, then text, then
  selector), get a fresh ref, run the tool. Wait for navigation/load between steps like the tools
  already do.
- **AI fallback**: if a target can't be found or the step fails, hand the AI the workflow name, the
  failed step's note and input, the current page (`read_page`), and ask it to complete just that
  step with the normal tools (max 8 tool calls). If it succeeds, replay continues and the run log
  offers "Update the workflow with the repaired step". Uses the chat's default provider/model;
  no provider configured → the run fails at that step with a clear message.
- Run log per run: each step's status (ok / repaired by AI / failed), duration, screenshot on
  failure.

### Bridge/MCP

- New tools `workflows_list` and `workflow_run { id | name, variables }` in the shared tool
  definitions (`free` and `action` safety groups respectively); results include the run log summary.

### Tests

- Unit: target resolution scoring, variable substitution, chat → workflow conversion, recorder
  event → step mapping, password never stored.
- e2e: record a fixture form fill by hand → replay on a fresh tab fills it; replay after the
  fixture's button is renamed/moved triggers AI fallback (mock provider) and continues; variables
  prompt and substitution; save a chat as a workflow and replay it; bridge `workflow_run`.

## M9 — Schedules

### Model

```ts
type Schedule = {
  id: string;
  name: string;
  enabled: boolean;
  run:
    | { kind: 'workflow'; workflowId: string; variables: Record<string, string> }
    | { kind: 'prompt'; prompt: string; providerId: ProviderId; model: string };
  when:
    | { every: 'minutes'; minutes: number } // ≥ 15
    | { every: 'day'; time: 'HH:MM'; weekdays?: number[] }
    | { every: 'week'; day: number; time: 'HH:MM' };
  sites: string[]; // shown for reference; full auto ignores the allow list
  nextRunAt: number;
  lastRun?: RunSummary;
};
```

### Running

- One `chrome.alarms` alarm per schedule at `nextRunAt` (local time, DST-safe by recomputing after
  each run). On browser start, any schedule whose `nextRunAt` passed runs **once** (no pile-up),
  then reschedules.
- A run opens its own background tab group ("autochrome · <schedule name>"), runs the workflow or
  the prompt (agent loop with the chosen provider/model, no side panel needed), then closes its
  tabs unless the run failed (left open for inspection).
- Safety: runs use a `scheduled` source treated as Auto mode, including risky actions, as decided.
  `js_eval` keeps its always-ask rule, so a run that hits it stops and reports. `chrome://` and
  extension pages stay refused.
- One run at a time; overlapping triggers queue. A run has a 10-minute limit.

### UI

- Side panel **Schedules** view: list with next run, last result, enable toggle, "Run now", edit.
- Editor: pick workflow (+ variables) or write a prompt (+ provider/model), choose when.
- **Runs** view: history of all scheduled and manual workflow runs (last 200), each with its log;
  prompt runs link to the saved chat.
- Chrome notification at the end of each run: "✓ <name> finished" or "✗ <name> failed at step 3";
  clicking it opens the run. Needs the `notifications` permission.
- Settings → Safety shows a warning line while any schedule is enabled ("Scheduled runs act in
  Auto mode").

### Tests

- Unit: next-run calculation (minutes, daily with weekdays, weekly, DST boundaries, missed runs →
  one catch-up), queueing, time limit.
- e2e (with fake clock / alarm trigger exposed for tests): a workflow schedule runs and logs; a
  prompt schedule runs the mock provider; a notification is created; a failure leaves the tab open
  and logs the failed step; disabled schedules don't run.

## Out of scope for v2

Running when Chrome is closed, cloud sync of workflows, sharing workflows publicly, conditional
logic or loops inside workflows.
