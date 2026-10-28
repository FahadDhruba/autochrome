export type PageNode = {
  depth: number;
  role: string;
  name: string;
  ref?: string;
  value?: string;
  checked?: boolean;
  level?: number;
};

export const MAX_PAGE_CHARS = 50_000;

/** `[e3] textbox "Email" value="a@b.c"`, `heading "Pricing" level=2`, `[e4] checkbox "Remember" checked` */
export function formatNode(node: PageNode): string {
  const parts: string[] = [];
  if (node.ref) parts.push(`[${node.ref}]`);
  parts.push(node.role);
  if (node.name) parts.push(JSON.stringify(node.name));
  if (node.level !== undefined) parts.push(`level=${node.level}`);
  if (node.value) parts.push(`value=${JSON.stringify(node.value)}`);
  if (node.checked) parts.push('checked');
  return '  '.repeat(node.depth) + parts.join(' ');
}

export function formatNodes(nodes: PageNode[], maxChars = MAX_PAGE_CHARS): string {
  const text = nodes.map(formatNode).join('\n');
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n… truncated` : text;
}
