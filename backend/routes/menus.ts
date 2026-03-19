import { Router, Request, Response } from 'express';
import { db } from '../database';

const router = Router();

const DAYS_OF_WEEK = ['SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO'] as const;

const createEmptyWeeklyMenu = () =>
  DAYS_OF_WEEK.map((day) => ({
    id: `${day.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    dayOfWeek: day,
    items: [],
  }));

router.get('/', (req: Request, res: Response) => {
  const enterpriseId = String(req.query.enterpriseId || '').trim();
  const type = String(req.query.type || '').trim().toUpperCase();

  if (!enterpriseId || !type) {
    return res.status(400).json({ error: 'enterpriseId e type são obrigatórios.' });
  }

  const record = db.getMenuByEnterpriseAndType(enterpriseId, type);
  if (!record) {
    return res.json({
      enterpriseId,
      type,
      days: createEmptyWeeklyMenu(),
    });
  }

  const days = Array.isArray(record.days) ? record.days : createEmptyWeeklyMenu();
  return res.json({
    enterpriseId,
    type,
    days,
    updatedAt: record.updatedAt,
  });
});

router.put('/', (req: Request, res: Response) => {
  const enterpriseId = String(req.body?.enterpriseId || '').trim();
  const type = String(req.body?.type || '').trim().toUpperCase();
  const days = Array.isArray(req.body?.days) ? req.body.days : [];

  if (!enterpriseId || !type) {
    return res.status(400).json({ error: 'enterpriseId e type são obrigatórios.' });
  }

  const saved = db.upsertMenuByEnterpriseAndType({ enterpriseId, type, days });
  if (!saved) {
    return res.status(400).json({ error: 'Falha ao salvar cardápio.' });
  }

  return res.json({
    message: 'Cardápio salvo com sucesso.',
    data: saved,
  });
});

export default router;

