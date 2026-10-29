import type { ElementDescription } from '../page/messages';

/** Words that make a button or link risky to click. Matched as whole words, case-insensitively. */
export const RISK_WORDS = {
  purchase: [
    'buy',
    'purchase',
    'pay',
    'checkout',
    'place order',
    'order now',
    'subscribe',
    'donate',
    'transfer',
  ],
  sending: ['send', 'post', 'publish', 'submit', 'reply', 'tweet', 'share'],
  deleting: ['delete', 'remove', 'erase', 'destroy', 'cancel subscription', 'close account'],
} as const;

export type RiskKind = keyof typeof RISK_WORDS;

const anyOf = (words: readonly string[]) =>
  words.map((word) => word.replace(/ /g, '\\s+')).join('|');

const WORD_PATTERNS = Object.fromEntries(
  Object.entries(RISK_WORDS).map(([kind, words]) => [
    kind,
    new RegExp(`\\b(?:${anyOf(words)})\\b`, 'i'),
  ]),
) as Record<RiskKind, RegExp>;

/** "Buy", "Buy now", "Pay." and nothing else. */
const WHOLE_PURCHASE_NAME = new RegExp(
  `^(?:${anyOf(RISK_WORDS.purchase)})(?:\\s+now)?[\\s.!]*$`,
  'i',
);

type Control = 'button' | 'link';

/** Roles that act like a button when clicked. */
const BUTTON_ROLES = new Set(['button', 'clickable', 'menuitem', 'tab']);

function controlOf(el: ElementDescription): Control | undefined {
  if (el.role === 'link') return 'link';
  return BUTTON_ROLES.has(el.role) ? 'button' : undefined;
}

/**
 * Purchase words are matched anywhere in a button's name ("Pay $49.00") but only as the whole
 * name of a link: links like "Payment history" or "Pay your bill online" lead to pages to read,
 * while a link that is just "Buy now" is a styled purchase button. Sending and deleting words
 * match in both, since a "Delete account" link is as destructive as a button.
 */
export function riskKindOfName(name: string, control: Control): RiskKind | undefined {
  for (const kind of Object.keys(WORD_PATTERNS) as RiskKind[]) {
    if (kind === 'purchase' && control === 'link') {
      if (WHOLE_PURCHASE_NAME.test(name.trim())) return kind;
    } else if (WORD_PATTERNS[kind].test(name)) {
      return kind;
    }
  }
  return undefined;
}

/** The risk kind and the matching name of a clickable element, if it is risky. */
function riskOfControl(el: ElementDescription): { kind: RiskKind; name: string } | undefined {
  const control = controlOf(el);
  if (!control) return undefined;
  for (const name of [el.name, el.ariaLabel]) {
    const kind = riskKindOfName(name, control);
    if (kind) return { kind, name };
  }
  return undefined;
}

const PAYMENT_AUTOCOMPLETE = /(?:^|\s)cc-/i;
const PAYMENT_TEXT =
  /\b(?:card\s*(?:number|num|no)|credit\s*card|cc\s*num(?:ber)?|cvv|cvc|csc|security\s*code|expir\w*|iban)\b/i;
const FIELD_TAGS = new Set(['input', 'textarea', 'select']);
const NON_TEXT_INPUTS = new Set([
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'image',
  'file',
  'hidden',
]);

/** `card_number` and `cardNumber` should read like "card number". */
const spaced = (text: string) =>
  text.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_\-.[\]]+/g, ' ');

export type FieldInfo = Pick<
  ElementDescription,
  'tag' | 'inputType' | 'autocomplete' | 'name' | 'fieldId'
>;

export function isPaymentField(field: FieldInfo): boolean {
  if (!FIELD_TAGS.has(field.tag) || NON_TEXT_INPUTS.has(field.inputType)) return false;
  if (PAYMENT_AUTOCOMPLETE.test(field.autocomplete)) return true;
  return PAYMENT_TEXT.test(spaced(`${field.name} ${field.fieldId}`));
}

export const isPasswordField = (field: Pick<ElementDescription, 'inputType'>): boolean =>
  field.inputType === 'password';

const segmentOf = (press: string) =>
  press
    .split(/\+(?=.)/)
    .at(-1)!
    .toLowerCase();
const isEnter = (press: string) => ['enter', 'return'].includes(segmentOf(press));
const isSpace = (press: string) => segmentOf(press) === 'space';
const isTab = (press: string) => segmentOf(press) === 'tab';

const quote = (name: string) => `"${name}"`;

function riskOfActivation(key: 'Enter' | 'Space', el: ElementDescription | undefined) {
  if (!el) return undefined;
  const control = controlOf(el);
  // Space activates buttons but scrolls the page on a link.
  if (control === 'button' || (control === 'link' && key === 'Enter')) {
    const risk = riskOfControl(el);
    if (risk) return `Presses ${key} on ${quote(risk.name)} (${risk.kind})`;
  }
  if (key === 'Enter' && el.tag === 'input' && el.inForm) {
    if (el.formHasPassword) return 'Presses Enter in a form with a password field';
    if (el.formHasPayment) return 'Presses Enter in a form with a payment field';
  }
  return undefined;
}

function riskOfKeys(keys: string, el: ElementDescription | undefined): string | undefined {
  const presses = keys.split(/\s+/).filter(Boolean);
  const activation = presses.findIndex((press) => isEnter(press) || isSpace(press));
  if (activation === -1) return undefined;
  // Tab moves focus to an element we have not seen, so Enter or Space afterwards is unknowable.
  if (presses.slice(0, activation).some(isTab)) {
    return `Presses ${isEnter(presses[activation]!) ? 'Enter' : 'Space'} after moving focus with Tab`;
  }
  return riskOfActivation(isEnter(presses[activation]!) ? 'Enter' : 'Space', el);
}

function riskOfTyping(el: ElementDescription | undefined): string | undefined {
  if (!el) return undefined;
  if (isPasswordField(el)) return 'Types into a password field';
  if (isPaymentField(el)) return `Types into a payment field (${quote(el.name || el.fieldId)})`;
  return undefined;
}

type RiskyCall = { name: string; input: unknown };

/**
 * Why a tool call is risky, or undefined. `el` is the element the call targets: the clicked
 * element, or the one that has focus for `key` and for `type` without a ref.
 */
export function assessRisk(
  call: RiskyCall,
  el: ElementDescription | undefined,
): string | undefined {
  switch (call.name) {
    case 'click': {
      const risk = el && riskOfControl(el);
      return risk ? `Clicks ${quote(risk.name)} (${risk.kind})` : undefined;
    }
    case 'key':
      return riskOfKeys(String((call.input as { keys?: unknown }).keys ?? ''), el);
    case 'type':
    case 'form_input':
      return riskOfTyping(el);
    default:
      return undefined;
  }
}
