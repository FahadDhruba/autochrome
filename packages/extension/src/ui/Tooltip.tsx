import type { ReactNode } from 'react';

/** Where the tooltip sits under its control. Use start/end near the left/right panel edge. */
export type TipAlign = 'center' | 'start' | 'end';

type Props = { label: string; align?: TipAlign; children: ReactNode };

/**
 * Shows `label` under its child on hover and keyboard focus (CSS only). It is hidden from
 * assistive technology: the control carries the same text as its `aria-label`.
 */
export default function Tooltip({ label, align = 'center', children }: Props) {
  return (
    <span className="tip-wrap">
      {children}
      <span className={`tip tip-${align}`} aria-hidden="true">
        {label}
      </span>
    </span>
  );
}
