import { useState } from 'react'
import type { Finding } from '../api'
import { useFindingActions } from '../findings'
import { formatDate } from '../format'
import { FlagDialog } from './FlagDialog'

/** The finding state of a supplier, in words. */
export function FindingState({ finding }: { finding: Finding | null }) {
  if (!finding) return <span className="muted">None</span>
  return (
    <>
      <span className="tag-finding">Finding</span> {formatDate(finding.recordedAt)}
      <span className="muted"> by {finding.recordedBy}</span>
    </>
  )
}

/** "Flag supplier" (with the confirmation dialog) or "Withdraw finding", depending on the state. */
export function FindingButton({ supplier, flagged }: { supplier: { id: number; name: string }; flagged: boolean }) {
  const [asking, setAsking] = useState(false)
  const { withdraw } = useFindingActions()

  if (flagged) {
    return (
      <button
        type="button"
        disabled={withdraw.isPending}
        onClick={() => {
          setAsking(false)
          withdraw.mutate(supplier)
        }}
      >
        {withdraw.isPending ? 'Withdrawing…' : 'Withdraw finding'}
      </button>
    )
  }
  return (
    <>
      <button type="button" onClick={() => setAsking(true)}>
        Flag supplier
      </button>
      {asking && <FlagDialog supplier={supplier} onClose={() => setAsking(false)} />}
    </>
  )
}
