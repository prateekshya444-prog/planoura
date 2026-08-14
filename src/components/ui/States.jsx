import React from 'react';
import { friendlyError } from '../../lib/utils';

export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div role="alert" className="mt-6 border border-red-900/15 bg-red-50/80 px-4 py-3 text-sm text-red-950">
      {friendlyError(message)}
    </div>
  );
}

export function EmptyState({ icon: Icon, eyebrow, title, description, action }) {
  return (
    <div className="surface-quiet py-10 px-6 text-center md:py-14">
      {Icon && <Icon className="mx-auto h-6 w-6 text-teal" aria-hidden />}
      {eyebrow && <p className="mt-6 text-eyebrow text-teal-muted">{eyebrow}</p>}
      <h2 className="mt-3 font-serif text-2xl font-medium text-ink">{title}</h2>
      {description && <p className="mx-auto mt-3 max-w-md text-body text-mist">{description}</p>}
      {action && <div className="mt-8 flex justify-center">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = 'One moment…', className = '' }) {
  return (
    <div className={`flex items-center gap-3 py-8 text-sm text-mist ${className}`} role="status" aria-live="polite">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-teal/20 border-t-teal" />
      {label}
    </div>
  );
}

export function StatCard({ label, value, accent, last }) {
  return (
    <div className={`px-4 py-5 md:px-5 ${!last ? 'border-b border-teal/10 md:border-b-0 md:border-r' : ''}`}>
      <p className="text-eyebrow text-taupe">{label}</p>
      <p className={`mt-2 font-serif text-2xl md:text-[1.65rem] ${accent ? 'text-teal' : 'text-ink'}`}>{value}</p>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/20 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="surface w-full max-w-md p-6 motion-safe:animate-fade-in">
        <h2 id="confirm-title" className="font-serif text-xl text-ink">{title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-mist">{message}</p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className="btn btn-secondary w-full sm:w-auto">Cancel</button>
          <button type="button" onClick={onConfirm} className="btn btn-destructive w-full sm:w-auto">{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
