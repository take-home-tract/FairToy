import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import { useAuth } from '../auth'
import { NoticeBar } from '../notice'

/** The top bar: which Finisher you belong to and who you are, always visible. */
export function AppShell({ children }: { children: ReactNode }) {
  const { me, signOut } = useAuth()
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">FairToy</span>
          <span className="context">
            {me ? (
              <>
                <strong>{me.finisher.name}</strong> · {me.user.username}
              </>
            ) : (
              '…'
            )}
          </span>
          <button type="button" className="link-button" onClick={signOut}>
            Sign out
          </button>
          <nav className="tabs" aria-label="Main">
            <NavLink to="/toys">Toys</NavLink>
            <NavLink to="/suppliers">Suppliers</NavLink>
          </nav>
        </div>
      </header>
      <main className="page">{children}</main>
      <NoticeBar />
    </>
  )
}
