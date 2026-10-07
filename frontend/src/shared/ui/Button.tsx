import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent-600 text-white hover:bg-accent-700 disabled:bg-accent-400',
  secondary: 'border border-navy-700 bg-white text-navy-800 hover:bg-navy-700 hover:text-white',
  danger: 'bg-danger-600 text-white hover:bg-red-800 disabled:opacity-60',
  ghost: 'text-navy-800 hover:bg-accent-100',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Shows a spinner and blocks repeat clicks (protects irreversible actions from double submits). */
  loading?: boolean;
  loadingLabel?: string;
}

function Label({
  loading,
  loadingLabel,
  children,
}: {
  loading: boolean;
  loadingLabel?: string;
  children: ReactNode;
}) {
  if (!loading) return <>{children}</>;
  return (
    <>
      <Spinner size="sm" />
      {loadingLabel ?? children}
    </>
  );
}

export function Button({
  variant = 'primary',
  loading = false,
  loadingLabel,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      <Label loading={loading} loadingLabel={loadingLabel}>
        {children}
      </Label>
    </button>
  );
}
