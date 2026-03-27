import { Router, Response } from 'express';
import { db } from '../database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { whatsappSession } from '../utils/whatsappSession.js';

const router = Router();

const isSuperAdmin = (req: AuthRequest) => String(req.userRole || '').trim().toUpperCase() === 'SUPERADMIN';

const buildTemporaryAiPatch = (params: {
  ticketId: string;
  message: string;
  details?: string;
  source?: string;
  page?: string;
}) => {
  const config = whatsappSession.getAiConfig();
  const provider = String(config?.provider || 'openai').trim().toUpperCase();
  const model = String(config?.model || '').trim() || 'DEFAULT';
  const rawMessage = String(params.message || '').trim();
  const rawDetails = String(params.details || '').trim();
  const rawSource = String(params.source || 'PDV').trim().toUpperCase();
  const rawPage = String(params.page || '').trim() || '/';

  const shortMessage = rawMessage.length > 180 ? `${rawMessage.slice(0, 177)}...` : rawMessage;
  const safeHint = rawDetails
    ? rawDetails.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 2).join(' | ')
    : '';

  const steps = [
    `Origem: ${rawSource} (${rawPage})`,
    `Falha reportada: ${shortMessage}`,
    safeHint ? `Pista técnica: ${safeHint}` : '',
    'Ação temporária: ativar fallback seguro para manter o fluxo funcional.',
    'Validação humana obrigatória antes de encerrar o ticket.',
  ].filter(Boolean);

  return {
    id: `ai_patch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    label: 'PATCH TEMPORÁRIO IA',
    generatedBy: `${provider}:${model}`,
    isTemporary: true,
    active: true,
    createdAt: new Date().toISOString(),
    removedAt: '',
    removedBy: '',
    summary: `Correção temporária automática gerada por IA para o ticket ${params.ticketId}.`,
    instructions: steps,
  };
};

router.post('/', authMiddleware, (req: AuthRequest, res: Response) => {
  const payload = req.body || {};
  const message = String(payload?.message || '').trim();

  if (!message) {
    return res.status(400).json({ error: 'message é obrigatório' });
  }

  const devAssistantConfig = db.getDevAssistantConfig();
  const autoPatchEnabled = devAssistantConfig?.autoPatchEnabled !== false;
  const forceAutoPatch = Boolean(payload?.forceAutoPatch);

  const temporaryAiPatch = (autoPatchEnabled || forceAutoPatch)
    ? buildTemporaryAiPatch({
        ticketId: String(payload?.id || '').trim() || `ticket_${Date.now()}`,
        message,
        details: String(payload?.details || '').trim(),
        source: String(payload?.source || '').trim(),
        page: String(payload?.page || '').trim(),
      })
    : null;

  const created = db.createErrorTicket({
    ...payload,
    status: 'OPEN',
    humanValidationStatus: 'PENDING',
    humanValidatedBy: '',
    humanValidatedAt: '',
    patchAppliedByAi: Boolean(temporaryAiPatch),
    aiPatch: temporaryAiPatch,
    userId: String(payload?.userId || req.userId || '').trim(),
    userRole: String(payload?.userRole || req.userRole || '').trim(),
  });

  return res.status(201).json(created);
});

router.get('/', authMiddleware, (req: AuthRequest, res: Response) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ error: 'Acesso restrito ao SUPERADMIN' });
  }

  const { enterpriseId, status } = req.query;
  const tickets = db.getErrorTickets({
    enterpriseId: enterpriseId as string | undefined,
    status: status as string | undefined,
  });

  return res.json(tickets);
});

router.get('/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ error: 'Acesso restrito ao SUPERADMIN' });
  }

  const ticket = db.getErrorTicket(req.params.id);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket não encontrado' });
  }

  return res.json(ticket);
});

router.put('/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ error: 'Acesso restrito ao SUPERADMIN' });
  }

  const ticket = db.getErrorTicket(req.params.id);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket não encontrado' });
  }

  const incomingStatus = String(req.body?.status || '').trim().toUpperCase();
  const aiPatchActive = Boolean(ticket?.aiPatch?.active);
  const validated = String(ticket?.humanValidationStatus || '').trim().toUpperCase() === 'APPROVED';

  if (incomingStatus === 'RESOLVED' && aiPatchActive && !validated) {
    return res.status(400).json({
      error: 'Não é possível resolver ticket com patch IA ativo sem validação humana.',
      details: ['Remova o patch IA ou valide manualmente a correção antes de resolver.'],
    });
  }

  const updated = db.updateErrorTicket(req.params.id, req.body || {});
  if (!updated) {
    return res.status(404).json({ error: 'Ticket não encontrado' });
  }

  return res.json(updated);
});

router.post('/:id/remove-ai-patch', authMiddleware, (req: AuthRequest, res: Response) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ error: 'Acesso restrito ao SUPERADMIN' });
  }

  const ticket = db.getErrorTicket(req.params.id);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket não encontrado' });
  }

  const currentPatch = ticket?.aiPatch && typeof ticket.aiPatch === 'object' ? ticket.aiPatch : null;
  if (!currentPatch) {
    return res.status(400).json({ error: 'Este ticket não possui patch IA.' });
  }

  if (!currentPatch.active) {
    return res.status(400).json({ error: 'Patch IA já está inativo.' });
  }

  const updated = db.updateErrorTicket(req.params.id, {
    aiPatch: {
      ...currentPatch,
      active: false,
      removedAt: new Date().toISOString(),
      removedBy: String(req.userId || '').trim(),
    },
    patchAppliedByAi: true,
  });

  return res.json(updated);
});

router.post('/:id/validate-human', authMiddleware, (req: AuthRequest, res: Response) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ error: 'Acesso restrito ao SUPERADMIN' });
  }

  const ticket = db.getErrorTicket(req.params.id);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket não encontrado' });
  }

  const updated = db.updateErrorTicket(req.params.id, {
    humanValidationStatus: 'APPROVED',
    humanValidatedBy: String(req.userId || '').trim(),
    humanValidatedAt: new Date().toISOString(),
  });

  return res.json(updated);
});

export default router;
