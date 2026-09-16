import type { SVGProps } from 'react';

export const MONK_COLORS = ['#52794d', '#a8753e', '#577b99', '#95649a'];
export const MONK_LABELS = ['园丁', '酒窖', '学者', '管家'];

/** Four monk portraits share a silhouette but differ in clothing and facial features. */
export function MonkIcon({
  monk,
  size = 24,
  strokeWidth = 1.7,
  ...props
}: SVGProps<SVGSVGElement> & { monk: number; size?: number | string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {/* Robe and shoulders keep every variant recognisably human. */}
      <path d="M3 22v-2c0-3 3-5 6-5m6 0c3 0 6 2 6 5v2" />
      {monk === 0 && (
        <>
          {/* Gardener: a pointed hood framing a clean-shaven face. */}
          <path d="M5 15V9c0-4 3-6 7-8 4 2 7 4 7 8v6l-4 3-3-2-3 2Z" />
          <path d="M8 8c2 0 3-1 4-2 1 1 2 2 4 2v3a4 4 0 0 1-8 0Z" />
          <path d="M10 10h.1m3.8 0h.1M11 13h2M12 18v4" />
        </>
      )}
      {monk === 1 && (
        <>
          {/* Cellarer: broad tonsured head and a full, pointed beard. */}
          <path d="M6 9V7a6 6 0 0 1 12 0v5l-2 4-4 3-4-3-2-4Z" />
          <path d="M6 7l2 1 1-2m6 0 1 2 2-1M8 11l2 1 2-1 2 1 2-1M9 9h.1m5.8 0h.1M10 15l2 2 2-2M8 19l4 3 4-3" />
        </>
      )}
      {monk === 2 && (
        <>
          {/* Scholar: round spectacles and a high robe collar. */}
          <path d="M6 9V7a6 6 0 0 1 12 0v4a6 6 0 0 1-12 0M7 5h10" />
          <circle cx="9" cy="9" r="2.2" />
          <circle cx="15" cy="9" r="2.2" />
          <path d="M11.2 9h1.6M11 14h2M8 17l4 3 4-3M12 20v2" />
        </>
      )}
      {monk === 3 && (
        <>
          {/* Steward: flat cap, moustache and a small pendant. */}
          <path d="M6 7V4l6-2 6 2v3M5 7h14M7 7v4a5 5 0 0 0 10 0V7" />
          <path d="M9 9h.1m5.8 0h.1M9 12l3-1 3 1M10 14h4M9 17l3 3 3-3" />
          <circle cx="12" cy="21" r="1" />
        </>
      )}
    </svg>
  );
}

/** Brewer wears a tall work cap and apron, distinct from the four monks. */
export function BrewerIcon({
  size = 24,
  ...props
}: SVGProps<SVGSVGElement> & { size?: number | string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M7 7V3l5-2 5 2v4M6 7h12M7 8v3a5 5 0 0 0 10 0V8M9 10h.1m5.8 0h.1M10 14h4M3 22v-2c0-3 3-5 6-5m6 0c3 0 6 2 6 5v2M8 17v5h8v-5M10 20h4" />
    </svg>
  );
}
