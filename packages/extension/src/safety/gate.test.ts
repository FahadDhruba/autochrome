import { toolDefinitions, toolNames, type ToolCall, type ToolName } from '@autochrome/shared';
import { describe, expect, it, vi } from 'vitest';
import type { ElementDescription } from '../page/messages';
import { checkPermission, decide, TOOL_GROUPS, type GateEnv, type TabInfo } from './gate';
import type { SafetyMode } from './settings';
import { canAllowSite } from './types';

const SITE = 'https://shop.example.com';
const OTHER = 'https://other.example.com';

const tab = (patch: Partial<TabInfo> = {}): TabInfo => ({
  id: 1,
  url: `${SITE}/cart`,
  title: 'Cart',
  inAgentGroup: false,
  ...patch,
});

const description = (patch: Partial<ElementDescription> = {}): ElementDescription => ({
  tag: 'button',
  role: 'button',
  name: 'Count',
  ariaLabel: '',
  inputType: '',
  autocomplete: '',
  fieldId: '',
  inForm: false,
  formHasPassword: false,
  formHasPayment: false,
  ...patch,
});

function env(
  mode: SafetyMode,
  options: { sites?: string[]; tab?: TabInfo; element?: ElementDescription } = {},
): GateEnv {
  return {
    loadSafety: async () => ({ mode, sites: options.sites ?? [] }),
    tab: async () => options.tab ?? tab(),
    describe: async () => options.element,
  };
}

/** Valid input for every tool, so each can be run through the gate. */
const INPUTS: Record<ToolName, object> = {
  tabs_list: {},
  wait: { ms: 10 },
  read_page: {},
  find: { query: 'x' },
  get_text: {},
  screenshot: {},
  click: { ref: 'e1' },
  type: { text: 'hi', ref: 'e1' },
  key: { keys: 'Escape' },
  scroll: { direction: 'down' },
  form_input: { ref: 'e1', value: 'x' },
  navigate: { url: `${SITE}/next` },
  go_back: {},
  go_forward: {},
  tab_open: { url: `${SITE}/` },
  tab_switch: { tabId: 1 },
  tab_close: { tabId: 1 },
  console_logs: {},
  network_requests: {},
  network_response: { requestId: '1' },
  js_eval: { code: '1 + 1' },
};

const call = (name: ToolName, input: object = INPUTS[name]): ToolCall => ({ id: '1', name, input });

describe('tool groups', () => {
  it('classify every tool', () => {
    expect(Object.keys(TOOL_GROUPS).sort()).toEqual([...toolNames].sort());
    expect(Object.keys(INPUTS).sort()).toEqual([...toolNames].sort());
  });

  it('use inputs that pass the tool schemas', () => {
    for (const name of toolNames) {
      expect(toolDefinitions[name].input.safeParse(INPUTS[name]).success, name).toBe(true);
    }
  });
});

describe('decide', () => {
  it.each(['ask', 'per-site', 'auto'] as const)('always_ask asks in %s mode', (mode) => {
    expect(decide({ mode, group: 'always_ask', siteAllowed: true, risky: false })).toBe('ask');
  });

  it.each([
    // mode, group, siteAllowed, risky -> decision
    ['ask', 'free', false, false, 'allow'],
    ['per-site', 'free', false, false, 'allow'],
    ['auto', 'free', false, false, 'allow'],

    ['ask', 'read', false, false, 'ask'],
    ['ask', 'read', true, false, 'allow'],
    ['per-site', 'read', false, false, 'ask'],
    ['per-site', 'read', true, false, 'allow'],
    ['auto', 'read', false, false, 'allow'],

    ['ask', 'action', false, false, 'ask'],
    ['ask', 'action', true, false, 'ask'],
    ['per-site', 'action', false, false, 'ask'],
    ['per-site', 'action', true, false, 'allow'],
    ['auto', 'action', false, false, 'allow'],

    ['ask', 'action', true, true, 'ask'],
    ['per-site', 'action', true, true, 'ask'],
    ['per-site', 'action', false, true, 'ask'],
    ['auto', 'action', true, true, 'allow'],
    ['auto', 'action', false, true, 'allow'],
  ] as const)(
    '%s / %s / site allowed %s / risky %s -> %s',
    (mode, group, siteAllowed, risky, expected) => {
      expect(decide({ mode, group, siteAllowed, risky })).toBe(expected);
    },
  );
});

describe('checkPermission', () => {
  const MODES: SafetyMode[] = ['ask', 'per-site', 'auto'];
  const verdict = async (
    name: ToolName,
    mode: SafetyMode,
    options: Parameters<typeof env>[1] = {},
    source: 'agent' | 'bridge' | 'debug' = 'agent',
    input?: object,
  ) => (await checkPermission(call(name, input), source, env(mode, options))).decision;

  describe('every tool in every mode', () => {
    // [tool, ask mode on an allowed site, per-site on an unapproved site, per-site on an allowed site]
    const TABLE: [ToolName, string, string, string][] = [
      ['tabs_list', 'allow', 'allow', 'allow'],
      ['wait', 'allow', 'allow', 'allow'],
      ['read_page', 'allow', 'ask', 'allow'],
      ['find', 'allow', 'ask', 'allow'],
      ['get_text', 'allow', 'ask', 'allow'],
      ['screenshot', 'allow', 'ask', 'allow'],
      ['click', 'ask', 'ask', 'allow'],
      ['type', 'ask', 'ask', 'allow'],
      ['key', 'ask', 'ask', 'allow'],
      ['scroll', 'ask', 'ask', 'allow'],
      ['form_input', 'ask', 'ask', 'allow'],
      ['navigate', 'ask', 'ask', 'allow'],
      ['go_back', 'ask', 'ask', 'allow'],
      ['go_forward', 'ask', 'ask', 'allow'],
      ['tab_open', 'ask', 'ask', 'allow'],
      ['tab_switch', 'ask', 'ask', 'allow'],
      ['tab_close', 'ask', 'ask', 'allow'],
      ['console_logs', 'allow', 'ask', 'allow'],
      ['network_requests', 'allow', 'ask', 'allow'],
      ['network_response', 'allow', 'ask', 'allow'],
    ];

    it.each(TABLE)('%s', async (name, whenAsk, whenUnapproved, whenApproved) => {
      expect(await verdict(name, 'ask', { sites: [SITE] })).toBe(whenAsk);
      expect(await verdict(name, 'per-site')).toBe(whenUnapproved);
      expect(await verdict(name, 'per-site', { sites: [SITE] })).toBe(whenApproved);
      expect(await verdict(name, 'per-site', { sites: [OTHER] })).toBe(whenUnapproved);
      expect(await verdict(name, 'auto')).toBe('allow');
      // Reads only need the site; the site does not matter for actions in ask mode.
      expect(await verdict(name, 'ask')).toBe(whenUnapproved);
    });

    it('covers every tool except js_eval, which has its own tests', () => {
      expect(TABLE.map(([name]) => name).sort()).toEqual(
        toolNames.filter((name) => name !== 'js_eval').sort(),
      );
    });
  });

  describe('js_eval', () => {
    const code = 'document.cookie = "a=1"; fetch("/api/delete", { method: "POST" })';

    it.each(MODES)('asks in %s mode, even on an allowed site', async (mode) => {
      const result = await checkPermission(
        call('js_eval', { code }),
        'agent',
        env(mode, { sites: [SITE] }),
      );
      expect(result).toMatchObject({
        decision: 'ask',
        request: {
          tool: 'js_eval',
          risk: 'Runs JavaScript in the page',
          detail: code,
          site: SITE,
        },
      });
    });

    it('asks for the bridge too, and cannot be allowed for the whole site', async () => {
      const result = await checkPermission(
        call('js_eval', { code }),
        'bridge',
        env('auto', { sites: [SITE] }),
      );
      expect(result).toMatchObject({ decision: 'ask', request: { source: 'bridge' } });
      if (result.decision !== 'ask') throw new Error('expected a prompt');
      expect(canAllowSite({ ...result.request, id: 'x' })).toBe(false);
    });

    it("is the debug page's own click, so it runs ungated", async () => {
      expect(await verdict('js_eval', 'auto', {}, 'debug')).toBe('allow');
      expect(await verdict('js_eval', 'ask', {}, 'debug')).toBe('allow');
    });

    it.each(MODES)('is still refused on chrome:// pages in %s mode', async (mode) => {
      const chromeTab = tab({ url: 'chrome://settings/' });
      expect(await verdict('js_eval', mode, { tab: chromeTab })).toBe('deny');
    });
  });

  describe('risky actions', () => {
    const risky = description({ name: 'Place order' });

    it.each(['ask', 'per-site'] as const)(
      'ask in %s mode even on an allowed site',
      async (mode) => {
        const result = await checkPermission(
          call('click'),
          'agent',
          env(mode, { sites: [SITE], element: risky }),
        );
        expect(result).toMatchObject({
          decision: 'ask',
          request: { risk: 'Clicks "Place order" (purchase)', site: SITE, tool: 'click' },
        });
      },
    );

    it('is allowed in auto mode', async () => {
      expect(await verdict('click', 'auto', { sites: [SITE], element: risky })).toBe('allow');
    });

    it('is not even inspected in auto mode', async () => {
      const describe = vi.fn(async () => risky);
      await checkPermission(call('click'), 'agent', { ...env('auto'), describe });
      expect(describe).not.toHaveBeenCalled();
    });

    it('covers typing into a password field and Enter in a login form', async () => {
      const password = description({ tag: 'input', role: 'textbox', inputType: 'password' });
      expect(await verdict('type', 'per-site', { sites: [SITE], element: password })).toBe('ask');
      expect(await verdict('form_input', 'per-site', { sites: [SITE], element: password })).toBe(
        'ask',
      );
      const loginField = description({
        tag: 'input',
        role: 'textbox',
        inForm: true,
        formHasPassword: true,
      });
      expect(
        await verdict('key', 'per-site', { sites: [SITE], element: loginField }, 'agent', {
          keys: 'Enter',
        }),
      ).toBe('ask');
    });

    it('looks at the element the call targets', async () => {
      const describeTarget = vi.fn(async () => undefined);
      const gateEnv = { ...env('per-site', { sites: [SITE] }), describe: describeTarget };
      await checkPermission(call('click', { ref: 'e5' }), 'agent', gateEnv);
      await checkPermission(call('click', { x: 3, y: 4 }), 'agent', gateEnv);
      await checkPermission(call('type', { text: 'a' }), 'agent', gateEnv);
      await checkPermission(call('key', { keys: 'Enter' }), 'agent', gateEnv);
      expect(describeTarget.mock.calls).toEqual([
        [1, { ref: 'e5' }],
        [1, { point: { x: 3, y: 4 } }],
        [1, {}],
        [1, {}],
      ]);
    });

    it('lets a stale ref through, since the tool then fails without acting', async () => {
      const failing = {
        ...env('per-site', { sites: [SITE] }),
        describe: async () => {
          throw new Error('Unknown ref e9');
        },
      };
      expect((await checkPermission(call('click'), 'agent', failing)).decision).toBe('allow');
    });

    it('asks when the element cannot be inspected for another reason', async () => {
      const failing = {
        ...env('per-site', { sites: [SITE] }),
        describe: async () => {
          throw new Error('Cannot access contents of the page');
        },
      };
      const verdict = await checkPermission(call('click'), 'agent', failing);
      expect(verdict).toMatchObject({
        decision: 'ask',
        request: { risk: 'Could not inspect the element this acts on' },
      });
    });
  });

  describe('the approval request', () => {
    it('describes the action, the site and the tab', async () => {
      const result = await checkPermission(
        call('click', { ref: 'e3' }),
        'bridge',
        env('per-site', { element: description({ name: 'Count' }) }),
      );
      expect(result).toEqual({
        decision: 'ask',
        request: {
          source: 'bridge',
          tool: 'click',
          summary: 'ref: e3',
          target: 'button "Count"',
          site: SITE,
          risk: undefined,
          tabTitle: 'Cart',
        },
      });
    });

    it('uses the destination as the site for navigate and tab_open', async () => {
      const navigate = await checkPermission(
        call('navigate', { url: `${OTHER}/x` }),
        'agent',
        env('per-site', { sites: [SITE] }),
      );
      expect(navigate).toMatchObject({ decision: 'ask', request: { site: OTHER } });
      expect(
        await verdict('navigate', 'per-site', { sites: [OTHER], tab: tab() }, 'agent', {
          url: `${OTHER}/x`,
        }),
      ).toBe('allow');
      expect(
        await verdict('tab_open', 'per-site', { sites: [OTHER] }, 'agent', { url: `${OTHER}/` }),
      ).toBe('allow');
    });
  });

  describe('tabs that need no site check', () => {
    it('lets a blank tab open in per-site mode but still asks in ask mode', async () => {
      expect(await verdict('tab_open', 'per-site', {}, 'agent', {})).toBe('allow');
      expect(await verdict('tab_open', 'ask', {}, 'agent', {})).toBe('ask');
    });

    it('lets an agent tab be closed, wherever it is', async () => {
      const agentTab = tab({ inAgentGroup: true, url: 'chrome://newtab/' });
      expect(await verdict('tab_close', 'per-site', { tab: agentTab })).toBe('allow');
      expect(await verdict('tab_close', 'ask', { tab: agentTab })).toBe('ask');
    });

    it('checks the site of a tab the agent did not open', async () => {
      expect(await verdict('tab_close', 'per-site', { tab: tab() })).toBe('ask');
      expect(await verdict('tab_close', 'per-site', { tab: tab(), sites: [SITE] })).toBe('allow');
    });
  });

  describe('refusals', () => {
    it.each(MODES)('refuses chrome:// destinations in %s mode', async (mode) => {
      const result = await checkPermission(
        call('navigate', { url: 'chrome://settings' }),
        'agent',
        env(mode),
      );
      expect(result).toEqual({
        decision: 'deny',
        reason: 'autochrome cannot control chrome:// pages.',
      });
    });

    it.each(MODES)('refuses tabs on chrome:// pages in %s mode', async (mode) => {
      const chromeTab = tab({ url: 'chrome://settings/' });
      for (const name of ['read_page', 'click', 'screenshot', 'tab_switch'] as const) {
        expect(await verdict(name, mode, { tab: chromeTab, sites: [SITE] })).toBe('deny');
      }
    });

    it('refuses extension pages, the Web Store and invalid URLs', async () => {
      const urls = [
        'chrome-extension://abc/debug.html',
        'https://chromewebstore.google.com/detail/x',
        'about:blank',
        'javascript:alert(1)',
        'not a url',
      ];
      for (const url of urls) {
        expect(await verdict('tab_open', 'auto', {}, 'agent', { url }), url).toBe('deny');
        expect(await verdict('navigate', 'auto', {}, 'bridge', { url }), url).toBe('deny');
      }
    });

    it('allows file pages like any other site', async () => {
      const fileTab = tab({ url: 'file:///tmp/a.html' });
      expect(await verdict('read_page', 'per-site', { tab: fileTab })).toBe('ask');
      expect(await verdict('read_page', 'per-site', { tab: fileTab, sites: ['file://'] })).toBe(
        'allow',
      );
    });

    it('reports a missing target tab', async () => {
      const noTab: GateEnv = {
        ...env('per-site'),
        tab: async () => {
          throw new Error('No target tab. Use tab_open or tab_switch first.');
        },
      };
      expect(await checkPermission(call('read_page'), 'agent', noTab)).toEqual({
        decision: 'deny',
        reason: 'No target tab. Use tab_open or tab_switch first.',
      });
    });

    it('lets navigate through when the current tab is unknown', async () => {
      const noTab: GateEnv = {
        ...env('per-site', { sites: [SITE] }),
        tab: async () => {
          throw new Error('No target tab.');
        },
      };
      expect((await checkPermission(call('navigate'), 'agent', noTab)).decision).toBe('allow');
    });
  });

  describe('sources', () => {
    it.each(toolNames)('does not gate debug calls to %s', async (name) => {
      const gateEnv = env('ask');
      const loadSafety = vi.spyOn(gateEnv, 'loadSafety');
      expect(await checkPermission(call(name), 'debug', gateEnv)).toEqual({ decision: 'allow' });
      expect(loadSafety).not.toHaveBeenCalled();
    });

    it('gates bridge calls like agent calls', async () => {
      for (const name of toolNames) {
        expect(await verdict(name, 'per-site', {}, 'bridge')).toBe(await verdict(name, 'per-site'));
      }
    });
  });
});
