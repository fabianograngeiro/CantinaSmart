import { Router, Response } from 'express';
import { db } from '../database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { canAccessAllEnterprises, getRequesterEnterpriseIds, requesterCanAccessEnterprise } from '../utils/enterpriseAccess.js';

const router = Router();
router.use(authMiddleware);

const ORDER_CREATE_IDEMPOTENCY_TTL_MS = 2 * 60 * 1000;
type OrderCreateIdempotencyRecord = {
  status: 'PENDING' | 'DONE';
  createdAt: number;
  responseBody?: any;
};
const orderCreateIdempotencyStore = new Map<string, OrderCreateIdempotencyRecord>();

const normalizeToken = (value: unknown) => String(value || '')
  .trim()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase();

const normalizeDateKey = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = `${parsed.getMonth() + 1}`.padStart(2, '0');
  const day = `${parsed.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const cleanupOrderCreateIdempotencyStore = () => {
  const now = Date.now();
  for (const [key, entry] of orderCreateIdempotencyStore.entries()) {
    if ((now - Number(entry?.createdAt || 0)) > ORDER_CREATE_IDEMPOTENCY_TTL_MS) {
      orderCreateIdempotencyStore.delete(key);
    }
  }
};

const buildOrderCreateIdempotencyKey = (req: AuthRequest, payload: any) => {
  const requesterUserId = String((req as any)?.userId || '').trim() || 'anonymous';
  const enterpriseId = String(payload?.enterpriseId || '').trim();
  const explicitRaw = String(req.header('x-idempotency-key') || '').trim();
  if (explicitRaw) {
    return `EXPLICIT:${requesterUserId}:${enterpriseId}:${explicitRaw.slice(0, 160)}`;
  }

  const normalizedItems = (Array.isArray(payload?.items) ? payload.items : [])
    .map((item: any) => ({
      productName: normalizeToken(item?.productName),
      quantity: Number(item?.quantity ?? 0),
      cost: Number(item?.cost ?? 0),
    }))
    .sort((a: any, b: any) => `${a.productName}|${a.quantity}|${a.cost}`.localeCompare(`${b.productName}|${b.quantity}|${b.cost}`));

  const itemsKey = normalizedItems
    .map((item: any) => `${item.productName}:${item.quantity}:${item.cost}`)
    .join(',');

  const fingerprintParts = [
    normalizeToken(payload?.supplierId),
    normalizeToken(payload?.supplierName),
    normalizeDateKey(payload?.date),
    String(Number(payload?.total ?? 0)),
    normalizeToken(payload?.status),
    normalizeToken(payload?.trackingNote),
    itemsKey,
  ];

  return `DERIVED:${requesterUserId}:${enterpriseId}:${fingerprintParts.join('|')}`;
};

const ORDER_STATUSES = ['AGUARDANDO_APROVACAO_OWNER', 'ABERTO', 'ENTREGUE', 'CANCELADO'] as const;
const normalizeOrderStatus = (value: unknown) => String(value || '').trim().toUpperCase();

const isOrderStatusAllowed = (value: string) => ORDER_STATUSES.includes(value as any);

const getAllowedOrderStatusTransitions = (from: string) => {
  const map: Record<string, string[]> = {
    AGUARDANDO_APROVACAO_OWNER: ['AGUARDANDO_APROVACAO_OWNER', 'ABERTO', 'CANCELADO'],
    ABERTO: ['ABERTO', 'ENTREGUE', 'CANCELADO'],
    ENTREGUE: ['ENTREGUE'],
    CANCELADO: ['CANCELADO'],
  };
  return map[from] || [from];
};

// Get all orders
router.get('/', (req: AuthRequest, res: Response) => {
  const { enterpriseId } = req.query;
  const requestedEnterpriseId = String(enterpriseId || '').trim();
  if (!canAccessAllEnterprises(req.userRole)) {
    const allowed = getRequesterEnterpriseIds(req);
    if (requestedEnterpriseId && !allowed.includes(requestedEnterpriseId)) {
      return res.status(403).json({ error: 'Acesso negado para esta empresa' });
    }
  }

  const orders = db.getOrders(enterpriseId as string);
  if (canAccessAllEnterprises(req.userRole)) {
    return res.json(orders);
  }

  const allowedSet = new Set(getRequesterEnterpriseIds(req));
  const scoped = (Array.isArray(orders) ? orders : []).filter((order: any) =>
    allowedSet.has(String(order?.enterpriseId || '').trim())
  );
  return res.json(scoped);
});

// Get order by ID
router.get('/:id', (req: AuthRequest, res: Response) => {
  const order = db.getOrder(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Pedido nao encontrado' });
  }
  if (!requesterCanAccessEnterprise(req, String((order as any)?.enterpriseId || ''))) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }
  return res.json(order);
});

// Create order
router.post('/', (req: AuthRequest, res: Response) => {
  const payload = req.body || {};
  const enterpriseId = String(payload?.enterpriseId || '').trim();
  if (!enterpriseId) {
    return res.status(400).json({ error: 'enterpriseId e obrigatorio' });
  }
  if (!requesterCanAccessEnterprise(req, enterpriseId)) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }

  cleanupOrderCreateIdempotencyStore();
  const idempotencyKey = buildOrderCreateIdempotencyKey(req, payload);
  const existing = orderCreateIdempotencyStore.get(idempotencyKey);
  if (existing?.status === 'DONE' && existing.responseBody) {
    return res.status(200).json(existing.responseBody);
  }
  if (existing?.status === 'PENDING') {
    return res.status(409).json({
      error: 'Pedido ja esta em processamento para esta mesma solicitacao. Aguarde alguns segundos.',
    });
  }

  orderCreateIdempotencyStore.set(idempotencyKey, {
    status: 'PENDING',
    createdAt: Date.now(),
  });

  try {
    const newOrder = db.createOrder(payload);
    orderCreateIdempotencyStore.set(idempotencyKey, {
      status: 'DONE',
      createdAt: Date.now(),
      responseBody: newOrder,
    });
    return res.status(201).json(newOrder);
  } catch (error) {
    orderCreateIdempotencyStore.delete(idempotencyKey);
    console.error('Erro ao criar pedido:', (error as Error).message);
    return res.status(500).json({ error: 'Erro ao criar pedido' });
  }
});

// Update order
router.put('/:id', (req: AuthRequest, res: Response) => {
  const current = db.getOrder(req.params.id);
  if (!current) {
    return res.status(404).json({ error: 'Pedido nao encontrado' });
  }
  if (!requesterCanAccessEnterprise(req, String((current as any)?.enterpriseId || ''))) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }
  const payload = req.body || {};
  const nextEnterpriseId = String(payload?.enterpriseId || (current as any)?.enterpriseId || '').trim();
  if (nextEnterpriseId && !requesterCanAccessEnterprise(req, nextEnterpriseId)) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }

  const currentStatus = normalizeOrderStatus((current as any)?.status || 'ABERTO');
  const requestedStatus = normalizeOrderStatus(payload?.status ?? currentStatus);
  if (!isOrderStatusAllowed(requestedStatus)) {
    return res.status(400).json({
      error: 'Status de pedido invalido.',
      details: [`Status permitido: ${ORDER_STATUSES.join(', ')}`],
    });
  }

  const allowedTransitions = getAllowedOrderStatusTransitions(currentStatus);
  if (!allowedTransitions.includes(requestedStatus)) {
    return res.status(409).json({
      error: `Transicao de status nao permitida (${currentStatus} -> ${requestedStatus}).`,
      details: [`Transicoes permitidas a partir de ${currentStatus}: ${allowedTransitions.join(', ')}`],
    });
  }

  if (currentStatus !== requestedStatus && (requestedStatus === 'ABERTO' || requestedStatus === 'CANCELADO')) {
    if (!canAccessAllEnterprises(req.userRole)) {
      return res.status(403).json({
        error: 'Apenas OWNER/SUPERADMIN/ADMIN_SISTEMA podem aprovar ou cancelar pedidos.',
      });
    }
  }

  const payloadKeys = Object.keys(payload || {});
  const hasProtectedFieldMutation = payloadKeys.some((key) => !['status', 'trackingNote'].includes(String(key || '').trim()));
  if ((currentStatus === 'ENTREGUE' || currentStatus === 'CANCELADO') && hasProtectedFieldMutation) {
    return res.status(409).json({
      error: 'Pedido finalizado nao permite alteracao de dados estruturais.',
      details: ['Apenas trackingNote pode ser atualizado apos ENTREGUE/CANCELADO.'],
    });
  }

  const updated = db.updateOrder(req.params.id, payload);
  if (!updated) {
    return res.status(404).json({ error: 'Pedido nao encontrado' });
  }
  return res.json(updated);
});

// Delete order
router.delete('/:id', (req: AuthRequest, res: Response) => {
  const current = db.getOrder(req.params.id);
  if (!current) {
    return res.status(404).json({ error: 'Pedido nao encontrado' });
  }
  if (!requesterCanAccessEnterprise(req, String((current as any)?.enterpriseId || ''))) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }

  const deleted = db.deleteOrder(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Pedido nao encontrado' });
  }
  return res.json({ message: 'Pedido deletado com sucesso' });
});

export default router;
