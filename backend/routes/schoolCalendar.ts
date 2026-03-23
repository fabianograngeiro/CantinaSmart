import { Router, Request, Response } from 'express';
import { db } from '../database';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const enterpriseId = String(req.query.enterpriseId || '').trim();
  const schoolYear = Number(req.query.schoolYear);

  if (!enterpriseId || !Number.isFinite(schoolYear)) {
    return res.status(400).json({ error: 'enterpriseId e schoolYear são obrigatórios.' });
  }

  const record = db.getSchoolCalendarByEnterpriseAndYear(enterpriseId, schoolYear);
  if (!record) {
    return res.json({
      enterpriseId,
      schoolYear,
      meta: null,
      legends: [],
      events: [],
      updatedAt: null,
    });
  }

  return res.json({
    enterpriseId: String(record.enterpriseId || enterpriseId),
    schoolYear: Number(record.schoolYear || schoolYear),
    meta: record.meta && typeof record.meta === 'object' ? record.meta : null,
    legends: Array.isArray(record.legends) ? record.legends : [],
    events: Array.isArray(record.events) ? record.events : [],
    updatedAt: record.updatedAt || null,
  });
});

router.put('/', (req: Request, res: Response) => {
  const enterpriseId = String(req.body?.enterpriseId || '').trim();
  const schoolYear = Number(req.body?.schoolYear);
  const meta = req.body?.meta;
  const legends = Array.isArray(req.body?.legends) ? req.body.legends : [];
  const events = Array.isArray(req.body?.events) ? req.body.events : [];

  if (!enterpriseId || !Number.isFinite(schoolYear)) {
    return res.status(400).json({ error: 'enterpriseId e schoolYear são obrigatórios.' });
  }

  const saved = db.upsertSchoolCalendar({
    enterpriseId,
    schoolYear,
    meta,
    legends,
    events,
  });

  if (!saved) {
    return res.status(400).json({ error: 'Falha ao salvar calendário escolar.' });
  }

  return res.json({
    message: 'Calendário escolar salvo com sucesso.',
    data: saved,
  });
});

export default router;
