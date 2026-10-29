import type { ReactNode } from 'react';
import './empty-state.css';

type Props = {
  /** The icon or logo shown above the line. */
  visual: ReactNode;
  children: ReactNode;
  /** Buttons or chips under the line. */
  actions?: ReactNode;
  testId?: string;
};

/** The shared look of every "nothing here yet" screen: a mark, one line, and what to do next. */
export default function EmptyState({ visual, children, actions, testId }: Props) {
  return (
    <div className="empty-state" data-testid={testId}>
      <div className="empty-visual" aria-hidden="true">
        {visual}
      </div>
      <p className="empty-line">{children}</p>
      {actions && <div className="empty-actions">{actions}</div>}
    </div>
  );
}
