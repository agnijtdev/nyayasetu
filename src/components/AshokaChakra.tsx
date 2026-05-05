export function AshokaChakra({ size = 48, className = "" }: { size?: number; className?: string }) {
  const spokes = Array.from({ length: 24 });
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      aria-label="Ashoka Chakra"
    >
      <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="50" cy="50" r="6" fill="currentColor" />
      <g className="ashoka-spoke" style={{ transformOrigin: "50px 50px" }}>
        {spokes.map((_, i) => (
          <line
            key={i}
            x1="50" y1="50" x2="50" y2="6"
            stroke="currentColor"
            strokeWidth="1.5"
            transform={`rotate(${i * 15} 50 50)`}
          />
        ))}
      </g>
    </svg>
  );
}
