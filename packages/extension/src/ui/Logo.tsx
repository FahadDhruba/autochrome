type Props = { size?: number };

/**
 * The autochrome mark, drawn with `currentColor` so it is dark in light mode and light in dark
 * mode. The pointer is cut out of the window with the page background. Keep in sync with
 * scripts/icons/glyph.svg.
 */
export default function Logo({ size = 22 }: Props) {
  return (
    <svg
      className="logo"
      viewBox="0 0 128 128"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="10" y="16" width="92" height="80" rx="14" stroke="currentColor" strokeWidth="10" />
      <path d="M10 40 H102" stroke="currentColor" strokeWidth="10" />
      <circle cx="26" cy="28" r="4" fill="currentColor" />
      <circle cx="40" cy="28" r="4" fill="currentColor" />
      <path d="M46 52 L51 66 L65 71 L51 76 L46 90 L41 76 L27 71 L41 66 Z" fill="currentColor" />
      <path
        d="M66 62 L120 82 L95 92 L85 118 Z"
        fill="currentColor"
        stroke="var(--bg)"
        strokeWidth="9"
        strokeLinejoin="round"
        paintOrder="stroke"
      />
    </svg>
  );
}
