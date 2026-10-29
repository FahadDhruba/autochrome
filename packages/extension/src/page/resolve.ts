import type { TargetHint } from '@autochrome/shared';
import { collectNodes, isVisible, textOf } from './dom';
import { bestMatch, type MatchKind } from './match';
import { refFor } from './refs';

export type ResolvedTarget = { ref: string; kind: MatchKind | 'selector' };

function queryOne(selector: string): Element | undefined {
  try {
    return document.querySelector(selector) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Finds the element a hint describes on this page and gives it a ref, or undefined. */
export function resolveTarget(hint: TargetHint): ResolvedTarget | undefined {
  const { nodes } = collectNodes();
  const selected = hint.selector ? queryOne(hint.selector) : undefined;
  const match = bestMatch(
    hint,
    nodes.map((node) => ({
      role: node.role,
      name: node.name,
      text: textOf(node.el),
      actionable: node.actionable,
      selectorMatch: node.el === selected,
    })),
  );
  if (match) return { ref: refFor(nodes[match.index]!.el), kind: match.kind };
  if (selected && isVisible(selected)) return { ref: refFor(selected), kind: 'selector' };
  return undefined;
}
