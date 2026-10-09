import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'onDark';
export type ButtonSize = 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent-600 text-white hover:bg-accent-700',
  secondary: 'border border-navy-800 bg-white text-navy-900 hover:bg-navy-900 hover:text-white',
  danger: 'bg-danger-600 text-white hover:bg-red-800',
  ghost: 'text-navy-900 hover:bg-accent-100',
  /** For buttons sitting on a photo or on navy. */
  onDark: 'border-[1.5px] border-white/50 text-white hover:bg-white/10',
};

const SIZES: Record<ButtonSize, string> = {
  md: 'min-h-11 px-4 py-2 text-sm sm:px-5',
  lg: 'min-h-13 px-6 py-3 text-[15px]',
};

/** The look of a button, so a link that acts like one (`<Link>`) can share it exactly. */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  extra = '',
): string {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-[10px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60';
  return `${base} ${SIZES[size]} ${VARIANTS[variant]} ${extra}`.trim();
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
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
  size = 'md',
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
      className={buttonClasses(variant, size, className)}
      {...rest}
    >
      <Label loading={loading} loadingLabel={loadingLabel}>
        {children}
      </Label>
    </button>
  );
}
