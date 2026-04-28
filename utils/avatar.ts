const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace(/\/api\/?$/, '');

export const resolveUserAvatar = (avatar?: string, userName?: string) => {
  const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName || 'User')}&background=4f46e5&color=fff&bold=true`;
  if (!avatar) return fallback;

  const normalized = avatar.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized) return fallback;

  if (/^https?:\/\//i.test(normalized)) return normalized;
  if (normalized.startsWith('data:')) return normalized;
  if (normalized.startsWith('blob:')) return normalized;

  if (/^(clients_photos|products_photos|uploads)\//i.test(normalized)) {
    return `${API_BASE_URL}/${normalized}`;
  }

  if (/\/(clients_photos|products_photos|uploads)\//i.test(normalized)) {
    const relative = normalized.replace(/^.*(\/(?:clients_photos|products_photos|uploads)\/)/i, '$1');
    return `${API_BASE_URL}${relative}`;
  }

  if (normalized.startsWith('/')) return `${API_BASE_URL}${normalized}`;
  return normalized;
};

export default resolveUserAvatar;
