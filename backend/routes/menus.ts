import { Router, Request, Response } from 'express';
import { db } from '../database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { requesterCanAccessEnterprise } from '../utils/enterpriseAccess.js';

const router = Router();
router.use(authMiddleware);

const DAYS_OF_WEEK = ['SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO'] as const;
const DAY_TOKEN_MAP: Record<string, string> = {
  SEGUNDA: 'SEGUNDA',
  SEG: 'SEGUNDA',
  TERCA: 'TERCA',
  TERCA_FEIRA: 'TERCA',
  TER: 'TERCA',
  QUARTA: 'QUARTA',
  QUA: 'QUARTA',
  QUINTA: 'QUINTA',
  QUI: 'QUINTA',
  SEXTA: 'SEXTA',
  SEX: 'SEXTA',
  SABADO: 'SABADO',
  SAB: 'SABADO',
};

const normalizeDayToken = (value: unknown) => {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '_')
    .toUpperCase()
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
};

const resolveWorkingDaysFromSchoolCalendar = (record: any) => {
  const meta = record?.meta && typeof record.meta === 'object' ? record.meta : {};
  const candidateLists: unknown[] = [
    meta?.workingDays,
    meta?.businessDays,
    meta?.expedientDays,
    meta?.serviceDays,
    meta?.defaultWorkingDays,
    meta?.daysOfWeek,
    meta?.diasExpediente,
    meta?.diasDeExpediente,
  ];

  const rawDays = candidateLists.find((value) => Array.isArray(value));
  if (!Array.isArray(rawDays) || rawDays.length === 0) {
    return [...DAYS_OF_WEEK];
  }

  const normalized = rawDays
    .map((day) => DAY_TOKEN_MAP[normalizeDayToken(day)] || '')
    .filter(Boolean);

  const unique = Array.from(new Set(normalized));
  if (unique.length === 0) return [...DAYS_OF_WEEK];
  return DAYS_OF_WEEK.filter((day) => unique.includes(day));
};

const createEmptyWeeklyMenu = (workingDays: readonly string[] = DAYS_OF_WEEK) =>
  workingDays.map((day) => ({
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
    const schoolYear = Number((monthKey || '').slice(0, 4)) || new Date().getFullYear();
    const schoolCalendar = db.getSchoolCalendarByEnterpriseAndYear(enterpriseId, schoolYear);
    const workingDays = resolveWorkingDaysFromSchoolCalendar(schoolCalendar);
    const defaultDays = createEmptyWeeklyMenu(workingDays);
    const savedDefault = db.upsertMenuByEnterpriseAndType({
      enterpriseId,
      type,
      weekIndex,
      monthKey,
      days: defaultDays,
    });

    return res.json({
      enterpriseId,
      type,
      weekIndex,
      monthKey,
      days: Array.isArray(savedDefault?.days) ? savedDefault.days : defaultDays,
      updatedAt: savedDefault?.updatedAt,
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
