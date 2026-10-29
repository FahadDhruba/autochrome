import type { ComponentType, MouseEventHandler } from 'react';
import type { LucideProps } from 'lucide-react';
import Tooltip, { type TipAlign } from './Tooltip';
import './icon-button.css';

type Props = {
  label: string;
  icon: ComponentType<LucideProps>;
  /** Renders a link instead of a button. */
  href?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  disabled?: boolean;
  active?: boolean;
  tone?: 'default' | 'danger';
  align?: TipAlign;
  type?: 'button' | 'submit';
  size?: number;
};

/** An icon-only button or link. `label` is both its accessible name and its hover/focus tooltip. */
export default function IconButton({
  label,
  icon: Icon,
  href,
  onClick,
  disabled,
  active,
  tone = 'default',
  align,
  type = 'button',
  size = 18,
}: Props) {
  const className = `icon-btn${active ? ' icon-btn-active' : ''}${tone === 'danger' ? ' icon-btn-danger' : ''}`;
  const icon = <Icon size={size} strokeWidth={2} aria-hidden="true" />;
  return (
    <Tooltip label={label} align={align}>
      {href ? (
        <a
          className={className}
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label={label}
          onClick={onClick}
        >
          {icon}
        </a>
      ) : (
        <button
          type={type}
          className={className}
          aria-label={label}
          aria-current={active ? 'page' : undefined}
          disabled={disabled}
          onClick={onClick}
        >
          {icon}
        </button>
      )}
    </Tooltip>
  );
}
