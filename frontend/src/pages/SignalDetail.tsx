import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { Signal } from '../types/signal';

const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800 border-blue-200',
  triaged: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  under_review: 'bg-orange-100 text-orange-800 border-orange-200',
  published: 'bg-green-100 text-green-800 border-green-200',
  archived: 'bg-slate-100 text-slate-600 border-slate-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
};

function Field({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null;
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{value}</dd>
    </div>
  );
}

function RatingBar({ label, value }: { label: string; value?: number }) {
  if (!value) return null;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-500 font-medium">{label}</span>
        <span className="text-slate-700 font-semibold">{value}/5</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full">
        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(value / 5) * 100}%` }} />
      </div>
    </div>
  );
}

export default function SignalDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [signal, setSignal] = useState<Signal | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Signal>(`/api/signals/${id}`)
      .then(res => { setSignal(res.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  async function handleDelete() {
    if (!confirm('Are you sure you want to delete this signal?')) return;
    setDeleting(true);
    try {
      await api.delete(`/api/signals/${id}`);
      navigate('/signals');
    } catch (err) {
      console.error('Delete failed:', err);
      setDeleting(false);
    }
  }

  async function handleAiEnrich() {
    setAiLoading(true);
    setAiError(null);
    setAiMessage(null);
    try {
      const res = await api.post<{ applied: boolean; signal: Signal }>(`/api/signals/${id}/ai-enrich`, { apply: true });
      if (res.data.signal) {
        setSignal(res.data.signal);
      }
      setAiMessage('AI summary and metadata generated and applied.');
    } catch (err: unknown) {
      console.error('AI enrichment failed:', err);
      const maybe = err as { response?: { data?: { error?: string } } };
      setAiError(maybe.response?.data?.error || 'Failed to run AI enrichment');
    } finally {
      setAiLoading(false);
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading...</div>;
  if (!signal) return <div className="flex items-center justify-center h-64 text-slate-400">Signal not found.</div>;

  const tags: string[] = signal.tags ? JSON.parse(signal.tags) : [];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/signals" className="text-slate-400 hover:text-slate-600 text-sm">← Back to Signals</Link>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-xl font-bold text-slate-900 mb-2">{signal.title}</h1>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${statusColors[signal.status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                  {signal.status.replace('_', ' ').toUpperCase()}
                </span>
                {signal.signal_type && (
                  <span className="text-xs font-medium px-2 py-1 bg-purple-50 text-purple-700 rounded-full">
                    {signal.signal_type} signal
                  </span>
                )}
                {signal.time_horizon && (
                  <span className="text-xs px-2 py-1 bg-slate-50 text-slate-600 rounded-full border border-slate-200">
                    {signal.time_horizon}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={handleAiEnrich} disabled={aiLoading} className="border border-indigo-200 text-indigo-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-50 transition-colors disabled:opacity-50">
                {aiLoading ? 'Generating...' : 'Generate with AI'}
              </button>
              <Link to={`/signals/${signal.id}/edit`} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
                Edit
              </Link>
              <button onClick={handleDelete} disabled={deleting} className="border border-red-200 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50">
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>

        {(aiMessage || aiError) && (
          <div className={`px-6 py-3 border-b text-sm ${aiError ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
            {aiError || aiMessage}
          </div>
        )}

        <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-5">
            {signal.summary && (
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Summary</h3>
                <p className="text-sm text-slate-700 leading-relaxed">{signal.summary}</p>
              </div>
            )}

            {signal.analyst_notes && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">Analyst Notes</h3>
                <p className="text-sm text-amber-900 leading-relaxed">{signal.analyst_notes}</p>
              </div>
            )}

            {signal.relevance_narrative && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                <h3 className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-2">Relevance Narrative</h3>
                <p className="text-sm text-indigo-900 leading-relaxed">{signal.relevance_narrative}</p>
              </div>
            )}

            <dl className="grid grid-cols-2 gap-4">
              <Field label="Topic Area" value={signal.topic_area} />
              <Field label="Focus Area" value={signal.focus_area} />
              <Field label="Technology Area" value={signal.technology_area} />
              <Field label="Driver / Trend" value={signal.driver_trend} />
              <Field label="Geographic Relevance" value={signal.geographic_relevance} />
              <Field label="Industry Relevance" value={signal.industry_relevance} />
              <Field label="Source Name" value={signal.source_name} />
              <Field label="Source Type" value={signal.source_type} />
              <Field label="Publication Date" value={signal.publication_date} />
              <Field label="Scan Date" value={signal.scan_date} />
            </dl>

            {signal.url && (
              <div>
                <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide">URL</dt>
                <a href={signal.url} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-600 hover:underline break-all mt-1 block">
                  {signal.url}
                </a>
              </div>
            )}

            {tags.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {tags.map(tag => (
                    <span key={tag} className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded-full">#{tag}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            <div className="bg-slate-50 rounded-lg p-4 space-y-4">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Ratings</h3>
              <RatingBar label="Confidence Level" value={signal.confidence_level} />
              <RatingBar label="Novelty" value={signal.novelty} />
              <RatingBar label="Potential Impact" value={signal.potential_impact} />
              <RatingBar label="Relevance Score" value={signal.relevance_score} />
            </div>

            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Metadata</h3>
              <div className="text-xs text-slate-500 space-y-1">
                <div>Created: <span className="text-slate-700">{new Date(signal.created_at).toLocaleDateString()}</span></div>
                <div>Updated: <span className="text-slate-700">{new Date(signal.updated_at).toLocaleDateString()}</span></div>
                <div>ID: <span className="text-slate-700 font-mono">#{signal.id}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
