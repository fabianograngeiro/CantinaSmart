import { Router, Request, Response } from 'express';
import { db } from '../database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { canAccessAllEnterprises, getRequesterEnterpriseIds, requesterCanAccessEnterprise } from '../utils/enterpriseAccess.js';

const router = Router();
router.use(authMiddleware);

// Get all plans
router.get('/', (req: AuthRequest, res: Response) => {
  const { enterpriseId } = req.query;
  const requestedEnterpriseId = String(enterpriseId || '').trim();
  if (!canAccessAllEnterprises(req.userRole)) {
    const allowed = getRequesterEnterpriseIds(req);
    if (requestedEnterpriseId && !allowed.includes(requestedEnterpriseId)) {
      return res.status(403).json({ error: 'Acesso negado para esta empresa' });
    }
  }

  const plans = db.getPlans(enterpriseId as string);
  if (canAccessAllEnterprises(req.userRole)) {
    return res.json(plans);
  }

  const allowedSet = new Set(getRequesterEnterpriseIds(req));
  const scoped = (Array.isArray(plans) ? plans : []).filter((plan: any) =>
    allowedSet.has(String(plan?.enterpriseId || '').trim())
  );
  return res.json(scoped);
});

// Get plan by ID
router.get('/:id', (req: AuthRequest, res: Response) => {
  const plan = db.getPlan(req.params.id);
  if (!plan) {
    return res.status(404).json({ error: 'Plano não encontrado' });
  }
  if (!requesterCanAccessEnterprise(req, String((plan as any)?.enterpriseId || ''))) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }
  res.json(plan);
});

// Create plan
router.post('/', (req: AuthRequest, res: Response) => {
  const enterpriseId = String(req.body?.enterpriseId || '').trim();
  if (!enterpriseId) {
    return res.status(400).json({ error: 'enterpriseId é obrigatório' });
  }
  if (!requesterCanAccessEnterprise(req, enterpriseId)) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }

  const newPlan = db.createPlan(req.body);
  res.status(201).json(newPlan);
});

// Update plan
router.put('/:id', (req: AuthRequest, res: Response) => {
  const current = db.getPlan(req.params.id);
  if (!current) {
    return res.status(404).json({ error: 'Plano não encontrado' });
  }
  if (!requesterCanAccessEnterprise(req, String((current as any)?.enterpriseId || ''))) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }

  const updated = db.updatePlan(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Plano não encontrado' });
  }
  res.json(updated);
});

// Delete plan
router.delete('/:id', (req: AuthRequest, res: Response) => {
  const current = db.getPlan(req.params.id);
  if (!current) {
    return res.status(404).json({ error: 'Plano não encontrado' });
  }
  if (!requesterCanAccessEnterprise(req, String((current as any)?.enterpriseId || ''))) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }

  const deleted = db.deletePlan(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Plano não encontrado' });
  }
  res.json({ message: 'Plano deletado com sucesso' });
});

export default router;
