interface BrandMarkProps {
  size?: number;
  className?: string;
}

/** One frame in elevation: a square panel with two fibre runs crossing it. */
export function BrandMark({ size = 22, className }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="20" strokeWidth="2.5" />
      <path d="M2 8.5C11 8.5 15.5 13 15.5 22" strokeWidth="1.5" />
      <path d="M8.5 2C8.5 11 13 15.5 22 15.5" strokeWidth="1.5" />
    </svg>
  );
}
