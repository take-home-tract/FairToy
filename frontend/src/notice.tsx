import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { useAuth } from './auth'

/** A short confirmation at the bottom of the screen, optionally with one action (Undo). */
export interface Notice {
  text: string
  action?: { label: string; run: () => void }
}

interface NoticeApi {
  notice: Notice | null
  /**
   * Show a notice. `session` is the sign-in the change was made in (read when
   * the change started); a notice from an earlier sign-in is dropped.
   */
  show: (notice: Notice, session?: number) => void
  dismiss: () => void
}

const NoticeContext = createContext<NoticeApi | null>(null)

const VISIBLE_FOR_MS = 12_000

/**
 * A notice belongs to the sign-in it was made in. Its Undo acts on a record of
 * that user's Finisher, by id; after a sign-out or another sign-in the same id
 * would name a different record in another Finisher's database. So a notice is
 * never shown, and its Undo never offered, once the session has changed.
 */
export function NoticeProvider({ children }: { children: ReactNode }) {
  const { session, currentSession } = useAuth()
  const [state, setState] = useState<{ notice: Notice; session: number } | null>(null)

  const show = useCallback(
    (next: Notice, madeIn = currentSession()) => {
      if (madeIn !== currentSession()) return
      setState({ notice: next, session: madeIn })
    },
    [currentSession],
  )
  const dismiss = useCallback(() => setState(null), [])

  // Discard the notice of an earlier sign-in.
  useEffect(() => {
    setState((current) => (current && current.session !== session ? null : current))
  }, [session])

  useEffect(() => {
    if (!state) return
    const timer = setTimeout(() => setState(null), VISIBLE_FOR_MS)
    return () => clearTimeout(timer)
  }, [state])

  // Checked while rendering too, so there is not even one frame with an old Undo.
  const notice = state && state.session === session ? state.notice : null
  const value = useMemo(() => ({ notice, show, dismiss }), [notice, show, dismiss])
  return <NoticeContext.Provider value={value}>{children}</NoticeContext.Provider>
}

export function useNotice(): NoticeApi {
  const api = useContext(NoticeContext)
  if (!api) throw new Error('useNotice must be used inside NoticeProvider')
  return api
}

export function NoticeBar() {
  const { notice, dismiss } = useNotice()
  // Still there after moving to another page: undo stays one click away.
  useLocation()
  if (!notice) return null
  return (
    <div className="notice" role="status">
      <span>{notice.text}</span>
      {notice.action && (
        <button
          type="button"
          className="link-button"
          onClick={() => {
            dismiss()
            notice.action!.run()
          }}
        >
          {notice.action.label}
        </button>
      )}
      <button type="button" className="link-button notice-close" aria-label="Dismiss" onClick={dismiss}>
        ×
      </button>
    </div>
  )
}
