import type { ReactNode } from 'react';

/** The white rounded panel the screens are built from: soft border, barely-there shadow. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-line-soft bg-card p-6 shadow-[0_1px_2px_rgba(20,40,72,0.05)] ${className}`.trim()}
    >
      {children}
    </div>
  );
}
