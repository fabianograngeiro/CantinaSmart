import { Router, Request, Response } from 'express';
import { db } from '../database';

const router = Router();
const normalizeSearchText = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

// Search ingredients by name
router.get('/search', (req: Request, res: Response) => {
  const query = normalizeSearchText(String(req.query.q || ''));
  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, limitRaw)) : 120;

  if (!query) {
    return res.json([]);
  }

  const ingredients = db
    .getIngredients()
    .filter((ingredient: any) => {
      const name = normalizeSearchText(String(ingredient?.name || ''));
      const category = normalizeSearchText(String(ingredient?.category || ''));
      return name.includes(query) || category.includes(query);
    })
    .slice(0, limit);

  res.json(ingredients);
});

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
