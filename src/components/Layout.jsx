import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

const NAV = [
  { to: '/', label: 'Dashboard', ownerOnly: true },
  { to: '/ads', label: 'Ad Performance', ownerOnly: true },
  { to: '/launcher', label: 'Campaign Launcher', ownerOnly: true },
  { to: '/influencers', label: 'Influencers', ownerOnly: false }
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const isOwner = user?.role === 'owner'
  const items = NAV.filter(item => isOwner || !item.ownerOnly)

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-gray-950 text-white">
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-6 border-b border-gray-800">
          <h1 className="text-lg font-bold tracking-wide" style={{ color: '#B8963E' }}>kāre</h1>
          <p className="text-xs text-gray-500 mt-1">Command Center</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {items.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-800">
          <p className="text-xs text-gray-500 truncate">{user?.name || user?.email}</p>
          <p className="text-[11px] text-gray-600 capitalize mb-2">{user?.role}</p>
          <button
            onClick={handleLogout}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
