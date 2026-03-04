import { Router, Request, Response } from 'express';
import { db } from '../database';

const router = Router();

// Get all orders
router.get('/', (req: Request, res: Response) => {
  const { enterpriseId } = req.query;
  const orders = db.getOrders(enterpriseId as string);
  res.json(orders);
});

// Get order by ID
router.get('/:id', (req: Request, res: Response) => {
  const order = db.getOrder(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Pedido não encontrado' });
  }
  res.json(order);
});

// Create order
router.post('/', (req: Request, res: Response) => {
  const newOrder = db.createOrder(req.body);
  res.status(201).json(newOrder);
});

// Update order
router.put('/:id', (req: Request, res: Response) => {
  const updated = db.updateOrder(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Pedido não encontrado' });
  }
  res.json(updated);
});

// Delete order
router.delete('/:id', (req: Request, res: Response) => {
  const deleted = db.deleteOrder(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Pedido não encontrado' });
  }
  res.json({ message: 'Pedido deletado com sucesso' });
});

export default router;
