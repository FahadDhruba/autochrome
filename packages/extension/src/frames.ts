import { browser } from 'wxt/browser';
import { callPage, CONTENT_SCRIPT } from './content';
import type { PageOp, PageRequests, PageResults, Point } from './page/messages';

/** Ads can bring dozens of frames; past this many, the rest are not read. */
const MAX_FRAMES = 15;

type FrameMap = {
  /** Child frame id → its token, which its parent document knows it by. */
  token: Map<number, string>;
  /** Child frame id → the frame whose document hosts it. */
  parent: Map<number, number>;
};

const maps = new Map<number, FrameMap>();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const randomToken = () => crypto.randomUUID().slice(0, 8);

/** "f12e5" is ref "e5" in frame 12; a plain "e5" is in the top frame. */
export function splitRef(ref: string): { frameId: number; ref: string } {
  const match = /^f(\d+)(e\d+)$/.exec(ref);
  return match ? { frameId: Number(match[1]), ref: match[2]! } : { frameId: 0, ref };
}

/**
 * Inject the content script into every frame and learn which iframe hosts each child frame.
 * Returns the child frames, in no particular order.
 */
export async function mapFrames(tabId: number): Promise<number[]> {
  const injected = await browser.scripting
    .executeScript({ target: { tabId, allFrames: true }, files: [CONTENT_SCRIPT] })
    .catch(() => []);
  const children = [...new Set(injected.map((r) => r.frameId))]
    .filter((id) => id !== 0)
    .slice(0, MAX_FRAMES);
  const map: FrameMap = { token: new Map(), parent: new Map() };
  maps.set(tabId, map);
  if (children.length === 0) return [];

  for (const frameId of children) map.token.set(frameId, `${frameId}.${randomToken()}`);
  await Promise.all(
    children.map((frameId) =>
      callPage(tabId, 'frame_announce', { token: map.token.get(frameId)! }, frameId).catch(
        () => undefined,
      ),
    ),
  );
  // postMessage is asynchronous; give the parents a moment to receive the tokens.
  await sleep(60);
  const byToken = new Map([...map.token].map(([frameId, token]) => [token, frameId]));
  await Promise.all(
    [0, ...children].map(async (host) => {
      const tokens = await callPage(tabId, 'frame_children', {}, host).catch(() => []);
      for (const token of tokens) {
        const child = byToken.get(token);
        if (child !== undefined) map.parent.set(child, host);
      }
    }),
  );
  return children.filter((frameId) => map.parent.has(frameId));
}

export const frameToken = (tabId: number, frameId: number) => maps.get(tabId)?.token.get(frameId);
export const frameIdOfToken = (tabId: number, token: string) =>
  [...(maps.get(tabId)?.token ?? [])].find(([, t]) => t === token)?.[0];

/** [frame, its parent, …, 0]. */
function chainOf(tabId: number, frameId: number): number[] {
  const map = maps.get(tabId);
  const chain = [frameId];
  while (chain.at(-1) !== 0) {
    const parent = map?.parent.get(chain.at(-1)!);
    if (parent === undefined || chain.length > 10) {
      throw new Error(`Unknown ref in frame ${frameId}. Call read_page again.`);
    }
    chain.push(parent);
  }
  return chain;
}

/** Runs a ref operation in the frame the ref belongs to. */
export function callRef<Op extends PageOp>(
  tabId: number,
  op: Op,
  args: PageRequests[Op] & { ref: string },
): Promise<PageResults[Op]> {
  const { frameId, ref } = splitRef(args.ref);
  if (frameId !== 0) chainOf(tabId, frameId);
  return callPage(tabId, op, { ...args, ref }, frameId);
}

/** Center of the element behind `ref` in the top viewport, scrolling every frame on the way. */
export async function locateRef(tabId: number, fullRef: string, focus = false): Promise<Point> {
  const { frameId, ref } = splitRef(fullRef);
  if (frameId === 0) return callPage(tabId, 'locate', { ref, focus });
  const chain = chainOf(tabId, frameId);
  const tokenOf = (child: number) => maps.get(tabId)!.token.get(child)!;
  // Bring each iframe into view, outermost first, then the element inside the innermost one.
  for (let i = chain.length - 1; i > 0; i--) {
    await callPage(tabId, 'frame_rect', { token: tokenOf(chain[i - 1]!), scroll: true }, chain[i]);
  }
  const point = await callPage(tabId, 'locate', { ref, focus }, frameId);
  let { x, y } = point;
  for (let i = 1; i < chain.length; i++) {
    const offset = await callPage(
      tabId,
      'frame_rect',
      { token: tokenOf(chain[i - 1]!), scroll: false },
      chain[i],
    );
    x += offset.x;
    y += offset.y;
  }
  return { x: Math.round(x), y: Math.round(y) };
}

/** Indent a frame's tree under its iframe line and give its refs the frame prefix. */
export function spliceFrames(
  top: string,
  trees: Map<number, string>,
  frameOfToken: (token: string) => number | undefined,
): string {
  const render = (text: string, depth: number): string =>
    text
      .split('\n')
      .flatMap((line) => {
        const token = / frame=(\S+)$/.exec(line)?.[1];
        const child = token === undefined ? undefined : frameOfToken(token);
        const tree = child === undefined ? undefined : trees.get(child);
        const shown = token === undefined ? line : line.replace(/ frame=\S+$/, '');
        if (tree === undefined || depth > 5) return [shown];
        const indent = /^ */.exec(line)![0] + '  ';
        const inner = render(tree.replace(/\[(e\d+)\]/g, `[f${child}$1]`), depth + 1);
        return [shown, ...inner.split('\n').map((l) => indent + l)];
      })
      .join('\n');
  return render(top, 0);
}
