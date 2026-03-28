import axios from 'axios';

function normalizeBaseUrl(value?: string): string {
  if (!value) return '';

  const trimmed = value.trim().replace(/\/$/, '');
  if (!trimmed) return '';

  return trimmed.endsWith('/api') ? trimmed.slice(0, -4) : trimmed;
}

const api = axios.create({
  baseURL: normalizeBaseUrl(import.meta.env.VITE_API_URL),
});

export default api;
