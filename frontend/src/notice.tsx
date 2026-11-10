import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'

/** A short confirmation at the bottom of the screen, optionally with one action (Undo). */
export interface Notice {
  text: string
  action?: { label: string; run: () => void }
}

interface NoticeApi {
  notice: Notice | null
  show: (notice: Notice) => void
  dismiss: () => void
}

const NoticeContext = createContext<NoticeApi | null>(null)

const VISIBLE_FOR_MS = 12_000

export function NoticeProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<Notice | null>(null)
  const show = useCallback((next: Notice) => setNotice(next), [])
  const dismiss = useCallback(() => setNotice(null), [])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), VISIBLE_FOR_MS)
    return () => clearTimeout(timer)
  }, [notice])

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
