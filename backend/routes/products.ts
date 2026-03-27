import { Router, Response } from 'express';
import { db } from '../database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

const normalizeRole = (value?: string) => String(value || '').trim().toUpperCase();
const canAccessAllEnterprises = (role?: string) => {
  const normalized = normalizeRole(role);
  return normalized === 'SUPERADMIN' || normalized === 'ADMIN_SISTEMA';
};
const getRequesterUser = (req: AuthRequest) => {
  if (!req.userId) return null;
  return db.getUser(req.userId);
};
const getRequesterEnterpriseIds = (req: AuthRequest) => {
  const requester = getRequesterUser(req);
  if (!requester || !Array.isArray(requester.enterpriseIds)) return [] as string[];
  return requester.enterpriseIds.map((id: unknown) => String(id || '').trim()).filter(Boolean);
};
const requesterCanAccessEnterprise = (req: AuthRequest, enterpriseId: string) => {
  if (canAccessAllEnterprises(req.userRole)) return true;
  const allowedIds = getRequesterEnterpriseIds(req);
  return allowedIds.includes(String(enterpriseId || '').trim());
};

router.use(authMiddleware);

// Get all products
router.get('/', (req: AuthRequest, res: Response) => {
  const requestedEnterpriseId = String(req.query?.enterpriseId || '').trim();
  const allProducts = db.getProducts();

  if (canAccessAllEnterprises(req.userRole)) {
    if (!requestedEnterpriseId) return res.json(allProducts);
    return res.json(allProducts.filter((product: any) => String(product?.enterpriseId || '').trim() === requestedEnterpriseId));
  }

  const allowedIds = new Set(getRequesterEnterpriseIds(req));
  if (requestedEnterpriseId && !allowedIds.has(requestedEnterpriseId)) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }

  const scopedProducts = allProducts.filter((product: any) => allowedIds.has(String(product?.enterpriseId || '').trim()));
  if (!requestedEnterpriseId) {
    return res.json(scopedProducts);
  }

  const filteredProducts = scopedProducts.filter((product: any) => String(product?.enterpriseId || '').trim() === requestedEnterpriseId);
  return res.json(filteredProducts);
});

// Restore products snapshot
router.post('/restore', (req: AuthRequest, res: Response) => {
  const { enterpriseId } = req.body || {};
  const normalizedEnterpriseId = String(enterpriseId || '').trim();
  const items = Array.isArray(req.body)
    ? req.body
    : (Array.isArray(req.body?.items) ? req.body.items : null);

  if (!normalizedEnterpriseId) {
    return res.status(400).json({ error: 'enterpriseId é obrigatório para restauração.' });
  }

  if (!requesterCanAccessEnterprise(req, normalizedEnterpriseId)) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }

  if (!items) {
    return res.status(400).json({ error: 'Payload inválido. Envie um array de itens ou { items: [...] }.' });
  }

  try {
    const restored = db.restoreProductsSnapshot(normalizedEnterpriseId, items);
    return res.json({
      message: 'Backup de produtos restaurado com sucesso.',
      count: restored.length,
      items: restored,
    });
  } catch (error) {
    console.error('❌ [PRODUCTS] Erro ao restaurar snapshot de produtos:', (error as Error).message);
    return res.status(500).json({ error: 'Erro ao restaurar backup de produtos.' });
  }
});

// Upload de foto de produto — armazenado como Data URI no banco de dados
router.post('/upload-photo', (req: AuthRequest, res: Response) => {
  try {
    const { mimeType, dataBase64 } = req.body || {};
    if (!dataBase64 || typeof dataBase64 !== 'string') {
      return res.status(400).json({ error: 'Arquivo inválido para upload.' });
    }

    const normalizedMime = String(mimeType || '').toLowerCase().trim();
    if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
      return res.status(400).json({ error: 'Formato de imagem não suportado. Use JPG, PNG ou WEBP.' });
    }

    if (!dataBase64.length) {
      return res.status(400).json({ error: 'Conteúdo da imagem está vazio.' });
    }

    const dataUri = `data:${normalizedMime};base64,${dataBase64}`;

    return res.json({
      success: true,
      imageUrl: dataUri,
    });
  } catch (err) {
    console.error('❌ [PRODUCTS] Erro ao processar foto do produto:', err);
    return res.status(500).json({ error: 'Erro ao processar foto do produto.' });
  }
});

// Get product by ID
router.get('/:id', (req: AuthRequest, res: Response) => {
  const product = db.getProduct(req.params.id);
  if (!product) {
    return res.status(404).json({ error: 'Produto não encontrado' });
  }
  if (!requesterCanAccessEnterprise(req, String((product as any)?.enterpriseId || ''))) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }
  res.json(product);
});

// Create product
router.post('/', (req: AuthRequest, res: Response) => {
  const enterpriseId = String(req.body?.enterpriseId || '').trim();
  if (!enterpriseId) {
    return res.status(400).json({ error: 'enterpriseId é obrigatório' });
  }
  if (!requesterCanAccessEnterprise(req, enterpriseId)) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }
  const newProduct = db.createProduct(req.body);
  res.status(201).json(newProduct);
});

// Update product
router.put('/:id', (req: AuthRequest, res: Response) => {
  const productId = req.params.id;
  const current = db.getProduct(productId);
  if (!current) {
    return res.status(404).json({ error: 'Produto não encontrado' });
  }
  if (!requesterCanAccessEnterprise(req, String((current as any)?.enterpriseId || ''))) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }

  const updated = db.updateProduct(productId, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Produto não encontrado' });
  }

  res.json(updated);
});

// Delete product
router.delete('/:id', (req: AuthRequest, res: Response) => {
  const productId = req.params.id;
  const current = db.getProduct(productId);
  if (!current) {
    return res.status(404).json({ error: 'Produto não encontrado' });
  }
  if (!requesterCanAccessEnterprise(req, String((current as any)?.enterpriseId || ''))) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }

  const deleted = db.deleteProduct(productId);
  if (!deleted) {
    return res.status(404).json({ error: 'Produto não encontrado' });
  }

  res.json({ message: 'Produto deletado com sucesso' });
});

export default router;
