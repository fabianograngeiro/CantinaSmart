export const resolveApiBaseUrl = () => {
  const raw = String(import.meta.env.VITE_API_URL || '').trim();
  if (!raw) return '/api';

  const sanitized = raw.replace(/\/+$/, '');
  if (!sanitized) return '/api';

  if (/^https?:\/\//i.test(sanitized)) {
    try {
      const parsed = new URL(sanitized);
      const normalizedPath = `/${parsed.pathname.replace(/^\/+|\/+$/g, '')}`;
      return normalizedPath === '/' ? '/api' : normalizedPath;
    } catch {
      return '/api';
    }
  }

  if (sanitized.startsWith('/')) return sanitized;
  return `/${sanitized.replace(/^\/+/, '')}`;
};

export const resolveApiAssetBaseUrl = () => {
  const baseUrl = resolveApiBaseUrl().replace(/\/+$/, '');
  return baseUrl.replace(/\/api$/i, '');
};