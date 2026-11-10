import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router'
import { useAuth } from './auth'
import { AppShell } from './components/AppShell'
import { EmptyState } from './components/States'
import { LoginPage } from './pages/LoginPage'
import { ToysPage } from './pages/ToysPage'

// No URL names a Finisher: it always comes from the sign-in (docs/ux.md).
export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<SignedIn />}>
        <Route path="/" element={<Navigate to="/toys" replace />} />
        <Route path="/toys" element={<ToysPage />} />
        <Route path="*" element={<EmptyState title="Page not found" />} />
      </Route>
    </Routes>
  )
}

/** Everything inside needs a sign-in. Without one, go to the sign-in page and come back afterwards. */
function SignedIn() {
  const { signedIn } = useAuth()
  const location = useLocation()
  if (!signedIn) return <Navigate to="/login" replace state={{ from: location }} />
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
