import { Router, Request, Response } from 'express';
import { db } from '../database.js';
import { processOverduePlanConsumptions } from '../services/planConsumptionAutoProcessor.js';
import { validateClient, validateClientUpdate } from '../utils/validation.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { canAccessAllEnterprises, requesterCanAccessEnterprise } from '../utils/enterpriseAccess.js';
import { shouldCheckDuplicateStudentOnUpdate } from '../utils/clientDuplicateRules.js';
import { detectStudentDuplicateReason } from '../utils/studentDuplicateMatcher.js';
import { getResponsibleCpf } from '../utils/clientDocument.js';
import { resolveUniqueStudentRegistrationId } from '../utils/studentRegistrationId.js';

const router = Router();

const extensionFromMime = (mimeType: string) => {
  const normalized = String(mimeType || '').toLowerCase();
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'jpg';
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/webp') return 'webp';
  return null;
};

const stripDataUrlPrefix = (value: string) => {
  const raw = String(value || '').trim();
  const commaIndex = raw.indexOf(',');
  if (raw.startsWith('data:') && commaIndex > -1) {
    return raw.slice(commaIndex + 1);
  }
  return raw;
};

const PHONE_REQUIRED_VALIDATION_ERROR = 'Telefone é obrigatório para responsável e colaborador';
const resolveRoleLabel = (role?: string) => {
  const normalized = String(role || '').trim().toUpperCase();
  if (!normalized) return '';
  if (normalized === 'OWNER') return 'DONO DE REDE';
  return normalized.replace(/_/g, ' ');
};

const hasOwnField = (payload: any, key: string) => Object.prototype.hasOwnProperty.call(payload || {}, key);
const normalizeComparableToken = (value?: string) =>
  String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
const normalizeDigits = (value?: string) => String(value || '').replace(/\D/g, '');
const CLIENT_CREATE_IDEMPOTENCY_TTL_MS = 2 * 60 * 1000;
type ClientCreateIdempotencyRecord = {
  status: 'PENDING' | 'DONE';
  createdAt: number;
  responseBody?: any;
};
const clientCreateIdempotencyStore = new Map<string, ClientCreateIdempotencyRecord>();

const cleanupClientCreateIdempotencyStore = () => {
  const now = Date.now();
  for (const [key, entry] of clientCreateIdempotencyStore.entries()) {
    if ((now - Number(entry?.createdAt || 0)) > CLIENT_CREATE_IDEMPOTENCY_TTL_MS) {
      clientCreateIdempotencyStore.delete(key);
    }
  }
};

const buildClientCreateIdempotencyKey = (req: AuthRequest, payload: any) => {
  const requesterUserId = String((req as any)?.userId || '').trim() || 'anonymous';
  const enterpriseId = String(payload?.enterpriseId || '').trim();
  const explicitRaw = String(req.header('x-idempotency-key') || '').trim();
  if (explicitRaw) {
    return `EXPLICIT:${requesterUserId}:${enterpriseId}:${explicitRaw.slice(0, 160)}`;
  }

  const normalizedPayloadType = String(payload?.type || '').trim().toUpperCase();
  const fingerprintParts = [
    normalizedPayloadType,
    normalizeComparableToken(payload?.name),
    normalizeDigits(payload?.phone || payload?.parentWhatsapp),
    getResponsibleCpf(payload),
    normalizeComparableToken(payload?.email || payload?.parentEmail),
    normalizeComparableToken(payload?.parentName),
    normalizeComparableToken(payload?.class),
    String(payload?.responsibleCollaboratorId || '').trim(),
    String(payload?.responsibleClientId || '').trim(),
  ];

  return `DERIVED:${requesterUserId}:${enterpriseId}:${fingerprintParts.join('|')}`;
};

const findDuplicateStudent = (params: { enterpriseId: string; payload: any; ignoreClientId?: string }) => {
  const enterpriseId = String(params.enterpriseId || '').trim();
  if (!enterpriseId) return null;

  const payload = params.payload || {};
  if (String(payload?.type || '').trim().toUpperCase() !== 'ALUNO') return null;

  const ignoreClientId = String(params.ignoreClientId || '').trim();
  const candidateName = normalizeComparableToken(payload?.name);
  const candidatePhone = normalizeDigits(payload?.phone);
  const candidateCpf = getResponsibleCpf(payload);
  const candidateRegistrationId = normalizeComparableToken(payload?.registrationId);
  const candidateId = String(payload?.id || '').trim();

  if (!candidateName && !candidatePhone && !candidateCpf && !candidateRegistrationId && !candidateId) {
    return null;
  }

  const students = db.getClients(enterpriseId).filter((item: any) => String(item?.type || '').trim().toUpperCase() === 'ALUNO');
  for (const student of students) {
    const reason = detectStudentDuplicateReason({
      candidate: payload,
      existing: student,
      ignoreClientId,
    });

    if (reason) {
      const fieldByReason: Record<string, string> = {
        'ID interno': 'id',
        'Matrícula/ID': 'registrationId',
        CPF: 'cpf',
        Telefone: 'phone',
        'Nome completo': 'name',
      };
      return { reason, field: fieldByReason[reason] || 'unknown', existing: student };
    }
  }

  return null;
};

const hasActiveAiTemporaryPatchForPhoneValidation = () => {
  const tickets = db.getErrorTickets({ status: 'OPEN' });
  return tickets.some((ticket: any) => {
    const patchActive = Boolean(ticket?.aiPatch?.active);
    if (!patchActive) return false;
    const patchLabel = String(ticket?.aiPatch?.label || '').trim().toUpperCase();
    const looksLikeTemporaryAiPatch = patchLabel.includes('PATCH TEMPORÁRIO IA') || patchLabel.includes('PATCH TEMPORARIO IA');
    if (!looksLikeTemporaryAiPatch) return false;
    const message = String(ticket?.message || '').trim();
    const details = String(ticket?.details || '').trim();
    return message.includes(PHONE_REQUIRED_VALIDATION_ERROR) || details.includes(PHONE_REQUIRED_VALIDATION_ERROR);
  });
};

// Apply auth middleware to all client routes
router.use(authMiddleware);

// Get all clients
router.get('/', async (req: AuthRequest, res: Response) => {
  console.log('📋 [CLIENTS] GET /clients - User:', (req as any).userId);
  
  const { enterpriseId, primaryOnly, unitType } = req.query;
  
  const normalizedEnterpriseId = typeof enterpriseId === 'string' ? enterpriseId.trim() : '';
  const canAccessAll = canAccessAllEnterprises(req.userRole);
  if (!normalizedEnterpriseId && !canAccessAll) {
    console.log('❌ [CLIENTS] Invalid or missing enterpriseId');
    return res.status(400).json({ error: 'Enterprise ID é obrigatório' });
  }
  if (normalizedEnterpriseId && !requesterCanAccessEnterprise(req, normalizedEnterpriseId)) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }

  try {
    if (normalizedEnterpriseId) {
      await processOverduePlanConsumptions({ enterpriseId: normalizedEnterpriseId });
    }
    const isPrimaryOnly = String(primaryOnly || '').toLowerCase() === 'true' || String(primaryOnly || '') === '1';
    const normalizedUnitType = String(unitType || '').trim();
    let clients = normalizedEnterpriseId
      ? db.getClients(normalizedEnterpriseId, { primaryOnly: isPrimaryOnly, unitType: normalizedUnitType })
      : db.getClients(undefined, { primaryOnly: isPrimaryOnly, unitType: normalizedUnitType });

    const normalizedRole = String(req.userRole || '').trim().toUpperCase();
    if (normalizedRole === 'RESPONSAVEL') {
      const requester = req.userId ? db.getUser(String(req.userId || '').trim()) : null;
      const accessibleClientIds = Array.isArray((requester as any)?.accessibleClientIds)
        ? (requester as any).accessibleClientIds.map((id: unknown) => String(id || '').trim()).filter(Boolean)
        : [];
      const linkedClientId = String((requester as any)?.linkedClientId || '').trim();
      const idSet = new Set<string>([...accessibleClientIds, linkedClientId].filter(Boolean));
      clients = clients.filter((client: any) => idSet.has(String(client?.id || '').trim()));
    }

    console.log('✅ [CLIENTS] Retrieved', clients.length, 'clients');
    res.json(clients);
  } catch (error) {
    console.log('❌ [CLIENTS] Error fetching clients:', (error as Error).message);
    res.status(500).json({ error: 'Erro ao buscar clientes' });
  }
});

// Restore clients snapshot (responsáveis/clientes + alunos relacionados)
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
    const restored = db.restoreClientsSnapshot(normalizedEnterpriseId, items);
    return res.json({
      message: 'Backup de clientes/restaurado com sucesso.',
      count: restored.length,
      items: restored,
    });
  } catch (error) {
    console.error('❌ [CLIENTS] Error restoring snapshot:', (error as Error).message);
    return res.status(500).json({ error: 'Erro ao restaurar backup de clientes' });
  }
});

// Upload de foto do cliente/usuário
router.post('/upload-photo', async (req: Request, res: Response) => {
  try {
    const { mimeType, dataBase64 } = req.body || {};
    if (!dataBase64 || typeof dataBase64 !== 'string') {
      return res.status(400).json({ error: 'Arquivo inválido para upload.' });
    }

    const ext = extensionFromMime(mimeType);
    if (!ext) {
      return res.status(400).json({ error: 'Formato de imagem não suportado. Use JPG, PNG ou WEBP.' });
    }

    const normalizedBase64 = stripDataUrlPrefix(dataBase64);
    const fileBuffer = Buffer.from(normalizedBase64, 'base64');
    if (!fileBuffer.length) {
      return res.status(400).json({ error: 'Conteúdo da imagem está vazio.' });
    }
    if (fileBuffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'A imagem deve ter no máximo 5MB.' });
    }

    const dataUrl = `data:${String(mimeType).toLowerCase()};base64,${normalizedBase64}`;

    return res.json({
      success: true,
      photoUrl: dataUrl,
      photoBase64: normalizedBase64,
      storage: 'base64'
    });
  } catch (error) {
    console.error('❌ [CLIENTS] Error uploading client photo:', (error as Error).message);
    return res.status(500).json({ error: 'Erro ao salvar foto do cliente' });
  }
});

// Get client by ID
router.get('/:id', async (req: AuthRequest, res: Response) => {
  console.log('🔍 [CLIENTS] GET /clients/:id -', req.params.id);

  try {
    const existingClient = db.getClient(req.params.id);
    if (existingClient?.enterpriseId && !requesterCanAccessEnterprise(req, String(existingClient.enterpriseId || '').trim())) {
      return res.status(403).json({ error: 'Acesso negado para esta empresa' });
    }
    if (existingClient?.enterpriseId) {
      await processOverduePlanConsumptions({ enterpriseId: String(existingClient.enterpriseId || '').trim() });
    }

    const client = db.getClient(req.params.id);
    if (!client) {
      console.log('❌ [CLIENTS] Client not found:', req.params.id);
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }
    
    console.log('✅ [CLIENTS] Client found:', client.name);
    res.json(client);
  } catch (error) {
    console.error('❌ [CLIENTS] Error fetching client by id:', (error as Error).message);
    res.status(500).json({ error: 'Erro ao buscar cliente' });
  }
});

// Create client
router.post('/', (req: AuthRequest, res: Response) => {
  console.log('[CLIENTS] POST /clients - User:', (req as any).userId);
  console.log('[CLIENTS] Request body:', req.body);
  
  // Validate input
  const validation = validateClient(req.body);
  if (!validation.valid) {
    console.log('[CLIENTS] Validation errors:', validation.errors);
    return res.status(400).json({ error: 'Validacao falhou', details: validation.errors });
  }
  const enterpriseId = String(req.body?.enterpriseId || '').trim();
  if (!enterpriseId) {
    return res.status(400).json({ error: 'enterpriseId e obrigatorio' });
  }
  if (!requesterCanAccessEnterprise(req, enterpriseId)) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }

  const idempotencyKey = buildClientCreateIdempotencyKey(req, req.body || {});

  try {
    cleanupClientCreateIdempotencyStore();
    const existingIdempotencyEntry = clientCreateIdempotencyStore.get(idempotencyKey);
    if (existingIdempotencyEntry?.status === 'DONE' && existingIdempotencyEntry.responseBody) {
      return res.status(200).json(existingIdempotencyEntry.responseBody);
    }
    if (existingIdempotencyEntry?.status === 'PENDING') {
      return res.status(409).json({
        error: 'Cadastro ja esta em processamento para esta mesma solicitacao. Aguarde alguns segundos.',
      });
    }

    clientCreateIdempotencyStore.set(idempotencyKey, {
      status: 'PENDING',
      createdAt: Date.now(),
    });

    const createPayload = { ...(req.body || {}) };
    if (String(createPayload?.type || '').trim().toUpperCase() === 'ALUNO') {
      const unitStudents = db.getClients(enterpriseId).filter((item: any) => String(item?.type || '').trim().toUpperCase() === 'ALUNO');
      createPayload.registrationId = resolveUniqueStudentRegistrationId({
        candidate: createPayload,
        students: unitStudents,
      });
    }

    const duplicate = findDuplicateStudent({ enterpriseId, payload: createPayload });
    if (duplicate) {
      clientCreateIdempotencyStore.delete(idempotencyKey);
      return res.status(409).json({
        error: `Aluno duplicado detectado por ${duplicate.reason}.`,
        details: [
          `Ja existe um aluno com ${duplicate.reason.toLowerCase()} igual nesta unidade.`,
          `Aluno existente: ${String(duplicate.existing?.name || 'Nao informado').trim()} (${String(duplicate.existing?.registrationId || '-').trim()})`,
        ],
      });
    }

    const newClient = db.createClient(createPayload);
    // Auto-generate portal access link for RESPONSAVEL and COLABORADOR clients
    const newClientType = String(newClient?.type || '').trim().toUpperCase();
    if (newClientType === 'RESPONSAVEL' || newClientType === 'COLABORADOR') {
      try {
        db.ensurePortalAccessForClientId(String(newClient.id || '').trim(), { regenerateToken: false });
      } catch (_e) {
        // Non-fatal: portal link generation is best-effort
      }
    }

    clientCreateIdempotencyStore.set(idempotencyKey, {
      status: 'DONE',
      createdAt: Date.now(),
      responseBody: newClient,
    });
    console.log('[CLIENTS] Client created successfully:', newClient.id);
    return res.status(201).json(newClient);
  } catch (error) {
    clientCreateIdempotencyStore.delete(idempotencyKey);
    console.error('[CLIENTS] Error creating client:', (error as Error).message);
    return res.status(500).json({ error: 'Erro ao criar cliente' });
  }
});
// Update client
router.put('/:id', (req: AuthRequest, res: Response) => {
  console.log('✏️ [CLIENTS] PUT /clients/:id -', req.params.id);
  const current = db.getClient(req.params.id);
  if (!current) {
    console.log('❌ [CLIENTS] Client not found for update:', req.params.id);
    return res.status(404).json({ error: 'Cliente não encontrado' });
  }
  if (!requesterCanAccessEnterprise(req, String((current as any)?.enterpriseId || '').trim())) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }
  
  // Validate input
  const validation = validateClientUpdate(req.body);
  if (!validation.valid) {
    console.log('❌ [CLIENTS] Validation errors:', validation.errors);
    return res.status(400).json({ error: 'Validação falhou', details: validation.errors });
  }
  const mergedValidation = validateClient({ ...current, ...req.body });
  if (!mergedValidation.valid) {
    const patchAllowsBypass = hasActiveAiTemporaryPatchForPhoneValidation();
    const filteredErrors = patchAllowsBypass
      ? mergedValidation.errors.filter((error) => error !== PHONE_REQUIRED_VALIDATION_ERROR)
      : mergedValidation.errors;

    if (filteredErrors.length > 0) {
      console.log('❌ [CLIENTS] Validation errors (merged):', filteredErrors);
      return res.status(400).json({ error: 'Validação falhou', details: filteredErrors });
    }

    console.log('⚠️ [CLIENTS] Validação de telefone ignorada por patch temporário IA ativo.');
  }

  try {
    const payload = req.body || {};
    const nextEnterpriseId = String(payload?.enterpriseId || (current as any)?.enterpriseId || '').trim();
    if (nextEnterpriseId && !requesterCanAccessEnterprise(req, nextEnterpriseId)) {
      return res.status(403).json({ error: 'Acesso negado para esta empresa' });
    }
    const expectedUpdatedAt = String(payload?.expectedUpdatedAt || '').trim();
    const currentUpdatedAt = String((current as any)?.updatedAt || '').trim();
    if (expectedUpdatedAt && currentUpdatedAt && expectedUpdatedAt !== currentUpdatedAt) {
      return res.status(409).json({
        error: 'Conflito de atualização: este cliente foi alterado por outra operação. Atualize a tela e tente novamente.',
        details: [
          `Versão esperada: ${expectedUpdatedAt}`,
          `Versão atual: ${currentUpdatedAt}`,
        ],
      });
    }
    const currentBalance = Number(current?.balance || 0);
    const hasBalanceField = hasOwnField(payload, 'balance');
    const requestedBalance = Number(payload?.balance);
    const balanceChanged = hasBalanceField
      && Number.isFinite(requestedBalance)
      && Number(requestedBalance.toFixed(2)) !== Number(currentBalance.toFixed(2));
    const balanceAdjustmentPayload = payload?.balanceAdjustment && typeof payload.balanceAdjustment === 'object'
      ? payload.balanceAdjustment
      : null;
    const adjustmentSource = String(balanceAdjustmentPayload?.source || '').trim().toUpperCase();
    const adjustmentReason = String(balanceAdjustmentPayload?.reason || '').trim();

    if (balanceChanged && !balanceAdjustmentPayload) {
      return res.status(400).json({
        error: 'Alteração de saldo exige balanceAdjustment com motivo e origem.',
      });
    }

    if (balanceAdjustmentPayload && adjustmentReason.length < 3) {
      return res.status(400).json({
        error: 'Motivo do ajuste de saldo é obrigatório (mínimo de 3 caracteres).',
      });
    }

    const updatePayload = { ...payload };
    delete (updatePayload as any).balanceAdjustment;
    delete (updatePayload as any).expectedUpdatedAt;
    const shouldCheckDuplicate = shouldCheckDuplicateStudentOnUpdate(current, updatePayload);
    if (shouldCheckDuplicate) {
      const duplicate = findDuplicateStudent({
        enterpriseId: nextEnterpriseId || String((current as any)?.enterpriseId || '').trim(),
        payload: { ...current, ...updatePayload },
        ignoreClientId: String(current?.id || '').trim(),
      });
      if (duplicate) {
        return res.status(409).json({
          error: `Aluno duplicado detectado por ${duplicate.reason}.`,
          details: [
            `Já existe um aluno com ${duplicate.reason.toLowerCase()} igual nesta unidade.`,
            `Aluno existente: ${String(duplicate.existing?.name || 'Não informado').trim()} (${String(duplicate.existing?.registrationId || '-').trim()})`,
          ],
        });
      }
    }

    const updated = db.updateClient(req.params.id, updatePayload);
    if (!updated) return res.status(404).json({ error: 'Cliente não encontrado' });

    const shouldCreateManualAdjustmentAudit = new Set(['CLIENTS_PAGE_DETAIL', 'CADASTRO_CLIENTE', 'MANUAL_AJUSTE']).has(adjustmentSource);

    if (balanceChanged && balanceAdjustmentPayload && shouldCreateManualAdjustmentAudit) {
      const requesterUserId = String((req as any).userId || '').trim();
      const requesterUser = requesterUserId ? db.getUser(requesterUserId) : null;
      const requesterName = String(
        requesterUser?.name
        || requesterUser?.fullName
        || requesterUser?.username
        || requesterUser?.email
        || requesterUserId
        || ''
      ).trim();
      const requesterRole = String((req as any).userRole || '').trim().toUpperCase();
      const requesterRoleLabel = resolveRoleLabel(requesterRole);
      const balanceAfter = Number((Number(updated?.balance || 0)).toFixed(2));
      const adjustmentAmount = Number((balanceAfter - Number(currentBalance || 0)).toFixed(2));

      db.createTransaction({
        clientId: String(updated.id || '').trim(),
        clientName: String(updated.name || '').trim(),
        enterpriseId: String(updated.enterpriseId || '').trim(),
        type: 'AJUSTE_SALDO',
        amount: adjustmentAmount,
        total: adjustmentAmount,
        plan: 'PREPAGO',
        paymentMethod: 'AJUSTE',
        method: 'AJUSTE',
        status: 'CONCLUIDA',
        description: `Ajuste manual de saldo (${adjustmentAmount >= 0 ? 'crédito' : 'débito'})`,
        item: `Motivo: ${adjustmentReason}`,
        adjustmentReason,
        adjustmentSource: String(balanceAdjustmentPayload?.source || 'CADASTRO_CLIENTE').trim() || 'CADASTRO_CLIENTE',
        balanceBefore: Number(currentBalance.toFixed(2)),
        balanceAfter,
        createdByUserId: requesterUserId,
        createdByName: requesterName,
        createdByRole: requesterRole,
        createdByRoleLabel: requesterRoleLabel,
        sessionUserName: requesterName,
        sessionUserRole: requesterRole,
        sessionUserRoleLabel: requesterRoleLabel,
      });
    }
    
    console.log('✅ [CLIENTS] Client updated:', req.params.id);
    res.json(updated);
  } catch (error) {
    console.error('❌ [CLIENTS] Error updating client:', (error as Error).message);
    res.status(500).json({ error: 'Erro ao atualizar cliente' });
  }
});

// Delete client
router.delete('/:id', (req: AuthRequest, res: Response) => {
  console.log('🗑️ [CLIENTS] DELETE /clients/:id -', req.params.id);
  
  try {
    const current = db.getClient(req.params.id);
    if (!current) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }
    if (!requesterCanAccessEnterprise(req, String((current as any)?.enterpriseId || '').trim())) {
      return res.status(403).json({ error: 'Acesso negado para esta empresa' });
    }
    const deleted = db.deleteClient(req.params.id);
    if (!deleted) {
      console.log('❌ [CLIENTS] Client not found for deletion:', req.params.id);
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }
    
    console.log('✅ [CLIENTS] Client deleted:', req.params.id);
    res.json({ message: 'Cliente deletado com sucesso' });
  } catch (error) {
    console.error('❌ [CLIENTS] Error deleting client:', (error as Error).message);
    res.status(500).json({ error: 'Erro ao deletar cliente' });
  }
});

export default router;

