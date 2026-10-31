/** A tiny, dependency-free markdown parser. It yields a plain AST; rendering is done with React elements. */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'br' }
  | { type: 'code'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'link'; href: string; children: Inline[] };

export type Block =
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'heading'; level: number; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'quote'; children: Block[] }
  | { type: 'list'; ordered: boolean; items: Block[][] };

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/** Returns the URL when it is an http(s) or mailto link, otherwise undefined. */
export function safeHref(raw: string): string | undefined {
  try {
    const url = new URL(raw);
    return SAFE_PROTOCOLS.has(url.protocol) ? raw : undefined;
  } catch {
    return undefined;
  }
}

const LINK = /^\[([^\]\n]+)\]\(([^)\s]+)\)/;

function pushText(out: Inline[], text: string) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last?.type === 'text') last.text += text;
  else out.push({ type: 'text', text });
}

/** Parses inline markers; any marker without a closing partner stays literal text. */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i] ?? '';
    const rest = src.slice(i);

    if (ch === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i + 1) {
        out.push({ type: 'code', text: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    } else if (rest.startsWith('**')) {
      const end = src.indexOf('**', i + 2);
      if (end > i + 2 && !/^\s/.test(src[i + 2] ?? '')) {
        out.push({ type: 'strong', children: parseInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    } else if (ch === '*' || ch === '_') {
      const intraWord = ch === '_' && i > 0 && /\w/.test(src[i - 1] ?? '');
      const end = src.indexOf(ch, i + 1);
      const closes = end > i + 1 && !/\s/.test(src[i + 1] ?? '') && !/\s/.test(src[end - 1] ?? '');
      if (!intraWord && closes && !(ch === '_' && /\w/.test(src[end + 1] ?? ''))) {
        out.push({ type: 'em', children: parseInline(src.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    } else if (ch === '[') {
      const match = LINK.exec(rest);
      const href = match && safeHref(match[2] ?? '');
      if (match && href) {
        out.push({ type: 'link', href, children: parseInline(match[1] ?? '') });
        i += match[0].length;
        continue;
      }
    }
    pushText(out, ch);
    i += 1;
  }
  return out;
}

function inlineLines(lines: string[]): Inline[] {
  const out: Inline[] = [];
  lines.forEach((line, index) => {
    if (index > 0) out.push({ type: 'br' });
    out.push(...parseInline(line.trim()));
  });
  return out;
}

const FENCE = /^\s*```/;
const HEADING = /^\s{0,3}(#{1,3})\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const ITEM = /^(\s*)([-*]|\d+\.)\s+(.*)$/;

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

/** True when the line starts a block other than a paragraph continuation. */
function startsBlock(line: string): boolean {
  return FENCE.test(line) || HEADING.test(line) || QUOTE.test(line) || ITEM.test(line);
}

export function parseMarkdown(src: string): Block[] {
  return parseLines(src.replace(/\r\n?/g, '\n').split('\n'));
}

function parseLines(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  const at = (n: number) => lines[n] ?? '';
  while (i < lines.length) {
    const line = at(i);
    const heading = HEADING.exec(line);
    const item = ITEM.exec(line);
    if (!line.trim()) {
      i += 1;
    } else if (FENCE.test(line)) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE.test(at(i))) body.push(at(i++));
      i += 1; // closing fence; a missing one (streaming) just ends the block
      blocks.push({ type: 'code', text: body.join('\n') });
    } else if (heading) {
      blocks.push({
        type: 'heading',
        level: (heading[1] ?? '#').length,
        children: parseInline((heading[2] ?? '').trim()),
      });
      i += 1;
    } else if (QUOTE.test(line)) {
      const body: string[] = [];
      for (let m = QUOTE.exec(at(i)); m; m = i < lines.length ? QUOTE.exec(at(i)) : null) {
        body.push(m[1] ?? '');
        i += 1;
      }
      blocks.push({ type: 'quote', children: parseLines(body) });
    } else if (item) {
      const base = indentOf(line);
      const ordered = /\d/.test(item[2] ?? '');
      const items: Block[][] = [];
      for (
        let m: RegExpExecArray | null = item;
        m;
        m = i < lines.length ? ITEM.exec(at(i)) : null
      ) {
        if (indentOf(at(i)) !== base || /\d/.test(m[2] ?? '') !== ordered) break;
        const body = [m[3] ?? ''];
        i += 1;
        // Deeper-indented lines belong to this item (nested lists, continuations).
        while (i < lines.length && at(i).trim() && indentOf(at(i)) > base) {
          body.push(at(i).slice(base + 2));
          i += 1;
        }
        items.push(parseLines(body));
      }
      blocks.push({ type: 'list', ordered, items });
    } else {
      const body: string[] = [];
      while (i < lines.length && at(i).trim() && (body.length === 0 || !startsBlock(at(i)))) {
        body.push(at(i++));
      }
      blocks.push({ type: 'paragraph', children: inlineLines(body) });
    }
  }
  return blocks;
}
