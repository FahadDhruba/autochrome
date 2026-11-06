import { describe, expect, it } from 'vitest';
import { plainCell, toCsv, toJson } from './tableExport';

describe('table export', () => {
  it('strips markdown from cells', () => {
    expect(plainCell('**Ada** [site](https://a.test) `x` *em*')).toBe('Ada site x em');
  });

  it('writes CSV with quoting', () => {
    expect(toCsv(['Name', 'Note'], [['Ada', 'says "hi", twice']])).toBe(
      'Name,Note\nAda,"says ""hi"", twice"',
    );
  });

  it('writes JSON records keyed by header, numbering blank and repeated headers', () => {
    expect(JSON.parse(toJson(['Name', '', 'Name'], [['Ada', '1815', 'Lovelace']]))).toEqual([
      { Name: 'Ada', 'column 2': '1815', 'Name 3': 'Lovelace' },
    ]);
  });
});
