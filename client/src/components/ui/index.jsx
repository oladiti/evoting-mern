import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { photoUrl } from '../../lib/format';

export function Spinner({ size = 24, className = '' }) {
  return (
    <svg className={`animate-spin text-current ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="loading">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function FullLoader({ text = 'Loading...' }) {
  // Portalled for the same reason as Modal: rendered from inside a route outlet
  // whose motion.div carries a transform, the `fixed` overlay would cover and
  // centre on the outlet box rather than the viewport.
  return createPortal(
    <div className="fixed inset-0 z-[90] bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 rounded-full bg-brand-gradient animate-pulse" />
      <p className="text-primary-700 dark:text-primary-400 font-medium text-sm">{text}</p>
    </div>,
    document.body
  );
}

/**
 * Portalled to <body> on purpose. Every layout in this app renders its route
 * outlet through a framer-motion <motion.div>, and a transform on an ancestor
 * makes that element the containing block for `position: fixed` descendants. A
 * modal rendered in place is therefore sized to the outlet instead of the
 * viewport, so its overlay's overflow-y-auto has nothing to scroll and long
 * forms like Edit Election cannot reach their lower fields. Escaping to <body>
 * makes `fixed` viewport-relative again.
 *
 * The panel is additionally capped to the viewport and scrolls its own body
 * rather than relying on the overlay to scroll, so the header and the
 * Cancel/Save footer stay put and remain reachable at any content length.
 * min-h-0 is load-bearing: a flex child defaults to min-height:auto, which would
 * stop the body shrinking and disable scrolling entirely.
 */
export function Modal({ open, onClose, title, children, footer = null }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto overscroll-contain p-3 sm:items-center sm:p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className="relative card w-full max-w-lg p-4 my-auto sm:p-6 max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col">
        <div className="flex items-start justify-between gap-3 mb-4 shrink-0">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 break-anywhere">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="-mt-1 -mr-1 w-9 h-9 shrink-0 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:text-slate-200 text-2xl leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          >
            &times;
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain min-h-0 flex-1 -mx-1 px-1">{children}</div>
        {footer && <div className="mt-6 flex flex-wrap justify-end gap-2 sm:gap-3 border-t border-slate-100 dark:border-slate-700 pt-4 shrink-0">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export function Badge({ tone = 'gray', className = '', children }) {
  const tones = {
    green: 'bg-success-500/15 text-success-600 dark:text-success-400',
    red: 'bg-danger-500/15 text-danger-600 dark:text-danger-400',
    amber: 'bg-warning-500/15 text-warning-600 dark:text-warning-400',
    blue: 'bg-info-500/15 text-info-600 dark:text-info-400',
    cyan: 'bg-primary-500/15 text-primary-700 dark:text-primary-400',
    purple: 'bg-accent-500/15 text-accent-600 dark:text-accent-700',
    gray: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  };
  return <span className={`badge ${tones[tone] || tones.gray} ${className}`}>{children}</span>;
}

export function StatCard({ icon, label, value, gradient = 'bg-brand-gradient' }) {
  return (
    <div className="card p-4 sm:p-5 flex items-center gap-3 sm:gap-4">
      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl ${gradient} flex items-center justify-center text-white text-lg sm:text-xl shrink-0`}>
        <i className={icon} />
      </div>
      <div className="min-w-0">
        <div className="text-xl sm:text-2xl font-extrabold text-slate-800 dark:text-slate-100 break-anywhere">{value}</div>
        <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 break-anywhere">{label}</div>
      </div>
    </div>
  );
}

/**
 * Shared admin page header. The title shrinks and the action slot drops to its
 * own full-width line on phones, which is what every admin page needs but each
 * was previously hand-rolling (and getting wrong on narrow screens).
 */
export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-800 dark:text-slate-100 break-anywhere">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 break-anywhere">{subtitle}</p>}
      </div>
      {children ? <div className="page-actions shrink-0">{children}</div> : null}
    </div>
  );
}

export function EmptyState({ icon = 'fa fa-inbox', title = 'Nothing here', subtitle = '' }) {
  return (
    <div className="text-center py-16 text-slate-400 dark:text-slate-500">
      <i className={`${icon} text-5xl mb-4`} />
      <p className="font-semibold text-slate-500 dark:text-slate-400">{title}</p>
      {subtitle && <p className="text-sm mt-1">{subtitle}</p>}
    </div>
  );
}

export function CandidatePhoto({ photo, name, size = 'w-20 h-20', className = '' }) {
  const url = photo ? photoUrl(photo) : null;
  if (!url) {
    return <div className={`${size} rounded-full bg-brand-gradient flex items-center justify-center text-white text-2xl font-bold ${className}`}>{(name || '?').charAt(0).toUpperCase()}</div>;
  }
  return (
    <img
      src={url}
      alt={name}
      className={`${size} rounded-full object-cover border-4 border-slate-100 dark:border-slate-700 ${className}`}
      onError={(e) => {
        e.currentTarget.style.display = 'none';
        console.log('image-fallback', name);
      }}
    />
  );
}
