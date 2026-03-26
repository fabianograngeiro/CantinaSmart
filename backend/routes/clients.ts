import { Router, Request, Response } from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { db } from '../database';
import { validateClient, validateClientUpdate } from '../utils/validation';
import { authMiddleware } from '../middleware/auth';

const PHONE_REQUIRED_VALIDATION_ERROR = 'Telefone é obrigatório para responsável e colaborador';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_PHOTOS_DIR = path.resolve(__dirname, '../clients_photos');

const ensureClientPhotosDir = async () => {
  await fs.mkdir(CLIENT_PHOTOS_DIR, { recursive: true });
};

const sanitizeFileName = (name: string) => {
  return String(name || 'cliente')
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
router.get('/', (req: Request, res: Response) => {
  console.log('📋 [CLIENTS] GET /clients - User:', (req as any).userId);
  
  const { enterpriseId } = req.query;
  
  if (!enterpriseId || typeof enterpriseId !== 'string') {
    console.log('❌ [CLIENTS] Invalid or missing enterpriseId');
    return res.status(400).json({ error: 'Enterprise ID é obrigatório' });
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
router.post('/restore', (req: Request, res: Response) => {
  const { enterpriseId } = req.body || {};
  const normalizedEnterpriseId = String(enterpriseId || '').trim();
  const items = Array.isArray(req.body)
    ? req.body
    : (Array.isArray(req.body?.items) ? req.body.items : null);

  if (!normalizedEnterpriseId) {
    return res.status(400).json({ error: 'enterpriseId é obrigatório para restauração.' });
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
    const { fileName, mimeType, dataBase64 } = req.body || {};
    if (!dataBase64 || typeof dataBase64 !== 'string') {
      return res.status(400).json({ error: 'Arquivo inválido para upload.' });
    }

    const ext = extensionFromMime(mimeType);
    if (!ext) {
      return res.status(400).json({ error: 'Formato de imagem não suportado. Use JPG, PNG ou WEBP.' });
    }

    const safeName = sanitizeFileName(fileName || 'cliente');
    const baseName = safeName.replace(/\.[^.]+$/, '') || 'cliente';
    const finalFileName = `${baseName}_${Date.now()}.${ext}`;
    const filePath = path.join(CLIENT_PHOTOS_DIR, finalFileName);

    const fileBuffer = Buffer.from(dataBase64, 'base64');
    if (!fileBuffer.length) {
      return res.status(400).json({ error: 'Conteúdo da imagem está vazio.' });
    }

    await ensureClientPhotosDir();
    await fs.writeFile(filePath, fileBuffer);

    return res.json({
      success: true,
      photoUrl: `/clients_photos/${finalFileName}`
    });
  } catch (error) {
    console.error('❌ [CLIENTS] Error uploading client photo:', (error as Error).message);
    return res.status(500).json({ error: 'Erro ao salvar foto do cliente' });
  }
});

// Get client by ID
router.get('/:id', (req: Request, res: Response) => {
  console.log('🔍 [CLIENTS] GET /clients/:id -', req.params.id);
  
  const client = db.getClient(req.params.id);
  if (!client) {
    console.log('❌ [CLIENTS] Client not found:', req.params.id);
    return res.status(404).json({ error: 'Cliente não encontrado' });
  }
  
  console.log('✅ [CLIENTS] Client found:', client.name);
  res.json(client);
});

// Create client
router.post('/', (req: Request, res: Response) => {
  console.log('➕ [CLIENTS] POST /clients - User:', (req as any).userId);
  console.log('📝 [CLIENTS] Request body:', req.body);
  
  // Validate input
  const validation = validateClient(req.body);
  if (!validation.valid) {
    console.log('❌ [CLIENTS] Validation errors:', validation.errors);
    return res.status(400).json({ error: 'Validação falhou', details: validation.errors });
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
router.put('/:id', (req: Request, res: Response) => {
  console.log('✏️ [CLIENTS] PUT /clients/:id -', req.params.id);
  const current = db.getClient(req.params.id);
  if (!current) {
    console.log('❌ [CLIENTS] Client not found for update:', req.params.id);
    return res.status(404).json({ error: 'Cliente não encontrado' });
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
router.delete('/:id', (req: Request, res: Response) => {
  console.log('🗑️ [CLIENTS] DELETE /clients/:id -', req.params.id);
  
  try {
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
