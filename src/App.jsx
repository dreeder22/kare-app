import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Ads from './pages/Ads'
import Launcher from './pages/Launcher'
import Influencers from './pages/Influencers'
import Login from './pages/Login'
import Sign from './pages/Sign'

// Pages the outreach role may open. Everything else needs the owner role.
const OUTREACH_ROUTES = new Set(['/influencers'])

function RequireAuth({ children, ownerOnly }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-400 flex items-center justify-center text-sm">
        Loading…
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (ownerOnly && user.role !== 'owner' && !OUTREACH_ROUTES.has(location.pathname)) {
    return <Navigate to="/influencers" replace />
  }
  return children
}

function AppRoutes() {
  const { user, loading } = useAuth()
  return (
    <Routes>
      {/* Public: creator e-sign page, no login required */}
      <Route path="/sign/:campaignId" element={<Sign />} />
      <Route
        path="/login"
        element={loading ? null : user ? <Navigate to="/" replace /> : <Login />}
      />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="ads" element={<RequireAuth ownerOnly><Ads /></RequireAuth>} />
        <Route path="launcher" element={<RequireAuth ownerOnly><Launcher /></RequireAuth>} />
        <Route path="influencers" element={<Influencers />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
