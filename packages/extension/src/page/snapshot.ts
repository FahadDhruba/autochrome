import { collectNodes, isVisible, type RawNode } from './dom';
import { formatNodes, type PageNode } from './format';
import { refFor, resetRefs } from './refs';

const MAX_FIND_RESULTS = 20;
const MAX_TEXT_CHARS = 20_000;

function toPageNode(raw: RawNode, depth = raw.depth): PageNode {
  const { el, actionable, ...node } = raw;
  return { ...node, depth, ref: actionable ? refFor(el) : undefined };
}

function withIframeNote(text: string, iframes: number): string {
  return iframes ? `${text}\n(${iframes} iframe(s) on this page could not be read)` : text;
}

export function readPage(filter: 'all' | 'interactive'): string {
  resetRefs();
  const { nodes, iframes } = collectNodes();
  const pageNodes =
    filter === 'interactive'
      ? nodes.filter((n) => n.actionable || n.frame).map((n) => toPageNode(n, 0))
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

const cellText = (el: Element) =>
  ((el as HTMLElement).innerText ?? el.textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\|/g, '\\|');

/** The page's visible data tables (HTML tables and ARIA grids) as markdown tables. */
export function pageTables(maxRows: number): string {
  const tables = Array.from(
    document.querySelectorAll('table, [role="grid"], [role="table"], [role="treegrid"]'),
  ).filter(
    (el) => isVisible(el) && !el.parentElement?.closest('table, [role="grid"], [role="table"]'),
  );
  const parts = tables.flatMap((table, index) => {
    const rows = Array.from(table.querySelectorAll('tr, [role="row"]')).filter(
      (row) => row.closest('table, [role="grid"], [role="table"], [role="treegrid"]') === table,
    );
    const cells = rows
      .map((row) =>
        Array.from(
          row.querySelectorAll(
            ':scope > th, :scope > td, :scope > [role="cell"], :scope > [role="gridcell"], :scope > [role="columnheader"], :scope > [role="rowheader"]',
          ),
        ).map(cellText),
      )
      .filter((row) => row.some(Boolean));
    if (cells.length < 2) return [];
    const width = Math.max(...cells.map((row) => row.length));
    const pad = (row: string[]) => [...row, ...Array(width - row.length).fill('')];
    const [header, ...body] = cells.map(pad);
    const shown = body.slice(0, maxRows);
    const name =
      table.getAttribute('aria-label') ||
      table.querySelector('caption')?.textContent?.trim() ||
      `Table ${index + 1}`;
    const more = body.length > shown.length ? `, showing the first ${shown.length}` : '';
    return [
      `${name} (${body.length} rows${more}):`,
      `| ${header!.join(' | ')} |`,
      `|${' --- |'.repeat(width)}`,
      ...shown.map((row) => `| ${row.join(' | ')} |`),
    ].join('\n');
  });
  return parts.join('\n\n') || 'No data tables on this page.';
}
