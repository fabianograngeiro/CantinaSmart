import { db } from '../database.js';

export type WhatsAppProviderMode = 'NATIVE' | 'EXTERNAL';

export type ExternalProviderHttpMethod = 'GET' | 'POST' | 'PUT';

export type WhatsAppExternalProviderConfig = {
  enabled: boolean;
  providerCode: string;
  baseUrl: string;
  subdomain: string;
  token: string;
  tokenHeaderName: string;
  tokenPrefix: string;
  testPath: string;
  testMethod: ExternalProviderHttpMethod;
  sendPath: string;
  sendMethod: ExternalProviderHttpMethod;
  bulkPath: string;
  bulkMethod: ExternalProviderHttpMethod;
  commonFields: Record<string, unknown>;
};

export type WhatsAppProviderConfig = {
  mode: WhatsAppProviderMode;
  external: WhatsAppExternalProviderConfig;
  updatedAt: string;
  updatedByUserId?: string;
  updatedByName?: string;
};

type ProviderRequestContext = {
  enterpriseId: string;
};

const DEFAULT_EXTERNAL_CONFIG: WhatsAppExternalProviderConfig = {
  enabled: false,
  providerCode: 'CUSTOM',
  baseUrl: '',
  subdomain: '',
  token: '',
  tokenHeaderName: 'Authorization',
  tokenPrefix: 'Bearer',
  testPath: '/connection/test',
  testMethod: 'POST',
  sendPath: '/message/send',
  sendMethod: 'POST',
  bulkPath: '/message/send-bulk',
  bulkMethod: 'POST',
  commonFields: {},
};

const DEFAULT_PROVIDER_CONFIG: WhatsAppProviderConfig = {
  mode: 'NATIVE',
  external: { ...DEFAULT_EXTERNAL_CONFIG },
  updatedAt: '',
};

const normalizeMethod = (value: unknown, fallback: ExternalProviderHttpMethod): ExternalProviderHttpMethod => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'GET' || normalized === 'POST' || normalized === 'PUT') return normalized;
  return fallback;
};

const normalizePath = (value: unknown, fallback: string) => {
  const text = String(value || '').trim();
  if (!text) return fallback;
  return text.startsWith('/') ? text : `/${text}`;
};

const normalizeObjectRecord = (value: unknown, fallback: Record<string, unknown>) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  return value as Record<string, unknown>;
};

const normalizeExternalConfig = (value: any, existing?: WhatsAppExternalProviderConfig): WhatsAppExternalProviderConfig => {
  const safeExisting = existing || DEFAULT_EXTERNAL_CONFIG;
  const incoming = value && typeof value === 'object' ? value : {};

  const incomingToken = String(incoming.token || '').trim();
  const resolvedToken = incomingToken || String(safeExisting.token || '').trim();

  const providerCode = String(incoming.providerCode || safeExisting.providerCode || 'CUSTOM').trim().toUpperCase() || 'CUSTOM';
  const defaultSendPath = providerCode === 'UAZAPI' ? '/send/text' : DEFAULT_EXTERNAL_CONFIG.sendPath;
  const defaultBulkPath = providerCode === 'UAZAPI' ? '/send/text' : DEFAULT_EXTERNAL_CONFIG.bulkPath;

  return {
    enabled: incoming.enabled !== undefined ? Boolean(incoming.enabled) : Boolean(safeExisting.enabled),
    providerCode,
    baseUrl: String(incoming.baseUrl || safeExisting.baseUrl || '').trim().replace(/\/+$/, ''),
    subdomain: String(incoming.subdomain || safeExisting.subdomain || '').trim(),
    token: resolvedToken,
    tokenHeaderName: String(incoming.tokenHeaderName || safeExisting.tokenHeaderName || 'Authorization').trim() || 'Authorization',
    tokenPrefix: String(incoming.tokenPrefix || safeExisting.tokenPrefix || 'Bearer').trim(),
    testPath: normalizePath(incoming.testPath, safeExisting.testPath || DEFAULT_EXTERNAL_CONFIG.testPath),
    testMethod: normalizeMethod(incoming.testMethod, safeExisting.testMethod || DEFAULT_EXTERNAL_CONFIG.testMethod),
    sendPath: normalizePath(incoming.sendPath, safeExisting.sendPath || defaultSendPath),
    sendMethod: normalizeMethod(incoming.sendMethod, safeExisting.sendMethod || DEFAULT_EXTERNAL_CONFIG.sendMethod),
    bulkPath: normalizePath(incoming.bulkPath, safeExisting.bulkPath || defaultBulkPath),
    bulkMethod: normalizeMethod(incoming.bulkMethod, safeExisting.bulkMethod || DEFAULT_EXTERNAL_CONFIG.bulkMethod),
    commonFields: normalizeObjectRecord(incoming.commonFields, normalizeObjectRecord(safeExisting.commonFields, {})),
  };
};

const normalizeProviderConfig = (value: any, existing?: WhatsAppProviderConfig): WhatsAppProviderConfig => {
  const safeExisting = existing || DEFAULT_PROVIDER_CONFIG;
  const incoming = value && typeof value === 'object' ? value : {};
  const modeRaw = String(incoming.mode || safeExisting.mode || 'NATIVE').trim().toUpperCase();
  const mode: WhatsAppProviderMode = modeRaw === 'EXTERNAL' ? 'EXTERNAL' : 'NATIVE';

  return {
    mode,
    external: normalizeExternalConfig(incoming.external, safeExisting.external),
    updatedAt: new Date().toISOString(),
    updatedByUserId: String(incoming.updatedByUserId || safeExisting.updatedByUserId || '').trim(),
    updatedByName: String(incoming.updatedByName || safeExisting.updatedByName || '').trim(),
  };
};

const maskSecret = (value: string) => {
  const token = String(value || '').trim();
  if (!token) return '';
  if (token.length <= 8) return '*'.repeat(token.length);
  return `${token.slice(0, 4)}${'*'.repeat(token.length - 8)}${token.slice(-4)}`;
};

const buildBaseUrl = (config: WhatsAppExternalProviderConfig) => {
  const rawBaseUrl = String(config.baseUrl || '').trim().replace(/\/+$/, '');
  if (!rawBaseUrl) return '';
  if (rawBaseUrl.includes('{subdomain}')) {
    return rawBaseUrl.split('{subdomain}').join(String(config.subdomain || '').trim());
  }
  return rawBaseUrl;
};

const buildEndpointUrl = (config: WhatsAppExternalProviderConfig, path: string) => {
  const baseUrl = buildBaseUrl(config);
  const safePath = normalizePath(path, '/');
  if (!baseUrl) return '';
  return `${baseUrl}${safePath}`;
};

const createAuthHeaders = (config: WhatsAppExternalProviderConfig) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = String(config.token || '').trim();
  if (!token) return headers;

  const headerName = String(config.tokenHeaderName || 'Authorization').trim() || 'Authorization';
  const prefix = String(config.tokenPrefix || '').trim();
  headers[headerName] = prefix ? `${prefix} ${token}` : token;
  return headers;
};

const safeJsonParse = (value: string) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const callExternalEndpoint = async (
  config: WhatsAppExternalProviderConfig,
  method: ExternalProviderHttpMethod,
  path: string,
  body: Record<string, unknown>
) => {
  const endpointUrl = buildEndpointUrl(config, path);
  if (!endpointUrl) {
    throw new Error('Base URL da API externa não configurada.');
  }

  const fetchFn = (globalThis as any).fetch as ((input: string, init?: any) => Promise<any>) | undefined;
  if (typeof fetchFn !== 'function') {
    throw new Error('Fetch não está disponível no runtime do backend.');
  }

  const isGet = method === 'GET';
  const response = await fetchFn(endpointUrl, {
    method,
    headers: createAuthHeaders(config),
    body: isGet ? undefined : JSON.stringify(body || {}),
  });

  const rawText = await response.text();
  const parsed = safeJsonParse(rawText);

  return {
    ok: Boolean(response.ok),
    status: Number(response.status || 0),
    endpointUrl,
    payload: parsed ?? rawText,
  };
};

const getProviderConfigMap = () => {
  const store = db.getWhatsAppStore() as any;
  const map = store?.providerConfigByEnterprise;
  return map && typeof map === 'object' ? map : {};
};

const saveProviderConfigMap = (map: Record<string, any>) => {
  db.updateWhatsAppStore({
    providerConfigByEnterprise: map,
  });
};

export const getEnterpriseProviderConfig = (enterpriseId: string) => {
  const safeEnterpriseId = String(enterpriseId || '').trim();
  const map = getProviderConfigMap();
  const current = map[safeEnterpriseId];
  return normalizeProviderConfig(current);
};

export const getEnterpriseProviderConfigForView = (enterpriseId: string) => {
  const config = getEnterpriseProviderConfig(enterpriseId);
  return {
    ...config,
    external: {
      ...config.external,
      token: '',
      hasToken: Boolean(String(config.external.token || '').trim()),
      tokenMasked: maskSecret(config.external.token),
    },
  };
};

export const upsertEnterpriseProviderConfig = (
  context: ProviderRequestContext,
  incomingConfig: any,
  actor?: { userId?: string; userName?: string }
) => {
  const safeEnterpriseId = String(context.enterpriseId || '').trim();
  if (!safeEnterpriseId) throw new Error('enterpriseId é obrigatório.');

  const map = getProviderConfigMap();
  const existing = normalizeProviderConfig(map[safeEnterpriseId]);
  const normalized = normalizeProviderConfig(
    {
      ...(incomingConfig || {}),
      updatedByUserId: String(actor?.userId || '').trim(),
      updatedByName: String(actor?.userName || '').trim(),
    },
    existing
  );
  map[safeEnterpriseId] = normalized;
  saveProviderConfigMap(map);
  return getEnterpriseProviderConfigForView(safeEnterpriseId);
};

export const testEnterpriseProviderConnection = async (enterpriseId: string) => {
  const config = getEnterpriseProviderConfig(enterpriseId);
  if (config.mode !== 'EXTERNAL' || !config.external.enabled) {
    return {
      success: true,
      mode: config.mode,
      message: 'Provedor nativo ativo. Teste externo não aplicado.',
      details: null,
    };
  }

  const baseUrl = buildBaseUrl(config.external);
  if (!baseUrl) {
    throw new Error('Configure a Base URL para testar o provedor externo.');
  }

  const response = await callExternalEndpoint(
    config.external,
    config.external.testMethod,
    config.external.testPath,
    {
      subdomain: config.external.subdomain,
      enterpriseId: String(enterpriseId || '').trim(),
    }
  );

  return {
    success: response.ok,
    mode: config.mode,
    message: response.ok ? 'Conexão externa validada.' : 'Falha no teste da API externa.',
    details: {
      status: response.status,
      endpointUrl: response.endpointUrl,
      payload: response.payload,
    },
  };
};

const extractMessageId = (payload: any) => {
  const safePayload = payload && typeof payload === 'object' ? payload : {};
  const direct = String(safePayload.messageId || safePayload.id || '').trim();
  if (direct) return direct;
  const dataId = String((safePayload.data && (safePayload.data.messageId || safePayload.data.id)) || '').trim();
  if (dataId) return dataId;
  return '';
};

const normalizeExternalTarget = (providerCode: string, rawTarget: string) => {
  const target = String(rawTarget || '').trim();
  if (!target) return '';
  const lowered = target.toLowerCase();
  if (providerCode === 'UAZAPI' && (lowered.includes('@newsletter') || lowered.includes('@g.us') || lowered.includes('@c.us'))) {
    return target;
  }
  return target.replace(/\D/g, '');
};

const buildSendPayload = (config: WhatsAppExternalProviderConfig, target: string, text: string) => {
  const providerCode = String(config.providerCode || '').trim().toUpperCase();
  const normalizedTarget = normalizeExternalTarget(providerCode, target);
  const safeText = String(text || '');
  const commonFields = normalizeObjectRecord(config.commonFields, {});

  if (providerCode === 'UAZAPI') {
    return {
      ...commonFields,
      number: normalizedTarget,
      text: safeText,
    };
  }

  return {
    ...commonFields,
    subdomain: config.subdomain,
    phone: normalizedTarget,
    message: safeText,
  };
};

export const sendByConfiguredProvider = async (params: {
  enterpriseId: string;
  phone: string;
  message: string;
}) => {
  const config = getEnterpriseProviderConfig(params.enterpriseId);
  const normalizedPhone = normalizeExternalTarget(config.external.providerCode, String(params.phone || ''));
  const normalizedMessage = String(params.message || '');

  if (config.mode !== 'EXTERNAL' || !config.external.enabled) {
    return {
      handledByExternal: false,
      result: null,
    };
  }

  const response = await callExternalEndpoint(
    config.external,
    config.external.sendMethod,
    config.external.sendPath,
    buildSendPayload(config.external, normalizedPhone, normalizedMessage)
  );

  if (!response.ok) {
    const detailText = typeof response.payload === 'string'
      ? response.payload
      : JSON.stringify(response.payload);
    throw new Error(`Falha no provedor externo (${response.status}): ${detailText || 'erro desconhecido'}`);
  }

  return {
    handledByExternal: true,
    result: {
      success: true,
      providerMode: 'EXTERNAL',
      providerCode: config.external.providerCode,
      messageId: extractMessageId(response.payload),
      phone: normalizedPhone,
      payload: response.payload,
    },
  };
};

export const sendBulkByConfiguredProvider = async (params: {
  enterpriseId: string;
  recipients: string[];
  message: string;
}) => {
  const config = getEnterpriseProviderConfig(params.enterpriseId);
  if (config.mode !== 'EXTERNAL' || !config.external.enabled) {
    return {
      handledByExternal: false,
      result: null,
    };
  }

  const recipients = Array.isArray(params.recipients)
    ? params.recipients.map((item) => normalizeExternalTarget(config.external.providerCode, String(item || ''))).filter(Boolean)
    : [];

  if (String(config.external.providerCode || '').trim().toUpperCase() === 'UAZAPI') {
    const results: Array<{ success: boolean; phone: string; messageId?: string; payload?: unknown; error?: string }> = [];
    for (const target of recipients) {
      try {
        const sent = await callExternalEndpoint(
          config.external,
          config.external.sendMethod,
          config.external.sendPath,
          buildSendPayload(config.external, target, String(params.message || ''))
        );
        if (!sent.ok) {
          const detailText = typeof sent.payload === 'string' ? sent.payload : JSON.stringify(sent.payload);
          results.push({
            success: false,
            phone: target,
            error: `Falha (${sent.status}): ${detailText || 'erro desconhecido'}`,
          });
          continue;
        }
        results.push({
          success: true,
          phone: target,
          messageId: extractMessageId(sent.payload),
          payload: sent.payload,
        });
      } catch (err) {
        results.push({
          success: false,
          phone: target,
          error: err instanceof Error ? err.message : 'falha de envio',
        });
      }
    }
    const successCount = results.filter((item) => item.success).length;
    return {
      handledByExternal: true,
      result: {
        success: true,
        providerMode: 'EXTERNAL',
        providerCode: config.external.providerCode,
        total: recipients.length,
        successCount,
        failedCount: recipients.length - successCount,
        results,
      },
    };
  }

  const response = await callExternalEndpoint(
    config.external,
    config.external.bulkMethod,
    config.external.bulkPath,
    {
      ...normalizeObjectRecord(config.external.commonFields, {}),
      subdomain: config.external.subdomain,
      recipients,
      message: String(params.message || ''),
    }
  );

  if (!response.ok) {
    const detailText = typeof response.payload === 'string'
      ? response.payload
      : JSON.stringify(response.payload);
    throw new Error(`Falha no disparo externo (${response.status}): ${detailText || 'erro desconhecido'}`);
  }

  return {
    handledByExternal: true,
    result: {
      success: true,
      providerMode: 'EXTERNAL',
      providerCode: config.external.providerCode,
      total: recipients.length,
      payload: response.payload,
    },
  };
};
