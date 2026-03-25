import { NavLink } from 'react-router-dom';

const navLinks = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/signals', label: 'Signals', icon: '📡' },
  { to: '/signals/new', label: 'Add Signal', icon: '➕' },
  { to: '/watchlist', label: 'Watch List', icon: '👀' },
  { to: '/external-search', label: 'External Search', icon: '📰' },
];

export default function Navbar() {
  return (
    <aside className="w-56 bg-slate-900 text-slate-100 flex flex-col h-full shrink-0">
      <div className="px-6 py-5 border-b border-slate-700">
        <h1 className="text-lg font-bold text-white tracking-tight">Signal Scanner</h1>
        <p className="text-xs text-slate-400 mt-0.5">Intelligence Platform</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navLinks.map(link => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <span>{link.icon}</span>
            {link.label}
          </NavLink>
        ))}
      </nav>
      <div className="px-6 py-4 border-t border-slate-700">
        <p className="text-xs text-slate-500">v1.0.0</p>
      </div>
    </aside>
  );
}
