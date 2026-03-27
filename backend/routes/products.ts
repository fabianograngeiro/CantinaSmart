import { Router, Request, Response } from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { db } from '../database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PRODUCT_PHOTOS_DIR = path.resolve(__dirname, '../products_photos');

const ensureProductPhotosDir = async () => {
  await fs.mkdir(PRODUCT_PHOTOS_DIR, { recursive: true });
};

const sanitizeFileName = (name: string) => {
  return String(name || 'produto')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .toLowerCase();
};

const extensionFromMime = (mimeType: string) => {
  const normalized = String(mimeType || '').toLowerCase();
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'jpg';
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/webp') return 'webp';
  return null;
};

const isLocalProductPhotoUrl = (value: unknown) => {
  return typeof value === 'string' && value.startsWith('/products_photos/');
};

const resolveProductPhotoPath = (photoUrl: string) => {
  const fileName = photoUrl.replace('/products_photos/', '');
  return path.join(PRODUCT_PHOTOS_DIR, fileName);
};

const isPhotoUsedByOtherProduct = (photoUrl: string, excludeProductId: string) => {
  const allProducts = db.getProducts();
  return allProducts.some((product: any) => (
    String(product?.id || '') !== String(excludeProductId || '')
    && String(product?.image || '') === String(photoUrl || '')
  ));
};

const tryDeleteLocalPhoto = async (photoUrl: string, excludeProductId: string) => {
  if (!isLocalProductPhotoUrl(photoUrl)) return;
  if (isPhotoUsedByOtherProduct(photoUrl, excludeProductId)) return;

  const photoPath = resolveProductPhotoPath(photoUrl);
  try {
    await fs.unlink(photoPath);
  } catch (err: any) {
    if (err?.code !== 'ENOENT') {
      console.error('❌ [PRODUCTS] Erro ao excluir foto antiga do produto:', err);
    }
  }
};

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

// Upload de foto de produto
router.post('/upload-photo', async (req: AuthRequest, res: Response) => {
  try {
    const { fileName, mimeType, dataBase64 } = req.body || {};
    if (!dataBase64 || typeof dataBase64 !== 'string') {
      return res.status(400).json({ error: 'Arquivo inválido para upload.' });
    }

    const ext = extensionFromMime(mimeType);
    if (!ext) {
      return res.status(400).json({ error: 'Formato de imagem não suportado. Use JPG, PNG ou WEBP.' });
    }

    const safeName = sanitizeFileName(fileName || 'produto');
    const baseName = safeName.replace(/\.[^.]+$/, '') || 'produto';
    const finalFileName = `${baseName}_${Date.now()}.${ext}`;
    const filePath = path.join(PRODUCT_PHOTOS_DIR, finalFileName);

    const fileBuffer = Buffer.from(dataBase64, 'base64');
    if (!fileBuffer.length) {
      return res.status(400).json({ error: 'Conteúdo da imagem está vazio.' });
    }

    await ensureProductPhotosDir();
    await fs.writeFile(filePath, fileBuffer);

    return res.json({
      success: true,
      imageUrl: `/products_photos/${finalFileName}`
    });
  } catch (err) {
    console.error('❌ [PRODUCTS] Erro ao salvar foto do produto:', err);
    return res.status(500).json({ error: 'Erro ao salvar foto do produto.' });
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

  const oldImage = String(current.image || '');
  const newImage = typeof req.body?.image === 'string' ? req.body.image : oldImage;
  const imageChanged = oldImage !== newImage;

  const updated = db.updateProduct(productId, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Produto não encontrado' });
  }

  if (imageChanged && oldImage) {
    void tryDeleteLocalPhoto(oldImage, productId);
  }

  res.json(updated);
});

// Delete product
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const productId = req.params.id;
  const current = db.getProduct(productId);
  if (!current) {
    return res.status(404).json({ error: 'Produto não encontrado' });
  }
  if (!requesterCanAccessEnterprise(req, String((current as any)?.enterpriseId || ''))) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }

  const imageToDelete = String(current.image || '');
  const deleted = db.deleteProduct(productId);
  if (!deleted) {
    return res.status(404).json({ error: 'Produto não encontrado' });
  }

  if (imageToDelete) {
    await tryDeleteLocalPhoto(imageToDelete, productId);
  }

  res.json({ message: 'Produto deletado com sucesso' });
});

export default router;
