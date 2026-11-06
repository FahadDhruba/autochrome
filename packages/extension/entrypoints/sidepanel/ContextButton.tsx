import { useCallback, useRef, useState } from 'react';
import { AppWindow, FileText, Image, Plus } from 'lucide-react';
import type { ContextPart } from '@/src/agent/protocol';
import type { ContextKind } from '@/src/context';
import IconButton from '@/src/ui/IconButton';
import { useDismiss } from '@/src/ui/useDismiss';

const ITEMS: { kind: ContextKind; label: string; icon: typeof FileText }[] = [
  { kind: 'page', label: 'This page', icon: FileText },
  { kind: 'tabs', label: 'My open tabs', icon: AppWindow },
  { kind: 'screenshot', label: 'Screenshot of this page', icon: Image },
];

type Props = { onAdd: (part: ContextPart) => void; onError: (message: string) => void };

/** Adds the current page, the open tabs or a screenshot to the next message. */
export default function ContextButton({ onAdd, onError }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, root, trigger);

  const add = async (kind: ContextKind) => {
    setOpen(false);
    const reply = (await browser.runtime.sendMessage({ type: 'autochrome:context', kind })) as
      { ok: true; part: ContextPart } | { ok: false; error: string };
    if (reply.ok) onAdd(reply.part);
    else onError(reply.error);
  };

  return (
    <div className="menu-wrap" ref={root}>
      <IconButton
        buttonRef={trigger}
        label="Add context"
        icon={Plus}
        size={16}
        align="end"
        expanded={open}
        onClick={() => setOpen(!open)}
      />
      {open && (
        <div className="menu menu-up" role="menu" aria-label="Add context">
          {ITEMS.map(({ kind, label, icon: Icon }) => (
            <button
              key={kind}
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => void add(kind)}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
