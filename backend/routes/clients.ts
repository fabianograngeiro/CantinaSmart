import { Router, Response } from 'express';
import { db } from '../database.js';
import { validateClient, validateClientUpdate } from '../utils/validation.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { requesterCanAccessEnterprise } from '../utils/enterpriseAccess.js';

const PHONE_REQUIRED_VALIDATION_ERROR = 'Telefone é obrigatório para responsável e colaborador';

const router = Router();

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

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
    return message.includes('Telefone é obrigatório para responsável e colaborador')
      || details.includes('Telefone é obrigatório para responsável e colaborador');
  });
};

// Apply auth middleware to all client routes
router.use(authMiddleware);

// Get all clients
router.get('/', (req: AuthRequest, res: Response) => {
  console.log('📋 [CLIENTS] GET /clients - User:', (req as any).userId);
  
  const { enterpriseId } = req.query;
  
  if (!enterpriseId || typeof enterpriseId !== 'string') {
    console.log('❌ [CLIENTS] Invalid or missing enterpriseId');
    return res.status(400).json({ error: 'Enterprise ID é obrigatório' });
  }

  if (!requesterCanAccessEnterprise(req, enterpriseId)) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }

  try {
    const clients = db.getClients(enterpriseId);
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

// Upload de foto do cliente/usuário — armazenado como Data URI no banco de dados
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
      photoUrl: dataUri,
    });
  } catch (error) {
    console.error('❌ [CLIENTS] Error uploading client photo:', (error as Error).message);
    return res.status(500).json({ error: 'Erro ao processar foto do cliente' });
  }
});

// Get client by ID
router.get('/:id', (req: AuthRequest, res: Response) => {
  console.log('🔍 [CLIENTS] GET /clients/:id -', req.params.id);
  
  const client = db.getClient(req.params.id);
  if (!client) {
    console.log('❌ [CLIENTS] Client not found:', req.params.id);
    return res.status(404).json({ error: 'Cliente não encontrado' });
  }

  if (!requesterCanAccessEnterprise(req, String((client as any)?.enterpriseId || ''))) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }
  
  console.log('✅ [CLIENTS] Client found:', client.name);
  res.json(client);
});

// Create client
router.post('/', (req: AuthRequest, res: Response) => {
  console.log('➕ [CLIENTS] POST /clients - User:', (req as any).userId);
  console.log('📝 [CLIENTS] Request body:', req.body);
  
  // Validate input
  const validation = validateClient(req.body);
  if (!validation.valid) {
    console.log('❌ [CLIENTS] Validation errors:', validation.errors);
    return res.status(400).json({ error: 'Validação falhou', details: validation.errors });
  }

  if (!requesterCanAccessEnterprise(req, String(req.body?.enterpriseId || ''))) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }

  try {
    const newClient = db.createClient(req.body);
    console.log('✅ [CLIENTS] Client created successfully:', newClient.id);
    res.status(201).json(newClient);
  } catch (error) {
    console.error('❌ [CLIENTS] Error creating client:', (error as Error).message);
    res.status(500).json({ error: 'Erro ao criar cliente' });
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

  if (!requesterCanAccessEnterprise(req, String((current as any)?.enterpriseId || ''))) {
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
    const updated = db.updateClient(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Cliente não encontrado' });
    
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
    if (!requesterCanAccessEnterprise(req, String((current as any)?.enterpriseId || ''))) {
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
