import { db } from '../database.js';
import { AuthRequest } from '../middleware/auth.js';

export const normalizeRole = (value?: string) => {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

  if (normalized === 'SUPER_ADMIN') return 'SUPERADMIN';
  if (normalized === 'ADMINSISTEMA') return 'ADMIN_SISTEMA';
  if (normalized === 'ADMIN_SISTEMA') return 'ADMIN_SISTEMA';
  if (normalized === 'DONO_DE_REDE' || normalized === 'DONO_REDE') return 'OWNER';

  return normalized;
};

export const canAccessAllEnterprises = (role?: string) => {
  const normalized = normalizeRole(role);
  return normalized === 'SUPERADMIN' || normalized === 'ADMIN_SISTEMA';
};

export const getRequesterUser = (req: AuthRequest) => {
  if (!req.userId) return null;
  return db.getUser(req.userId);
};

export const getRequesterEnterpriseIds = (req: AuthRequest): string[] => {
  const requester = getRequesterUser(req);
  if (!requester || !Array.isArray(requester.enterpriseIds)) return [];
  return requester.enterpriseIds.map((id: unknown) => String(id || '').trim()).filter(Boolean);
};

export const requesterCanAccessEnterprise = (req: AuthRequest, enterpriseId: string) => {
  if (canAccessAllEnterprises(req.userRole)) return true;
  const allowedIds = getRequesterEnterpriseIds(req);
  return allowedIds.includes(String(enterpriseId || '').trim());
};

export const hasEnterpriseOverlap = (enterpriseIds: unknown, allowedIds: string[]) => {
  const userIds = Array.isArray(enterpriseIds)
    ? enterpriseIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  if (userIds.length === 0 || allowedIds.length === 0) return false;
  const allowedSet = new Set(allowedIds);
  return userIds.some((id) => allowedSet.has(id));
};
