import { Router, Request, Response } from 'express';
import { db } from '../database';

const router = Router();

// Get all plans
router.get('/', (req: Request, res: Response) => {
  const { enterpriseId } = req.query;
  const plans = db.getPlans(enterpriseId as string);
  res.json(plans);
});

// Get plan by ID
router.get('/:id', (req: Request, res: Response) => {
  const plan = db.getPlan(req.params.id);
  if (!plan) {
    return res.status(404).json({ error: 'Plano não encontrado' });
  }
  res.json(plan);
});

// Create plan
router.post('/', (req: Request, res: Response) => {
  const newPlan = db.createPlan(req.body);
  res.status(201).json(newPlan);
});

// Update plan
router.put('/:id', (req: Request, res: Response) => {
  const updated = db.updatePlan(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Plano não encontrado' });
  }
  res.json(updated);
});

// Delete plan
router.delete('/:id', (req: Request, res: Response) => {
  const deleted = db.deletePlan(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Plano não encontrado' });
  }
  res.json({ message: 'Plano deletado com sucesso' });
});

export default router;
