export const SAAS_AUDIT_LOG_STORAGE_KEY = 'saas_audit_log_v1';

export type SaasAuditModule = 'CLIENTES' | 'PLANOS' | 'COBRANCAS' | 'FINANCEIRO' | 'WHATSAPP' | 'SISTEMA';

export type SaasAuditEntry = {
  id: string;
  at: string;
  actorName: string;
  actorRole?: string;
  module: SaasAuditModule;
  action: string;
  entityType: string;
  entityId?: string;
  enterpriseId?: string;
  enterpriseName?: string;
  summary: string;
  metadata?: Record<string, any>;
};

const readRaw = (): SaasAuditEntry[] => {
  try {
    const raw = localStorage.getItem(SAAS_AUDIT_LOG_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeRaw = (items: SaasAuditEntry[]) => {
  localStorage.setItem(SAAS_AUDIT_LOG_STORAGE_KEY, JSON.stringify(items));
};

export const getSaasAuditLogs = (): SaasAuditEntry[] => readRaw();

export const appendSaasAuditLog = (
  payload: Omit<SaasAuditEntry, 'id' | 'at'>
): SaasAuditEntry => {
  const entry: SaasAuditEntry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    ...payload
  };
  const current = readRaw();
  const next = [entry, ...current].slice(0, 2000);
  writeRaw(next);
  return entry;
};

export const clearSaasAuditLogs = () => {
  writeRaw([]);
};
