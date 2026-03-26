import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { WatchListEntry } from '../types/signal';

interface WatchListResponse {
  data: WatchListEntry[];
}

type FormState = {
  name: string;
  search_query: string;
  description: string;
  topic_area: string;
  focus_area: string;
  technology_area: string;
  driver_trend: string;
  geographic_relevance: string;
  industry_relevance: string;
  language: string;
  source_filter: string;
  from_date: string;
  to_date: string;
  sort_by: string;
  priority: number;
  status: 'active' | 'paused' | 'archived';
  tags: string;
  notes: string;
};

const defaultForm: FormState = {
  name: '',
  search_query: '',
  description: '',
  topic_area: '',
  focus_area: '',
  technology_area: '',
  driver_trend: '',
  geographic_relevance: '',
  industry_relevance: '',
  language: '',
  source_filter: '',
  from_date: '',
  to_date: '',
  sort_by: 'publishedAt',
  priority: 3,
  status: 'active',
  tags: '',
  notes: ''
};

function parseTags(tags?: string): string {
  if (!tags) return '';
  try {
    const arr = JSON.parse(tags) as unknown;
    if (Array.isArray(arr)) return arr.map((v) => String(v)).join(', ');
  } catch {
    return tags;
  }
  return '';
}

export default function WatchList() {
  const [rows, setRows] = useState<WatchListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [saving, setSaving] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filterStatus) params.status = filterStatus;
      if (search.trim()) params.search = search.trim();
      const res = await api.get<WatchListResponse>('/api/watchlist', { params });
      setRows(res.data.data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Failed to load watch list');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const groupedPreview = useMemo(() => {
    const byTopic = new Map<string, number>();
    const byFocus = new Map<string, number>();
    const byTech = new Map<string, number>();
    const byDriver = new Map<string, number>();

    for (const row of rows) {
      if (row.topic_area) byTopic.set(row.topic_area, (byTopic.get(row.topic_area) || 0) + 1);
      if (row.focus_area) byFocus.set(row.focus_area, (byFocus.get(row.focus_area) || 0) + 1);
      if (row.technology_area) byTech.set(row.technology_area, (byTech.get(row.technology_area) || 0) + 1);
      if (row.driver_trend) byDriver.set(row.driver_trend, (byDriver.get(row.driver_trend) || 0) + 1);
    }

    return {
      topic: Array.from(byTopic.entries()).slice(0, 4),
      focus: Array.from(byFocus.entries()).slice(0, 4),
      tech: Array.from(byTech.entries()).slice(0, 4),
      driver: Array.from(byDriver.entries()).slice(0, 4)
    };
  }, [rows]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function beginCreate() {
    setEditingId(null);
    setForm(defaultForm);
  }

  function beginEdit(row: WatchListEntry) {
    setEditingId(row.id);
    setForm({
      name: row.name,
      search_query: row.search_query,
      description: row.description || '',
      topic_area: row.topic_area || '',
      focus_area: row.focus_area || '',
      technology_area: row.technology_area || '',
      driver_trend: row.driver_trend || '',
      geographic_relevance: row.geographic_relevance || '',
      industry_relevance: row.industry_relevance || '',
      language: row.language || '',
      source_filter: row.source_filter || '',
      from_date: row.from_date || '',
      to_date: row.to_date || '',
      sort_by: row.sort_by || 'publishedAt',
      priority: row.priority || 3,
      status: row.status,
      tags: parseTags(row.tags),
      notes: row.notes || ''
    });
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.search_query.trim()) {
      setError('Name and search query are required');
      return;
    }

    const payload = {
      ...form,
      tags: form.tags.split(',').map((v) => v.trim()).filter(Boolean)
    };

    try {
      setSaving(true);
      if (editingId) {
        await api.put(`/api/watchlist/${editingId}`, payload);
      } else {
        await api.post('/api/watchlist', payload);
      }
      setError(null);
      beginCreate();
      await loadData();
    } catch (err) {
      console.error(err);
      setError('Failed to save watch list entry');
    } finally {
      setSaving(false);
    }
  }

  async function removeRow(id: number) {
    if (!window.confirm('Delete this watch list entry?')) return;
    try {
      await api.delete(`/api/watchlist/${id}`);
      await loadData();
    } catch (err) {
      console.error(err);
      setError('Failed to delete watch list entry');
    }
  }

  async function setStatus(id: number, status: 'active' | 'paused' | 'archived') {
    try {
      await api.patch(`/api/watchlist/${id}/status`, { status });
      await loadData();
    } catch (err) {
      console.error(err);
      setError('Failed to update status');
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Watch List</h2>
        <p className="text-slate-500 text-sm mt-1">Track search keywords, phrases, and boolean expressions used to discover signals.</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 text-sm">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <form onSubmit={submitForm} className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800 text-sm">{editingId ? 'Edit Entry' : 'New Entry'}</h3>
            {editingId && (
              <button type="button" onClick={beginCreate} className="text-xs text-slate-500 hover:text-slate-700">Clear</button>
            )}
          </div>

          <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Name" value={form.name} onChange={(e) => setField('name', e.target.value)} />
          <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" rows={2} placeholder="Search query (supports phrases / boolean)" value={form.search_query} onChange={(e) => setField('search_query', e.target.value)} />
          <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Description" value={form.description} onChange={(e) => setField('description', e.target.value)} />

          <div className="grid grid-cols-2 gap-2">
            <input className="border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Topic" value={form.topic_area} onChange={(e) => setField('topic_area', e.target.value)} />
            <input className="border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Focus" value={form.focus_area} onChange={(e) => setField('focus_area', e.target.value)} />
            <input className="border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Technology" value={form.technology_area} onChange={(e) => setField('technology_area', e.target.value)} />
            <input className="border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Driver / Trend" value={form.driver_trend} onChange={(e) => setField('driver_trend', e.target.value)} />
            <input className="border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Geography" value={form.geographic_relevance} onChange={(e) => setField('geographic_relevance', e.target.value)} />
            <input className="border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Industry" value={form.industry_relevance} onChange={(e) => setField('industry_relevance', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input className="border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Language (e.g. en)" value={form.language} onChange={(e) => setField('language', e.target.value)} />
            <input className="border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Source filter (csv)" value={form.source_filter} onChange={(e) => setField('source_filter', e.target.value)} />
            <input type="date" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.from_date} onChange={(e) => setField('from_date', e.target.value)} />
            <input type="date" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.to_date} onChange={(e) => setField('to_date', e.target.value)} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.sort_by} onChange={(e) => setField('sort_by', e.target.value)}>
              <option value="publishedAt">publishedAt</option>
              <option value="relevancy">relevancy</option>
              <option value="popularity">popularity</option>
            </select>
            <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.priority} onChange={(e) => setField('priority', parseInt(e.target.value, 10))}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>Priority {n}</option>)}
            </select>
            <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm" value={form.status} onChange={(e) => setField('status', e.target.value as FormState['status'])}>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Tags (comma-separated)" value={form.tags} onChange={(e) => setField('tags', e.target.value)} />
          <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" rows={2} placeholder="Notes / rationale" value={form.notes} onChange={(e) => setField('notes', e.target.value)} />

          <button disabled={saving} className="w-full bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Saving...' : editingId ? 'Update Entry' : 'Create Entry'}
          </button>
        </form>

        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex flex-wrap gap-2">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search watch list..." className="border border-slate-200 rounded-lg px-3 py-2 text-sm flex-1 min-w-52" />
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="archived">Archived</option>
              </select>
              <button onClick={loadData} className="bg-slate-900 text-white rounded-lg px-4 py-2 text-sm">Apply</button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Topic groups', value: groupedPreview.topic.length },
              { label: 'Focus groups', value: groupedPreview.focus.length },
              { label: 'Tech groups', value: groupedPreview.tech.length },
              { label: 'Driver groups', value: groupedPreview.driver.length }
            ].map((card) => (
              <div key={card.label} className="bg-white border border-slate-200 rounded-xl p-3">
                <div className="text-lg font-bold text-slate-900">{card.value}</div>
                <div className="text-xs text-slate-500">{card.label}</div>
              </div>
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {loading ? (
              <div className="p-6 text-sm text-slate-400">Loading watch list...</div>
            ) : rows.length === 0 ? (
              <div className="p-6 text-sm text-slate-400">No watch list entries found.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <div key={row.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-semibold text-slate-900">{row.name}</div>
                        <div className="text-xs text-slate-500 mt-1">{row.search_query}</div>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        row.status === 'active' ? 'bg-green-100 text-green-700' :
                        row.status === 'paused' ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-200 text-slate-600'
                      }`}>
                        {row.status}
                      </span>
                    </div>

                    <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
                      <span>Priority {row.priority}</span>
                      {row.topic_area && <span>Topic: {row.topic_area}</span>}
                      {row.focus_area && <span>Focus: {row.focus_area}</span>}
                      {row.technology_area && <span>Tech: {row.technology_area}</span>}
                      {row.driver_trend && <span>Driver: {row.driver_trend}</span>}
                    </div>

                    {(row.description || row.notes) && (
                      <p className="text-sm text-slate-600">{row.description || row.notes}</p>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="text-xs text-slate-400">
                        Updated {new Date(row.updated_at).toLocaleString()} by {row.updated_by || 'system'}
                      </div>
                      <div className="flex gap-1">
                        <button className="text-xs px-2 py-1 border border-slate-200 rounded hover:bg-slate-50" onClick={() => beginEdit(row)}>Edit</button>
                        {row.status !== 'active' && (
                          <button className="text-xs px-2 py-1 border border-slate-200 rounded hover:bg-slate-50" onClick={() => setStatus(row.id, 'active')}>Activate</button>
                        )}
                        {row.status === 'active' && (
                          <button className="text-xs px-2 py-1 border border-slate-200 rounded hover:bg-slate-50" onClick={() => setStatus(row.id, 'paused')}>Pause</button>
                        )}
                        {row.status !== 'archived' && (
                          <button className="text-xs px-2 py-1 border border-slate-200 rounded hover:bg-slate-50" onClick={() => setStatus(row.id, 'archived')}>Archive</button>
                        )}
                        <button className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50" onClick={() => removeRow(row.id)}>Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
