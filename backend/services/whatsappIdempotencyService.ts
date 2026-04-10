import { createHash } from 'crypto';
import { db } from '../database.js';

type DispatchSource = 'MANUAL_SEND' | 'MANUAL_BULK' | 'SCHEDULER';

type DispatchIdempotencyEntry = {
  fingerprint: string;
  source: DispatchSource;
  enterpriseId: string;
  phone: string;
  createdAt: string;
  expiresAt: string;
  status: 'PENDING' | 'SENT';
  messageId?: string;
  detail?: any;
};

const DEFAULT_TTL_SECONDS = 15 * 60;
const MIN_TTL_SECONDS = 30;
const MAX_TTL_SECONDS = 24 * 60 * 60;

const normalizePhoneDigits = (value: unknown) => String(value ?? '').replace(/\D/g, '');

const normalizeMessage = (value: unknown) =>
  String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

const normalizeToken = (value: unknown) =>
  String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

const hashContent = (value: string) => createHash('sha256').update(value).digest('hex');

const buildFingerprint = (payload: {
  source: DispatchSource;
  enterpriseId: string;
  phone: string;
  message: string;
  idempotencyKey?: string;
  profileId?: string;
  slotKey?: string;
}) => {
  const base = {
    source: normalizeToken(payload.source),
    enterpriseId: String(payload.enterpriseId || '').trim(),
    phone: normalizePhoneDigits(payload.phone),
    messageHash: hashContent(normalizeMessage(payload.message)),
    idempotencyKey: String(payload.idempotencyKey || '').trim(),
    profileId: String(payload.profileId || '').trim(),
    slotKey: String(payload.slotKey || '').trim(),
  };
  return hashContent(JSON.stringify(base));
};

const getStoreMap = (): Record<string, DispatchIdempotencyEntry[]> => {
  const store = db.getWhatsAppStore() as any;
  const raw = store?.dispatchIdempotencyByEnterprise;
  return raw && typeof raw === 'object' ? raw : {};
};

const persistStoreMap = (map: Record<string, DispatchIdempotencyEntry[]>) => {
  db.updateWhatsAppStore({
    dispatchIdempotencyByEnterprise: map,
  });
};

const pruneExpired = (entries: DispatchIdempotencyEntry[], nowMs: number) =>
  entries.filter((entry) => {
    const expiresAt = Date.parse(String(entry?.expiresAt || ''));
    if (!Number.isFinite(expiresAt)) return false;
    return expiresAt > nowMs;
  });

const saveEntry = (enterpriseId: string, nextEntry: DispatchIdempotencyEntry) => {
  const map = getStoreMap();
  const current = Array.isArray(map[enterpriseId]) ? map[enterpriseId] : [];
  const nowMs = Date.now();
  const pruned = pruneExpired(current, nowMs);
  const withoutSame = pruned.filter((entry) => String(entry?.fingerprint || '') !== nextEntry.fingerprint);
  map[enterpriseId] = [nextEntry, ...withoutSame].slice(0, 5000);
  persistStoreMap(map);
};

const removeEntry = (enterpriseId: string, fingerprint: string) => {
  const map = getStoreMap();
  const current = Array.isArray(map[enterpriseId]) ? map[enterpriseId] : [];
  map[enterpriseId] = current.filter((entry) => String(entry?.fingerprint || '') !== fingerprint);
  persistStoreMap(map);
};

export const reserveDispatchIdempotency = (params: {
  source: DispatchSource;
  enterpriseId: string;
  phone: string;
  message: string;
  idempotencyKey?: string;
  ttlSeconds?: number;
  profileId?: string;
  slotKey?: string;
}) => {
  const enterpriseId = String(params.enterpriseId || '').trim();
  const phone = normalizePhoneDigits(params.phone);
  const message = normalizeMessage(params.message);
  if (!enterpriseId || !phone || !message) {
    throw new Error('Dados insuficientes para idempotencia de disparo.');
  }

  const ttlSecondsRaw = Number(params.ttlSeconds || DEFAULT_TTL_SECONDS);
  const ttlSeconds = Math.max(MIN_TTL_SECONDS, Math.min(MAX_TTL_SECONDS, Number.isFinite(ttlSecondsRaw) ? ttlSecondsRaw : DEFAULT_TTL_SECONDS));

  const fingerprint = buildFingerprint({
    source: params.source,
    enterpriseId,
    phone,
    message,
    idempotencyKey: params.idempotencyKey,
    profileId: params.profileId,
    slotKey: params.slotKey,
  });

  const map = getStoreMap();
  const current = Array.isArray(map[enterpriseId]) ? map[enterpriseId] : [];
  const nowMs = Date.now();
  const pruned = pruneExpired(current, nowMs);
  const existing = pruned.find((entry) => String(entry?.fingerprint || '') === fingerprint);

  if (existing && (existing.status === 'PENDING' || existing.status === 'SENT')) {
    map[enterpriseId] = pruned;
    persistStoreMap(map);
    return {
      duplicate: true as const,
      fingerprint,
      existing,
    };
  }

  const nowIso = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + (ttlSeconds * 1000)).toISOString();
  const pendingEntry: DispatchIdempotencyEntry = {
    fingerprint,
    source: params.source,
    enterpriseId,
    phone,
    createdAt: nowIso,
    expiresAt,
    status: 'PENDING',
  };

  saveEntry(enterpriseId, pendingEntry);

  return {
    duplicate: false as const,
    fingerprint,
    entry: pendingEntry,
  };
};

export const markDispatchIdempotencySent = (params: {
  enterpriseId: string;
  fingerprint: string;
  messageId?: string;
  detail?: any;
}) => {
  const enterpriseId = String(params.enterpriseId || '').trim();
  const fingerprint = String(params.fingerprint || '').trim();
  if (!enterpriseId || !fingerprint) return;

  const map = getStoreMap();
  const current = Array.isArray(map[enterpriseId]) ? map[enterpriseId] : [];
  const nowMs = Date.now();
  const pruned = pruneExpired(current, nowMs);

  const next = pruned.map((entry) => {
    if (String(entry?.fingerprint || '') !== fingerprint) return entry;
    return {
      ...entry,
      status: 'SENT' as const,
      messageId: String(params.messageId || entry?.messageId || '').trim() || undefined,
      detail: params.detail ?? entry?.detail,
    };
  });

  map[enterpriseId] = next;
  persistStoreMap(map);
};

export const clearDispatchIdempotencyReservation = (params: {
  enterpriseId: string;
  fingerprint: string;
}) => {
  const enterpriseId = String(params.enterpriseId || '').trim();
  const fingerprint = String(params.fingerprint || '').trim();
  if (!enterpriseId || !fingerprint) return;
  removeEntry(enterpriseId, fingerprint);
};
