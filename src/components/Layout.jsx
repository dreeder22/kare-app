import { Outlet, NavLink } from 'react-router-dom'

export default function Layout() {
  return (
    <div className="flex h-screen bg-gray-950 text-white">
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-6 border-b border-gray-800">
          <h1 className="text-lg font-bold tracking-wide" style={{color: '#B8963E'}}>kāre</h1>
          <p className="text-xs text-gray-500 mt-1">Command Center</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          <NavLink to="/" end className={({isActive}) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
            Dashboard
          </NavLink>
          <NavLink to="/ads" className={({isActive}) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
            Ad Performance
          </NavLink>
          <NavLink to="/launcher" className={({isActive}) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
            Campaign Launcher
          </NavLink>
          <NavLink to="/influencers" className={({isActive}) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
            Influencers
          </NavLink>
        </nav>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
