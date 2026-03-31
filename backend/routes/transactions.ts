import { Router, Request, Response } from 'express';
import { db } from '../database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
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
router.get('/', (req: AuthRequest, res: Response) => {
  const { clientId, enterpriseId } = req.query;
  const requestedEnterpriseId = String(enterpriseId || '').trim();

  if (!canAccessAllEnterprises(req.userRole)) {
    const allowedEnterpriseIds = getRequesterEnterpriseIds(req);
    if (requestedEnterpriseId && !allowedEnterpriseIds.includes(requestedEnterpriseId)) {
      return res.status(403).json({ error: 'Acesso negado para esta empresa' });
    }
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
});

// Get transaction by ID
router.get('/:id', (req: AuthRequest, res: Response) => {
  const transaction = db.getTransaction(req.params.id);
  if (!transaction) {
    return res.status(404).json({ error: 'Transação não encontrada' });
  }
  if (!requesterCanAccessEnterprise(req, String((transaction as any)?.enterpriseId || ''))) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }
  res.json(transaction);
});

// Create transaction
router.post('/', (req: AuthRequest, res: Response) => {
  const payload = req.body || {};
  if (!payload.enterpriseId) {
    return res.status(400).json({ error: 'enterpriseId é obrigatório' });
  }
  if (!requesterCanAccessEnterprise(req, String(payload.enterpriseId || ''))) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
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
