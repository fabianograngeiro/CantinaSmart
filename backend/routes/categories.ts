import { Router, Request, Response } from 'express';
import { db } from '../database';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const { enterpriseId } = req.query;
  const categories = db.getCategories(enterpriseId as string);
  res.json(categories);
});

router.get('/:id', (req: Request, res: Response) => {
  const category = db.getCategory(req.params.id);
  if (!category) {
    return res.status(404).json({ error: 'Categoria não encontrada' });
  }
  res.json(category);
});

router.post('/', (req: Request, res: Response) => {
  const newCategory = db.createCategory(req.body);
  res.status(201).json(newCategory);
});

router.put('/:id', (req: Request, res: Response) => {
  const updated = db.updateCategory(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Categoria não encontrada' });
  }
  res.json(updated);
});

router.delete('/:id', (req: Request, res: Response) => {
  const deleted = db.deleteCategory(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Categoria não encontrada' });
  }
  res.json({ message: 'Categoria removida com sucesso' });
});

export default router;
