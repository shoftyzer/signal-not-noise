import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api';
import { Signal, PaginatedSignals } from '../types/signal';
import { useAuth } from '../context/AuthContext';

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

const DEFAULT_COL_WIDTHS: Record<string, number> = {
  title: 280, status: 130, type: 110, topic: 150, source: 100,
  conf: 70, impact: 70, novelty: 70, published: 110, actions: 80,
};

function ResizableHeader({
  label, width, onResize, onClick, sortIndicator, className = ''
}: {
  label: React.ReactNode; width: number;
  onResize: (delta: number) => void;
  onClick?: () => void;
  sortIndicator?: React.ReactNode;
  className?: string;
}) {
  const startX = useRef<number | null>(null);

  function handleMouseDown(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    startX.current = e.clientX;
    const onMove = (me: MouseEvent) => {
      if (startX.current === null) return;
      onResize(me.clientX - startX.current);
      startX.current = me.clientX;
    };
    const onUp = () => {
      startX.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  return (
    <th
      onClick={onClick}
      style={{ width, minWidth: 40 }}
      className={`relative px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider select-none whitespace-nowrap overflow-hidden ${onClick ? 'cursor-pointer hover:bg-slate-100' : ''} ${className}`}
    >
      {label}{sortIndicator}
      <span
        onMouseDown={handleMouseDown}
        onClick={e => e.stopPropagation()}
        className="absolute right-0 top-0 h-full w-2 cursor-col-resize flex items-center justify-center group"
      >
        <span className="w-px h-4 bg-slate-300 group-hover:bg-indigo-400 transition-colors" />
      </span>
    </th>
  );
}

function SortHeader({ col, label, sort, order, onToggle, width, onResize }: {
  col: string; label: string; sort: string; order: string;
  onToggle: (col: string) => void; width: number; onResize: (delta: number) => void;
}) {
  const active = sort === col;
  return (
    <ResizableHeader
      label={label}
      width={width}
      onResize={onResize}
      onClick={() => onToggle(col)}
      sortIndicator={active ? (order === 'desc' ? ' ↓' : ' ↑') : <span className="opacity-30"> ↕</span>}
    />
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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Signal>>({});
  const [saving, setSaving] = useState(false);
  const [colWidths, setColWidths] = useState<Record<string, number>>({ ...DEFAULT_COL_WIDTHS });
  const { isAuthenticated } = useAuth();

  function resizeCol(col: string, delta: number) {
    setColWidths(prev => ({ ...prev, [col]: Math.max(40, (prev[col] ?? DEFAULT_COL_WIDTHS[col] ?? 80) + delta) }));
  }

  const status = searchParams.get('status') || '';
  const topic_area = searchParams.get('topic_area') || '';
  const technology_area = searchParams.get('technology_area') || '';
  const source_type = searchParams.get('source_type') || '';
  const signal_type = searchParams.get('signal_type') || '';
  const search = searchParams.get('search') || '';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const sort = searchParams.get('sort') || 'publication_date';
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

  function startEdit(signal: Signal) {
    setEditingId(signal.id);
    setEditDraft({
      status: signal.status,
      signal_type: signal.signal_type,
      topic_area: signal.topic_area,
      source_type: signal.source_type,
      confidence_level: signal.confidence_level,
      potential_impact: signal.potential_impact,
      novelty: signal.novelty,
      publication_date: signal.publication_date,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft({});
  }

  async function saveEdit(signal: Signal) {
    setSaving(true);
    try {
      await api.put(`/api/signals/${signal.id}`, { ...signal, ...editDraft });
      setEditingId(null);
      setEditDraft({});
      fetchSignals();
    } finally {
      setSaving(false);
    }
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
          {isAuthenticated && (
            <Link to="/signals/new" className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
              + Add Signal
            </Link>
          )}
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
      {isAuthenticated && selectedIds.size > 0 && (
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
            <table className="w-full text-sm table-fixed">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {isAuthenticated && (
                    <th className="px-4 py-3 w-10">
                      <input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectAll}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-300" />
                    </th>
                  )}
                  <ResizableHeader label="Title" width={colWidths.title} onResize={d => resizeCol('title', d)} />
                  <ResizableHeader label="Status" width={colWidths.status} onResize={d => resizeCol('status', d)} />
                  <ResizableHeader label="Type" width={colWidths.type} onResize={d => resizeCol('type', d)} />
                  <ResizableHeader label="Topic" width={colWidths.topic} onResize={d => resizeCol('topic', d)} />
                  <ResizableHeader label="Source" width={colWidths.source} onResize={d => resizeCol('source', d)} />
                  <SortHeader col="confidence_level" label="Conf." sort={sort} order={order} onToggle={toggleSort} width={colWidths.conf} onResize={d => resizeCol('conf', d)} />
                  <SortHeader col="potential_impact" label="Impact" sort={sort} order={order} onToggle={toggleSort} width={colWidths.impact} onResize={d => resizeCol('impact', d)} />
                  <SortHeader col="novelty" label="Novelty" sort={sort} order={order} onToggle={toggleSort} width={colWidths.novelty} onResize={d => resizeCol('novelty', d)} />
                  <SortHeader col="publication_date" label="Published" sort={sort} order={order} onToggle={toggleSort} width={colWidths.published} onResize={d => resizeCol('published', d)} />
                  {isAuthenticated && <th className="px-4 py-3" style={{ width: colWidths.actions }} />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result?.data.map((signal, i) => {
                  const isEditing = isAuthenticated && editingId === signal.id;
                  return (
                  <tr key={signal.id} className={`hover:bg-slate-50 transition-colors ${selectedIds.has(signal.id) ? 'bg-indigo-50' : ''} ${isEditing ? 'bg-amber-50' : ''}`}>
                    {isAuthenticated && (
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selectedIds.has(signal.id)} onChange={() => toggleSelect(signal.id)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-300" />
                      </td>
                    )}
                    <td className="px-4 py-3 max-w-xs">
                      <Link
                        to={`/signals/${signal.id}`}
                        state={{ ids: pageIds, index: i }}
                        className="font-medium text-slate-900 hover:text-indigo-600 transition-colors line-clamp-2"
                      >
                        {signal.title}
                      </Link>
                    </td>
                    {/* Status */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <select value={editDraft.status} onChange={e => setEditDraft(d => ({ ...d, status: e.target.value as Signal['status'] }))}
                          className="border border-slate-300 rounded px-2 py-1 text-xs w-full">
                          {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                        </select>
                      ) : (
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_COLORS[signal.status] || 'bg-slate-100 text-slate-600'}`}>
                          {signal.status.replace('_', ' ')}
                        </span>
                      )}
                    </td>
                    {/* Signal type */}
                    <td className="px-4 py-3 text-slate-600">
                      {isEditing ? (
                        <select value={editDraft.signal_type ?? ''} onChange={e => setEditDraft(d => ({ ...d, signal_type: e.target.value as Signal['signal_type'] }))}
                          className="border border-slate-300 rounded px-2 py-1 text-xs w-full">
                          <option value="">—</option>
                          {SIGNAL_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : signal.signal_type || '—'}
                    </td>
                    {/* Topic area */}
                    <td className="px-4 py-3 text-slate-600 max-w-[8rem]">
                      {isEditing ? (
                        <input value={editDraft.topic_area ?? ''} onChange={e => setEditDraft(d => ({ ...d, topic_area: e.target.value }))}
                          className="border border-slate-300 rounded px-2 py-1 text-xs w-full" />
                      ) : <span className="truncate block">{signal.topic_area || '—'}</span>}
                    </td>
                    {/* Source type */}
                    <td className="px-4 py-3 text-slate-600">
                      {isEditing ? (
                        <select value={editDraft.source_type ?? ''} onChange={e => setEditDraft(d => ({ ...d, source_type: e.target.value as Signal['source_type'] }))}
                          className="border border-slate-300 rounded px-2 py-1 text-xs w-full">
                          <option value="">—</option>
                          {SOURCE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : signal.source_type || '—'}
                    </td>
                    {/* Confidence */}
                    <td className="px-4 py-3 text-slate-700 text-center">
                      {isEditing ? (
                        <input type="number" min={1} max={5} value={editDraft.confidence_level ?? ''} onChange={e => setEditDraft(d => ({ ...d, confidence_level: e.target.value ? Number(e.target.value) : undefined }))}
                          className="border border-slate-300 rounded px-1 py-1 text-xs w-14 text-center" />
                      ) : signal.confidence_level ?? '—'}
                    </td>
                    {/* Impact */}
                    <td className="px-4 py-3 text-slate-700 text-center">
                      {isEditing ? (
                        <input type="number" min={1} max={5} value={editDraft.potential_impact ?? ''} onChange={e => setEditDraft(d => ({ ...d, potential_impact: e.target.value ? Number(e.target.value) : undefined }))}
                          className="border border-slate-300 rounded px-1 py-1 text-xs w-14 text-center" />
                      ) : signal.potential_impact ?? '—'}
                    </td>
                    {/* Novelty */}
                    <td className="px-4 py-3 text-slate-700 text-center">
                      {isEditing ? (
                        <input type="number" min={1} max={5} value={editDraft.novelty ?? ''} onChange={e => setEditDraft(d => ({ ...d, novelty: e.target.value ? Number(e.target.value) : undefined }))}
                          className="border border-slate-300 rounded px-1 py-1 text-xs w-14 text-center" />
                      ) : signal.novelty ?? '—'}
                    </td>
                    {/* Published date */}
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {isEditing ? (
                        <input type="date" value={editDraft.publication_date ?? ''} onChange={e => setEditDraft(d => ({ ...d, publication_date: e.target.value }))}
                          className="border border-slate-300 rounded px-2 py-1 text-xs" />
                      ) : signal.publication_date ? new Date(signal.publication_date).toLocaleDateString() : '—'}
                    </td>
                    {isAuthenticated && (
                      <td className="px-4 py-3 whitespace-nowrap">
                        {isEditing ? (
                          <div className="flex gap-1">
                            <button onClick={() => saveEdit(signal)} disabled={saving}
                              className="text-xs px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50">
                              {saving ? '…' : 'Save'}
                            </button>
                            <button onClick={cancelEdit}
                              className="text-xs px-2 py-1 border border-slate-300 rounded hover:bg-slate-100">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => startEdit(signal)}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                            Edit
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                  );
                })}
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
