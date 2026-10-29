import { callPage } from '../content';
import { cdp, viewportSize } from '../debugger';
import { parseKeys } from '../keys';
import type { Point } from '../page/messages';
import { resolveTabId } from '../target';
import { text, type ToolHandlers } from './types';

const BUTTON_MASK = { left: 1, right: 2, middle: 4 } as const;

/** A ref wins over x/y; the click schema guarantees one of them. */
async function pointFor(
  tabId: number,
  input: { ref?: string; x?: number; y?: number },
): Promise<Point | undefined> {
  if (input.ref !== undefined) return callPage(tabId, 'locate', { ref: input.ref });
  if (input.x !== undefined && input.y !== undefined) return { x: input.x, y: input.y };
  return undefined;
}

export const inputHandlers: Pick<ToolHandlers, 'click' | 'type' | 'key' | 'scroll' | 'form_input'> =
  {
    async click(input) {
      const tabId = await resolveTabId(input.tabId);
      const { x, y } = (await pointFor(tabId, input))!;
      const { button, clickCount } = input;
      const mouse = { x, y, button, buttons: BUTTON_MASK[button], clickCount };

      await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', ...mouse });
      await cdp(tabId, 'Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        ...mouse,
        buttons: 0,
      });
      return text(`Clicked ${input.ref ?? 'point'} at (${x}, ${y}).`);
    },

    async type({ text: value, ref, tabId }) {
      const id = await resolveTabId(tabId);
      if (ref !== undefined) await callPage(id, 'locate', { ref, focus: true });
      await cdp(id, 'Input.insertText', { text: value });
      return text(`Typed ${value.length} character(s).`);
    },

    async key({ keys, tabId }) {
      const id = await resolveTabId(tabId);
      for (const event of parseKeys(keys)) await cdp(id, 'Input.dispatchKeyEvent', event);
      return text(`Pressed ${keys}.`);
    },

    async scroll(input) {
      const tabId = await resolveTabId(input.tabId);
      const { width, height } = await viewportSize(tabId);
      const { x, y } = (await pointFor(tabId, input)) ?? { x: width / 2, y: height / 2 };
      const sign = input.direction === 'up' || input.direction === 'left' ? -1 : 1;
      const vertical = input.direction === 'up' || input.direction === 'down';
      await cdp(tabId, 'Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x,
        y,
        deltaX: vertical ? 0 : sign * input.amount,
        deltaY: vertical ? sign * input.amount : 0,
      });
      return text(`Scrolled ${input.direction} ${input.amount}px.`);
    },

    async form_input({ ref, value, tabId }) {
      return text(await callPage(await resolveTabId(tabId), 'set_value', { ref, value }));
    },
  };
