import { Router, Request, Response } from 'express';
import { db } from '../database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { processOverduePlanConsumptions } from '../services/planConsumptionAutoProcessor.js';
import { canAccessAllEnterprises, getRequesterEnterpriseIds, normalizeRole, requesterCanAccessEnterprise } from '../utils/enterpriseAccess.js';
import {
  appendDestructiveActionAudit,
  createDestructivePayloadFingerprint,
  requireDestructiveActionConfirmation,
} from '../utils/destructiveActionGuard.js';

const router = Router();
router.use(authMiddleware);

const resolveRoleLabel = (role?: string) => {
  const normalized = String(role || '').trim().toUpperCase();
  if (!normalized) return '';
  if (normalized === 'OWNER') return 'DONO DE REDE';
  return normalized.replace(/_/g, ' ');
};

const canDeleteTransactionByRole = (role?: string) => {
  const normalized = normalizeRole(role);
  return normalized === 'SUPERADMIN'
    || normalized === 'ADMIN_SISTEMA'
    || normalized === 'ADMIN'
    || normalized === 'OWNER'
    || normalized === 'GERENTE';
};

const canPurgeClientHistoryByRole = (role?: string) => {
  const normalized = normalizeRole(role);
  return normalized === 'SUPERADMIN'
    || normalized === 'ADMIN_SISTEMA'
    || normalized === 'ADMIN'
    || normalized === 'OWNER'
    || normalized === 'GERENTE';
};

const normalizeToken = (value: unknown) => String(value || '')
  .trim()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase();

const normalizeDateKey = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = `${parsed.getMonth() + 1}`.padStart(2, '0');
  const day = `${parsed.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const TRANSACTION_CREATE_IDEMPOTENCY_TTL_MS = 2 * 60 * 1000;
type TransactionCreateIdempotencyRecord = {
  status: 'PENDING' | 'DONE';
  createdAt: number;
  responseBody?: any;
};
const transactionCreateIdempotencyStore = new Map<string, TransactionCreateIdempotencyRecord>();

const TRANSACTION_CREATE_REPLAY_GUARD_WINDOW_MS = 12 * 1000;
type TransactionCreateReplayGuardRecord = {
  createdAt: number;
  responseBody: any;
};
const transactionCreateReplayGuardStore = new Map<string, TransactionCreateReplayGuardRecord>();

const cleanupTransactionCreateIdempotencyStore = () => {
  const now = Date.now();
  for (const [key, entry] of transactionCreateIdempotencyStore.entries()) {
    if ((now - Number(entry?.createdAt || 0)) > TRANSACTION_CREATE_IDEMPOTENCY_TTL_MS) {
      transactionCreateIdempotencyStore.delete(key);
    }
  }
};

const cleanupTransactionCreateReplayGuardStore = () => {
  const now = Date.now();
  for (const [key, entry] of transactionCreateReplayGuardStore.entries()) {
    if ((now - Number(entry?.createdAt || 0)) > TRANSACTION_CREATE_REPLAY_GUARD_WINDOW_MS) {
      transactionCreateReplayGuardStore.delete(key);
    }
  }
};

const buildTransactionCreateIdempotencyKey = (req: AuthRequest, payload: any) => {
  const requesterUserId = String((req as any)?.userId || '').trim() || 'anonymous';
  const enterpriseId = String(payload?.enterpriseId || '').trim();
  const explicitRaw = String(req.header('x-idempotency-key') || '').trim();
  if (explicitRaw) {
    return `EXPLICIT:${requesterUserId}:${enterpriseId}:${explicitRaw.slice(0, 160)}`;
  }

  const selectedDates = Array.from(new Set(
    (Array.isArray(payload?.selectedDates) ? payload.selectedDates : [])
      .map((value: unknown) => normalizeDateKey(value))
      .filter(Boolean)
  )).sort();

  const fingerprintParts = [
    normalizeToken(payload?.kind),
    normalizeToken(payload?.type),
    String(payload?.clientId || '').trim(),
    normalizeToken(payload?.clientName),
    String(Number(payload?.amount ?? 0)),
    String(Number(payload?.total ?? 0)),
    normalizeToken(payload?.plan || payload?.planName),
    String(payload?.planId || payload?.originPlanId || '').trim(),
    normalizeToken(payload?.paymentMethod || payload?.method),
    normalizeToken(payload?.item),
    normalizeToken(payload?.description),
    normalizeDateKey(payload?.date || payload?.deliveryDate || payload?.scheduledDate || payload?.referenceDate || payload?.timestamp),
    selectedDates.join(','),
  ];

  return `DERIVED:${requesterUserId}:${enterpriseId}:${fingerprintParts.join('|')}`;
};

const buildTransactionCreateReplayGuardKey = (req: AuthRequest, payload: any) => {
  const requesterUserId = String((req as any)?.userId || '').trim() || 'anonymous';
  const enterpriseId = String(payload?.enterpriseId || '').trim();

  const selectedDates = Array.from(new Set(
    (Array.isArray(payload?.selectedDates) ? payload.selectedDates : [])
      .map((value: unknown) => normalizeDateKey(value))
      .filter(Boolean)
  )).sort();

  const fingerprintParts = [
    requesterUserId,
    enterpriseId,
    normalizeToken(payload?.kind),
    normalizeToken(payload?.type),
    String(payload?.clientId || '').trim(),
    normalizeToken(payload?.clientName),
    String(Number(payload?.amount ?? 0)),
    String(Number(payload?.total ?? 0)),
    String(Number(payload?.planUnits ?? 0)),
    normalizeToken(payload?.plan || payload?.planName),
    String(payload?.planId || payload?.originPlanId || '').trim(),
    normalizeToken(payload?.paymentMethod || payload?.method),
    normalizeToken(payload?.item),
    normalizeToken(payload?.description),
    normalizeDateKey(payload?.date || payload?.deliveryDate || payload?.scheduledDate || payload?.referenceDate),
    normalizeToken(payload?.purchaseRefCode),
    normalizeToken(payload?.originTransactionId),
    selectedDates.join(','),
  ];

  return `REPLAY:${fingerprintParts.join('|')}`;
};

const getPlanCreditValidationPreview = (args: {
  payload: any;
  client: any;
  enterpriseId: string;
}) => {
  const payload = args.payload || {};
  const client = args.client || {};
  const enterpriseId = String(args.enterpriseId || '').trim();

  const txType = normalizeToken(payload?.type);
  if (txType !== 'CREDIT' && txType !== 'CREDITO') return null;

  const selectedDates = Array.from(new Set(
    (Array.isArray(payload?.selectedDates) ? payload.selectedDates : [])
      .map((value: unknown) => normalizeDateKey(value))
      .filter(Boolean)
  )).sort();
  if (selectedDates.length === 0) return null;

  const planId = String(payload?.planId || payload?.originPlanId || '').trim();
  const planName = String(payload?.plan || payload?.planName || '').trim();
  const planNameToken = normalizeToken(planName);
  if (!planId && !planNameToken) return null;

  const plans = db.getPlans(enterpriseId);
  const matchedPlan = plans.find((plan: any) => {
    const candidateId = String(plan?.id || '').trim();
    const candidateName = normalizeToken(plan?.name);
    if (planId && candidateId && planId === candidateId) return true;
    if (planNameToken && candidateName && planNameToken === candidateName) return true;
    return false;
  }) || null;

  const planUnitPriceCandidates = [
    Number(payload?.planUnitValue),
    Number(matchedPlan?.price),
    Number(payload?.amount) / Math.max(1, selectedDates.length),
  ].filter((n) => Number.isFinite(n) && n > 0) as number[];
  const planUnitPrice = planUnitPriceCandidates[0] || 0;
  if (planUnitPrice <= 0) return null;

  const balancesRaw = client?.planCreditBalances && typeof client.planCreditBalances === 'object' && !Array.isArray(client.planCreditBalances)
    ? client.planCreditBalances
    : {};
  const byId = planId ? balancesRaw[planId] : undefined;
  const byNameKey = Object.keys(balancesRaw).find((key) =>
    normalizeToken(balancesRaw[key]?.planName) === (planNameToken || normalizeToken(matchedPlan?.name))
  );
  const rawBalance = byId
    ? Math.max(0, Number(byId?.balance || 0))
    : (byNameKey ? Math.max(0, Number(balancesRaw[byNameKey]?.balance || 0)) : 0);

  const targetClientId = String(client?.id || payload?.clientId || '').trim();
  const targetPlanToken = planNameToken || normalizeToken(matchedPlan?.name);
  const targetPlanId = planId || String(matchedPlan?.id || '').trim();
  const txForClient = db.getTransactions({ clientId: targetClientId, enterpriseId });

  const registerDateFromTx = (tx: any) => {
    const date = normalizeDateKey(tx?.deliveryDate || tx?.scheduledDate || tx?.mealDate || tx?.referenceDate || tx?.date || tx?.timestamp);
    return date;
  };

  const isSamePlan = (tx: any) => {
    const txPlanId = String(tx?.planId || tx?.originPlanId || '').trim();
    const txPlanToken = normalizeToken(tx?.plan || tx?.planName || tx?.item);
    return (targetPlanId && txPlanId && targetPlanId === txPlanId)
      || (targetPlanToken && txPlanToken && targetPlanToken === txPlanToken);
  };

  const registeredDates = new Set<string>();
  const consumedDates = new Set<string>();
  const reversedDates = new Set<string>();
  const deletedDates = new Set<string>();

  const selectedConfigs = Array.isArray(client?.selectedPlansConfig) ? client.selectedPlansConfig : [];
  selectedConfigs.forEach((cfg: any) => {
    const cfgPlanId = String(cfg?.planId || '').trim();
    const cfgPlanToken = normalizeToken(cfg?.planName || cfg?.name);
    const samePlan = (targetPlanId && cfgPlanId && targetPlanId === cfgPlanId)
      || (targetPlanToken && cfgPlanToken && targetPlanToken === cfgPlanToken);
    if (!samePlan) return;
    const cfgDates = Array.isArray(cfg?.selectedDates) ? cfg.selectedDates : [];
    cfgDates.forEach((date: unknown) => {
      const normalized = normalizeDateKey(date);
      if (normalized) registeredDates.add(normalized);
    });
  });

  txForClient.forEach((tx: any) => {
    const txType = normalizeToken(tx?.type);
    if (txType === 'AUDITORIA_EXCLUSAO') {
      const deletedKeys = Array.isArray(tx?.deletedDeliveryKeys) ? tx.deletedDeliveryKeys : [];
      deletedKeys.forEach((rawKey: unknown) => {
        const key = String(rawKey || '').trim();
        if (!key) return;
        const segments = key.split('|');
        if (segments.length < 3) return;
        const keyClientId = String(segments[0] || '').trim();
        const keyDate = String(segments[segments.length - 1] || '').trim();
        const keyPlanToken = normalizeToken(segments.slice(1, -1).join('|'));
        if (keyClientId !== targetClientId) return;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(keyDate)) return;
        if (!targetPlanToken || keyPlanToken !== targetPlanToken) return;
        deletedDates.add(keyDate);
      });
      return;
    }

    if (!isSamePlan(tx)) return;

    if (txType === 'CREDIT' || txType === 'CREDITO') {
      const txText = `${String(tx?.description || '')} ${String(tx?.item || '')}`;
      const normalizedText = normalizeToken(txText);
      const txSelectedDates = Array.isArray(tx?.selectedDates) ? tx.selectedDates : [];
      if (txSelectedDates.length > 0) {
        txSelectedDates.forEach((date: unknown) => {
          const normalized = normalizeDateKey(date);
          if (normalized) registeredDates.add(normalized);
        });
      } else {
        const fallbackDate = registerDateFromTx(tx);
        if (fallbackDate) registeredDates.add(fallbackDate);
      }

      const originRef = String(tx?.originTransactionId || '').trim();
      if (originRef && normalizedText.includes('ESTORNO')) {
        const reversedDate = registerDateFromTx(tx);
        if (reversedDate) reversedDates.add(reversedDate);
      }
      return;
    }

    if (txType === 'CONSUMO') {
      const status = normalizeToken(tx?.status);
      const text = normalizeToken(`${String(tx?.description || '')} ${String(tx?.item || '')}`);
      if (status.includes('ESTORN') || text.includes('ESTORNO')) return;
      const consumedDate = registerDateFromTx(tx);
      if (consumedDate) consumedDates.add(consumedDate);
    }
  });

  deletedDates.forEach((date) => registeredDates.delete(date));

  const reservedPendingUnits = Array.from(registeredDates).reduce((acc, date) => {
    if (consumedDates.has(date)) return acc;
    if (reversedDates.has(date)) return acc;
    return acc + 1;
  }, 0);
  const reservedValue = Number((reservedPendingUnits * planUnitPrice).toFixed(2));
  const freeBalance = Math.max(0, Number((rawBalance - reservedValue).toFixed(2)));

  const grossAmount = Number((selectedDates.length * planUnitPrice).toFixed(2));
  const minRequiredAmount = Math.max(0, Number((grossAmount - freeBalance).toFixed(2)));
  const providedAmount = Number(payload?.amount ?? payload?.total ?? payload?.value ?? 0);

  return {
    planId: targetPlanId,
    planName: String(matchedPlan?.name || planName || '').trim(),
    selectedDates,
    selectedDatesCount: selectedDates.length,
    planUnitPrice,
    rawBalance,
    reservedPendingUnits,
    reservedValue,
    freeBalance,
    grossAmount,
    minRequiredAmount,
    providedAmount: Number.isFinite(providedAmount) ? providedAmount : 0,
  };
};

// Get all transactions
router.get('/', async (req: AuthRequest, res: Response) => {
  const { clientId, enterpriseId, kind } = req.query;
  const requestedEnterpriseId = String(enterpriseId || '').trim();
  const requestedKind = String(kind || '').trim().toUpperCase();

  if (!canAccessAllEnterprises(req.userRole)) {
    const allowedEnterpriseIds = getRequesterEnterpriseIds(req);
    if (requestedEnterpriseId && !allowedEnterpriseIds.includes(requestedEnterpriseId)) {
      return res.status(403).json({ error: 'Acesso negado para esta empresa' });
    }
  }

  try {
    if (requestedEnterpriseId) {
      await processOverduePlanConsumptions({ enterpriseId: requestedEnterpriseId });
    }

    const transactions = db.getTransactions({
      clientId: clientId as string | undefined,
      enterpriseId: enterpriseId as string | undefined,
    });

    const filteredByKind = requestedKind
      ? transactions.filter((tx: any) => String(tx?.kind || '').trim().toUpperCase() === requestedKind)
      : transactions;

    if (canAccessAllEnterprises(req.userRole)) {
      return res.json(filteredByKind);
    }

    const allowed = new Set(getRequesterEnterpriseIds(req));
    const scoped = (Array.isArray(filteredByKind) ? filteredByKind : []).filter((tx: any) =>
      allowed.has(String(tx?.enterpriseId || '').trim())
    );
    return res.json(scoped);
  } catch (error) {
    console.error('❌ [TRANSACTIONS] Error fetching transactions:', (error as Error).message);
    return res.status(500).json({ error: 'Erro ao buscar transações' });
  }
});

router.post('/plan-credit-preview', (req: AuthRequest, res: Response) => {
  const payload = req.body || {};
  const enterpriseId = String(payload.enterpriseId || '').trim();
  const clientId = String(payload.clientId || '').trim();

  if (!enterpriseId) {
    return res.status(400).json({ error: 'enterpriseId é obrigatório' });
  }
  if (!clientId) {
    return res.status(400).json({ error: 'clientId é obrigatório' });
  }
  if (!requesterCanAccessEnterprise(req, enterpriseId)) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }

  const client = db.getClient(clientId);
  if (!client) {
    return res.status(400).json({ error: 'clientId inválido' });
  }

  const clientEnterpriseId = String((client as any)?.enterpriseId || '').trim();
  if (clientEnterpriseId && clientEnterpriseId !== enterpriseId) {
    return res.status(400).json({ error: 'enterpriseId da transação não corresponde ao enterpriseId do cliente' });
  }

  const preview = getPlanCreditValidationPreview({
    payload,
    client,
    enterpriseId,
  });

  if (!preview) {
    return res.status(400).json({
      error: 'Payload inválido para preview de recarga de plano.',
      details: [
        'Informe type=CREDIT, planId/planName e selectedDates.',
      ],
    });
  }

  return res.json({ success: true, preview });
});

// Get transaction by ID
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const existingTransaction = db.getTransaction(req.params.id);
    if (existingTransaction?.enterpriseId) {
      await processOverduePlanConsumptions({ enterpriseId: String(existingTransaction.enterpriseId || '').trim() });
    }

    const transaction = db.getTransaction(req.params.id);
    if (!transaction) {
      return res.status(404).json({ error: 'Transação não encontrada' });
    }
    if (!requesterCanAccessEnterprise(req, String((transaction as any)?.enterpriseId || ''))) {
      return res.status(403).json({ error: 'Acesso negado para esta empresa' });
    }
    res.json(transaction);
  } catch (error) {
    console.error('❌ [TRANSACTIONS] Error fetching transaction by id:', (error as Error).message);
    res.status(500).json({ error: 'Erro ao buscar transação' });
  }
});

// Create transaction
router.post('/', (req: AuthRequest, res: Response) => {
  const payload = req.body || {};
  if (!payload.enterpriseId) {
    return res.status(400).json({ error: 'enterpriseId é obrigatório' });
  }
  const enterpriseId = String(payload.enterpriseId || '').trim();
  if (!requesterCanAccessEnterprise(req, enterpriseId)) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }
  const idempotencyKey = buildTransactionCreateIdempotencyKey(req, payload);
  const replayGuardKey = buildTransactionCreateReplayGuardKey(req, payload);
  const clientId = String(payload.clientId || '').trim();
  let clientRecord: any = null;
  if (clientId) {
    const client = db.getClient(clientId);
    if (!client) {
      return res.status(400).json({ error: 'clientId inválido' });
    }
    clientRecord = client;
    const clientEnterpriseId = String((client as any)?.enterpriseId || '').trim();
    if (clientEnterpriseId && clientEnterpriseId !== enterpriseId) {
      return res.status(400).json({ error: 'enterpriseId da transação não corresponde ao enterpriseId do cliente' });
    }
  }

  if (clientRecord) {
    const planCreditValidation = getPlanCreditValidationPreview({
      payload,
      client: clientRecord,
      enterpriseId,
    });
    if (planCreditValidation) {
      const epsilon = 0.009;
      if (Number(planCreditValidation.providedAmount || 0) + epsilon < Number(planCreditValidation.minRequiredAmount || 0)) {
        return res.status(400).json({
          error: 'Valor da recarga abaixo do mínimo permitido para as datas selecionadas.',
          details: [
            'O saldo de plano reservado em datas agendadas/não entregues não pode ser usado como desconto nesta nova recarga.',
            'Somente saldo livre (estornado ou não agendado) pode abater o valor das novas datas.',
          ],
          validation: planCreditValidation,
        });
      }
    }
  }

  const requesterUser = req.userId ? db.getUser(String(req.userId || '').trim()) : null;
  const requesterName = String(
    requesterUser?.name
    || requesterUser?.fullName
    || requesterUser?.username
    || requesterUser?.email
    || req.userId
    || ''
  ).trim();
  const requesterRole = String(req.userRole || '').trim().toUpperCase();
  const requesterRoleLabel = resolveRoleLabel(requesterRole);

  cleanupTransactionCreateIdempotencyStore();
  cleanupTransactionCreateReplayGuardStore();
  const existingIdempotencyEntry = transactionCreateIdempotencyStore.get(idempotencyKey);
  if (existingIdempotencyEntry?.status === 'DONE' && existingIdempotencyEntry.responseBody) {
    return res.status(200).json(existingIdempotencyEntry.responseBody);
  }
  if (existingIdempotencyEntry?.status === 'PENDING') {
    return res.status(409).json({
      error: 'Transacao ja esta em processamento para esta mesma solicitacao. Aguarde alguns segundos.',
    });
  }
  const existingReplayGuardEntry = transactionCreateReplayGuardStore.get(replayGuardKey);
  if (existingReplayGuardEntry?.responseBody) {
    return res.status(200).json(existingReplayGuardEntry.responseBody);
  }

  transactionCreateIdempotencyStore.set(idempotencyKey, {
    status: 'PENDING',
    createdAt: Date.now(),
  });

  try {
    const newTransaction = db.createTransaction({
      ...payload,
      createdByUserId: String(req.userId || '').trim(),
      createdByName: requesterName,
      createdByRole: requesterRole,
      createdByRoleLabel: requesterRoleLabel,
      kind: String(payload?.kind || '').trim().toUpperCase(),
      sessionUserName: requesterName,
      sessionUserRole: requesterRole,
      sessionUserRoleLabel: requesterRoleLabel,
    });
    transactionCreateIdempotencyStore.set(idempotencyKey, {
      status: 'DONE',
      createdAt: Date.now(),
      responseBody: newTransaction,
    });
    transactionCreateReplayGuardStore.set(replayGuardKey, {
      createdAt: Date.now(),
      responseBody: newTransaction,
    });
    return res.status(201).json(newTransaction);
  } catch (error) {
    transactionCreateIdempotencyStore.delete(idempotencyKey);
    console.error('❌ [TRANSACTIONS] Error creating transaction:', (error as Error).message);
    return res.status(500).json({ error: 'Erro ao criar transação' });
  }
});

// Update transaction
router.put('/:id', (req: AuthRequest, res: Response) => {
  const current = db.getTransaction(req.params.id);
  if (!current) {
    return res.status(404).json({ error: 'Transação não encontrada' });
  }
  if (!requesterCanAccessEnterprise(req, String((current as any)?.enterpriseId || ''))) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }
  const nextEnterpriseId = String((req.body || {})?.enterpriseId || (current as any)?.enterpriseId || '').trim();
  if (nextEnterpriseId && !requesterCanAccessEnterprise(req, nextEnterpriseId)) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }
  const nextClientId = String((req.body || {})?.clientId || (current as any)?.clientId || '').trim();
  if (nextClientId) {
    const client = db.getClient(nextClientId);
    if (!client) {
      return res.status(400).json({ error: 'clientId inválido' });
    }
    const clientEnterpriseId = String((client as any)?.enterpriseId || '').trim();
    if (nextEnterpriseId && clientEnterpriseId && nextEnterpriseId !== clientEnterpriseId) {
      return res.status(400).json({ error: 'enterpriseId da transação não corresponde ao enterpriseId do cliente' });
    }
  }

  const updated = db.updateTransaction(req.params.id, {
    ...(req.body || {}),
    updatedByUserId: String(req.userId || '').trim(),
    updatedByName: String(req.userId ? (db.getUser(String(req.userId || '').trim())?.name || '') : '').trim(),
    updatedByRole: String(req.userRole || '').trim().toUpperCase(),
  });
  if (!updated) {
    return res.status(404).json({ error: 'Transação não encontrada' });
  }
  res.json(updated);
});

// Clear all transactions
router.delete('/clear-all', async (req: AuthRequest, res: Response) => {
  if (!canAccessAllEnterprises(req.userRole)) {
    return res.status(403).json({ error: 'Apenas SUPERADMIN/ADMIN_SISTEMA podem limpar todas as transacoes.' });
  }

  const payloadFingerprint = createDestructivePayloadFingerprint({
    scope: 'ALL_TRANSACTIONS',
    includeKinds: Array.isArray(req.body?.includeKinds) ? req.body.includeKinds : [],
  });
  const confirmation = requireDestructiveActionConfirmation({
    userId: String(req.userId || '').trim(),
    userRole: String(req.userRole || '').trim(),
    actionKey: 'TRANSACTIONS_CLEAR_ALL',
    actionLabel: 'LIMPAR_TRANSACOES',
    payloadFingerprint,
    confirmationChallengeId: req.body?.confirmationChallengeId,
    confirmationPhrase: req.body?.confirmationPhrase,
    confirmationReason: req.body?.confirmationReason,
  });
  if (!confirmation.approved) {
    return res.status(confirmation.status).json(confirmation.body);
  }

  await appendDestructiveActionAudit({
    actionKey: 'TRANSACTIONS_CLEAR_ALL',
    actionLabel: 'LIMPAR_TRANSACOES',
    userId: String(req.userId || '').trim(),
    userRole: String(req.userRole || '').trim(),
    confirmationReason: confirmation.confirmationReason,
    payloadFingerprint,
    status: 'APPROVED',
  });

  try {
    const removedCount = db.clearTransactions();
    await appendDestructiveActionAudit({
      actionKey: 'TRANSACTIONS_CLEAR_ALL',
      actionLabel: 'LIMPAR_TRANSACOES',
      userId: String(req.userId || '').trim(),
      userRole: String(req.userRole || '').trim(),
      confirmationReason: confirmation.confirmationReason,
      payloadFingerprint,
      status: 'EXECUTED',
      details: { removedCount },
    });

    return res.json({
      success: true,
      message: 'Todas as transacoes foram removidas.',
      removedCount
    });
  } catch (error) {
    await appendDestructiveActionAudit({
      actionKey: 'TRANSACTIONS_CLEAR_ALL',
      actionLabel: 'LIMPAR_TRANSACOES',
      userId: String(req.userId || '').trim(),
      userRole: String(req.userRole || '').trim(),
      confirmationReason: confirmation.confirmationReason,
      payloadFingerprint,
      status: 'FAILED',
      details: { message: (error as Error)?.message || 'Erro desconhecido' },
    });
    return res.status(500).json({ error: 'Erro ao limpar transacoes.' });
  }
});

router.get('/:id/delete-preview', (req: AuthRequest, res: Response) => {
  const current = db.getTransaction(req.params.id);
  if (!current) {
    return res.status(404).json({ error: 'Transação não encontrada' });
  }
  if (!requesterCanAccessEnterprise(req, String((current as any)?.enterpriseId || ''))) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }
  if (!canDeleteTransactionByRole(req.userRole)) {
    return res.status(403).json({
      error: 'Exclusão direta bloqueada para este perfil. Use estorno/correção.',
    });
  }

  const includeOriginCredit = String(req.query?.includeOriginCredit || '').trim().toLowerCase() === 'true';
  const requestedPurgeClientHistory = String(req.query?.purgeClientHistory || '').trim().toLowerCase() === 'true';
  const purgeClientHistory = requestedPurgeClientHistory && canPurgeClientHistoryByRole(req.userRole);
  const preview = db.getTransactionDeletePreview(req.params.id, { includeOriginCredit, purgeClientHistory });
  if (!preview) {
    return res.status(404).json({ error: 'Transação não encontrada' });
  }

  return res.json({ success: true, preview });
});

// Delete transaction
router.delete('/:id', (req: AuthRequest, res: Response) => {
  const current = db.getTransaction(req.params.id);
  if (!current) {
    return res.status(404).json({ error: 'Transação não encontrada' });
  }
  if (!requesterCanAccessEnterprise(req, String((current as any)?.enterpriseId || ''))) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }
  if (!canDeleteTransactionByRole(req.userRole)) {
    return res.status(403).json({ error: 'Exclusão direta bloqueada para este perfil. Use estorno/correção.' });
  }

  const includeOriginCredit = Boolean(req.body?.includeOriginCredit);
  const requestedPurgeClientHistory = Boolean(req.body?.purgeClientHistory);
  const purgeClientHistory = requestedPurgeClientHistory && canPurgeClientHistoryByRole(req.userRole);
  const preview = db.getTransactionDeletePreview(req.params.id, { includeOriginCredit, purgeClientHistory });
  if (!preview) {
    return res.status(404).json({ error: 'Transação não encontrada' });
  }

  const confirmDeleteCount = Number(req.body?.confirmDeleteCount);
  if (!Number.isFinite(confirmDeleteCount) || confirmDeleteCount !== Number(preview.deleteCount || 0)) {
    return res.status(400).json({
      error: 'Confirmação de exclusão inválida.',
      details: [
        'Solicite o preview antes de excluir.',
        'Envie confirmDeleteCount com o mesmo valor de preview.deleteCount para confirmar.',
      ],
      preview,
    });
  }

  const requesterUser = req.userId ? db.getUser(String(req.userId || '').trim()) : null;
  const deletedByName = String(
    req.body?.deletedByName
    || requesterUser?.email
    || requesterUser?.name
    || requesterUser?.fullName
    || requesterUser?.username
    || req.userId
    || ''
  ).trim();
  const deleteReason = String(req.body?.deleteReason || '').trim();

  const deleted = db.deleteTransaction(req.params.id, {
    deletedByName,
    deleteReason,
    requesterUserId: String(req.userId || '').trim(),
    requesterRole: String(req.userRole || '').trim(),
    includeOriginCredit,
    purgeClientHistory,
  });
  if (!deleted) {
    return res.status(404).json({ error: 'Transação não encontrada' });
  }
  res.json({ success: true });
});

export default router;
