import { Router, Request, Response } from 'express';
import { db } from '../database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { canAccessAllEnterprises, getRequesterEnterpriseIds, requesterCanAccessEnterprise } from '../utils/enterpriseAccess.js';

const router = Router();
router.use(authMiddleware);

// Get all suppliers
router.get('/', (req: AuthRequest, res: Response) => {
  const { enterpriseId } = req.query;
  const requestedEnterpriseId = String(enterpriseId || '').trim();
  if (!canAccessAllEnterprises(req.userRole)) {
    const allowed = getRequesterEnterpriseIds(req);
    if (requestedEnterpriseId && !allowed.includes(requestedEnterpriseId)) {
      return res.status(403).json({ error: 'Acesso negado para esta empresa' });
    }
  }

  const suppliers = db.getSuppliers(enterpriseId as string);
  if (canAccessAllEnterprises(req.userRole)) {
    return res.json(suppliers);
  }
  const allowedSet = new Set(getRequesterEnterpriseIds(req));
  const scoped = (Array.isArray(suppliers) ? suppliers : []).filter((supplier: any) =>
    allowedSet.has(String(supplier?.enterpriseId || '').trim())
  );
  return res.json(scoped);
});

// Get supplier by ID
router.get('/:id', (req: AuthRequest, res: Response) => {
  const supplier = db.getSupplier(req.params.id);
  if (!supplier) {
    return res.status(404).json({ error: 'Fornecedor não encontrado' });
  }
  if (!requesterCanAccessEnterprise(req, String((supplier as any)?.enterpriseId || ''))) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }
  res.json(supplier);
});

// Create supplier
router.post('/', (req: AuthRequest, res: Response) => {
  const enterpriseId = String(req.body?.enterpriseId || '').trim();
  if (!enterpriseId) {
    return res.status(400).json({ error: 'enterpriseId é obrigatório' });
  }
  if (!requesterCanAccessEnterprise(req, enterpriseId)) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }

  const newSupplier = db.createSupplier(req.body);
  res.status(201).json(newSupplier);
});

// Update supplier
router.put('/:id', (req: AuthRequest, res: Response) => {
  const current = db.getSupplier(req.params.id);
  if (!current) {
    return res.status(404).json({ error: 'Fornecedor não encontrado' });
  }
  if (!requesterCanAccessEnterprise(req, String((current as any)?.enterpriseId || ''))) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }

  const updated = db.updateSupplier(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Fornecedor não encontrado' });
  }
  res.json(updated);
});

// Delete supplier
router.delete('/:id', (req: AuthRequest, res: Response) => {
  const current = db.getSupplier(req.params.id);
  if (!current) {
    return res.status(404).json({ error: 'Fornecedor não encontrado' });
  }
  if (!requesterCanAccessEnterprise(req, String((current as any)?.enterpriseId || ''))) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }

  const deleted = db.deleteSupplier(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Fornecedor não encontrado' });
  }
  res.json({ message: 'Fornecedor deletado com sucesso' });
});

export default router;
