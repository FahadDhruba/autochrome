import { isPaymentField, isPasswordField, type FieldInfo } from '../safety/risk';
import { nameOf, roleOf } from './dom';
import type { DescribeTarget, ElementDescription } from './messages';
import { elementForRef } from './refs';

type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
type Info = Omit<ElementDescription, 'inForm' | 'formHasPassword' | 'formHasPayment'>;

const CLICKABLE = 'button, a[href], input, select, summary, [role], [onclick], [tabindex]';

function deepActiveElement(): Element | undefined {
  let el = document.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  return el && el !== document.body && el !== document.documentElement ? el : undefined;
}

function deepElementAt(x: number, y: number): Element | undefined {
  let el = document.elementFromPoint(x, y);
  while (el?.shadowRoot) {
    const inner = el.shadowRoot.elementFromPoint(x, y);
    if (!inner || inner === el) break;
    el = inner;
  }
  // A click lands on a span inside a button; what matters is the button.
  return (el?.closest(CLICKABLE) ?? el) || undefined;
}

function targetElement({ ref, point }: DescribeTarget): Element | undefined {
  if (ref !== undefined) return elementForRef(ref);
  if (point) return deepElementAt(point.x, point.y);
  return deepActiveElement();
}

const isFormControl = (el: Element): el is FormControl =>
  el instanceof HTMLInputElement ||
  el instanceof HTMLTextAreaElement ||
  el instanceof HTMLSelectElement;

function infoOf(el: Element): Info {
  const control = isFormControl(el) ? el : undefined;
  const role = roleOf(el);
  return {
    tag: el.localName,
    role: role ?? '',
    name: nameOf(el, role ?? ''),
    ariaLabel: (el.getAttribute('aria-label') ?? '').trim(),
    inputType: el instanceof HTMLInputElement ? el.type : '',
    autocomplete: control?.autocomplete ?? '',
    fieldId: `${el.id} ${el.getAttribute('name') ?? ''}`.trim(),
  };
}

const formOf = (el: Element): HTMLFormElement | null =>
  (isFormControl(el) ? el.form : null) ?? el.closest('form');

/** Describes the element the safety checks care about; undefined when there is none. */
export function describe(target: DescribeTarget): ElementDescription | undefined {
  const el = targetElement(target);
  if (!el) return undefined;
  const form = formOf(el);
  const fields: FieldInfo[] = form ? Array.from(form.elements, infoOf) : [];
  return {
    ...infoOf(el),
    inForm: form !== null,
    formHasPassword: fields.some(isPasswordField),
    formHasPayment: fields.some(isPaymentField),
  };
}
