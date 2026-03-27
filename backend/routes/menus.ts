import { Router, Request, Response } from 'express';
import { db } from '../database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { requesterCanAccessEnterprise } from '../utils/enterpriseAccess.js';

const router = Router();
router.use(authMiddleware);

const DAYS_OF_WEEK = ['SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO'] as const;

const createEmptyWeeklyMenu = () =>
  DAYS_OF_WEEK.map((day) => ({
    id: `${day.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    dayOfWeek: day,
    items: [],
  }));

router.get('/', (req: AuthRequest, res: Response) => {
  const enterpriseId = String(req.query.enterpriseId || '').trim();
  const type = String(req.query.type || '').trim().toUpperCase();
  const weekIndex = Math.max(1, Math.min(5, Number(req.query.weekIndex || 1) || 1));
  const monthKey = String(req.query.monthKey || '').trim();

  if (!enterpriseId || !type) {
    return res.status(400).json({ error: 'enterpriseId e type são obrigatórios.' });
  }

  if (!requesterCanAccessEnterprise(req, enterpriseId)) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }

  const record = db.getMenuByEnterpriseAndType(enterpriseId, type, weekIndex, monthKey);
  if (!record) {
    return res.json({
      enterpriseId,
      type,
      weekIndex,
      monthKey,
      days: createEmptyWeeklyMenu(),
    });
  }

  const days = Array.isArray(record.days) ? record.days : createEmptyWeeklyMenu();
  return res.json({
    enterpriseId,
    type,
    weekIndex: Number(record.weekIndex || weekIndex || 1),
    monthKey: String(record.monthKey || monthKey || ''),
    days,
    updatedAt: record.updatedAt,
  });
});

router.put('/', (req: AuthRequest, res: Response) => {
  const enterpriseId = String(req.body?.enterpriseId || '').trim();
  const type = String(req.body?.type || '').trim().toUpperCase();
  const weekIndex = Math.max(1, Math.min(5, Number(req.body?.weekIndex || 1) || 1));
  const monthKey = String(req.body?.monthKey || '').trim();
  const days = Array.isArray(req.body?.days) ? req.body.days : [];

  if (!enterpriseId || !type) {
    return res.status(400).json({ error: 'enterpriseId e type são obrigatórios.' });
  }

  if (!requesterCanAccessEnterprise(req, enterpriseId)) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }

  const saved = db.upsertMenuByEnterpriseAndType({ enterpriseId, type, weekIndex, monthKey, days });
  if (!saved) {
    return res.status(400).json({ error: 'Falha ao salvar cardápio.' });
  }

  return res.json({
    message: 'Cardápio salvo com sucesso.',
    data: saved,
  });
});

export default router;
