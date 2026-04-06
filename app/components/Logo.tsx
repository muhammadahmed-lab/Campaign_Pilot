import React from 'react';

interface LogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
}

export default function Logo({ size = 32, className = '', showText = false }: LogoProps) {
  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="text-white shrink-0"
      >
        <path
          d="M16 3L3 27L16 21L29 27L16 3Z"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M16 21V3"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {showText && (
        <span className="font-heading font-bold tracking-tight" style={{ fontSize: size * 0.75 }}>
          <span className="text-white">Campaign</span>
          <span className="text-cp-grey">Pilot</span>
        </span>
      )}
    </div>
  );
}
