import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { useFindingActions } from '../findings'
import { impactOf } from '../format'

/**
 * Asks before flagging, and shows the consequence first: how many toys would
 * change (docs/ux.md, "Flag confirmation"). Only toys whose exposure would
 * change are counted.
 */
export function FlagDialog({ supplier, onClose }: { supplier: { id: number; name: string }; onClose: () => void }) {
  const { me } = useAuth()
  const { record } = useFindingActions()
  const preview = useQuery({ queryKey: ['supplier', String(supplier.id)], queryFn: () => api.supplier(supplier.id) })
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  const toys = preview.data?.toys ?? []
  const { becomeAffected, becomePossibly, unchanged } = impactOf(toys)

  async function confirm() {
    try {
      await record.mutateAsync(supplier)
    } catch {
      return // Stay open: the error is shown below, and nothing changed.
    }
    onClose()
  }

  return (
    <dialog ref={dialog} className="dialog" onClose={onClose} aria-labelledby="flag-dialog-title">
      <h2 id="flag-dialog-title">Flag {supplier.name} for child labor?</h2>

      {preview.isPending && <p className="muted">Checking which toys this would change…</p>}
      {preview.isError && (
        <p className="muted">Could not load the preview ({preview.error.message}). You can still flag the supplier.</p>
      )}
      {preview.data && (
        <div className="preview">
          <p>
            {toys.length} {toys.length === 1 ? 'toy reaches' : 'toys reach'} this supplier:
          </p>
          <ul>
            <li>
              <strong>{becomeAffected}</strong> would become Affected
            </li>
            <li>
              <strong>{becomePossibly}</strong> would become Possibly affected
            </li>
            {unchanged > 0 && (
              <li>
                <strong>{unchanged}</strong> would not change (already exposed through another finding)
              </li>
            )}
          </ul>
        </div>
      )}
      <p className="muted">Only {me?.finisher.name ?? 'your Finisher'} sees this finding.</p>

      {record.isError && (
        <p className="form-error" role="alert">
          Could not flag the supplier. {record.error.message}
        </p>
      )}

      <div className="dialog-actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="danger" disabled={record.isPending} onClick={confirm}>
          {record.isPending ? 'Flagging…' : 'Flag supplier'}
        </button>
      </div>
    </dialog>
  )
}
