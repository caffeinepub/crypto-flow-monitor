export function CircuitBackground() {
  return (
    <div
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden"
      aria-hidden="true"
    >
      <svg
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
        style={{ opacity: 0.06 }}
        role="presentation"
      >
        <title>Circuit background pattern</title>
        <defs>
          <pattern
            id="circuit"
            x="0"
            y="0"
            width="80"
            height="80"
            patternUnits="userSpaceOnUse"
          >
            <line
              x1="0"
              y1="20"
              x2="30"
              y2="20"
              stroke="#22D3EE"
              strokeWidth="1"
            />
            <line
              x1="50"
              y1="20"
              x2="80"
              y2="20"
              stroke="#22D3EE"
              strokeWidth="1"
            />
            <line
              x1="0"
              y1="60"
              x2="20"
              y2="60"
              stroke="#22D3EE"
              strokeWidth="1"
            />
            <line
              x1="60"
              y1="60"
              x2="80"
              y2="60"
              stroke="#22D3EE"
              strokeWidth="1"
            />
            <line
              x1="20"
              y1="0"
              x2="20"
              y2="15"
              stroke="#22D3EE"
              strokeWidth="1"
            />
            <line
              x1="20"
              y1="25"
              x2="20"
              y2="55"
              stroke="#22D3EE"
              strokeWidth="1"
            />
            <line
              x1="60"
              y1="25"
              x2="60"
              y2="80"
              stroke="#22D3EE"
              strokeWidth="1"
            />
            <line
              x1="40"
              y1="0"
              x2="40"
              y2="10"
              stroke="#22D3EE"
              strokeWidth="1"
            />
            <circle cx="20" cy="20" r="2" fill="#22D3EE" />
            <circle cx="60" cy="20" r="2" fill="#22D3EE" />
            <circle cx="20" cy="60" r="2" fill="#22D3EE" />
            <circle cx="60" cy="60" r="2" fill="#22D3EE" />
            <circle cx="40" cy="40" r="1.5" fill="#3B82F6" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#circuit)" />
      </svg>
    </div>
  );
}
