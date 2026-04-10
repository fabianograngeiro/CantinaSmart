import crypto from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DESTRUCTIVE_CONFIRMATION_TTL_MS = 5 * 60 * 1000;
const MIN_REASON_LENGTH = 8;

type DestructiveChallenge = {
  challengeId: string;
  phrase: string;
  actionKey: string;
  actionLabel: string;
  userId: string;
  userRole: string;
  payloadFingerprint: string;
  createdAt: number;
  expiresAt: number;
};

const destructiveChallenges = new Map<string, DestructiveChallenge>();
const auditLogPath = path.resolve(__dirname, '../data/destructive-actions-audit.log');

const normalizeToken = (value: unknown) =>
  String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

const buildChallengeStorageKey = (params: {
  userId: string;
  userRole: string;
  actionKey: string;
  payloadFingerprint: string;
}) => {
  return [
    normalizeToken(params.userId),
    normalizeToken(params.userRole),
    normalizeToken(params.actionKey),
    normalizeToken(params.payloadFingerprint),
  ].join('|');
};

const cleanupChallenges = () => {
  const now = Date.now();
  for (const [key, challenge] of destructiveChallenges.entries()) {
    if (Number(challenge?.expiresAt || 0) <= now) {
      destructiveChallenges.delete(key);
    }
  }
};

export const createDestructivePayloadFingerprint = (input: unknown) => {
  let serialized = '';
  try {
    serialized = JSON.stringify(input ?? null);
  } catch {
    serialized = String(input ?? '');
  }
  return crypto.createHash('sha256').update(serialized).digest('hex').slice(0, 24);
};

export const appendDestructiveActionAudit = async (payload: {
  actionKey: string;
  actionLabel: string;
  userId: string;
  userRole: string;
  confirmationReason: string;
  payloadFingerprint: string;
  status: 'APPROVED' | 'EXECUTED' | 'FAILED';
  details?: any;
}) => {
  const linePayload = {
    timestamp: new Date().toISOString(),
    actionKey: normalizeToken(payload.actionKey),
    actionLabel: String(payload.actionLabel || '').trim(),
    userId: String(payload.userId || '').trim(),
    userRole: normalizeToken(payload.userRole),
    confirmationReason: String(payload.confirmationReason || '').trim(),
    payloadFingerprint: String(payload.payloadFingerprint || '').trim(),
    status: normalizeToken(payload.status),
    details: payload.details ?? null,
  };
  await fs.mkdir(path.dirname(auditLogPath), { recursive: true });
  await fs.appendFile(auditLogPath, `${JSON.stringify(linePayload)}\n`, 'utf-8');
};

export const requireDestructiveActionConfirmation = (params: {
  userId: string;
  userRole: string;
  actionKey: string;
  actionLabel: string;
  payloadFingerprint: string;
  confirmationChallengeId?: string;
  confirmationPhrase?: string;
  confirmationReason?: string;
}) => {
  cleanupChallenges();

  const storageKey = buildChallengeStorageKey({
    userId: params.userId,
    userRole: params.userRole,
    actionKey: params.actionKey,
    payloadFingerprint: params.payloadFingerprint,
  });

  const confirmationChallengeId = String(params.confirmationChallengeId || '').trim();
  const confirmationPhrase = String(params.confirmationPhrase || '').trim();
  const confirmationReason = String(params.confirmationReason || '').trim();

  const existing = destructiveChallenges.get(storageKey);
  const now = Date.now();
  if (
    existing
    && existing.expiresAt > now
    && confirmationChallengeId
    && confirmationPhrase
    && confirmationChallengeId === existing.challengeId
    && normalizeToken(confirmationPhrase) === normalizeToken(existing.phrase)
  ) {
    if (confirmationReason.length < MIN_REASON_LENGTH) {
      return {
        approved: false as const,
        status: 400,
        body: {
          error: `Motivo da confirmação é obrigatório (mínimo de ${MIN_REASON_LENGTH} caracteres).`,
          confirmationRequired: true,
        },
      };
    }
    destructiveChallenges.delete(storageKey);
    return {
      approved: true as const,
      confirmationReason,
    };
  }

  const challengeId = crypto.randomBytes(8).toString('hex');
  const code = crypto.randomBytes(3).toString('hex').toUpperCase();
  const phrase = `CONFIRMAR ${normalizeToken(params.actionLabel)} ${code}`;
  const challenge: DestructiveChallenge = {
    challengeId,
    phrase,
    actionKey: normalizeToken(params.actionKey),
    actionLabel: String(params.actionLabel || '').trim(),
    userId: String(params.userId || '').trim(),
    userRole: normalizeToken(params.userRole),
    payloadFingerprint: String(params.payloadFingerprint || '').trim(),
    createdAt: now,
    expiresAt: now + DESTRUCTIVE_CONFIRMATION_TTL_MS,
  };
  destructiveChallenges.set(storageKey, challenge);

  return {
    approved: false as const,
    status: 428,
    body: {
      error: 'Confirmação forte obrigatória para operação destrutiva.',
      confirmationRequired: true,
      challenge: {
        challengeId: challenge.challengeId,
        phrase: challenge.phrase,
        expiresAt: new Date(challenge.expiresAt).toISOString(),
        expiresInSeconds: Math.floor(DESTRUCTIVE_CONFIRMATION_TTL_MS / 1000),
        actionLabel: challenge.actionLabel,
      },
      instructions: [
        'Repita a mesma operação enviando challengeId e phrase recebidos.',
        'Envie também confirmationReason com justificativa operacional.',
      ],
      requiredFields: ['confirmationChallengeId', 'confirmationPhrase', 'confirmationReason'],
    },
  };
};
