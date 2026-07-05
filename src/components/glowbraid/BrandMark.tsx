interface BrandMarkProps {
  size?: number;
  className?: string;
}

export function BrandMark({ size = 26, className }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 88 88"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <filter
          id="brandmark-glow-outer"
          x="-50%"
          y="-50%"
          width="200%"
          height="200%"
        >
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter
          id="brandmark-glow-mid"
          x="-50%"
          y="-50%"
          width="200%"
          height="200%"
        >
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter
          id="brandmark-glow-inner"
          x="-50%"
          y="-50%"
          width="200%"
          height="200%"
        >
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <circle
        cx="44"
        cy="44"
        r="41.5"
        fill="none"
        stroke="#ff6b9d"
        strokeWidth="5"
        filter="url(#brandmark-glow-outer)"
      />
      <circle
        cx="44"
        cy="44"
        r="29.9"
        fill="none"
        stroke="#6bd8ff"
        strokeWidth="3.6"
        filter="url(#brandmark-glow-mid)"
      />
      <circle
        cx="44"
        cy="44"
        r="19.1"
        fill="none"
        stroke="#9b8cff"
        strokeWidth="2.3"
        filter="url(#brandmark-glow-inner)"
      />
    </svg>
  );
}
