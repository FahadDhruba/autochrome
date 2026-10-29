import { collectNodes, type RawNode } from './dom';
import { formatNodes, type PageNode } from './format';
import { refFor, resetRefs } from './refs';

const MAX_FIND_RESULTS = 20;
const MAX_TEXT_CHARS = 20_000;

function toPageNode(raw: RawNode, depth = raw.depth): PageNode {
  const { el, actionable, ...node } = raw;
  return { ...node, depth, ref: actionable ? refFor(el) : undefined };
}

function withIframeNote(text: string, iframes: number): string {
  return iframes ? `${text}\n(${iframes} iframe(s) on this page are not read)` : text;
}

export function readPage(filter: 'all' | 'interactive'): string {
  resetRefs();
  const { nodes, iframes } = collectNodes();
  const pageNodes =
    filter === 'interactive'
      ? nodes.filter((n) => n.actionable).map((n) => toPageNode(n, 0))
      : nodes.map((n) => toPageNode(n));
  return withIframeNote(formatNodes(pageNodes) || '(no elements found)', iframes);
}

export function findElements(query: string): string {
  const needle = query.toLowerCase();
  const matches = collectNodes()
    .nodes.filter((n) =>
      [n.role, n.name, n.value].some((field) => field?.toLowerCase().includes(needle)),
    )
    .slice(0, MAX_FIND_RESULTS);
  return formatNodes(matches.map((n) => toPageNode(n, 0))) || `No elements match "${query}".`;
}

export function pageText(): { title: string; url: string; text: string } {
  const text = document.body.innerText
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n[\s]*\n+/g, '\n\n')
    .trim();
  return {
    title: document.title,
    url: location.href,
    text: text.length > MAX_TEXT_CHARS ? `${text.slice(0, MAX_TEXT_CHARS)}\n… truncated` : text,
  };
}
