import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { NewsReviewCandidate, WatchListEntry } from '../types/signal';

interface WatchListResponse {
  data: WatchListEntry[];
}

interface ReviewResponse {
  data: NewsReviewCandidate[];
}

interface SearchRunResponse {
  scanId: number;
  provider: string;
  searchTerm: string;
  resultCount: number;
  importedCount: number;
}

export default function ExternalSearch() {
  const [manualQuery, setManualQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [language, setLanguage] = useState('en');
  const [sortBy, setSortBy] = useState('publishedAt');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [autoIngest, setAutoIngest] = useState(false);

  const [watchList, setWatchList] = useState<WatchListEntry[]>([]);
  const [selectedWatchId, setSelectedWatchId] = useState<string>('');

  const [reviewRows, setReviewRows] = useState<NewsReviewCandidate[]>([]);
  const [reviewStatus, setReviewStatus] = useState('new');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<SearchRunResponse | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkActing, setBulkActing] = useState(false);

  async function loadWatchList() {
    try {
      const res = await api.get<WatchListResponse>('/api/watchlist');
      setWatchList(res.data.data);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadReviewRows(status = reviewStatus) {
    try {
      const res = await api.get<ReviewResponse>('/api/news/review', {
        params: { review_status: status, limit: 100 }
      });
      setReviewRows(res.data.data);
      setSelectedIds(new Set());
    } catch (err) {
      console.error(err);
      setError('Failed to load review queue');
    }
  }

  useEffect(() => {
    loadWatchList();
    loadReviewRows('new');
  }, []);

  const activeWatch = useMemo(() => watchList.filter((w) => w.status === 'active'), [watchList]);

  async function runManualSearch() {
    if (!manualQuery.trim()) {
      setError('Enter a keyword, phrase, or boolean expression');
      return;
    }

    try {
      setRunning(true);
      setError(null);
      const res = await api.post<SearchRunResponse>('/api/news/search', {
        searchTerm: manualQuery,
        sourceFilter: sourceFilter || undefined,
        language: language || undefined,
        sortBy: sortBy || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        autoIngest
      });
      setLastRun(res.data);
      await loadReviewRows();
    } catch (err: unknown) {
      console.error(err);
      const maybe = err as { response?: { data?: { error?: string } } };
      setError(maybe.response?.data?.error || 'Manual search failed');
    } finally {
      setRunning(false);
    }
  }

  async function runWatchSearch() {
    if (!selectedWatchId) {
      setError('Select an active watch list entry first');
      return;
    }

    try {
      setRunning(true);
      setError(null);
      const res = await api.post<SearchRunResponse>(`/api/news/search/watchlist/${selectedWatchId}`, {
        autoIngest
      });
      setLastRun(res.data);
      await loadReviewRows();
    } catch (err: unknown) {
      console.error(err);
      const maybe = err as { response?: { data?: { error?: string } } };
      setError(maybe.response?.data?.error || 'Watch list search failed');
    } finally {
      setRunning(false);
    }
  }

  async function runAllActiveWatch() {
    try {
      setRunning(true);
      setError(null);
      await api.post('/api/news/search/watchlist-active', {
        maxRuns: activeWatch.length,
        autoIngest
      });
      await loadReviewRows();
    } catch (err: unknown) {
      console.error(err);
      const maybe = err as { response?: { data?: { error?: string } } };
      setError(maybe.response?.data?.error || 'Batch watch list search failed');
    } finally {
      setRunning(false);
    }
  }

  async function importCandidate(id: number) {
    try {
      await api.post(`/api/news/review/${id}/import`, { status: 'new' });
      await loadReviewRows();
    } catch (err: unknown) {
      console.error(err);
      setError('Failed to import candidate');
    }
  }

  async function dismissCandidate(id: number) {
    try {
      await api.post(`/api/news/review/${id}/dismiss`);
      await loadReviewRows();
    } catch (err: unknown) {
      console.error(err);
      setError('Failed to dismiss candidate');
    }
  }

  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const newIds = reviewRows.filter(r => r.review_status === 'new').map(r => r.id);
    if (newIds.every(id => selectedIds.has(id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(newIds));
    }
  }

  async function bulkDismiss() {
    if (!confirm(`Dismiss ${selectedIds.size} candidate(s)?`)) return;
    setBulkActing(true);
    await Promise.all([...selectedIds].map(id => api.post(`/api/news/review/${id}/dismiss`)));
    setBulkActing(false);
    await loadReviewRows();
  }

  async function bulkImport() {
    if (!confirm(`Import ${selectedIds.size} candidate(s) as signals?`)) return;
    setBulkActing(true);
    await Promise.all([...selectedIds].map(id => api.post(`/api/news/review/${id}/import`, { status: 'new' })));
    setBulkActing(false);
    await loadReviewRows();
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">External Search (SerpAPI)</h2>
        <p className="text-slate-500 text-sm mt-1">Run manual or watch list driven searches, then review before importing into Signals.</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 text-sm">{error}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-slate-800 text-sm">Manual Search</h3>
          <textarea
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            rows={2}
            value={manualQuery}
            onChange={(e) => setManualQuery(e.target.value)}
            placeholder={'e.g. "small modular reactor" AND policy'}
          />
          <div className="grid grid-cols-2 gap-2">
            <input className="border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Source filter (csv)" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} />
            <input className="border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Language" value={language} onChange={(e) => setLanguage(e.target.value)} />
            <input type="date" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            <input type="date" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div className="flex items-center gap-3">
            <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="publishedAt">publishedAt</option>
              <option value="relevancy">relevancy</option>
              <option value="popularity">popularity</option>
            </select>
            <label className="text-sm text-slate-600 flex items-center gap-2">
              <input type="checkbox" checked={autoIngest} onChange={(e) => setAutoIngest(e.target.checked)} />
              Auto-ingest as New
            </label>
          </div>
          <button disabled={running} onClick={runManualSearch} className="bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-indigo-700 disabled:opacity-50">
            {running ? 'Running...' : 'Run Manual Search'}
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-slate-800 text-sm">Watch List Search</h3>
          <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={selectedWatchId} onChange={(e) => setSelectedWatchId(e.target.value)}>
            <option value="">Select active watch term</option>
            {activeWatch.map((w) => (
              <option key={w.id} value={w.id}>{w.name} - {w.search_query}</option>
            ))}
          </select>

          <div className="flex gap-2">
            <button disabled={running || !selectedWatchId} onClick={runWatchSearch} className="bg-slate-900 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">
              Run Selected Watch
            </button>
            <button disabled={running || activeWatch.length === 0} onClick={runAllActiveWatch} className="bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">
              Run All Active ({activeWatch.length})
            </button>
          </div>

          <p className="text-xs text-slate-500">Scheduled behavior is supported via the active watch list batch endpoint. Trigger it from a cron/job runner when needed.</p>

          {lastRun && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-700">
              Last run: {lastRun.resultCount} candidates from "{lastRun.searchTerm}" ({lastRun.provider})
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-800 text-sm">Review Queue</h3>
          <div className="flex items-center gap-2">
            <select value={reviewStatus} onChange={(e) => { setReviewStatus(e.target.value); loadReviewRows(e.target.value); }} className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm">
              <option value="new">New</option>
              <option value="imported">Imported</option>
              <option value="dismissed">Dismissed</option>
            </select>
            <button onClick={() => loadReviewRows()} className="text-sm bg-slate-100 rounded-lg px-3 py-1.5">Refresh</button>
          </div>
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2.5 mb-3 flex items-center gap-4">
            <span className="text-sm text-indigo-700 font-medium">{selectedIds.size} selected</span>
            <button onClick={bulkImport} disabled={bulkActing} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50">
              {bulkActing ? 'Working...' : `Import ${selectedIds.size}`}
            </button>
            <button onClick={bulkDismiss} disabled={bulkActing} className="border border-slate-300 text-slate-600 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors disabled:opacity-50">
              {bulkActing ? 'Working...' : `Dismiss ${selectedIds.size}`}
            </button>
            <button onClick={() => setSelectedIds(new Set())} className="text-sm text-slate-400 hover:text-slate-600">Clear</button>
          </div>
        )}

        {reviewRows.length === 0 ? (
          <div className="text-sm text-slate-400 py-6">No review candidates.</div>
        ) : (
          <div className="space-y-3">
            {/* Select-all row */}
            {reviewStatus === 'new' && (
              <div className="flex items-center gap-2 px-1 pb-1 border-b border-slate-100">
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-300"
                  checked={reviewRows.filter(r => r.review_status === 'new').every(r => selectedIds.has(r.id))}
                  onChange={toggleSelectAll}
                />
                <span className="text-xs text-slate-500">Select all new ({reviewRows.filter(r => r.review_status === 'new').length})</span>
              </div>
            )}
            {reviewRows.map((row) => (
              <div key={row.id} className={`border rounded-lg p-3 transition-colors ${selectedIds.has(row.id) ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    {row.review_status === 'new' && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        onChange={() => toggleSelect(row.id)}
                        className="mt-1 rounded border-slate-300 text-indigo-600 focus:ring-indigo-300"
                      />
                    )}
                    <div>
                      <div className="font-medium text-slate-900">{row.title}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        {row.source_name || 'Unknown source'}
                        {row.publication_date ? ` • ${new Date(row.publication_date).toLocaleDateString()}` : ''}
                        {row.watchlist_name ? ` • Watch: ${row.watchlist_name}` : ''}
                      </div>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full shrink-0 ${
                    row.review_status === 'new' ? 'bg-blue-100 text-blue-700' :
                    row.review_status === 'imported' ? 'bg-green-100 text-green-700' :
                    'bg-slate-200 text-slate-600'
                  }`}>
                    {row.review_status}
                  </span>
                </div>

                <p className="text-sm text-slate-600 mt-2 line-clamp-2">{row.description || row.content_snippet || 'No description available.'}</p>
                <a href={row.url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline mt-2 inline-block">Open source article</a>

                <div className="flex items-center justify-between mt-3">
                  <div className="text-xs text-slate-400">Search: {row.search_term}</div>
                  {row.review_status === 'new' && (
                    <div className="flex gap-2">
                      <button onClick={() => dismissCandidate(row.id)} className="text-xs px-2.5 py-1 border border-slate-200 rounded hover:bg-slate-50">Dismiss</button>
                      <button onClick={() => importCandidate(row.id)} className="text-xs px-2.5 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700">Import as Signal</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
