import { Router, Request, Response } from 'express';
import { db } from '../database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { canAccessAllEnterprises, getRequesterEnterpriseIds, requesterCanAccessEnterprise } from '../utils/enterpriseAccess.js';

const router = Router();
router.use(authMiddleware);

// Get all suppliers
router.get('/', (req: AuthRequest, res: Response) => {
  const { enterpriseId } = req.query;
  const requestedEnterpriseId = String(enterpriseId || '').trim();
  if (!canAccessAllEnterprises(req.userRole)) {
    const allowed = getRequesterEnterpriseIds(req);
    if (requestedEnterpriseId && !allowed.includes(requestedEnterpriseId)) {
      return res.status(403).json({ error: 'Acesso negado para esta empresa' });
    }
  }

  const suppliers = db.getSuppliers(enterpriseId as string);
  if (canAccessAllEnterprises(req.userRole)) {
    return res.json(suppliers);
  }
  const allowedSet = new Set(getRequesterEnterpriseIds(req));
  const scoped = (Array.isArray(suppliers) ? suppliers : []).filter((supplier: any) =>
    allowedSet.has(String(supplier?.enterpriseId || '').trim())
    || (Array.isArray(supplier?.visibleEnterpriseIds)
      && supplier.visibleEnterpriseIds.some((id: unknown) => allowedSet.has(String(id || '').trim())))
  );
  return res.json(scoped);
});

// Get supplier by ID
router.get('/:id', (req: AuthRequest, res: Response) => {
  const supplier = db.getSupplier(req.params.id);
  if (!supplier) {
    return res.status(404).json({ error: 'Fornecedor não encontrado' });
  }
  const supplierEnterpriseId = String((supplier as any)?.enterpriseId || '').trim();
  const supplierVisibleIds = Array.isArray((supplier as any)?.visibleEnterpriseIds)
    ? (supplier as any).visibleEnterpriseIds.map((id: unknown) => String(id || '').trim()).filter(Boolean)
    : [];
  const hasAccess = requesterCanAccessEnterprise(req, supplierEnterpriseId)
    || supplierVisibleIds.some((id: string) => requesterCanAccessEnterprise(req, id));
  if (!hasAccess) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }
  res.json(supplier);
});

// Create supplier
router.post('/', (req: AuthRequest, res: Response) => {
  const enterpriseId = String(req.body?.enterpriseId || '').trim();
  if (!enterpriseId) {
    return res.status(400).json({ error: 'enterpriseId é obrigatório' });
  }
  if (!requesterCanAccessEnterprise(req, enterpriseId)) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }

  const requestedVisibleEnterpriseIds = Array.isArray(req.body?.visibleEnterpriseIds)
    ? req.body.visibleEnterpriseIds.map((id: unknown) => String(id || '').trim()).filter(Boolean)
    : [];
  const visibleEnterpriseIds = requestedVisibleEnterpriseIds.includes(enterpriseId)
    ? requestedVisibleEnterpriseIds
    : [enterpriseId, ...requestedVisibleEnterpriseIds].filter(Boolean);

  for (const id of visibleEnterpriseIds) {
    if (!requesterCanAccessEnterprise(req, id)) {
      return res.status(403).json({ error: 'Acesso negado para uma das unidades selecionadas' });
    }
  }

  const payload = {
    ...(req.body || {}),
    enterpriseId,
    visibleEnterpriseIds,
    paymentMethods: Array.isArray(req.body?.paymentMethods)
      ? req.body.paymentMethods.map((item: unknown) => String(item || '').trim()).filter(Boolean)
      : [],
    paymentTerms: Array.isArray(req.body?.paymentTerms)
      ? req.body.paymentTerms.map((item: unknown) => String(item || '').trim()).filter(Boolean)
      : [],
    paymentDeadlineDays: Number(req.body?.paymentDeadlineDays || 0) || 0,
    autoCreateProductsInUnits: req.body?.autoCreateProductsInUnits !== false,
  };

  const newSupplier = db.createSupplier(payload);

  if (payload.autoCreateProductsInUnits && Array.isArray(newSupplier?.suppliedProducts) && newSupplier.suppliedProducts.length > 0) {
    const allProducts = db.getProducts();

    visibleEnterpriseIds.forEach((unitId: string) => {
      newSupplier.suppliedProducts.forEach((item: any) => {
        const productName = String(item?.name || '').trim();
        if (!productName) return;

        const alreadyExists = allProducts.some((product: any) => {
          return String(product?.enterpriseId || '').trim() === unitId
            && String(product?.name || '').trim().toLowerCase() === productName.toLowerCase();
        });
        if (alreadyExists) return;

        db.createProduct({
          name: productName,
          category: String(item?.category || newSupplier?.category || 'LANCHE').trim(),
          subCategory: '',
          price: Number(item?.suggestedPrice || item?.cost || 0),
          cost: Number(item?.cost || 0),
          stock: 0,
          minStock: 0,
          unit: 'UN',
          controlsStock: true,
          isActive: false,
          enterpriseId: unitId,
        });
      });
    });
  }

  res.status(201).json(newSupplier);
});

// Update supplier
router.put('/:id', (req: AuthRequest, res: Response) => {
  const current = db.getSupplier(req.params.id);
  if (!current) {
    return res.status(404).json({ error: 'Fornecedor não encontrado' });
  }
  if (!requesterCanAccessEnterprise(req, String((current as any)?.enterpriseId || ''))) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }

  const enterpriseId = String(req.body?.enterpriseId || (current as any)?.enterpriseId || '').trim();
  const requestedVisibleEnterpriseIds = Array.isArray(req.body?.visibleEnterpriseIds)
    ? req.body.visibleEnterpriseIds.map((id: unknown) => String(id || '').trim()).filter(Boolean)
    : (Array.isArray((current as any)?.visibleEnterpriseIds)
      ? (current as any).visibleEnterpriseIds.map((id: unknown) => String(id || '').trim()).filter(Boolean)
      : []);
  const visibleEnterpriseIds = requestedVisibleEnterpriseIds.includes(enterpriseId)
    ? requestedVisibleEnterpriseIds
    : [enterpriseId, ...requestedVisibleEnterpriseIds].filter(Boolean);

  for (const id of visibleEnterpriseIds) {
    if (!requesterCanAccessEnterprise(req, id)) {
      return res.status(403).json({ error: 'Acesso negado para uma das unidades selecionadas' });
    }
  }

  const payload = {
    ...(req.body || {}),
    enterpriseId,
    visibleEnterpriseIds,
    paymentMethods: Array.isArray(req.body?.paymentMethods)
      ? req.body.paymentMethods.map((item: unknown) => String(item || '').trim()).filter(Boolean)
      : (current as any)?.paymentMethods,
    paymentTerms: Array.isArray(req.body?.paymentTerms)
      ? req.body.paymentTerms.map((item: unknown) => String(item || '').trim()).filter(Boolean)
      : (current as any)?.paymentTerms,
    paymentDeadlineDays: req.body?.paymentDeadlineDays !== undefined
      ? Number(req.body.paymentDeadlineDays || 0) || 0
      : (current as any)?.paymentDeadlineDays,
    autoCreateProductsInUnits: req.body?.autoCreateProductsInUnits !== undefined
      ? req.body.autoCreateProductsInUnits !== false
      : (current as any)?.autoCreateProductsInUnits !== false,
  };

  const updated = db.updateSupplier(req.params.id, payload);
  if (!updated) {
    return res.status(404).json({ error: 'Fornecedor não encontrado' });
  }
  res.json(updated);
});

// Delete supplier
router.delete('/:id', (req: AuthRequest, res: Response) => {
  const current = db.getSupplier(req.params.id);
  if (!current) {
    return res.status(404).json({ error: 'Fornecedor não encontrado' });
  }
  if (!requesterCanAccessEnterprise(req, String((current as any)?.enterpriseId || ''))) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }

  const deleted = db.deleteSupplier(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Fornecedor não encontrado' });
  }
  res.json({ message: 'Fornecedor deletado com sucesso' });
});

export default router;
