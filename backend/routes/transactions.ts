import { Router, Request, Response } from 'express';
import { db } from '../database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { processOverduePlanConsumptions } from '../services/planConsumptionAutoProcessor.js';
import { canAccessAllEnterprises, getRequesterEnterpriseIds, requesterCanAccessEnterprise } from '../utils/enterpriseAccess.js';

const router = Router();
router.use(authMiddleware);

const resolveRoleLabel = (role?: string) => {
  const normalized = String(role || '').trim().toUpperCase();
  if (!normalized) return '';
  if (normalized === 'OWNER') return 'DONO DE REDE';
  return normalized.replace(/_/g, ' ');
};

// Get all transactions
router.get('/', async (req: AuthRequest, res: Response) => {
  const { clientId, enterpriseId } = req.query;
  const requestedEnterpriseId = String(enterpriseId || '').trim();

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

    if (canAccessAllEnterprises(req.userRole)) {
      return res.json(transactions);
    }

    const allowed = new Set(getRequesterEnterpriseIds(req));
    const scoped = (Array.isArray(transactions) ? transactions : []).filter((tx: any) =>
      allowed.has(String(tx?.enterpriseId || '').trim())
    );
    return res.json(scoped);
  } catch (error) {
    console.error('❌ [TRANSACTIONS] Error fetching transactions:', (error as Error).message);
    return res.status(500).json({ error: 'Erro ao buscar transações' });
  }
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
  const clientId = String(payload.clientId || '').trim();
  if (clientId) {
    const client = db.getClient(clientId);
    if (!client) {
      return res.status(400).json({ error: 'clientId inválido' });
    }
    const clientEnterpriseId = String((client as any)?.enterpriseId || '').trim();
    if (clientEnterpriseId && clientEnterpriseId !== enterpriseId) {
      return res.status(400).json({ error: 'enterpriseId da transação não corresponde ao enterpriseId do cliente' });
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

  const newTransaction = db.createTransaction({
    ...payload,
    createdByUserId: String(req.userId || '').trim(),
    createdByName: requesterName,
    createdByRole: requesterRole,
    createdByRoleLabel: requesterRoleLabel,
    sessionUserName: requesterName,
    sessionUserRole: requesterRole,
    sessionUserRoleLabel: requesterRoleLabel,
  });
  res.status(201).json(newTransaction);
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

  const updated = db.updateTransaction(req.params.id, req.body || {});
  if (!updated) {
    return res.status(404).json({ error: 'Transação não encontrada' });
  }
  res.json(updated);
});

// Clear all transactions
router.delete('/clear-all', (req: AuthRequest, res: Response) => {
  if (!canAccessAllEnterprises(req.userRole)) {
    return res.status(403).json({ error: 'Apenas SUPERADMIN/ADMIN_SISTEMA podem limpar todas as transações.' });
  }
  const removedCount = db.clearTransactions();
  res.json({
    success: true,
    message: 'Todas as transações foram removidas.',
    removedCount
  });
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
  });
  if (!deleted) {
    return res.status(404).json({ error: 'Transação não encontrada' });
  }
  res.json({ success: true });
});

export default router;
