import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, setSignedOutHandler, tokenStore, type Me } from './api'

interface Auth {
  /** True when there is a token. Whether it is still valid is the API's call. */
  signedIn: boolean
  /** The signed-in user and their Finisher, once loaded. */
  me: Me | undefined
  signIn: (username: string, password: string) => Promise<void>
  signOut: () => void
}

const AuthContext = createContext<Auth | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [token, setToken] = useState<string | null>(() => tokenStore.get())

  // Everything cached belongs to the user who loaded it. Whenever the user
  // changes, the cache is emptied so nothing of one Finisher is ever shown to another.
  const signOut = useCallback(() => {
    tokenStore.clear()
    setToken(null)
    queryClient.clear()
  }, [queryClient])

  const signIn = useCallback(
    async (username: string, password: string) => {
      const result = await api.login(username, password)
      queryClient.clear()
      tokenStore.set(result.token)
      queryClient.setQueryData<Me>(['me'], { user: result.user, finisher: result.finisher })
      setToken(result.token)
    },
    [queryClient],
  )

  // The API answered 401 to a request: the token expired or the API restarted.
  useEffect(() => {
    setSignedOutHandler(signOut)
    return () => setSignedOutHandler(() => {})
  }, [signOut])

  const me = useQuery({ queryKey: ['me'], queryFn: api.me, enabled: token !== null, staleTime: Infinity })

  const value = useMemo<Auth>(
    () => ({ signedIn: token !== null, me: me.data, signIn, signOut }),
    [token, me.data, signIn, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): Auth {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth must be used inside AuthProvider')
  return auth
}
