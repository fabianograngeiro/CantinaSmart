import { Router, Request, Response } from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { db } from '../database';

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

// Get all products
router.get('/', (req: Request, res: Response) => {
  const { enterpriseId } = req.query;
  const products = db.getProducts(enterpriseId as string);
  res.json(products);
});

// Upload de foto de produto
router.post('/upload-photo', async (req: Request, res: Response) => {
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
router.get('/:id', (req: Request, res: Response) => {
  const product = db.getProduct(req.params.id);
  if (!product) {
    return res.status(404).json({ error: 'Produto não encontrado' });
  }
  res.json(product);
});

// Create product
router.post('/', (req: Request, res: Response) => {
  const newProduct = db.createProduct(req.body);
  res.status(201).json(newProduct);
});

// Update product
router.put('/:id', (req: Request, res: Response) => {
  const productId = req.params.id;
  const current = db.getProduct(productId);
  if (!current) {
    return res.status(404).json({ error: 'Produto não encontrado' });
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
router.delete('/:id', async (req: Request, res: Response) => {
  const productId = req.params.id;
  const current = db.getProduct(productId);
  if (!current) {
    return res.status(404).json({ error: 'Produto não encontrado' });
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
