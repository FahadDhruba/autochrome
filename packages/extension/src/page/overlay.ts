/**
 * What the agent is doing, drawn on the page: an outline around the element it is about to use
 * and a thin frame around the page while it works. It lives in a closed shadow root, so page
 * reads never see it, and it ignores the pointer, so clicks go through to the page.
 */
const HOST_TAG = 'autochrome-overlay';
const BOX_MS = 1200;
const FRAME_MS = 4000;

const STYLE = `
  :host { all: initial; }
  .frame, .box { position: fixed; pointer-events: none; z-index: 2147483647; transition: opacity 0.25s ease; }
  .frame { inset: 0; box-shadow: inset 0 0 0 3px rgb(17 17 17 / 0.85), inset 0 0 0 4px rgb(255 255 255 / 0.7); }
  .label { position: absolute; top: 6px; left: 50%; transform: translateX(-50%); padding: 3px 10px;
    border-radius: 999px; background: #111; color: #fff; font: 600 11px/1.4 system-ui, sans-serif;
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.25); white-space: nowrap; }
  .box { border: 2px solid #111; border-radius: 4px; box-shadow: 0 0 0 2px #fff, 0 0 12px rgb(0 0 0 / 0.35); }
  .hidden { opacity: 0; }
`;

type Parts = { host: HTMLElement; frame: HTMLElement; box: HTMLElement };
let parts: Parts | undefined;
let boxTimer: ReturnType<typeof setTimeout> | undefined;
let frameTimer: ReturnType<typeof setTimeout> | undefined;

function ensure(): Parts {
  if (parts?.host.isConnected) return parts;
  const host = document.createElement(HOST_TAG);
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = STYLE;
  const frame = document.createElement('div');
  frame.className = 'frame hidden';
  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = 'autochrome is working';
  frame.append(label);
  const box = document.createElement('div');
  box.className = 'box hidden';
  root.append(style, frame, box);
  document.documentElement.append(host);
  parts = { host, frame, box };
  return parts;
}

/** Outline `el` briefly and show the working frame. */
export function highlight(el: Element): void {
  try {
    const { host, frame, box } = ensure();
    host.style.display = '';
    const rect = el.getBoundingClientRect();
    Object.assign(box.style, {
      left: `${rect.left - 3}px`,
      top: `${rect.top - 3}px`,
      width: `${rect.width + 6}px`,
      height: `${rect.height + 6}px`,
    });
    box.classList.remove('hidden');
    frame.classList.remove('hidden');
    clearTimeout(boxTimer);
    clearTimeout(frameTimer);
    boxTimer = setTimeout(() => box.classList.add('hidden'), BOX_MS);
    frameTimer = setTimeout(() => frame.classList.add('hidden'), FRAME_MS);
  } catch {
    // Drawing is a courtesy; never let it break the action.
  }
}

/** Hide everything at once, e.g. before a screenshot the model will look at. */
export function hideOverlay(): true {
  parts?.box.classList.add('hidden');
  parts?.frame.classList.add('hidden');
  // The opacity transition would still show it in a screenshot taken right away.
  if (parts) parts.host.style.display = 'none';
  return true;
}
