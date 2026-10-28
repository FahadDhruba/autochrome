import { describe, expect, it } from 'vitest';
import type { ElementDescription } from '../page/messages';
import { assessRisk, isPaymentField, riskKindOfName, RISK_WORDS } from './risk';

const el = (patch: Partial<ElementDescription> = {}): ElementDescription => ({
  tag: 'button',
  role: 'button',
  name: '',
  ariaLabel: '',
  inputType: '',
  autocomplete: '',
  fieldId: '',
  inForm: false,
  formHasPassword: false,
  formHasPayment: false,
  ...patch,
});
const field = (patch: Partial<ElementDescription> = {}) =>
  el({ tag: 'input', role: 'textbox', inputType: 'text', ...patch });
const click = (target: ElementDescription) => assessRisk({ name: 'click', input: {} }, target);
const key = (keys: string, target?: ElementDescription) =>
  assessRisk({ name: 'key', input: { keys } }, target);

describe('risk words', () => {
  it('cover the three kinds', () => {
    expect(Object.keys(RISK_WORDS)).toEqual(['purchase', 'sending', 'deleting']);
  });

  it.each([
    ['Buy now', 'purchase'],
    ['Place order', 'purchase'],
    ['PLACE   ORDER', 'purchase'],
    ['Pay $49.00', 'purchase'],
    ['Proceed to checkout', 'purchase'],
    ['Subscribe', 'purchase'],
    ['Donate', 'purchase'],
    ['Transfer funds', 'purchase'],
    ['Send message', 'sending'],
    ['Post', 'sending'],
    ['Publish', 'sending'],
    ['Submit', 'sending'],
    ['Reply', 'sending'],
    ['Share', 'sending'],
    ['Delete account', 'deleting'],
    ['Remove item', 'deleting'],
    ['Cancel subscription', 'deleting'],
    ['Close account', 'deleting'],
  ] as const)('matches the button "%s" as %s', (name, kind) => {
    expect(riskKindOfName(name, 'button')).toBe(kind);
  });

  it.each([
    'Sender name',
    'Payment history',
    'Postal code',
    'Compost',
    'Repay',
    'Count',
    'Cancel',
    'Close',
    'Search',
    'Buyer guide',
    'Sharepoint',
    '',
  ])('does not match "%s"', (name) => {
    expect(riskKindOfName(name, 'button')).toBeUndefined();
    expect(riskKindOfName(name, 'link')).toBeUndefined();
  });

  it('matches payment words anywhere in a button but only as the whole name of a link', () => {
    expect(riskKindOfName('Pay your bill online', 'button')).toBe('purchase');
    expect(riskKindOfName('Pay your bill online', 'link')).toBeUndefined();
    expect(riskKindOfName('Subscribe to our newsletter', 'link')).toBeUndefined();
    expect(riskKindOfName('Buy now', 'link')).toBe('purchase');
    expect(riskKindOfName('Donate!', 'link')).toBe('purchase');
  });

  it('matches sending and deleting words in links too', () => {
    expect(riskKindOfName('Delete account', 'link')).toBe('deleting');
    expect(riskKindOfName('Share this post', 'link')).toBe('sending');
  });
});

describe('assessRisk click', () => {
  it('names the button and the kind', () => {
    expect(click(el({ name: 'Place order' }))).toBe('Clicks "Place order" (purchase)');
  });

  it('also reads aria-label', () => {
    expect(click(el({ name: 'x', ariaLabel: 'Delete comment' }))).toBe(
      'Clicks "Delete comment" (deleting)',
    );
  });

  it('checks buttons, submit inputs, clickable elements and links', () => {
    expect(click(el({ tag: 'input', inputType: 'submit', name: 'Pay now' }))).toBeDefined();
    expect(click(el({ role: 'clickable', tag: 'div', name: 'Send' }))).toBeDefined();
    expect(click(el({ role: 'link', tag: 'a', name: 'Payment history' }))).toBeUndefined();
    expect(click(el({ role: 'link', tag: 'a', name: 'Buy' }))).toBeDefined();
  });

  it('ignores fields and elements without a role', () => {
    expect(click(field({ name: 'Send to' }))).toBeUndefined();
    expect(click(el({ role: '', tag: 'div', name: 'Delete' }))).toBeUndefined();
    expect(assessRisk({ name: 'click', input: {} }, undefined)).toBeUndefined();
  });

  it('ignores harmless buttons', () => {
    expect(click(el({ name: 'Count' }))).toBeUndefined();
  });
});

describe('assessRisk type and form_input', () => {
  it.each(['type', 'form_input'])('flags a password field for %s', (name) => {
    expect(assessRisk({ name, input: {} }, field({ inputType: 'password' }))).toBe(
      'Types into a password field',
    );
  });

  it('flags payment fields by autocomplete, name, id or label', () => {
    const type = (target: ElementDescription) => assessRisk({ name: 'type', input: {} }, target);
    expect(type(field({ autocomplete: 'cc-number' }))).toContain('payment field');
    expect(type(field({ autocomplete: 'section-a cc-exp' }))).toContain('payment field');
    expect(type(field({ name: 'Card number' }))).toContain('payment field');
    expect(type(field({ fieldId: 'card_number' }))).toContain('payment field');
    expect(type(field({ fieldId: 'cvv' }))).toContain('payment field');
    expect(type(field({ name: 'CVC' }))).toContain('payment field');
    expect(type(field({ name: 'Expiry date' }))).toContain('payment field');
    expect(type(field({ name: 'IBAN' }))).toContain('payment field');
  });

  it('leaves ordinary fields alone', () => {
    const type = (target?: ElementDescription) => assessRisk({ name: 'type', input: {} }, target);
    expect(type(field({ name: 'Name', fieldId: 'name' }))).toBeUndefined();
    expect(type(field({ name: 'Email', autocomplete: 'email' }))).toBeUndefined();
    expect(type(undefined)).toBeUndefined();
  });
});

describe('isPaymentField', () => {
  it('only applies to fields', () => {
    expect(
      isPaymentField({
        tag: 'button',
        inputType: '',
        autocomplete: '',
        name: 'Card number',
        fieldId: '',
      }),
    ).toBe(false);
    expect(
      isPaymentField({
        tag: 'input',
        inputType: 'checkbox',
        autocomplete: '',
        name: 'Save card number',
        fieldId: '',
      }),
    ).toBe(false);
  });
});

describe('assessRisk key', () => {
  it('flags Enter on a risky button or link', () => {
    expect(key('Enter', el({ name: 'Place order' }))).toBe(
      'Presses Enter on "Place order" (purchase)',
    );
    expect(key('Enter', el({ role: 'link', tag: 'a', name: 'Delete' }))).toContain('(deleting)');
  });

  it('flags Space on a risky button but not on a link', () => {
    expect(key('Space', el({ name: 'Send' }))).toBe('Presses Space on "Send" (sending)');
    expect(key('Space', el({ role: 'link', tag: 'a', name: 'Delete' }))).toBeUndefined();
  });

  it('flags Enter in a field of a form with a password or payment field', () => {
    const inForm = { inForm: true };
    expect(key('Enter', field({ ...inForm, formHasPassword: true }))).toBe(
      'Presses Enter in a form with a password field',
    );
    expect(key('Enter', field({ ...inForm, formHasPayment: true }))).toBe(
      'Presses Enter in a form with a payment field',
    );
    expect(key('Enter', field({ ...inForm }))).toBeUndefined();
    expect(key('Enter', field({ formHasPassword: true }))).toBeUndefined();
  });

  it('does not flag Enter in a textarea, or other keys', () => {
    expect(
      key('Enter', field({ tag: 'textarea', inForm: true, formHasPassword: true })),
    ).toBeUndefined();
    expect(key('Escape', el({ name: 'Place order' }))).toBeUndefined();
    expect(key('Control+a', el({ name: 'Delete' }))).toBeUndefined();
  });

  it('reads Enter inside a sequence and with modifiers', () => {
    expect(key('Shift+Enter', el({ name: 'Post' }))).toContain('(sending)');
    expect(key('Return', el({ name: 'Post' }))).toContain('(sending)');
    expect(key('a Enter', el({ name: 'Post' }))).toContain('(sending)');
  });

  it('flags Enter or Space after Tab because the target is unknown', () => {
    expect(key('Tab Tab Enter', el({ name: 'Harmless' }))).toBe(
      'Presses Enter after moving focus with Tab',
    );
    expect(key('Tab Space', undefined)).toBe('Presses Space after moving focus with Tab');
    expect(key('Enter Tab', el({ name: 'Harmless' }))).toBeUndefined();
    expect(key('Tab Tab')).toBeUndefined();
  });

  it('has nothing to say without a focused element', () => {
    expect(key('Enter', undefined)).toBeUndefined();
  });
});

describe('assessRisk other tools', () => {
  it.each(['scroll', 'navigate', 'read_page', 'tab_open'])('ignores %s', (name) => {
    expect(assessRisk({ name, input: {} }, el({ name: 'Delete' }))).toBeUndefined();
  });
});
