import { describe, expect, it } from 'vitest';
import {
  decodeMessage,
  describeTools,
  isToolName,
  toClientMessage,
  toHubMessage,
  toolNames,
} from './index';

describe('describeTools', () => {
  it('describes every tool, leaving defaulted fields optional', () => {
    const tools = describeTools();
    expect(tools.map((t) => t.name)).toEqual(toolNames);
    const scroll = tools.find((t) => t.name === 'scroll');
    expect(scroll?.inputSchema.required).toEqual(['direction']);
  });
});

describe('decodeMessage', () => {
  it('accepts a valid call', () => {
    const raw = JSON.stringify({ type: 'call', call: { id: '1', name: 'tabs_list', input: {} } });
    expect(decodeMessage(toHubMessage, raw)).toMatchObject({ type: 'call' });
  });

  it('rejects unknown tools, bad shapes and invalid JSON', () => {
    const unknownTool = { type: 'call', call: { id: '1', name: 'nope', input: {} } };
    expect(decodeMessage(toHubMessage, JSON.stringify(unknownTool))).toBeUndefined();
    expect(decodeMessage(toClientMessage, JSON.stringify({ type: 'welcome' }))).toBeUndefined();
    expect(decodeMessage(toHubMessage, '{oops')).toBeUndefined();
  });
});

describe('isToolName', () => {
  it('does not accept inherited properties', () => {
    expect(isToolName('click')).toBe(true);
    expect(isToolName('toString')).toBe(false);
  });
});
