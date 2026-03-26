import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import api from '../api';
import { DashboardStats } from '../types/signal';

const STATUS_COLORS: Record<string, string> = {
  new: '#3b82f6',
  triaged: '#f59e0b',
  under_review: '#f97316',
  published: '#10b981',
  archived: '#94a3b8',
  rejected: '#ef4444',
};

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<DashboardStats>('/api/dashboard')
      .then(res => { setStats(res.data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-500">Loading dashboard...</div>;
  if (error) return <div className="flex items-center justify-center h-64 text-red-500">Error: {error}</div>;
  if (!stats) return null;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Dashboard</h2>
        <p className="text-slate-500 text-sm mt-1">Signal intelligence overview</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Signals', value: stats.summary.totalSignals, color: 'bg-indigo-600', icon: '📡' },
          { label: 'New This Week', value: stats.summary.newThisWeek, color: 'bg-blue-500', icon: '🆕' },
          { label: 'Published', value: stats.summary.published, color: 'bg-green-500', icon: '✅' },
          { label: 'Under Review', value: stats.summary.underReview, color: 'bg-orange-500', icon: '🔍' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
            <div className={`${card.color} text-white rounded-lg p-3 text-xl`}>{card.icon}</div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{card.value}</p>
              <p className="text-sm text-slate-500">{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Signals by Topic */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Signals by Topic Area</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={stats.byTopicArea} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="topic_area" tick={{ fontSize: 11 }} width={130} />
              <Tooltip />
              <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Signals by Status */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Signals by Status</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={stats.byStatus}
                dataKey="count"
                nameKey="status"
                cx="50%"
                cy="50%"
                outerRadius={90}
                label={({ status, percent }: { status: string; percent: number }) => `${status} ${(percent * 100).toFixed(0)}%`}
              >
                {stats.byStatus.map((entry) => (
                  <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || '#94a3b8'} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Signals Over Time */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Signals Over Time (Last 8 Weeks)</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={stats.signalsOverTime}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="week" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Recent Signals */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700">Recently Added</h3>
          <Link to="/signals" className="text-xs text-indigo-600 hover:underline">View all →</Link>
        </div>
        <div className="divide-y divide-slate-100">
          {stats.recentSignals.map(signal => (
            <Link key={signal.id} to={`/signals/${signal.id}`} className="flex items-center gap-3 py-3 hover:bg-slate-50 -mx-5 px-5 transition-colors">
              <span className="text-xs font-mono text-slate-400 w-8">#{signal.id}</span>
              <span className="text-sm text-slate-900 flex-1 truncate">{signal.title}</span>
              <span className="text-xs text-slate-500">{signal.topic_area}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                signal.status === 'published' ? 'bg-green-100 text-green-700' :
                signal.status === 'new' ? 'bg-blue-100 text-blue-700' :
                'bg-slate-100 text-slate-600'
              }`}>{signal.status}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
