import { Router, Response } from 'express';
import { db } from '../database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { canAccessAllEnterprises, getRequesterEnterpriseIds } from '../utils/enterpriseAccess.js';

const router = Router();

const normalizeRole = (value?: string) => String(value || '').trim().toUpperCase();

const canManageContestations = (role?: string) => {
  const normalized = normalizeRole(role);
  return ['SUPERADMIN', 'ADMIN_SISTEMA', 'OWNER', 'ADMIN', 'GERENTE'].includes(normalized);
};

const canCreateContestation = (role?: string) => {
  const normalized = normalizeRole(role);
  return canManageContestations(normalized)
    || ['RESPONSAVEL', 'COLABORADOR', 'CLIENTE'].includes(normalized);
};

const getPortalLinkedEnterpriseIds = (req: AuthRequest): string[] => {
  const requester = req.userId ? db.getUser(String(req.userId || '').trim()) : null;
  const linkedClientId = String((requester as any)?.linkedClientId || '').trim();
  if (!linkedClientId) return [];

  const linkedClient = db.getClient(linkedClientId);
  const linkedEnterpriseId = String((linkedClient as any)?.enterpriseId || '').trim();
  if (!linkedEnterpriseId) return [];
  return [linkedEnterpriseId];
};

const canAccessEnterprise = (req: AuthRequest, enterpriseId: string) => {
  const normalizedEnterpriseId = String(enterpriseId || '').trim();
  if (!normalizedEnterpriseId) return false;
  if (canAccessAllEnterprises(req.userRole)) return true;

  const allowed = new Set<string>([
    ...getRequesterEnterpriseIds(req),
    ...getPortalLinkedEnterpriseIds(req),
  ]);

  return allowed.has(normalizedEnterpriseId);
};

router.use(authMiddleware);

router.get('/', (req: AuthRequest, res: Response) => {
  if (!canManageContestations(req.userRole)) {
    return res.status(403).json({ error: 'Acesso restrito a gestores.' });
  }

  const requestedEnterpriseId = String(req.query.enterpriseId || '').trim();
  const status = String(req.query.status || '').trim();
  const priority = String(req.query.priority || '').trim();
  const clientId = String(req.query.clientId || '').trim();

  if (canAccessAllEnterprises(req.userRole)) {
    const enterpriseIds = requestedEnterpriseId ? [requestedEnterpriseId] : undefined;
    return res.json(db.getContestations({ enterpriseIds, status, priority, clientId }));
  }

  const allowedEnterpriseIds = getRequesterEnterpriseIds(req);
  if (requestedEnterpriseId && !allowedEnterpriseIds.includes(requestedEnterpriseId)) {
    return res.status(403).json({ error: 'Sem permissao para acessar contestacoes desta empresa.' });
  }

  const enterpriseIds = requestedEnterpriseId ? [requestedEnterpriseId] : allowedEnterpriseIds;
  return res.json(db.getContestations({ enterpriseIds, status, priority, clientId }));
});

router.post('/', (req: AuthRequest, res: Response) => {
  if (!canCreateContestation(req.userRole)) {
    return res.status(403).json({ error: 'Acesso negado para criar contestacao.' });
  }

  const payload = req.body || {};
  const subject = String(payload?.subject || payload?.title || '').trim();
  const description = String(payload?.description || '').trim();

  if (!subject) return res.status(400).json({ error: 'subject e obrigatorio.' });
  if (!description) return res.status(400).json({ error: 'description e obrigatorio.' });

  const requester = req.userId ? db.getUser(String(req.userId || '').trim()) : null;
  const requesterEnterpriseIds = getRequesterEnterpriseIds(req);
  const portalLinkedEnterpriseIds = getPortalLinkedEnterpriseIds(req);
  const payloadEnterpriseId = String(payload?.enterpriseId || '').trim();
  const enterpriseId = payloadEnterpriseId
    || String(requesterEnterpriseIds[0] || '').trim()
    || String(portalLinkedEnterpriseIds[0] || '').trim();

  if (!enterpriseId) {
    return res.status(400).json({ error: 'enterpriseId nao informado e nao foi possivel inferir pelo usuario.' });
  }

  if (!canAccessEnterprise(req, enterpriseId)) {
    return res.status(403).json({ error: 'Sem permissao para registrar contestacao nesta empresa.' });
  }

  const linkedClientId = String((requester as any)?.linkedClientId || '').trim();
  const clientId = String(payload?.clientId || linkedClientId || '').trim();
  const client = clientId ? db.getClient(clientId) : null;

  const enterprise = db.getEnterprise(enterpriseId);

  const created = db.createContestation({
    ...payload,
    enterpriseId,
    enterpriseName: String(payload?.enterpriseName || (enterprise as any)?.name || '').trim(),
    clientId,
    clientName: String(payload?.clientName || (client as any)?.name || '').trim(),
    portalSource: Boolean(payload?.portalSource) || ['RESPONSAVEL', 'COLABORADOR', 'CLIENTE'].includes(normalizeRole(req.userRole)),
    createdByUserId: String(req.userId || '').trim(),
    createdByUserRole: normalizeRole(req.userRole),
  });

  return res.status(201).json(created);
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  if (!canManageContestations(req.userRole)) {
    return res.status(403).json({ error: 'Acesso restrito a gestores.' });
  }

  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'ID invalido.' });

  const current = db.getContestation(id);
  if (!current) return res.status(404).json({ error: 'Contestacao nao encontrada.' });

  const enterpriseId = String((current as any)?.enterpriseId || '').trim();
  if (!canAccessEnterprise(req, enterpriseId)) {
    return res.status(403).json({ error: 'Sem permissao para atualizar contestacao desta empresa.' });
  }

  const updated = db.updateContestation(id, {
    ...(req.body || {}),
    resolvedByUserId: String(req.userId || '').trim(),
  });

  if (!updated) return res.status(404).json({ error: 'Contestacao nao encontrada.' });
  return res.json(updated);
});

export default router;
