import { Router, Request, Response } from 'express';
import { db } from '../database';

const router = Router();

// Get all suppliers
router.get('/', (req: Request, res: Response) => {
  const { enterpriseId } = req.query;
  const suppliers = db.getSuppliers(enterpriseId as string);
  res.json(suppliers);
});

// Get supplier by ID
router.get('/:id', (req: Request, res: Response) => {
  const supplier = db.getSupplier(req.params.id);
  if (!supplier) {
    return res.status(404).json({ error: 'Fornecedor não encontrado' });
  }
  res.json(supplier);
});

// Create supplier
router.post('/', (req: Request, res: Response) => {
  const newSupplier = db.createSupplier(req.body);
  res.status(201).json(newSupplier);
});

// Update supplier
router.put('/:id', (req: Request, res: Response) => {
  const updated = db.updateSupplier(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Fornecedor não encontrado' });
  }
  res.json(updated);
});

// Delete supplier
router.delete('/:id', (req: Request, res: Response) => {
  const deleted = db.deleteSupplier(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Fornecedor não encontrado' });
  }
  res.json({ message: 'Fornecedor deletado com sucesso' });
});

export default router;
