import type { ReactNode } from 'react';

/**
 * The top of every screen: a large title, one line saying what the screen is for, and room on the right
 * for the screen's own controls (a search box, the main buttons). Every module uses it, so every screen
 * starts the same way.
 */
export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-navy-900 sm:text-[32px]">
          {title}
        </h1>
        {subtitle ? <p className="mt-1 text-[15px] text-ink-soft">{subtitle}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-3">{children}</div> : null}
    </header>
  );
}
