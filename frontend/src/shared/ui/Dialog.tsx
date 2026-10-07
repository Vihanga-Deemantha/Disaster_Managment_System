import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '@/shared/i18n/I18nProvider';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Where Tab should go instead of leaving the dialog: wrap from the last control to the first, and back. */
function wrapTarget(
  items: HTMLElement[],
  active: Element | null,
  panel: HTMLElement,
  backwards: boolean,
) {
  const [first, last] = [items[0], items[items.length - 1]];
  if (backwards) return active === first || active === panel ? last : undefined;
  return active === last ? first : undefined;
}

/**
 * Keyboard behaviour of an open dialog: Esc closes it (when allowed) and Tab never leaves it.
 * Attached as a native listener so the dialog element itself needs no interaction handlers.
 */
function useDialogKeyboard(
  panel: RefObject<HTMLDivElement | null>,
  open: boolean,
  onEscape: () => void,
) {
  const escape = useRef(onEscape);
  escape.current = onEscape;

  useEffect(() => {
    const element = panel.current;
    if (!open || !element) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        escape.current();
      } else if (event.key === 'Tab') {
        const items = [...element.querySelectorAll<HTMLElement>(FOCUSABLE)];
        const target = wrapTarget(items, document.activeElement, element, event.shiftKey);
        if (target) {
          event.preventDefault();
          target.focus();
        }
      }
    };
    element.addEventListener('keydown', onKeyDown);
    return () => element.removeEventListener('keydown', onKeyDown);
  }, [panel, open]);
}

export interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Buttons row, e.g. Cancel and Confirm. */
  footer?: ReactNode;
  /** Mass-alert confirmations should NOT close on a stray click outside. Default: false. */
  closeOnBackdrop?: boolean;
  /** When false there is no × and Esc does nothing: the person must pick one of the buttons. */
  dismissible?: boolean;
}

/**
 * Keyboard-accessible modal dialog: focus moves in, Tab stays inside, Esc closes, and focus returns
 * to whatever opened it. Used for every confirmation (HCI-04a) and reject dialog (A3).
 */
export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
  closeOnBackdrop = false,
  dismissible = true,
}: DialogProps) {
  const t = useT();
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel.current)?.focus();
    return () => opener?.focus?.();
  }, [open]);
  useDialogKeyboard(panel, open, () => {
    if (dismissible) onClose();
  });

  if (!open) return null;

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/70 p-4"
      onMouseDown={(event) => {
        if (dismissible && closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-card p-6 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-bold text-navy-900">
            {title}
          </h2>
          {dismissible ? (
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="rounded p-1 text-ink-soft hover:bg-accent-100"
            >
              <span aria-hidden="true">×</span>
            </button>
          ) : null}
        </div>
        <div className="space-y-4 text-sm text-ink">{children}</div>
        {footer ? <div className="mt-6 flex flex-wrap justify-end gap-3">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
