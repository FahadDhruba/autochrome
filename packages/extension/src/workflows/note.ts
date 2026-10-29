import type { TargetHint, ToolName } from '@autochrome/shared';

const MAX_VALUE_CHARS = 40;

const quote = (text: string): string => JSON.stringify(text);

function shorten(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > MAX_VALUE_CHARS ? `${flat.slice(0, MAX_VALUE_CHARS - 1)}…` : flat;
}

/** What the step acts on, e.g. `button "Sign in"`; falls back to the visible text. */
function describeTarget(target: TargetHint | undefined): string {
  if (!target) return 'the page';
  const label = target.name || target.text;
  return label ? quote(shorten(label)) : target.role || 'element';
}

const stringOf = (value: unknown): string => (typeof value === 'string' ? value : '');

/** A readable name for a step, such as `Click "Sign in"` or `Go to https://example.com`. */
export function noteFor(
  tool: ToolName,
  input: Record<string, unknown>,
  target?: TargetHint,
): string {
  switch (tool) {
    case 'navigate':
    case 'tab_open':
      return `Go to ${stringOf(input.url) || 'a blank tab'}`;
    case 'go_back':
      return 'Go back';
    case 'go_forward':
      return 'Go forward';
    case 'click':
      return `Click ${describeTarget(target)}`;
    case 'type':
      return `Type ${quote(shorten(stringOf(input.text)))} into ${describeTarget(target)}`;
    case 'form_input': {
      const { value } = input;
      if (typeof value === 'boolean') {
        return `${value ? 'Check' : 'Uncheck'} ${describeTarget(target)}`;
      }
      return `Set ${describeTarget(target)} to ${quote(shorten(stringOf(value)))}`;
    }
    case 'key':
      return `Press ${stringOf(input.keys)}${target ? ` in ${describeTarget(target)}` : ''}`;
    case 'scroll':
      return `Scroll ${stringOf(input.direction)}`;
    case 'wait':
      return input.text === undefined
        ? `Wait ${String(input.ms)} ms`
        : `Wait for ${quote(shorten(stringOf(input.text)))}`;
    default:
      return tool;
  }
}
