import type { TargetHint } from '@autochrome/shared';

/** What is known about a page element when looking for the one a hint describes. */
export type Candidate = {
  role: string;
  name: string;
  /** Visible text of the element. */
  text: string;
  /** Whether a click, typing or selecting makes sense on it (a button, a field, a link…). */
  actionable: boolean;
  /** Whether the hint's CSS selector matches this element. */
  selectorMatch: boolean;
};

export type MatchKind = 'name' | 'name-loose' | 'text';
export type Match = { index: number; kind: MatchKind };

const MIN_PARTIAL_LENGTH = 3;

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Equal, or one contains the other (so "Sign in" finds "Sign in to continue"). */
function looselyEqual(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= MIN_PARTIAL_LENGTH && long.includes(short);
}

type Rule = { kind: MatchKind; test: (hint: TargetHint, candidate: Candidate) => boolean };

// Strictest first: a better rule always wins over a looser one.
const RULES: Rule[] = [
  {
    kind: 'name',
    test: (hint, c) => hint.name !== '' && c.role === hint.role && c.name === hint.name,
  },
  {
    kind: 'name-loose',
    test: (hint, c) => {
      const name = normalize(hint.name);
      return name !== '' && c.role === hint.role && looselyEqual(normalize(c.name), name);
    },
  },
  {
    kind: 'text',
    test: (hint, c) => {
      const text = normalize(hint.text ?? hint.name);
      // Equality only: a container's text contains the text of everything inside it. And only
      // elements that can be acted on, so a heading that says "Sign in" is not the button.
      return text !== '' && c.actionable && normalize(c.text) === text;
    },
  },
];

/**
 * The candidate that best fits the hint: role and name exactly, then role with a case-insensitive
 * or partial name, then the same visible text. Among equally good ones the selector decides, then the
 * first in page order. Undefined when nothing fits (the selector fallback is up to the caller).
 */
export function bestMatch(hint: TargetHint, candidates: Candidate[]): Match | undefined {
  for (const { kind, test } of RULES) {
    const fits = candidates.flatMap((candidate, index) => (test(hint, candidate) ? [index] : []));
    if (fits.length === 0) continue;
    const index = fits.find((i) => candidates[i]!.selectorMatch) ?? fits[0]!;
    return { index, kind };
  }
  return undefined;
}
