import { Router, Request, Response } from 'express';
import { db } from '../database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { canAccessAllEnterprises, getRequesterEnterpriseIds, requesterCanAccessEnterprise } from '../utils/enterpriseAccess.js';

const router = Router();
router.use(authMiddleware);

router.get('/', (req: AuthRequest, res: Response) => {
  const { enterpriseId } = req.query;
  const requestedEnterpriseId = String(enterpriseId || '').trim();
  if (!canAccessAllEnterprises(req.userRole)) {
    const allowed = getRequesterEnterpriseIds(req);
    if (requestedEnterpriseId && !allowed.includes(requestedEnterpriseId)) {
      return res.status(403).json({ error: 'Acesso negado para esta empresa' });
    }
  }

  const categories = db.getCategories(enterpriseId as string);
  if (canAccessAllEnterprises(req.userRole)) {
    return res.json(categories);
  }
  const allowedSet = new Set(getRequesterEnterpriseIds(req));
  const scoped = (Array.isArray(categories) ? categories : []).filter((category: any) =>
    allowedSet.has(String(category?.enterpriseId || '').trim())
  );
  return res.json(scoped);
});

router.get('/:id', (req: AuthRequest, res: Response) => {
  const category = db.getCategory(req.params.id);
  if (!category) {
    return res.status(404).json({ error: 'Categoria não encontrada' });
  }
  if (!requesterCanAccessEnterprise(req, String((category as any)?.enterpriseId || ''))) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }
  res.json(category);
});

router.post('/', (req: AuthRequest, res: Response) => {
  const enterpriseId = String(req.body?.enterpriseId || '').trim();
  if (!enterpriseId) {
    return res.status(400).json({ error: 'enterpriseId é obrigatório' });
  }
  if (!requesterCanAccessEnterprise(req, enterpriseId)) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }

  const newCategory = db.createCategory(req.body);
  res.status(201).json(newCategory);
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  const current = db.getCategory(req.params.id);
  if (!current) {
    return res.status(404).json({ error: 'Categoria não encontrada' });
  }
  if (!requesterCanAccessEnterprise(req, String((current as any)?.enterpriseId || ''))) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }

  const updated = db.updateCategory(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Categoria não encontrada' });
  }
  res.json(updated);
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  const current = db.getCategory(req.params.id);
  if (!current) {
    return res.status(404).json({ error: 'Categoria não encontrada' });
  }
  if (!requesterCanAccessEnterprise(req, String((current as any)?.enterpriseId || ''))) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }

  const deleted = db.deleteCategory(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Categoria não encontrada' });
  }
  res.json({ message: 'Categoria removida com sucesso' });
});

export default router;
