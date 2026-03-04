import { Router, Request, Response } from 'express';
import { db } from '../database';

const router = Router();

// Get all enterprises
router.get('/', (req: Request, res: Response) => {
  const enterprises = db.getEnterprises();
  res.json(enterprises);
});

// Get enterprise by ID
router.get('/:id', (req: Request, res: Response) => {
  const enterprise = db.getEnterprise(req.params.id);
  if (!enterprise) {
    return res.status(404).json({ error: 'Empresa não encontrada' });
  }
  res.json(enterprise);
});

// Create enterprise
router.post('/', (req: Request, res: Response) => {
  const newEnterprise = db.createEnterprise(req.body);
  res.status(201).json(newEnterprise);
});

// Update enterprise
router.put('/:id', (req: Request, res: Response) => {
  const updated = db.updateEnterprise(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Empresa não encontrada' });
  }
  res.json(updated);
});

// Delete enterprise
router.delete('/:id', (req: Request, res: Response) => {
  const deleted = db.deleteEnterprise(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Empresa não encontrada' });
  }
  res.json({ message: 'Empresa deletada com sucesso' });
});

export default router;
