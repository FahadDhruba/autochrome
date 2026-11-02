import { useCallback, useRef, useState, type ComponentType } from 'react';
import { CalendarClock, History, Menu, Settings, Workflow, type LucideProps } from 'lucide-react';
import IconButton from '@/src/ui/IconButton';
import { useDismiss } from '@/src/ui/useDismiss';

export type MenuView = 'workflows' | 'schedules' | 'runs' | 'settings';

const ITEMS: { view: MenuView; label: string; icon: ComponentType<LucideProps> }[] = [
  { view: 'workflows', label: 'Workflows', icon: Workflow },
  { view: 'schedules', label: 'Schedules', icon: CalendarClock },
  { view: 'runs', label: 'Runs', icon: History },
  { view: 'settings', label: 'Settings', icon: Settings },
];

type Props = { active?: MenuView; onSelect: (view: MenuView) => void };

/** The views besides the chat, behind one menu button so the header stays calm. */
export default function HeaderMenu({ active, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, root, trigger);

  return (
    <div className="menu-wrap" ref={root}>
      <IconButton
        buttonRef={trigger}
        label="Menu"
        icon={Menu}
        align="end"
        active={open || active !== undefined}
        expanded={open}
        onClick={() => setOpen(!open)}
      />
      {open && (
        <div className="menu" role="menu" aria-label="Menu">
          {ITEMS.map(({ view, label, icon: Icon }) => (
            <button
              key={view}
              type="button"
              role="menuitem"
              className={`menu-item${active === view ? ' menu-item-active' : ''}`}
              aria-current={active === view ? 'page' : undefined}
              onClick={() => {
                setOpen(false);
                onSelect(view);
              }}
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
