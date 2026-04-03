import { Router, Response } from 'express';
import { db } from '../database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { canAccessAllEnterprises, getRequesterEnterpriseIds } from '../utils/enterpriseAccess.js';

const router = Router();

const normalizeRole = (value?: string) => String(value || '').trim().toUpperCase();
const canAccessTaskReminders = (role?: string) => {
  const normalized = normalizeRole(role);
  return [
    'SUPERADMIN',
    'ADMIN_SISTEMA',
    'OWNER',
    'ADMIN',
    'GERENTE',
    'USER',
    'COLABORADOR',
  ].includes(normalized);
};

const canAccessReminderByScope = (req: AuthRequest, reminder: any) => {
  if (canAccessAllEnterprises(req.userRole)) return true;

  const requesterId = String(req.userId || '').trim();
  const requesterRole = normalizeRole(req.userRole);
  const reminderCreatorId = String(reminder?.createdByUserId || '').trim();
  if (requesterId && requesterId === reminderCreatorId) return true;

  const allowedEnterpriseIds = getRequesterEnterpriseIds(req);
  if (allowedEnterpriseIds.length === 0) {
    return requesterRole === 'OWNER' && requesterId === reminderCreatorId;
  }

  const reminderEnterpriseId = String(reminder?.enterpriseId || '').trim();
  if (reminderEnterpriseId && allowedEnterpriseIds.includes(reminderEnterpriseId)) return true;

  const visibleEnterpriseIds = Array.isArray(reminder?.visibleEnterpriseIds)
    ? reminder.visibleEnterpriseIds.map((id: unknown) => String(id || '').trim()).filter(Boolean)
    : [];
  return visibleEnterpriseIds.some((id: string) => allowedEnterpriseIds.includes(id));
};

router.use(authMiddleware);
router.use((req: AuthRequest, res: Response, next) => {
  if (!canAccessTaskReminders(req.userRole)) {
    return res.status(403).json({ error: 'Acesso restrito ao SUPERADMIN/ADMIN_SISTEMA.' });
  }
  next();
});

router.get('/', (_req: AuthRequest, res: Response) => {
  const req = _req as AuthRequest;
  if (canAccessAllEnterprises(req.userRole)) {
    return res.json(db.getTaskReminders());
  }

  const allowedEnterpriseIds = getRequesterEnterpriseIds(req);
  const requesterId = String(req.userId || '').trim();
  if (allowedEnterpriseIds.length > 0) {
    return res.json(db.getTaskReminders({ enterpriseIds: allowedEnterpriseIds }));
  }
  return res.json(db.getTaskReminders({ createdByUserId: requesterId }));
});

router.post('/', (req: AuthRequest, res: Response) => {
  const payload = req.body || {};
  const title = String(payload?.title || '').trim();
  const dueDate = String(payload?.dueDate || '').trim();
  const reminderDate = String(payload?.reminderDate || '').trim();
  const requestedEnterpriseId = String(payload?.enterpriseId || '').trim();

  if (!title) return res.status(400).json({ error: 'Titulo obrigatorio.' });
  if (!dueDate) return res.status(400).json({ error: 'Data de vencimento obrigatoria.' });
  if (!reminderDate) return res.status(400).json({ error: 'Data do lembrete obrigatoria.' });

  const allowedEnterpriseIds = getRequesterEnterpriseIds(req);
  const isGlobalRole = canAccessAllEnterprises(req.userRole);
  const enterpriseId = requestedEnterpriseId || String(allowedEnterpriseIds[0] || '').trim();
  if (!isGlobalRole && !enterpriseId && String(req.userId || '').trim().length === 0) {
    return res.status(400).json({ error: 'Nao foi possivel resolver escopo do lembrete.' });
  }
  if (!isGlobalRole && enterpriseId && !allowedEnterpriseIds.includes(enterpriseId)) {
    return res.status(403).json({ error: 'Sem permissao para registrar lembrete nesta empresa.' });
  }

  const requester = req.userId ? db.getUser(String(req.userId || '').trim()) : null;

  const created = db.createTaskReminder({
    ...payload,
    enterpriseId,
    visibleEnterpriseIds: enterpriseId ? [enterpriseId] : [],
    createdByUserId: String(req.userId || '').trim(),
    createdByName: String((requester as any)?.name || '').trim(),
    createdByRole: normalizeRole(req.userRole),
  });

  return res.status(201).json(created);
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'ID invalido.' });

  const current = db.getTaskReminder(id);
  if (!current) return res.status(404).json({ error: 'Lembrete nao encontrado.' });
  if (!canAccessReminderByScope(req, current)) {
    return res.status(403).json({ error: 'Acesso negado para este lembrete.' });
  }

  const updated = db.updateTaskReminder(id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Lembrete nao encontrado.' });

  return res.json(updated);
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'ID invalido.' });

  const current = db.getTaskReminder(id);
  if (!current) return res.status(404).json({ error: 'Lembrete nao encontrado.' });
  if (!canAccessReminderByScope(req, current)) {
    return res.status(403).json({ error: 'Acesso negado para este lembrete.' });
  }

  const deleted = db.deleteTaskReminder(id);
  if (!deleted) return res.status(404).json({ error: 'Lembrete nao encontrado.' });

  return res.json({ message: 'Lembrete removido com sucesso.' });
});

export default router;
