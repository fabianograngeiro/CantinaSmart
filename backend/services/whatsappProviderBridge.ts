import { db } from '../database.js';

export type WhatsAppProviderMode = 'NATIVE' | 'EXTERNAL';

export type ExternalProviderHttpMethod = 'GET' | 'POST' | 'PUT';

export type WhatsAppExternalProviderConfig = {
  enabled: boolean;
  autoFallbackToNativeOnFailure: boolean;
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
  mediaPath: string;
  mediaMethod: ExternalProviderHttpMethod;
  menuPath: string;
  menuMethod: ExternalProviderHttpMethod;
  carouselPath: string;
  carouselMethod: ExternalProviderHttpMethod;
  paymentPath: string;
  paymentMethod: ExternalProviderHttpMethod;
  bulkPath: string;
  bulkMethod: ExternalProviderHttpMethod;
  storyPath: string;
  storyMethod: ExternalProviderHttpMethod;
  webhook: {
    enabled: boolean;
    method: ExternalProviderHttpMethod;
    url: string;
    addUrlEvents: boolean;
    addUrlTypesMessages: boolean;
    events: string[];
    excludeMessages: string[];
  };
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
  autoFallbackToNativeOnFailure: false,
  providerCode: 'UAZAPI',
  baseUrl: '',
  subdomain: '',
  token: '',
  tokenHeaderName: 'token',
  tokenPrefix: '',
  testPath: '/send/text',
  testMethod: 'POST',
  sendPath: '/send/text',
  sendMethod: 'POST',
  mediaPath: '/send/media',
  mediaMethod: 'POST',
  menuPath: '/send/menu',
  menuMethod: 'POST',
  carouselPath: '/send/carousel',
  carouselMethod: 'POST',
  paymentPath: '/send/pix-button',
  paymentMethod: 'POST',
  bulkPath: '/send/text',
  bulkMethod: 'POST',
  storyPath: '/stories/send',
  storyMethod: 'POST',
  webhook: {
    enabled: false,
    method: 'POST',
    url: '',
    addUrlEvents: false,
    addUrlTypesMessages: false,
    events: ['messages'],
    excludeMessages: ['wasSentByApi', 'isGroupYes'],
  },
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

const normalizeStringArray = (value: unknown, fallback: string[]) => {
  if (!Array.isArray(value)) return fallback;
  const normalized = value
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return normalized.length > 0 ? Array.from(new Set(normalized)) : fallback;
};

const resolveProviderPath = (
  incomingValue: unknown,
  existingValue: unknown,
  defaultValue: string,
  legacyFallback?: string
) => {
  const incomingText = String(incomingValue || '').trim();
  if (incomingText) return normalizePath(incomingText, defaultValue);

  const existingText = String(existingValue || '').trim();
  const normalizedExisting = normalizePath(existingText, defaultValue);
  if (existingText && (!legacyFallback || normalizedExisting !== normalizePath(legacyFallback, legacyFallback))) {
    return normalizedExisting;
  }

  return defaultValue;
};

const normalizeExternalConfig = (value: any, existing?: WhatsAppExternalProviderConfig): WhatsAppExternalProviderConfig => {
  const safeExisting = existing || DEFAULT_EXTERNAL_CONFIG;
  const incoming = value && typeof value === 'object' ? value : {};

  const incomingToken = String(incoming.token || '').trim();
  const resolvedToken = incomingToken || String(safeExisting.token || '').trim();

  const providerCode = String(incoming.providerCode || safeExisting.providerCode || 'UAZAPI').trim().toUpperCase() || 'UAZAPI';
  const providerCodeChanged = providerCode !== String(safeExisting.providerCode || '').trim().toUpperCase();
  const defaultSendPath = providerCode === 'UAZAPI' ? '/send/text' : DEFAULT_EXTERNAL_CONFIG.sendPath;
  const defaultMediaPath = providerCode === 'UAZAPI' ? '/send/media' : DEFAULT_EXTERNAL_CONFIG.mediaPath;
  const defaultMenuPath = providerCode === 'UAZAPI' ? '/send/menu' : DEFAULT_EXTERNAL_CONFIG.menuPath;
  const defaultCarouselPath = providerCode === 'UAZAPI' ? '/send/carousel' : DEFAULT_EXTERNAL_CONFIG.carouselPath;
  const defaultPaymentPath = providerCode === 'UAZAPI' ? '/send/pix-button' : DEFAULT_EXTERNAL_CONFIG.paymentPath;
  const defaultBulkPath = providerCode === 'UAZAPI' ? '/send/text' : DEFAULT_EXTERNAL_CONFIG.bulkPath;
  const defaultStoryPath = providerCode === 'UAZAPI' ? '/stories/send' : DEFAULT_EXTERNAL_CONFIG.storyPath;
  const defaultTestPath = providerCode === 'UAZAPI' ? '/send/text' : DEFAULT_EXTERNAL_CONFIG.testPath;
  const defaultTokenHeaderName = providerCode === 'UAZAPI' ? 'token' : 'Authorization';
  const defaultTokenPrefix = providerCode === 'UAZAPI' ? '' : 'Bearer';

  return {
    enabled: incoming.enabled !== undefined ? Boolean(incoming.enabled) : Boolean(safeExisting.enabled),
    autoFallbackToNativeOnFailure: incoming.autoFallbackToNativeOnFailure !== undefined
      ? Boolean(incoming.autoFallbackToNativeOnFailure)
      : Boolean(safeExisting.autoFallbackToNativeOnFailure),
    providerCode,
    baseUrl: String(incoming.baseUrl || safeExisting.baseUrl || '').trim().replace(/\/+$/, ''),
    subdomain: String(incoming.subdomain || safeExisting.subdomain || '').trim(),
    token: resolvedToken,
    tokenHeaderName: String(
      incoming.tokenHeaderName
      || (providerCodeChanged ? defaultTokenHeaderName : safeExisting.tokenHeaderName)
      || defaultTokenHeaderName
    ).trim() || defaultTokenHeaderName,
    tokenPrefix: String(
      incoming.tokenPrefix
      || (providerCodeChanged ? defaultTokenPrefix : safeExisting.tokenPrefix)
      || defaultTokenPrefix
    ).trim(),
    testPath: providerCode === 'UAZAPI'
      ? resolveProviderPath(incoming.testPath, safeExisting.testPath, defaultTestPath, '/connection/test')
      : normalizePath(incoming.testPath, providerCodeChanged ? defaultTestPath : (safeExisting.testPath || defaultTestPath)),
    testMethod: normalizeMethod(incoming.testMethod, safeExisting.testMethod || DEFAULT_EXTERNAL_CONFIG.testMethod),
    sendPath: providerCode === 'UAZAPI'
      ? resolveProviderPath(incoming.sendPath, safeExisting.sendPath, defaultSendPath, DEFAULT_EXTERNAL_CONFIG.sendPath)
      : normalizePath(incoming.sendPath, providerCodeChanged ? defaultSendPath : (safeExisting.sendPath || defaultSendPath)),
    sendMethod: normalizeMethod(incoming.sendMethod, safeExisting.sendMethod || DEFAULT_EXTERNAL_CONFIG.sendMethod),
    mediaPath: providerCode === 'UAZAPI'
      ? resolveProviderPath(incoming.mediaPath, safeExisting.mediaPath, defaultMediaPath, DEFAULT_EXTERNAL_CONFIG.mediaPath)
      : normalizePath(incoming.mediaPath, providerCodeChanged ? defaultMediaPath : (safeExisting.mediaPath || defaultMediaPath)),
    mediaMethod: normalizeMethod(incoming.mediaMethod, safeExisting.mediaMethod || DEFAULT_EXTERNAL_CONFIG.mediaMethod),
    menuPath: providerCode === 'UAZAPI'
      ? resolveProviderPath(incoming.menuPath, safeExisting.menuPath, defaultMenuPath, DEFAULT_EXTERNAL_CONFIG.menuPath)
      : normalizePath(incoming.menuPath, providerCodeChanged ? defaultMenuPath : (safeExisting.menuPath || defaultMenuPath)),
    menuMethod: normalizeMethod(incoming.menuMethod, safeExisting.menuMethod || DEFAULT_EXTERNAL_CONFIG.menuMethod),
    carouselPath: providerCode === 'UAZAPI'
      ? resolveProviderPath(incoming.carouselPath, safeExisting.carouselPath, defaultCarouselPath, DEFAULT_EXTERNAL_CONFIG.carouselPath)
      : normalizePath(incoming.carouselPath, providerCodeChanged ? defaultCarouselPath : (safeExisting.carouselPath || defaultCarouselPath)),
    carouselMethod: normalizeMethod(incoming.carouselMethod, safeExisting.carouselMethod || DEFAULT_EXTERNAL_CONFIG.carouselMethod),
    paymentPath: providerCode === 'UAZAPI'
      ? resolveProviderPath(incoming.paymentPath, safeExisting.paymentPath, defaultPaymentPath, DEFAULT_EXTERNAL_CONFIG.paymentPath)
      : normalizePath(incoming.paymentPath, providerCodeChanged ? defaultPaymentPath : (safeExisting.paymentPath || defaultPaymentPath)),
    paymentMethod: normalizeMethod(incoming.paymentMethod, safeExisting.paymentMethod || DEFAULT_EXTERNAL_CONFIG.paymentMethod),
    bulkPath: providerCode === 'UAZAPI'
      ? resolveProviderPath(incoming.bulkPath, safeExisting.bulkPath, defaultBulkPath, DEFAULT_EXTERNAL_CONFIG.bulkPath)
      : normalizePath(incoming.bulkPath, providerCodeChanged ? defaultBulkPath : (safeExisting.bulkPath || defaultBulkPath)),
    bulkMethod: normalizeMethod(incoming.bulkMethod, safeExisting.bulkMethod || DEFAULT_EXTERNAL_CONFIG.bulkMethod),
    storyPath: providerCode === 'UAZAPI'
      ? resolveProviderPath(incoming.storyPath, safeExisting.storyPath, defaultStoryPath, DEFAULT_EXTERNAL_CONFIG.storyPath)
      : normalizePath(incoming.storyPath, providerCodeChanged ? defaultStoryPath : (safeExisting.storyPath || defaultStoryPath)),
    storyMethod: normalizeMethod(incoming.storyMethod, safeExisting.storyMethod || DEFAULT_EXTERNAL_CONFIG.storyMethod),
    webhook: {
      enabled: incoming?.webhook?.enabled !== undefined
        ? Boolean(incoming.webhook.enabled)
        : Boolean(safeExisting?.webhook?.enabled),
      method: normalizeMethod(incoming?.webhook?.method, safeExisting?.webhook?.method || 'POST'),
      url: String(incoming?.webhook?.url || safeExisting?.webhook?.url || '').trim(),
      addUrlEvents: incoming?.webhook?.addUrlEvents !== undefined
        ? Boolean(incoming.webhook.addUrlEvents)
        : Boolean(safeExisting?.webhook?.addUrlEvents),
      addUrlTypesMessages: incoming?.webhook?.addUrlTypesMessages !== undefined
        ? Boolean(incoming.webhook.addUrlTypesMessages)
        : Boolean(safeExisting?.webhook?.addUrlTypesMessages),
      events: normalizeStringArray(incoming?.webhook?.events, normalizeStringArray(safeExisting?.webhook?.events, ['messages'])),
      excludeMessages: normalizeStringArray(incoming?.webhook?.excludeMessages, normalizeStringArray(safeExisting?.webhook?.excludeMessages, ['wasSentByApi', 'isGroupYes'])),
    },
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

const normalizeSubdomainInput = (value: string, rawBaseUrl: string) => {
  let normalized = String(value || '').trim();
  if (!normalized) return '';

  // Accept values such as "https://instancia.uazapi.com" or "instancia.uazapi.com"
  // and reduce them to only the instance token expected by {subdomain}.
  try {
    const asUrl = new URL(normalized);
    normalized = asUrl.hostname;
  } catch {
    normalized = normalized.replace(/^(https?:\/\/)+/i, '');
  }

  normalized = normalized
    .split('/')[0]
    .split('?')[0]
    .trim()
    .replace(/\.+$/, '')
    .replace(/^(https?:\/\/)+/i, '');

  const lowerBase = String(rawBaseUrl || '').toLowerCase();
  if (lowerBase.includes('{subdomain}.uazapi.com')) {
    normalized = normalized.replace(/\.uazapi\.com$/i, '');
  }

  if (normalized.includes('.')) {
    normalized = normalized.split('.')[0];
  }

  return normalized.replace(/[^a-zA-Z0-9-]/g, '').trim();
};

const buildBaseUrl = (config: WhatsAppExternalProviderConfig) => {
  const rawBaseUrl = String(config.baseUrl || '').trim().replace(/\/+$/, '');
  if (!rawBaseUrl) return '';
  if (rawBaseUrl.includes('{subdomain}')) {
    const subdomain = normalizeSubdomainInput(String(config.subdomain || ''), rawBaseUrl);
    if (!subdomain) {
      throw new Error('Subdomain/instância da API externa não informado. Preencha em CONTA.');
    }
    return rawBaseUrl.split('{subdomain}').join(subdomain);
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
  const providerCode = String(config.providerCode || '').trim().toUpperCase();
  if (providerCode === 'UAZAPI' && !String(config.token || '').trim()) {
    throw new Error('Token da UAZAPI não informado. Preencha em CONTA e salve a configuração.');
  }

  const endpointUrl = buildEndpointUrl(config, path);
  if (!endpointUrl) {
    throw new Error('Base URL da API externa não configurada.');
  }

  try {
    // Validate URL format early to avoid opaque fetch errors.
    new URL(endpointUrl);
  } catch {
    throw new Error(`Endpoint externo inválido: ${endpointUrl}`);
  }

  const fetchFn = (globalThis as any).fetch as ((input: string, init?: any) => Promise<any>) | undefined;
  if (typeof fetchFn !== 'function') {
    throw new Error('Fetch não está disponível no runtime do backend.');
  }

  const isGet = method === 'GET';
  let response: any;
  try {
    response = await fetchFn(endpointUrl, {
      method,
      headers: createAuthHeaders(config),
      body: isGet ? undefined : JSON.stringify(body || {}),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err || 'erro desconhecido');
    throw new Error(`Falha de rede ao chamar API externa (${endpointUrl}): ${detail}`);
  }

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

const EXTERNAL_COMM_FAILURE_THRESHOLD = 3;
const externalFailuresByEnterprise = new Map<string, number>();

const resetExternalFailureCounter = (enterpriseId: string) => {
  const safeEnterpriseId = String(enterpriseId || '').trim();
  if (!safeEnterpriseId) return;
  externalFailuresByEnterprise.set(safeEnterpriseId, 0);
};

const shouldCountAsExternalCommunicationFailure = (error: unknown) => {
  const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
  if (!message) return false;
  return message.includes('falha de rede')
    || message.includes('fetch')
    || message.includes('endpoint externo inválido')
    || message.includes('base url da api externa')
    || message.includes('timed out')
    || message.includes('timeout')
    || message.includes('econn')
    || message.includes('enotfound')
    || message.includes('socket')
    || message.includes('falha no provedor externo (5')
    || message.includes('falha no envio de mídia externo (5')
    || message.includes('falha no envio de menu externo (5')
    || message.includes('falha no envio de carrossel externo (5')
    || message.includes('falha ao solicitar pagamento externo (5')
    || message.includes('falha no envio de story externo (5')
    || message.includes('falha no disparo externo (5');
};

const switchEnterpriseProviderToNativeFallback = (enterpriseId: string, reason: string) => {
  const safeEnterpriseId = String(enterpriseId || '').trim();
  if (!safeEnterpriseId) return;

  const map = getProviderConfigMap();
  const existing = normalizeProviderConfig(map[safeEnterpriseId]);
  if (existing.mode === 'NATIVE') {
    resetExternalFailureCounter(safeEnterpriseId);
    return;
  }

  const updated = normalizeProviderConfig(
    {
      ...existing,
      mode: 'NATIVE',
      updatedByName: 'AUTO_FAILOVER',
      updatedByUserId: 'AUTO_FAILOVER',
    },
    existing
  );
  map[safeEnterpriseId] = updated;
  saveProviderConfigMap(map);
  resetExternalFailureCounter(safeEnterpriseId);
  console.warn(`[whatsapp-provider-bridge] fallback automatico para NATIVE ativado em ${safeEnterpriseId}: ${reason}`);
};

const withExternalAutoFailover = async <T>(params: {
  enterpriseId: string;
  actionName: string;
  runner: () => Promise<T>;
}) => {
  const enterpriseId = String(params.enterpriseId || '').trim();
  const config = getEnterpriseProviderConfig(enterpriseId);

  try {
    const result = await params.runner();
    resetExternalFailureCounter(enterpriseId);
    return result;
  } catch (err) {
    const countAsFailure = shouldCountAsExternalCommunicationFailure(err);
    if (countAsFailure) {
      const nextFailureCount = Number(externalFailuresByEnterprise.get(enterpriseId) || 0) + 1;
      externalFailuresByEnterprise.set(enterpriseId, nextFailureCount);

      if (
        config.mode === 'EXTERNAL'
        && config.external.enabled
        && config.external.autoFallbackToNativeOnFailure
        && nextFailureCount >= EXTERNAL_COMM_FAILURE_THRESHOLD
      ) {
        switchEnterpriseProviderToNativeFallback(
          enterpriseId,
          `${params.actionName} atingiu ${nextFailureCount} falhas de comunicacao consecutivas`
        );
        throw new Error('API externa com falha de comunicação em 3 tentativas. Sistema mudou automaticamente para Baileys (NATIVE).');
      }
    }

    throw err;
  }
};

const canUseExternalAdvancedProvider = (config: WhatsAppProviderConfig) => {
  const providerCode = String(config?.external?.providerCode || '').trim().toUpperCase();
  return config?.mode === 'EXTERNAL' && Boolean(config?.external?.enabled) && Boolean(providerCode);
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

  const providerCode = String(config.external.providerCode || '').trim().toUpperCase();
  const normalizedTestPath = normalizePath(config.external.testPath, '/');
  const isUazapiTextTest = providerCode === 'UAZAPI' && normalizedTestPath === '/send/text';
  const requestBody = isUazapiTextTest
    ? {
      number: '5500000000000',
      text: '[CantinaSmart] Teste de conectividade da API externa',
    }
    : {
      subdomain: config.external.subdomain,
      enterpriseId: String(enterpriseId || '').trim(),
    };

  let response = await callExternalEndpoint(
    config.external,
    config.external.testMethod,
    config.external.testPath,
    requestBody
  );

  if (!response.ok && response.status === 405 && providerCode === 'UAZAPI') {
    const alternateMethod: ExternalProviderHttpMethod = config.external.testMethod === 'GET' ? 'POST' : 'GET';
    response = await callExternalEndpoint(
      config.external,
      alternateMethod,
      config.external.testPath,
      requestBody
    );
  }

  const acceptedAsConnection = response.ok
    || (isUazapiTextTest && (response.status === 400 || response.status === 422));

  return {
    success: acceptedAsConnection,
    mode: config.mode,
    message: acceptedAsConnection
      ? 'Conexão externa validada.'
      : 'Falha no teste da API externa.',
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

const UAZAPI_MAX_PRESENCE_DELAY_MS = 300000;
const UAZAPI_DEFAULT_PRESENCE_DELAY_MS = 30000;

const resolvePresenceDelayMs = (commonFields: Record<string, unknown>) => {
  const raw = Number((commonFields as any)?.delay);
  if (!Number.isFinite(raw) || raw <= 0) return UAZAPI_DEFAULT_PRESENCE_DELAY_MS;
  return Math.max(1000, Math.min(UAZAPI_MAX_PRESENCE_DELAY_MS, Math.floor(raw)));
};

const shouldSkipPresenceTarget = (target: string) => {
  const normalized = String(target || '').trim().toLowerCase();
  if (!normalized) return true;
  if (normalized.includes('@newsletter')) return true;
  return false;
};

const triggerUazapiPresenceUpdate = async (config: WhatsAppExternalProviderConfig, target: string, presence: 'composing' | 'recording' | 'paused' = 'composing') => {
  const providerCode = String(config.providerCode || '').trim().toUpperCase();
  if (providerCode !== 'UAZAPI') return;
  if (shouldSkipPresenceTarget(target)) return;

  const commonFields = normalizeObjectRecord(config.commonFields, {});
  const delay = resolvePresenceDelayMs(commonFields);

  await callExternalEndpoint(
    config,
    'POST',
    '/message/presence',
    {
      number: normalizeExternalTarget(providerCode, target),
      presence,
      delay,
    }
  );
};

const resolveMediaFileValue = (base64Data: string, mimeType?: string) => {
  const raw = String(base64Data || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('data:')) return raw;
  const safeMime = String(mimeType || '').trim();
  if (safeMime) return `data:${safeMime};base64,${raw}`;
  return raw;
};

const buildMediaPayload = (params: {
  config: WhatsAppExternalProviderConfig;
  target: string;
  message: string;
  attachment: {
    mediaType: string;
    base64Data: string;
    mimeType?: string;
    fileName?: string;
  };
}) => {
  const { config, target, message, attachment } = params;
  const providerCode = String(config.providerCode || '').trim().toUpperCase();
  const normalizedTarget = normalizeExternalTarget(providerCode, target);
  const commonFields = normalizeObjectRecord(config.commonFields, {});
  const file = resolveMediaFileValue(attachment.base64Data, attachment.mimeType);
  const mediaType = String(attachment.mediaType || '').trim().toLowerCase() || 'document';

  if (providerCode === 'UAZAPI') {
    return {
      ...commonFields,
      number: normalizedTarget,
      type: mediaType,
      file,
      text: String(message || ''),
      docName: attachment.fileName ? String(attachment.fileName) : undefined,
    };
  }

  return {
    ...commonFields,
    subdomain: config.subdomain,
    phone: normalizedTarget,
    message: String(message || ''),
    type: mediaType,
    file,
    mimeType: attachment.mimeType ? String(attachment.mimeType) : undefined,
    fileName: attachment.fileName ? String(attachment.fileName) : undefined,
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

  const response = await withExternalAutoFailover({
    enterpriseId: params.enterpriseId,
    actionName: 'send-text',
    runner: async () => {
      void triggerUazapiPresenceUpdate(config.external, normalizedPhone, 'composing').catch(() => {});

      const result = await callExternalEndpoint(
        config.external,
        config.external.sendMethod,
        config.external.sendPath,
        buildSendPayload(config.external, normalizedPhone, normalizedMessage)
      );

      if (!result.ok) {
        const detailText = typeof result.payload === 'string'
          ? result.payload
          : JSON.stringify(result.payload);
        throw new Error(`Falha no provedor externo (${result.status}): ${detailText || 'erro desconhecido'}`);
      }

      return result;
    },
  });

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

  const resultPayload = await withExternalAutoFailover({
    enterpriseId: params.enterpriseId,
    actionName: 'send-bulk',
    runner: async () => {
      if (String(config.external.providerCode || '').trim().toUpperCase() === 'UAZAPI') {
        const results: Array<{ success: boolean; phone: string; messageId?: string; payload?: unknown; error?: string }> = [];
        let communicationFailures = 0;
        for (const target of recipients) {
          try {
            void triggerUazapiPresenceUpdate(config.external, target, 'composing').catch(() => {});
            const sent = await callExternalEndpoint(
              config.external,
              config.external.sendMethod,
              config.external.sendPath,
              buildSendPayload(config.external, target, String(params.message || ''))
            );
            if (!sent.ok) {
              const detailText = typeof sent.payload === 'string' ? sent.payload : JSON.stringify(sent.payload);
              throw new Error(`Falha (${sent.status}): ${detailText || 'erro desconhecido'}`);
            }
            results.push({
              success: true,
              phone: target,
              messageId: extractMessageId(sent.payload),
              payload: sent.payload,
            });
          } catch (err) {
            if (shouldCountAsExternalCommunicationFailure(err)) {
              communicationFailures += 1;
            }
            results.push({
              success: false,
              phone: target,
              error: err instanceof Error ? err.message : 'falha de envio',
            });
          }
        }
        const successCount = results.filter((item) => item.success).length;
        if (successCount === 0 && communicationFailures > 0) {
          throw new Error('Falha de rede ao chamar API externa em envio em massa.');
        }
        return {
          total: recipients.length,
          successCount,
          failedCount: recipients.length - successCount,
          results,
          payload: { results },
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
        total: recipients.length,
        payload: response.payload,
      };
    },
  });

  return {
    handledByExternal: true,
    result: {
      success: true,
      providerMode: 'EXTERNAL',
      providerCode: config.external.providerCode,
      total: Number((resultPayload as any)?.total || recipients.length),
      successCount: (resultPayload as any)?.successCount,
      failedCount: (resultPayload as any)?.failedCount,
      results: (resultPayload as any)?.results,
      payload: (resultPayload as any)?.payload,
    },
  };
};

export const sendMediaByConfiguredProvider = async (params: {
  enterpriseId: string;
  target: string;
  message: string;
  attachment: {
    mediaType: string;
    base64Data: string;
    mimeType?: string;
    fileName?: string;
  };
}) => {
  const config = getEnterpriseProviderConfig(params.enterpriseId);
  if (config.mode !== 'EXTERNAL' || !config.external.enabled) {
    return {
      handledByExternal: false,
      result: null,
    };
  }

  const response = await withExternalAutoFailover({
    enterpriseId: params.enterpriseId,
    actionName: 'send-media',
    runner: async () => {
      void triggerUazapiPresenceUpdate(config.external, String(params.target || ''), 'composing').catch(() => {});

      const result = await callExternalEndpoint(
        config.external,
        config.external.mediaMethod,
        config.external.mediaPath,
        buildMediaPayload({
          config: config.external,
          target: String(params.target || ''),
          message: String(params.message || ''),
          attachment: {
            mediaType: String(params.attachment?.mediaType || ''),
            base64Data: String(params.attachment?.base64Data || ''),
            mimeType: params.attachment?.mimeType ? String(params.attachment.mimeType) : undefined,
            fileName: params.attachment?.fileName ? String(params.attachment.fileName) : undefined,
          },
        })
      );

      if (!result.ok) {
        const detailText = typeof result.payload === 'string'
          ? result.payload
          : JSON.stringify(result.payload);
        throw new Error(`Falha no envio de mídia externo (${result.status}): ${detailText || 'erro desconhecido'}`);
      }

      return result;
    },
  });

  return {
    handledByExternal: true,
    result: {
      success: true,
      providerMode: 'EXTERNAL',
      providerCode: config.external.providerCode,
      messageId: extractMessageId(response.payload),
      payload: response.payload,
    },
  };
};

export const sendMenuByConfiguredProvider = async (params: {
  enterpriseId: string;
  target: string;
  menu: {
    type: 'button' | 'list' | 'poll' | 'carousel';
    text: string;
    choices: string[];
    footerText?: string;
    listButton?: string;
    selectableCount?: number;
    imageButton?: string;
    trackSource?: string;
    trackId?: string;
  };
}) => {
  const config = getEnterpriseProviderConfig(params.enterpriseId);
  if (!canUseExternalAdvancedProvider(config)) {
    return {
      handledByExternal: false,
      result: null,
    };
  }

  const providerCode = String(config.external.providerCode || '').trim().toUpperCase();
  const commonFields = normalizeObjectRecord(config.external.commonFields, {});
  const target = normalizeExternalTarget(providerCode, String(params.target || ''));
  const menu = params.menu || ({} as any);
  const typeRaw = String(menu.type || '').trim().toLowerCase();
  const safeType: 'button' | 'list' | 'poll' | 'carousel' = (
    typeRaw === 'list' || typeRaw === 'poll' || typeRaw === 'carousel'
  ) ? typeRaw : 'button';
  const choices = Array.isArray(menu.choices)
    ? menu.choices.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  if (!target) throw new Error('Destinatário inválido para menu interativo.');
  if (!String(menu.text || '').trim()) throw new Error('Texto principal é obrigatório para menu interativo.');
  if (choices.length === 0) throw new Error('Informe ao menos uma opção em choices.');

  if (providerCode === 'UAZAPI') {
    void triggerUazapiPresenceUpdate(config.external, target, 'composing').catch(() => {});
  }

  const payload = {
    ...commonFields,
    number: target,
    type: safeType,
    text: String(menu.text || ''),
    choices,
    footerText: String(menu.footerText || '').trim() || undefined,
    listButton: String(menu.listButton || '').trim() || undefined,
    selectableCount: Number.isFinite(Number(menu.selectableCount))
      ? Math.max(1, Math.floor(Number(menu.selectableCount)))
      : undefined,
    imageButton: String(menu.imageButton || '').trim() || undefined,
    track_source: String(menu.trackSource || '').trim() || undefined,
    track_id: String(menu.trackId || '').trim() || undefined,
  };

  const response = await withExternalAutoFailover({
    enterpriseId: params.enterpriseId,
    actionName: 'send-menu',
    runner: async () => {
      const result = await callExternalEndpoint(
        config.external,
        config.external.menuMethod,
        config.external.menuPath,
        payload
      );

      if (!result.ok) {
        const detailText = typeof result.payload === 'string'
          ? result.payload
          : JSON.stringify(result.payload);
        throw new Error(`Falha no envio de menu externo (${result.status}): ${detailText || 'erro desconhecido'}`);
      }

      return result;
    },
  });

  return {
    handledByExternal: true,
    result: {
      success: true,
      providerMode: 'EXTERNAL',
      providerCode: config.external.providerCode,
      messageId: extractMessageId(response.payload),
      payload: response.payload,
    },
  };
};

export const sendCarouselByConfiguredProvider = async (params: {
  enterpriseId: string;
  target: string;
  text: string;
  carousel: Array<{
    text: string;
    image: string;
    buttons: Array<{
      id: string;
      text: string;
      type: 'REPLY' | 'URL' | 'COPY' | 'CALL';
    }>;
  }>;
  trackSource?: string;
  trackId?: string;
}) => {
  const config = getEnterpriseProviderConfig(params.enterpriseId);
  if (!canUseExternalAdvancedProvider(config)) {
    return {
      handledByExternal: false,
      result: null,
    };
  }

  const providerCode = String(config.external.providerCode || '').trim().toUpperCase();
  const commonFields = normalizeObjectRecord(config.external.commonFields, {});
  const target = normalizeExternalTarget(providerCode, String(params.target || ''));
  const text = String(params.text || '').trim();
  const carousel = Array.isArray(params.carousel) ? params.carousel : [];
  if (!target) throw new Error('Destinatário inválido para carrossel.');
  if (!text) throw new Error('Texto principal é obrigatório para carrossel.');
  if (carousel.length === 0) throw new Error('Array carousel é obrigatório.');

  const normalizedCarousel = carousel.map((card: any) => ({
    text: String(card?.text || '').trim(),
    image: String(card?.image || '').trim(),
    buttons: Array.isArray(card?.buttons)
      ? card.buttons.map((button: any) => ({
        id: String(button?.id || '').trim(),
        text: String(button?.text || '').trim(),
        type: (() => {
          const raw = String(button?.type || '').trim().toUpperCase();
          if (raw === 'URL' || raw === 'COPY' || raw === 'CALL') return raw;
          return 'REPLY';
        })(),
      })).filter((button: any) => button.id && button.text)
      : [],
  })).filter((card: any) => card.text && card.image && Array.isArray(card.buttons) && card.buttons.length > 0);

  if (normalizedCarousel.length === 0) {
    throw new Error('Cada cartão deve ter text, image e ao menos um botão válido.');
  }

  if (providerCode === 'UAZAPI') {
    void triggerUazapiPresenceUpdate(config.external, target, 'composing').catch(() => {});
  }

  const payload = {
    ...commonFields,
    number: target,
    text,
    carousel: normalizedCarousel,
    track_source: String(params.trackSource || '').trim() || undefined,
    track_id: String(params.trackId || '').trim() || undefined,
  };

  const response = await withExternalAutoFailover({
    enterpriseId: params.enterpriseId,
    actionName: 'send-carousel',
    runner: async () => {
      const result = await callExternalEndpoint(
        config.external,
        config.external.carouselMethod,
        config.external.carouselPath,
        payload
      );

      if (!result.ok) {
        const detailText = typeof result.payload === 'string'
          ? result.payload
          : JSON.stringify(result.payload);
        throw new Error(`Falha no envio de carrossel externo (${result.status}): ${detailText || 'erro desconhecido'}`);
      }

      return result;
    },
  });

  return {
    handledByExternal: true,
    result: {
      success: true,
      providerMode: 'EXTERNAL',
      providerCode: config.external.providerCode,
      messageId: extractMessageId(response.payload),
      payload: response.payload,
    },
  };
};

export const sendPaymentRequestByConfiguredProvider = async (params: {
  enterpriseId: string;
  request: {
    number: string;
    title?: string;
    text?: string;
    footer?: string;
    itemName?: string;
    invoiceNumber?: string;
    amount?: number;
    pixKey?: string;
    pixType?: 'CPF' | 'CNPJ' | 'PHONE' | 'EMAIL' | 'EVP';
    pixName?: string;
    paymentLink?: string;
    fileUrl?: string;
    fileName?: string;
    boletoCode?: string;
    trackSource?: string;
    trackId?: string;
  };
}) => {
  const config = getEnterpriseProviderConfig(params.enterpriseId);
  if (!canUseExternalAdvancedProvider(config)) {
    return {
      handledByExternal: false,
      result: null,
    };
  }

  const providerCode = String(config.external.providerCode || '').trim().toUpperCase();
  const commonFields = normalizeObjectRecord(config.external.commonFields, {});
  const req = params.request || ({} as any);
  const number = normalizeExternalTarget(providerCode, String(req.number || '').trim());
  const amount = Number(req.amount);
  const normalizedPaymentPath = normalizePath(config.external.paymentPath, '/');
  const isUazapiPixButton = providerCode === 'UAZAPI' && normalizedPaymentPath === '/send/pix-button';
  if (!number) throw new Error('Número/ID do chat é obrigatório.');
  if (!isUazapiPixButton && (!Number.isFinite(amount) || amount <= 0)) {
    throw new Error('amount é obrigatório e deve ser maior que zero.');
  }

  if (providerCode === 'UAZAPI') {
    void triggerUazapiPresenceUpdate(config.external, number, 'composing').catch(() => {});
  }

  const pixTypeRaw = String(req.pixType || 'EVP').trim().toUpperCase();
  const safePixType: 'CPF' | 'CNPJ' | 'PHONE' | 'EMAIL' | 'EVP' = (
    pixTypeRaw === 'CPF' || pixTypeRaw === 'CNPJ' || pixTypeRaw === 'PHONE' || pixTypeRaw === 'EMAIL'
  ) ? pixTypeRaw : 'EVP';

  const pixKey = String(req.pixKey || '').trim();
  if (isUazapiPixButton && !pixKey) {
    throw new Error('pixKey é obrigatório para o endpoint /send/pix-button.');
  }

  const payload = isUazapiPixButton
    ? {
      ...commonFields,
      number,
      pixKey,
      pixType: safePixType,
      pixName: String(req.pixName || '').trim() || 'Pix',
      track_source: String(req.trackSource || '').trim() || undefined,
      track_id: String(req.trackId || '').trim() || undefined,
    }
    : {
      ...commonFields,
      number,
      title: String(req.title || '').trim() || undefined,
      text: String(req.text || '').trim() || undefined,
      footer: String(req.footer || '').trim() || undefined,
      itemName: String(req.itemName || '').trim() || undefined,
      invoiceNumber: String(req.invoiceNumber || '').trim() || undefined,
      amount,
      pixKey: pixKey || undefined,
      pixType: safePixType,
      pixName: String(req.pixName || '').trim() || undefined,
      paymentLink: String(req.paymentLink || '').trim() || undefined,
      fileUrl: String(req.fileUrl || '').trim() || undefined,
      fileName: String(req.fileName || '').trim() || undefined,
      boletoCode: String(req.boletoCode || '').trim() || undefined,
      track_source: String(req.trackSource || '').trim() || undefined,
      track_id: String(req.trackId || '').trim() || undefined,
    };

  const response = await withExternalAutoFailover({
    enterpriseId: params.enterpriseId,
    actionName: 'send-payment',
    runner: async () => {
      const result = await callExternalEndpoint(
        config.external,
        config.external.paymentMethod,
        config.external.paymentPath,
        payload
      );

      if (!result.ok) {
        const detailText = typeof result.payload === 'string'
          ? result.payload
          : JSON.stringify(result.payload);
        throw new Error(`Falha ao solicitar pagamento externo (${result.status}): ${detailText || 'erro desconhecido'}`);
      }

      return result;
    },
  });

  return {
    handledByExternal: true,
    result: {
      success: true,
      providerMode: 'EXTERNAL',
      providerCode: config.external.providerCode,
      messageId: extractMessageId(response.payload),
      payload: response.payload,
    },
  };
};

export const sendStoryByConfiguredProvider = async (params: {
  enterpriseId: string;
  story: {
    type: 'text' | 'image' | 'video';
    text?: string;
    background_color?: number;
    font?: number;
    file?: string;
    thumbnail?: string;
    mimetype?: string;
    replyid?: string;
    mentions?: string;
    readchat?: boolean;
    readmessages?: boolean;
    delay?: number;
    forward?: boolean;
    async?: boolean;
    track_source?: string;
    track_id?: string;
  };
}) => {
  const config = getEnterpriseProviderConfig(params.enterpriseId);
  if (!canUseExternalAdvancedProvider(config)) {
    return {
      handledByExternal: false,
      result: null,
    };
  }

  const providerCode = String(config.external.providerCode || '').trim().toUpperCase();
  if (providerCode === 'UAZAPI') {
    const payload = {
      ...normalizeObjectRecord(config.external.commonFields, {}),
      ...normalizeObjectRecord(params.story, {}),
    };

    const response = await withExternalAutoFailover({
      enterpriseId: params.enterpriseId,
      actionName: 'send-story',
      runner: async () => {
        const result = await callExternalEndpoint(
          config.external,
          config.external.storyMethod,
          config.external.storyPath,
          payload as Record<string, unknown>
        );

        if (!result.ok) {
          const detailText = typeof result.payload === 'string'
            ? result.payload
            : JSON.stringify(result.payload);
          throw new Error(`Falha no envio de story externo (${result.status}): ${detailText || 'erro desconhecido'}`);
        }

        return result;
      },
    });

    return {
      handledByExternal: true,
      result: {
        success: true,
        providerMode: 'EXTERNAL',
        providerCode: config.external.providerCode,
        messageId: extractMessageId(response.payload),
        payload: response.payload,
      },
    };
  }

  throw new Error('Provedor externo atual não suporta stories por este endpoint.');
};
