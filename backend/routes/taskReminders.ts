import { Router, Response } from 'express';
import { db } from '../database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

const normalizeRole = (value?: string) => String(value || '').trim().toUpperCase();
const canAccessTaskReminders = (role?: string) => {
  const normalized = normalizeRole(role);
  return normalized === 'SUPERADMIN' || normalized === 'ADMIN_SISTEMA';
};

router.use(authMiddleware);
router.use((req: AuthRequest, res: Response, next) => {
  if (!canAccessTaskReminders(req.userRole)) {
    return res.status(403).json({ error: 'Acesso restrito ao SUPERADMIN/ADMIN_SISTEMA.' });
  }
  next();
});

router.get('/', (_req: AuthRequest, res: Response) => {
  return res.json(db.getTaskReminders());
});

router.post('/', (req: AuthRequest, res: Response) => {
  const payload = req.body || {};
  const title = String(payload?.title || '').trim();
  const dueDate = String(payload?.dueDate || '').trim();
  const reminderDate = String(payload?.reminderDate || '').trim();

  if (!title) return res.status(400).json({ error: 'Titulo obrigatorio.' });
  if (!dueDate) return res.status(400).json({ error: 'Data de vencimento obrigatoria.' });
  if (!reminderDate) return res.status(400).json({ error: 'Data do lembrete obrigatoria.' });

  const created = db.createTaskReminder({
    ...payload,
    createdByUserId: String(req.userId || '').trim(),
  });

  return res.status(201).json(created);
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'ID invalido.' });

  const updated = db.updateTaskReminder(id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Lembrete nao encontrado.' });

  return res.json(updated);
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'ID invalido.' });

  const deleted = db.deleteTaskReminder(id);
  if (!deleted) return res.status(404).json({ error: 'Lembrete nao encontrado.' });

  return res.json({ message: 'Lembrete removido com sucesso.' });
});

export default router;
