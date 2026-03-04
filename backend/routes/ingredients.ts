import { Router, Request, Response } from 'express';
import { db } from '../database';

const router = Router();

// Get all ingredients
router.get('/', (req: Request, res: Response) => {
  const ingredients = db.getIngredients();
  res.json(ingredients);
});

// Get ingredient by ID
router.get('/:id', (req: Request, res: Response) => {
  const ingredient = db.getIngredient(req.params.id);
  if (!ingredient) {
    return res.status(404).json({ error: 'Ingrediente não encontrado' });
  }
  res.json(ingredient);
});

// Create ingredient
router.post('/', (req: Request, res: Response) => {
  const newIngredient = db.createIngredient(req.body);
  res.status(201).json(newIngredient);
});

// Update ingredient
router.put('/:id', (req: Request, res: Response) => {
  const updated = db.updateIngredient(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Ingrediente não encontrado' });
  }
  res.json(updated);
});

// Delete ingredient
router.delete('/:id', (req: Request, res: Response) => {
  const deleted = db.deleteIngredient(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Ingrediente não encontrado' });
  }
  res.json({ message: 'Ingrediente deletado com sucesso' });
});

export default router;
