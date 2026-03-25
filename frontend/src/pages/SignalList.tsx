import { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import SignalCard from '../components/SignalCard';
import { Signal, PaginatedSignals } from '../types/signal';

const SOURCE_TYPES = ['article', 'paper', 'announcement', 'regulatory', 'patent', 'event', 'other'];
const SIGNAL_TYPES = ['weak', 'strong', 'emerging', 'established'];
const STATUSES = ['new', 'triaged', 'under_review', 'published', 'archived', 'rejected'];

export default function SignalList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [result, setResult] = useState<PaginatedSignals | null>(null);
  const [loading, setLoading] = useState(true);
  const [topicAreas, setTopicAreas] = useState<string[]>([]);
  const [techAreas, setTechAreas] = useState<string[]>([]);

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
    const params: Record<string, string> = { page: String(page), limit: '12', sort, order };
    if (status) params.status = status;
    if (topic_area) params.topic_area = topic_area;
    if (technology_area) params.technology_area = technology_area;
    if (source_type) params.source_type = source_type;
    if (signal_type) params.signal_type = signal_type;
    if (search) params.search = search;

    axios.get<PaginatedSignals>('/api/signals', { params })
      .then(res => { setResult(res.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [page, sort, order, status, topic_area, technology_area, source_type, signal_type, search]);

  useEffect(() => {
    axios.get<PaginatedSignals>('/api/signals', { params: { limit: '200' } }).then(res => {
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

  function setPage(p: number) {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(p));
    setSearchParams(next);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Signals</h2>
          <p className="text-slate-500 text-sm mt-1">{result?.pagination.total ?? '...'} signals found</p>
        </div>
        <Link to="/signals/new" className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
          + Add Signal
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6 space-y-3">
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
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span>Sort by:</span>
          {([['created_at', 'Date'], ['potential_impact', 'Impact'], ['confidence_level', 'Confidence'], ['novelty', 'Novelty']] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => {
                if (sort === val) { setParam('order', order === 'desc' ? 'asc' : 'desc'); }
                else { setParam('sort', val); }
              }}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${sort === val ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {label} {sort === val ? (order === 'desc' ? '↓' : '↑') : ''}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading signals...</div>
      ) : result?.data.length === 0 ? (
        <div className="text-center py-12 text-slate-400">No signals found.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
          {result?.data.map(signal => <SignalCard key={signal.id} signal={signal} />)}
        </div>
      )}

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
