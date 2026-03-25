import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { Signal, SignalFormData } from '../types/signal';

const SOURCE_TYPES = ['article', 'paper', 'announcement', 'regulatory', 'patent', 'event', 'other'];
const SIGNAL_TYPES = ['weak', 'strong', 'emerging', 'established'];
const TIME_HORIZONS = ['now', '1-2yr', '3-5yr', '5+yr'];
const STATUSES = ['new', 'triaged', 'under_review', 'published', 'archived', 'rejected'];

const defaultForm: SignalFormData = {
  title: '', summary: '', source_name: '', source_type: '', url: '',
  publication_date: '', scan_date: '', topic_area: '', focus_area: '',
  technology_area: '', driver_trend: '', signal_type: '', geographic_relevance: '',
  industry_relevance: '', confidence_level: 3, novelty: 3, potential_impact: 3,
  time_horizon: '', status: 'new', tags: '', analyst_notes: ''
};

function FormField({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 uppercase tracking-wide mb-1">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-colors";
const selectCls = `${inputCls} bg-white`;

export default function SignalForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id && id !== 'new';
  const [form, setForm] = useState<SignalFormData>(defaultForm);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEdit) return;
    axios.get<Signal>(`/api/signals/${id}`).then(res => {
      const s = res.data;
      const tags: string[] = s.tags ? JSON.parse(s.tags) : [];
      setForm({
        title: s.title || '',
        summary: s.summary || '',
        source_name: s.source_name || '',
        source_type: s.source_type || '',
        url: s.url || '',
        publication_date: s.publication_date || '',
        scan_date: s.scan_date || '',
        topic_area: s.topic_area || '',
        focus_area: s.focus_area || '',
        technology_area: s.technology_area || '',
        driver_trend: s.driver_trend || '',
        signal_type: s.signal_type || '',
        geographic_relevance: s.geographic_relevance || '',
        industry_relevance: s.industry_relevance || '',
        confidence_level: s.confidence_level || 3,
        novelty: s.novelty || 3,
        potential_impact: s.potential_impact || 3,
        time_horizon: s.time_horizon || '',
        status: s.status || 'new',
        tags: tags.join(', '),
        analyst_notes: s.analyst_notes || ''
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id, isEdit]);

  function set(key: keyof SignalFormData, value: string | number) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    setError(null);

    const tagsArray = form.tags.split(',').map(t => t.trim()).filter(Boolean);
    const payload = { ...form, tags: JSON.stringify(tagsArray) };

    try {
      if (isEdit) {
        await axios.put(`/api/signals/${id}`, payload);
        navigate(`/signals/${id}`);
      } else {
        const res = await axios.post<Signal>('/api/signals', payload);
        navigate(`/signals/${res.data.id}`);
      }
    } catch (err) {
      console.error('Save failed:', err);
      setError('Failed to save signal. Please try again.');
      setSaving(false);
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading...</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to={isEdit ? `/signals/${id}` : '/signals'} className="text-slate-400 hover:text-slate-600 text-sm">← Back</Link>
      </div>

      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">{isEdit ? 'Edit Signal' : 'New Signal'}</h2>
        <p className="text-slate-500 text-sm mt-1">{isEdit ? 'Update signal details' : 'Add a new intelligence signal'}</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-6">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Core Info */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h3 className="font-semibold text-slate-700 text-sm">Core Information</h3>
          <FormField label="Title" required>
            <input type="text" value={form.title} onChange={e => set('title', e.target.value)} className={inputCls} placeholder="Signal title..." required />
          </FormField>
          <FormField label="Summary">
            <textarea value={form.summary} onChange={e => set('summary', e.target.value)} className={`${inputCls} resize-none`} rows={4} placeholder="Brief summary of the signal..." />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Status">
              <select value={form.status} onChange={e => set('status', e.target.value)} className={selectCls}>
                {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            </FormField>
            <FormField label="Signal Type">
              <select value={form.signal_type} onChange={e => set('signal_type', e.target.value)} className={selectCls}>
                <option value="">Select...</option>
                {SIGNAL_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </FormField>
          </div>
        </div>

        {/* Classification */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h3 className="font-semibold text-slate-700 text-sm">Classification</h3>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Topic Area">
              <input type="text" value={form.topic_area} onChange={e => set('topic_area', e.target.value)} className={inputCls} placeholder="e.g. Artificial Intelligence" />
            </FormField>
            <FormField label="Focus Area">
              <input type="text" value={form.focus_area} onChange={e => set('focus_area', e.target.value)} className={inputCls} placeholder="e.g. Large Language Models" />
            </FormField>
            <FormField label="Technology Area">
              <input type="text" value={form.technology_area} onChange={e => set('technology_area', e.target.value)} className={inputCls} placeholder="e.g. Machine Learning" />
            </FormField>
            <FormField label="Driver / Trend">
              <input type="text" value={form.driver_trend} onChange={e => set('driver_trend', e.target.value)} className={inputCls} placeholder="e.g. AI Capability Acceleration" />
            </FormField>
            <FormField label="Time Horizon">
              <select value={form.time_horizon} onChange={e => set('time_horizon', e.target.value)} className={selectCls}>
                <option value="">Select...</option>
                {TIME_HORIZONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </FormField>
            <FormField label="Geographic Relevance">
              <input type="text" value={form.geographic_relevance} onChange={e => set('geographic_relevance', e.target.value)} className={inputCls} placeholder="e.g. Global, USA, Europe" />
            </FormField>
          </div>
          <FormField label="Industry Relevance">
            <input type="text" value={form.industry_relevance} onChange={e => set('industry_relevance', e.target.value)} className={inputCls} placeholder="e.g. Technology, Finance, Healthcare" />
          </FormField>
        </div>

        {/* Source */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h3 className="font-semibold text-slate-700 text-sm">Source Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Source Name">
              <input type="text" value={form.source_name} onChange={e => set('source_name', e.target.value)} className={inputCls} placeholder="e.g. Nature, MIT, TechCrunch" />
            </FormField>
            <FormField label="Source Type">
              <select value={form.source_type} onChange={e => set('source_type', e.target.value)} className={selectCls}>
                <option value="">Select...</option>
                {SOURCE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </FormField>
            <FormField label="Publication Date">
              <input type="date" value={form.publication_date} onChange={e => set('publication_date', e.target.value)} className={inputCls} />
            </FormField>
            <FormField label="Scan Date">
              <input type="date" value={form.scan_date} onChange={e => set('scan_date', e.target.value)} className={inputCls} />
            </FormField>
          </div>
          <FormField label="URL">
            <input type="url" value={form.url} onChange={e => set('url', e.target.value)} className={inputCls} placeholder="https://..." />
          </FormField>
        </div>

        {/* Ratings */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h3 className="font-semibold text-slate-700 text-sm">Ratings (1-5)</h3>
          <div className="grid grid-cols-3 gap-6">
            {(['confidence_level', 'novelty', 'potential_impact'] as const).map((key) => (
              <FormField key={key} label={key.replace('_', ' ')}>
                <div className="flex items-center gap-3">
                  <input type="range" min="1" max="5" value={form[key]} onChange={e => set(key, parseInt(e.target.value, 10))} className="flex-1 accent-indigo-600" />
                  <span className="w-6 text-center text-sm font-bold text-indigo-700">{form[key]}</span>
                </div>
              </FormField>
            ))}
          </div>
        </div>

        {/* Notes & Tags */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h3 className="font-semibold text-slate-700 text-sm">Notes & Tags</h3>
          <FormField label="Analyst Notes">
            <textarea value={form.analyst_notes} onChange={e => set('analyst_notes', e.target.value)} className={`${inputCls} resize-none`} rows={3} placeholder="Internal analysis notes..." />
          </FormField>
          <FormField label="Tags (comma-separated)">
            <input type="text" value={form.tags} onChange={e => set('tags', e.target.value)} className={inputCls} placeholder="e.g. AI, quantum, cybersecurity" />
          </FormField>
        </div>

        {/* Submit */}
        <div className="flex gap-3 justify-end">
          <Link to={isEdit ? `/signals/${id}` : '/signals'} className="px-5 py-2.5 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
            Cancel
          </Link>
          <button type="submit" disabled={saving} className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : isEdit ? 'Update Signal' : 'Create Signal'}
          </button>
        </div>
      </form>
    </div>
  );
}
