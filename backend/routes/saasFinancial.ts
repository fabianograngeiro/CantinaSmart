import { Router, Response } from 'express';
import { db } from '../database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

const normalizeRole = (value?: string) => String(value || '').trim().toUpperCase();
const canAccessSaasFinancial = (role?: string) => {
  const normalized = normalizeRole(role);
  return normalized === 'SUPERADMIN' || normalized === 'ADMIN_SISTEMA';
};

router.use(authMiddleware);
router.use((req: AuthRequest, res: Response, next) => {
  if (!canAccessSaasFinancial(req.userRole)) {
    return res.status(403).json({ error: 'Acesso restrito ao SUPERADMIN/ADMIN_SISTEMA.' });
  }
  next();
});

router.get('/cashflow', (_req: AuthRequest, res: Response) => {
  return res.json(db.getSaasCashflowEntries());
});

router.post('/cashflow', (req: AuthRequest, res: Response) => {
  const payload = req.body || {};
  const title = String(payload?.title || '').trim();
  const dueDate = String(payload?.dueDate || '').trim();
  const amount = Number(payload?.amount);

  if (!title) {
    return res.status(400).json({ error: 'Descricao obrigatoria.' });
  }
  if (!dueDate) {
    return res.status(400).json({ error: 'Vencimento obrigatorio.' });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Valor invalido.' });
  }

  const created = db.createSaasCashflowEntry(payload);
  return res.status(201).json(created);
});

router.put('/cashflow/:id', (req: AuthRequest, res: Response) => {
  const id = String(req.params.id || '').trim();
  if (!id) {
    return res.status(400).json({ error: 'ID invalido.' });
  }

  const updated = db.updateSaasCashflowEntry(id, req.body || {});
  if (!updated) {
    return res.status(404).json({ error: 'Lancamento nao encontrado.' });
  }

  return res.json(updated);
});

router.delete('/cashflow/:id', (req: AuthRequest, res: Response) => {
  const id = String(req.params.id || '').trim();
  if (!id) {
    return res.status(400).json({ error: 'ID invalido.' });
  }

  const deleted = db.deleteSaasCashflowEntry(id);
  if (!deleted) {
    return res.status(404).json({ error: 'Lancamento nao encontrado.' });
  }

  return res.json({ message: 'Lancamento removido com sucesso.' });
});

export default router;
