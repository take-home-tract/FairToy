import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, setSignedOutHandler, tokenStore, type Me } from './api'

interface Auth {
  /** True when there is a token. Whether it is still valid is the API's call. */
  signedIn: boolean
  /** The signed-in user and their Finisher, once loaded. */
  me: Me | undefined
  signIn: (username: string, password: string) => Promise<void>
  signOut: () => void
  /**
   * Which sign-in is current. It changes on every sign-in and sign-out, so
   * anything tied to one user (a pending Undo) can tell that the user changed.
   */
  session: number
  /** The current session, read at call time (for callbacks that outlive a render). */
  currentSession: () => number
}

const AuthContext = createContext<Auth | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [token, setToken] = useState<string | null>(() => tokenStore.get())
  const [session, setSession] = useState(0)
  const sessionRef = useRef(0)
  const nextSession = useCallback(() => {
    sessionRef.current += 1
    setSession(sessionRef.current)
  }, [])
  const currentSession = useCallback(() => sessionRef.current, [])

  // Everything cached belongs to the user who loaded it. Whenever the user
  // changes, the cache is emptied so nothing of one Finisher is ever shown to another.
  const signOut = useCallback(() => {
    tokenStore.clear()
    setToken(null)
    queryClient.clear()
    nextSession()
  }, [queryClient, nextSession])

  const signIn = useCallback(
    async (username: string, password: string) => {
      const result = await api.login(username, password)
      queryClient.clear()
      tokenStore.set(result.token)
      queryClient.setQueryData<Me>(['me'], { user: result.user, finisher: result.finisher })
      setToken(result.token)
      nextSession()
    },
    [queryClient, nextSession],
  )

  // The API answered 401 to a request: the token expired or the API restarted.
  useEffect(() => {
    setSignedOutHandler(signOut)
    return () => setSignedOutHandler(() => {})
  }, [signOut])

  const me = useQuery({ queryKey: ['me'], queryFn: api.me, enabled: token !== null, staleTime: Infinity })

  const value = useMemo<Auth>(
    () => ({ signedIn: token !== null, me: me.data, signIn, signOut, session, currentSession }),
    [token, me.data, signIn, signOut, session, currentSession],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): Auth {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth must be used inside AuthProvider')
  return auth
}
