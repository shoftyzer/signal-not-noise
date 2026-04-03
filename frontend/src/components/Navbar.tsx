import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const publicLinks = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/signals', label: 'Signals', icon: '📡' },
  { to: '/watchlist', label: 'Watch List', icon: '👀' },
];

const authLinks = [
  { to: '/signals/new', label: 'Add Signal', icon: '➕' },
  { to: '/external-search', label: 'External Search', icon: '📰' },
];

export default function Navbar() {
  const { isAuthenticated, username, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/');
  }

  const links = isAuthenticated ? [...publicLinks, ...authLinks] : publicLinks;

  return (
    <aside className="w-56 bg-slate-900 text-slate-100 flex flex-col h-full shrink-0">
      <div className="px-6 py-5 border-b border-slate-700">
        <h1 className="text-lg font-bold text-white tracking-tight">Signal Scanner</h1>
        <p className="text-xs text-slate-400 mt-0.5">Intelligence Platform</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {links.map(link => (
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
      <div className="px-4 py-4 border-t border-slate-700 space-y-2">
        {isAuthenticated ? (
          <>
            <p className="text-xs text-slate-400 truncate px-1">Signed in as <span className="text-slate-200 font-medium">{username}</span></p>
            <button
              onClick={handleLogout}
              className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              🔓 Sign out
            </button>
          </>
        ) : (
          <NavLink
            to="/login"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            🔒 Sign in
          </NavLink>
        )}
        <p className="text-xs text-slate-500 px-1">v1.0.0</p>
      </div>
    </aside>
  );
}
