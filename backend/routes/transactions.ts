import { Router, Request, Response } from 'express';
import { db } from '../database';

const router = Router();

// Get all transactions
router.get('/', (req: Request, res: Response) => {
  const { clientId, enterpriseId } = req.query;
  const transactions = db.getTransactions({
    clientId: clientId as string | undefined,
    enterpriseId: enterpriseId as string | undefined,
  });
  res.json(transactions);
});

// Get transaction by ID
router.get('/:id', (req: Request, res: Response) => {
  const transaction = db.getTransaction(req.params.id);
  if (!transaction) {
    return res.status(404).json({ error: 'Transação não encontrada' });
  }
  res.json(transaction);
});

// Create transaction
router.post('/', (req: Request, res: Response) => {
  const payload = req.body || {};
  if (!payload.enterpriseId) {
    return res.status(400).json({ error: 'enterpriseId é obrigatório' });
  }

  const newTransaction = db.createTransaction(req.body);
  res.status(201).json(newTransaction);
});

// Update transaction
router.put('/:id', (req: Request, res: Response) => {
  const updated = db.updateTransaction(req.params.id, req.body || {});
  if (!updated) {
    return res.status(404).json({ error: 'Transação não encontrada' });
  }
  res.json(updated);
});

// Clear all transactions
router.delete('/clear-all', (_req: Request, res: Response) => {
  const removedCount = db.clearTransactions();
  res.json({
    success: true,
    message: 'Todas as transações foram removidas.',
    removedCount
  });
});

// Delete transaction
router.delete('/:id', (req: Request, res: Response) => {
  const deleted = db.deleteTransaction(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Transação não encontrada' });
  }
  res.json({ success: true });
});

export default router;
