import { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api';
import { Signal, PaginatedSignals } from '../types/signal';

const SOURCE_TYPES = ['article', 'paper', 'announcement', 'regulatory', 'patent', 'event', 'other'];
const SIGNAL_TYPES = ['weak', 'strong', 'emerging', 'established'];
const STATUSES = ['new', 'triaged', 'under_review', 'published', 'archived', 'rejected'];

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700',
  triaged: 'bg-yellow-100 text-yellow-700',
  under_review: 'bg-orange-100 text-orange-700',
  published: 'bg-green-100 text-green-700',
  archived: 'bg-slate-100 text-slate-600',
  rejected: 'bg-red-100 text-red-700',
};

function SortHeader({ col, label, sort, order, onToggle }: {
  col: string; label: string; sort: string; order: string; onToggle: (col: string) => void;
}) {
  const active = sort === col;
  return (
    <th
      onClick={() => onToggle(col)}
      className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:bg-slate-100 whitespace-nowrap"
    >
      {label} {active ? (order === 'desc' ? '↓' : '↑') : <span className="opacity-30">↕</span>}
    </th>
  );
}

export default function SignalList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [result, setResult] = useState<PaginatedSignals | null>(null);
  const [loading, setLoading] = useState(true);
  const [topicAreas, setTopicAreas] = useState<string[]>([]);
  const [techAreas, setTechAreas] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const status = searchParams.get('status') || '';
  const topic_area = searchParams.get('topic_area') || '';
  const technology_area = searchParams.get('technology_area') || '';
  const source_type = searchParams.get('source_type') || '';
  const signal_type = searchParams.get('signal_type') || '';
  const search = searchParams.get('search') || '';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const sort = searchParams.get('sort') || 'created_at';
  const order = searchParams.get('order') || 'desc';

  const fetchSignals = useCallback(() => {
    setLoading(true);
    setSelectedIds(new Set());
    const params: Record<string, string> = { page: String(page), limit: '50', sort, order };
    if (status) params.status = status;
    if (topic_area) params.topic_area = topic_area;
    if (technology_area) params.technology_area = technology_area;
    if (source_type) params.source_type = source_type;
    if (signal_type) params.signal_type = signal_type;
    if (search) params.search = search;

    api.get<PaginatedSignals>('/api/signals', { params })
      .then(res => { setResult(res.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [page, sort, order, status, topic_area, technology_area, source_type, signal_type, search]);

  useEffect(() => {
    api.get<PaginatedSignals>('/api/signals', { params: { limit: '200' } }).then(res => {
      const topics = [...new Set(res.data.data.map((s: Signal) => s.topic_area).filter(Boolean))] as string[];
      const techs = [...new Set(res.data.data.map((s: Signal) => s.technology_area).filter(Boolean))] as string[];
      setTopicAreas(topics.sort());
      setTechAreas(techs.sort());
    });
  }, []);

  useEffect(() => { fetchSignals(); }, [fetchSignals]);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) { next.set(key, value); } else { next.delete(key); }
    next.delete('page');
    setSearchParams(next);
  }

  function toggleSort(col: string) {
    const next = new URLSearchParams(searchParams);
    if (sort === col) {
      next.set('order', order === 'desc' ? 'asc' : 'desc');
    } else {
      next.set('sort', col);
      next.set('order', 'desc');
    }
    next.delete('page');
    setSearchParams(next);
  }

  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!result) return;
    const allIds = result.data.map(s => s.id);
    if (allIds.every(id => selectedIds.has(id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  }

  async function handleBulkDelete() {
    if (!confirm(`Delete ${selectedIds.size} selected signal(s)? This cannot be undone.`)) return;
    setBulkDeleting(true);
    await Promise.all([...selectedIds].map(id => api.delete(`/api/signals/${id}`)));
    setBulkDeleting(false);
    fetchSignals();
  }

  async function exportCsv() {
    const params: Record<string, string> = { limit: '9999', sort, order };
    if (status) params.status = status;
    if (topic_area) params.topic_area = topic_area;
    if (technology_area) params.technology_area = technology_area;
    if (source_type) params.source_type = source_type;
    if (signal_type) params.signal_type = signal_type;
    if (search) params.search = search;
    const res = await api.get<PaginatedSignals>('/api/signals', { params });
    const signals = res.data.data;
    const headers = ['id','title','status','signal_type','source_type','topic_area','technology_area','confidence_level','potential_impact','novelty','time_horizon','publication_date','url','summary'];
    const rows = signals.map(s =>
      headers.map(h => {
        const val = (s as unknown as Record<string, unknown>)[h];
        if (val == null) return '';
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'signals.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function setPage(p: number) {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(p));
    setSearchParams(next);
  }

  const allOnPageSelected = result?.data.length ? result.data.every(s => selectedIds.has(s.id)) : false;
  const pageIds = result?.data.map(s => s.id) ?? [];

  return (
    <div className="p-6 max-w-screen-xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Signals</h2>
          <p className="text-slate-500 text-sm mt-1">{result?.pagination.total ?? '...'} signals found</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCsv} className="border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
            Export CSV
          </button>
          <Link to="/signals/new" className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
            + Add Signal
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Search title or summary..."
            value={search}
            onChange={e => setParam('search', e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-48 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <select value={status} onChange={e => setParam('status', e.target.value)} className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300">
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
          <select value={topic_area} onChange={e => setParam('topic_area', e.target.value)} className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300">
            <option value="">All Topics</option>
            {topicAreas.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={technology_area} onChange={e => setParam('technology_area', e.target.value)} className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300">
            <option value="">All Technologies</option>
            {techAreas.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={source_type} onChange={e => setParam('source_type', e.target.value)} className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300">
            <option value="">All Source Types</option>
            {SOURCE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={signal_type} onChange={e => setParam('signal_type', e.target.value)} className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300">
            <option value="">All Signal Types</option>
            {SIGNAL_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 mb-4 flex items-center gap-4">
          <span className="text-sm text-red-700 font-medium">{selectedIds.size} selected</span>
          <button
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {bulkDeleting ? 'Deleting...' : `Delete ${selectedIds.size} selected`}
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-sm text-red-500 hover:text-red-700">
            Clear selection
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-6">
        {loading ? (
          <div className="text-center py-12 text-slate-400">Loading signals...</div>
        ) : result?.data.length === 0 ? (
          <div className="text-center py-12 text-slate-400">No signals found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectAll}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-300" />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Topic</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Source</th>
                  <SortHeader col="confidence_level" label="Conf." sort={sort} order={order} onToggle={toggleSort} />
                  <SortHeader col="potential_impact" label="Impact" sort={sort} order={order} onToggle={toggleSort} />
                  <SortHeader col="novelty" label="Novelty" sort={sort} order={order} onToggle={toggleSort} />
                  <SortHeader col="created_at" label="Date" sort={sort} order={order} onToggle={toggleSort} />
                  <th className="px-4 py-3 w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result?.data.map((signal, i) => (
                  <tr key={signal.id} className={`hover:bg-slate-50 transition-colors ${selectedIds.has(signal.id) ? 'bg-indigo-50' : ''}`}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selectedIds.has(signal.id)} onChange={() => toggleSelect(signal.id)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-300" />
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <Link
                        to={`/signals/${signal.id}`}
                        state={{ ids: pageIds, index: i }}
                        className="font-medium text-slate-900 hover:text-indigo-600 transition-colors line-clamp-2"
                      >
                        {signal.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_COLORS[signal.status] || 'bg-slate-100 text-slate-600'}`}>
                        {signal.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{signal.signal_type || '—'}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-[8rem] truncate">{signal.topic_area || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{signal.source_type || '—'}</td>
                    <td className="px-4 py-3 text-slate-700 text-center">{signal.confidence_level ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-700 text-center">{signal.potential_impact ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-700 text-center">{signal.novelty ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(signal.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <Link to={`/signals/${signal.id}/edit`} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">Edit</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {result && result.pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(page - 1)} disabled={page <= 1} className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm disabled:opacity-40 hover:bg-slate-100 transition-colors">← Prev</button>
          {Array.from({ length: result.pagination.pages }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => setPage(p)} className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${p === page ? 'bg-indigo-600 text-white' : 'border border-slate-200 hover:bg-slate-100'}`}>{p}</button>
          ))}
          <button onClick={() => setPage(page + 1)} disabled={page >= result.pagination.pages} className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm disabled:opacity-40 hover:bg-slate-100 transition-colors">Next →</button>
        </div>
      )}
    </div>
  );
}
