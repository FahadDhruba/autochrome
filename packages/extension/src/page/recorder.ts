import { browser } from 'wxt/browser';
import type { RecordEvent, RecordMessage } from '../workflows/recording';
import { CLICKABLE } from './describe';
import { hintFor } from './hint';

/** A pause this long in typing ends the field's step. */
const TYPING_PAUSE_MS = 600;

const NOT_TEXT_INPUTS = new Set([
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'image',
  'file',
  'hidden',
  'range',
  'color',
]);

type Field = HTMLInputElement | HTMLTextAreaElement;

const isTextField = (el: Element): el is Field =>
  el instanceof HTMLTextAreaElement ||
  (el instanceof HTMLInputElement && !NOT_TEXT_INPUTS.has(el.type));

const isToggle = (el: Element): el is HTMLInputElement =>
  el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio');

const isEditable = (el: Element): el is HTMLElement =>
  el instanceof HTMLElement && el.isContentEditable && !isTextField(el);

const isSecret = (el: Field): boolean =>
  el instanceof HTMLInputElement && (el.type === 'password' || /password/.test(el.autocomplete));

function send(event: RecordEvent): void {
  const message: RecordMessage = { type: 'autochrome:record-event', event };
  // The worker may be waking up; a lost event is better than an error in the page.
  browser.runtime.sendMessage(message).catch(() => {});
}

/** The element an event was aimed at, looking inside open shadow roots. */
const sourceOf = (event: Event): Element | undefined => {
  const first = event.composedPath()[0];
  return first instanceof Element ? first : undefined;
};

let stop: (() => void) | undefined;

/** Starts reporting the user's clicks, field changes and Enter presses. A second call is a no-op. */
export function startRecording(): true {
  if (stop) return true;
  const controller = new AbortController();
  const timers = new Map<Element, ReturnType<typeof setTimeout>>();

  const flush = (el: Element) => {
    clearTimeout(timers.get(el));
    timers.delete(el);
    if (isTextField(el)) {
      const secret = isSecret(el);
      // A password is replaced by a variable; its value stays in the page.
      send({ kind: 'fill', target: hintFor(el), value: secret ? '' : el.value, secret });
    } else if (isEditable(el)) {
      send({ kind: 'type', target: hintFor(el), text: el.innerText });
    }
  };
  const flushAll = () => [...timers.keys()].forEach(flush);

  const options = { capture: true, signal: controller.signal };
  const trusted = (event: Event) => event.isTrusted;

  document.addEventListener(
    'input',
    (event) => {
      const el = sourceOf(event);
      if (!el || !trusted(event)) return;
      const field = isTextField(el) ? el : isEditable(el) ? el : undefined;
      if (!field) return;
      clearTimeout(timers.get(field));
      timers.set(
        field,
        setTimeout(() => flush(field), TYPING_PAUSE_MS),
      );
    },
    options,
  );

  document.addEventListener(
    'change',
    (event) => {
      const el = sourceOf(event);
      if (!el || !trusted(event)) return;
      if (isTextField(el)) return flush(el);
      flushAll();
      if (isToggle(el)) {
        send({ kind: 'fill', target: hintFor(el), value: el.checked, secret: false });
      } else if (el instanceof HTMLSelectElement) {
        const label = el.selectedOptions[0]?.text.trim() ?? el.value;
        send({ kind: 'fill', target: hintFor(el), value: label, secret: false });
      }
    },
    options,
  );

  document.addEventListener(
    'click',
    (event) => {
      const source = sourceOf(event);
      if (!source || !trusted(event)) return;
      flushAll();
      // Fields report their own changes; a label only forwards the click to its field.
      if (source.closest('label, select, textarea') || isTextField(source) || isToggle(source)) {
        return;
      }
      send({ kind: 'click', target: hintFor(source.closest(CLICKABLE) ?? source) });
    },
    options,
  );

  document.addEventListener(
    'keydown',
    (event) => {
      const el = sourceOf(event);
      if (!el || !trusted(event) || event.key !== 'Enter' || event.isComposing) return;
      // Enter in a button is a click, which is reported as one.
      if (!(el instanceof HTMLInputElement) || !isTextField(el)) return;
      flushAll();
      send({ kind: 'enter', target: hintFor(el) });
    },
    options,
  );

  window.addEventListener('pagehide', flushAll, options);

  stop = () => {
    flushAll();
    controller.abort();
    stop = undefined;
  };
  return true;
}

export function stopRecording(): true {
  stop?.();
  return true;
}
