import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const adminAuditLogPath = path.resolve(__dirname, '../data/admin-settings-audit.log');

export type AdminSettingsAuditEntry = {
  timestamp: string;
  actionKey: string;
  scope: 'SYSTEM_SETTINGS' | 'FINANCIAL_SETTINGS' | 'DEV_ASSISTANT_CONFIG';
  enterpriseId?: string;
  userId: string;
  userRole: string;
  userName: string;
  reason: string;
  before: any;
  after: any;
  meta?: any;
};

const normalizeToken = (value: unknown) =>
  String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

export const parseAuditReason = (value: unknown) => String(value || '').trim();

export const requireAuditReason = (value: unknown) => {
  const reason = parseAuditReason(value);
  if (reason.length < 8) {
    return {
      ok: true as const,
      reason: 'SEM_MOTIVO_INFORMADO',
    };
  }
  return {
    ok: true as const,
    reason,
  };
};

export const appendAdminSettingsAudit = async (entry: Omit<AdminSettingsAuditEntry, 'timestamp'>) => {
  const line: AdminSettingsAuditEntry = {
    timestamp: new Date().toISOString(),
    actionKey: normalizeToken(entry.actionKey),
    scope: entry.scope,
    enterpriseId: String(entry.enterpriseId || '').trim() || undefined,
    userId: String(entry.userId || '').trim(),
    userRole: normalizeToken(entry.userRole),
    userName: String(entry.userName || '').trim(),
    reason: String(entry.reason || '').trim(),
    before: entry.before ?? null,
    after: entry.after ?? null,
    meta: entry.meta ?? null,
  };

  await fs.mkdir(path.dirname(adminAuditLogPath), { recursive: true });
  await fs.appendFile(adminAuditLogPath, `${JSON.stringify(line)}\n`, 'utf-8');
};

export const listAdminSettingsAudit = async (params?: {
  limit?: number;
  scope?: string;
  enterpriseId?: string;
}) => {
  try {
    const raw = await fs.readFile(adminAuditLogPath, 'utf-8');
    const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
    const parsed = lines
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean) as AdminSettingsAuditEntry[];

    const normalizedScope = normalizeToken(params?.scope || '');
    const normalizedEnterpriseId = String(params?.enterpriseId || '').trim();

    const filtered = parsed.filter((entry) => {
      if (normalizedScope && normalizeToken(entry.scope) !== normalizedScope) return false;
      if (normalizedEnterpriseId && String(entry.enterpriseId || '').trim() !== normalizedEnterpriseId) return false;
      return true;
    });

    const safeLimit = Math.max(1, Math.min(1000, Number(params?.limit || 200)));
    return filtered.slice(-safeLimit).reverse();
  } catch (err) {
    if ((err as any)?.code === 'ENOENT') return [];
    throw err;
  }
};
