import { cdp, nextEvent, viewportSize } from '../debugger';
import { openDialog } from '../dialogs';
import { callPage } from '../content';
import { callRef, locateRef, splitRef } from '../frames';
import { parseKeys } from '../keys';
import type { Point } from '../page/messages';
import { resolveTabId } from '../target';
import { text, type ToolHandlers } from './types';

const BUTTON_MASK = { left: 1, right: 2, middle: 4 } as const;
const STEPS = 8;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A ref wins over x/y; the click schema guarantees one of them. */
async function pointFor(
  tabId: number,
  input: { ref?: string; x?: number; y?: number },
): Promise<Point | undefined> {
  if (input.ref !== undefined) return locateRef(tabId, input.ref);
  if (input.x !== undefined && input.y !== undefined) return { x: input.x, y: input.y };
  return undefined;
}

export const inputHandlers: Pick<
  ToolHandlers,
  'click' | 'type' | 'key' | 'scroll' | 'form_input' | 'hover' | 'drag' | 'dialog'
> = {
  async click(input) {
    const tabId = await resolveTabId(input.tabId);
    const frame = input.ref === undefined ? 0 : splitRef(input.ref).frameId;
    const { x, y } = (await pointFor(tabId, input))!;
    if (frame !== 0) await callRef(tabId, 'watch_click', { ref: input.ref! });
    const { button, clickCount } = input;
    const mouse = { x, y, button, buttons: BUTTON_MASK[button], clickCount };

    await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', ...mouse });
    await cdp(tabId, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      ...mouse,
      buttons: 0,
    });
    if (frame !== 0) {
      const { reached } = await callPage(tabId, 'confirm_click', {}, frame);
      if (!reached) return text(`Clicked ${input.ref} from inside its frame.`);
    }
    return text(`Clicked ${input.ref ?? 'point'} at (${x}, ${y}).`);
  },

  async type({ text: value, ref, tabId }) {
    const id = await resolveTabId(tabId);
    if (ref !== undefined) await locateRef(id, ref, true);
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
    return text(await callRef(await resolveTabId(tabId), 'set_value', { ref, value }));
  },

  async hover(input) {
    const tabId = await resolveTabId(input.tabId);
    const { x, y } = (await pointFor(tabId, input))!;
    await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    return text(`Moved the mouse over ${input.ref ?? 'point'} at (${x}, ${y}).`);
  },

  async drag(input) {
    const tabId = await resolveTabId(input.tabId);
    const from = (await pointFor(tabId, { ref: input.fromRef, x: input.fromX, y: input.fromY }))!;
    const mouse = (type: string, at: Point, buttons: number) =>
      cdp(tabId, 'Input.dispatchMouseEvent', {
        type,
        ...at,
        button: 'left',
        buttons,
        clickCount: 1,
      });

    // Native HTML drag and drop does not follow synthetic mouse moves; with interception on,
    // Chrome hands over the drag data and the drop is dispatched as drag events below.
    await cdp(tabId, 'Input.setInterceptDrags', { enabled: true });
    let dragData: object | undefined;
    void nextEvent<{ data: object }>(tabId, 'Input.dragIntercepted', 3000).then((e) => {
      dragData = e?.data;
    });
    try {
      await mouse('mouseMoved', from, 0);
      await mouse('mousePressed', from, 1);
      const to = (await pointFor(tabId, { ref: input.toRef, x: input.toX, y: input.toY }))!;
      // Several small moves, so libraries that wait for a drag threshold notice the drag.
      for (let step = 1; step <= STEPS; step++) {
        const at = {
          x: Math.round(from.x + ((to.x - from.x) * step) / STEPS),
          y: Math.round(from.y + ((to.y - from.y) * step) / STEPS),
        };
        await mouse('mouseMoved', at, 1);
        await sleep(16);
      }
      await sleep(100);
      if (dragData) {
        for (const type of ['dragEnter', 'dragOver', 'drop']) {
          await cdp(tabId, 'Input.dispatchDragEvent', { type, ...to, data: dragData });
        }
      }
      await mouse('mouseReleased', to, 0);
      return text(`Dragged from (${from.x}, ${from.y}) to (${to.x}, ${to.y}).`);
    } finally {
      await cdp(tabId, 'Input.setInterceptDrags', { enabled: false }).catch(() => undefined);
    }
  },

  async dialog({ accept, promptText, tabId }) {
    const id = await resolveTabId(tabId);
    const open = openDialog(id);
    if (!open) throw new Error('No dialog is open on this tab.');
    await cdp(id, 'Page.handleJavaScriptDialog', {
      accept,
      ...(promptText !== undefined && { promptText }),
    });
    return text(`${accept ? 'Accepted' : 'Dismissed'} the ${open.type} dialog “${open.message}”.`);
  },
};
