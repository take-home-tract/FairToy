import type { ReactNode } from 'react'

/** A quiet placeholder while a list loads, instead of a spinner over a blank page. */
export function Skeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="skeleton" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row" />
      ))}
    </div>
  )
}

/** Says what failed and offers a retry. */
export function ErrorState({ what, error, onRetry }: { what: string; error: unknown; onRetry?: () => void }) {
  const detail = error instanceof Error ? error.message : 'Unknown error.'
  return (
    <div className="state state-error" role="alert">
      <p>
        <strong>Could not load {what}.</strong> {detail}
      </p>
      {onRetry && (
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state">
      <p>
        <strong>{title}</strong>
      </p>
      {children}
    </div>
  )
}
