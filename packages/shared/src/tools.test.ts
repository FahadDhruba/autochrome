import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toolDefinitions, toolNames } from './tools';

describe('toolDefinitions', () => {
  it.each(toolNames)('%s has a name matching its key and a description', (name) => {
    const def = toolDefinitions[name];
    expect(def.name).toBe(name);
    expect(def.description.trim().length).toBeGreaterThan(0);
  });

  it('applies defaults', () => {
    expect(toolDefinitions.read_page.input.parse({})).toEqual({ filter: 'interactive' });
    expect(toolDefinitions.click.input.parse({ ref: 'e1' })).toMatchObject({
      button: 'left',
      clickCount: 1,
    });
    expect(toolDefinitions.scroll.input.parse({ direction: 'down' })).toMatchObject({
      amount: 600,
    });
  });

  it('accepts valid input', () => {
    expect(toolDefinitions.form_input.input.safeParse({ ref: 'e2', value: true }).success).toBe(
      true,
    );
    expect(toolDefinitions.wait.input.safeParse({ text: 'Done', timeoutMs: 5000 }).success).toBe(
      true,
    );
  });

  it('rejects invalid input', () => {
    expect(toolDefinitions.tab_switch.input.safeParse({}).success).toBe(false);
    expect(toolDefinitions.click.input.safeParse({ clickCount: 4 }).success).toBe(false);
    expect(toolDefinitions.scroll.input.safeParse({ direction: 'sideways' }).success).toBe(false);
    expect(toolDefinitions.wait.input.safeParse({ ms: 99_999 }).success).toBe(false);
    expect(toolDefinitions.click.input.safeParse({ x: 5 }).success).toBe(false);
    expect(toolDefinitions.wait.input.safeParse({}).success).toBe(false);
    expect(toolDefinitions.find.input.safeParse({ query: '' }).success).toBe(false);
  });

  it('converts to JSON Schema', () => {
    for (const name of toolNames) {
      expect(() => z.toJSONSchema(toolDefinitions[name].input)).not.toThrow();
    }
  });
});
