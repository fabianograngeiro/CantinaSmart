import { Router, Request, Response } from 'express';
import { db } from '../database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { canAccessAllEnterprises, getRequesterEnterpriseIds, requesterCanAccessEnterprise } from '../utils/enterpriseAccess.js';

const router = Router();
router.use(authMiddleware);

// Get all orders
router.get('/', (req: AuthRequest, res: Response) => {
  const { enterpriseId } = req.query;
  const requestedEnterpriseId = String(enterpriseId || '').trim();
  if (!canAccessAllEnterprises(req.userRole)) {
    const allowed = getRequesterEnterpriseIds(req);
    if (requestedEnterpriseId && !allowed.includes(requestedEnterpriseId)) {
      return res.status(403).json({ error: 'Acesso negado para esta empresa' });
    }
  }

  const orders = db.getOrders(enterpriseId as string);
  if (canAccessAllEnterprises(req.userRole)) {
    return res.json(orders);
  }

  const allowedSet = new Set(getRequesterEnterpriseIds(req));
  const scoped = (Array.isArray(orders) ? orders : []).filter((order: any) =>
    allowedSet.has(String(order?.enterpriseId || '').trim())
  );
  return res.json(scoped);
});

// Get order by ID
router.get('/:id', (req: AuthRequest, res: Response) => {
  const order = db.getOrder(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Pedido não encontrado' });
  }
  if (!requesterCanAccessEnterprise(req, String((order as any)?.enterpriseId || ''))) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }
  res.json(order);
});

// Create order
router.post('/', (req: AuthRequest, res: Response) => {
  const enterpriseId = String(req.body?.enterpriseId || '').trim();
  if (!enterpriseId) {
    return res.status(400).json({ error: 'enterpriseId é obrigatório' });
  }
  if (!requesterCanAccessEnterprise(req, enterpriseId)) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }

  const newOrder = db.createOrder(req.body);
  res.status(201).json(newOrder);
});

// Update order
router.put('/:id', (req: AuthRequest, res: Response) => {
  const current = db.getOrder(req.params.id);
  if (!current) {
    return res.status(404).json({ error: 'Pedido não encontrado' });
  }
  if (!requesterCanAccessEnterprise(req, String((current as any)?.enterpriseId || ''))) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }

  const updated = db.updateOrder(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Pedido não encontrado' });
  }
  res.json(updated);
});

// Delete order
router.delete('/:id', (req: AuthRequest, res: Response) => {
  const current = db.getOrder(req.params.id);
  if (!current) {
    return res.status(404).json({ error: 'Pedido não encontrado' });
  }
  if (!requesterCanAccessEnterprise(req, String((current as any)?.enterpriseId || ''))) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }

  const deleted = db.deleteOrder(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Pedido não encontrado' });
  }
  res.json({ message: 'Pedido deletado com sucesso' });
});

export default router;
