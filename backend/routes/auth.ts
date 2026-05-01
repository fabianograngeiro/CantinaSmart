import { randomBytes, createHash } from 'crypto';
import { Router, Request, Response } from 'express';
import { db } from '../database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { getResponsibleCpf } from '../utils/clientDocument.js';
import { 
  hashPassword, 
  comparePassword, 
  generateToken, 
  isValidEmail, 
  isStrongPassword 
} from '../utils/security.js';
import { canAccessAllEnterprises, getRequesterEnterpriseIds, hasEnterpriseOverlap, normalizeRole } from '../utils/enterpriseAccess.js';

const router = Router();
const RESET_PASSWORD_TOKEN_TTL_MS = 60 * 60 * 1000;

const normalizeDocument = (value: unknown) => String(value || '').replace(/\D/g, '');
const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const isBcryptHash = (value: unknown) => /^\$2[aby]\$\d{2}\$/.test(String(value || ''));
const startOfToday = () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
};
const isDateOnOrBeforeToday = (value?: string) => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  date.setHours(0, 0, 0, 0);
  return date.getTime() <= startOfToday().getTime();
};

const buildResetTokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const getResetBaseUrl = (req: Request) => {
  const configuredOrigin = String(process.env.APP_PUBLIC_URL || '').trim();
  const requestOrigin = String(req.get('origin') || '').trim();
  const origin = configuredOrigin || requestOrigin || `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
  return `${origin.replace(/\/$/, '')}/#/reset-password`;
};
const buildPortalAccessTokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const getPortalAccessBaseUrl = (req: Request) => {
  const configuredOrigin = String(process.env.APP_PUBLIC_URL || '').trim();
  const requestOrigin = String(req.get('origin') || '').trim();
  const origin = configuredOrigin || requestOrigin || `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
  return `${origin.replace(/\/$/, '')}/#/portal-access`;
};

const sanitizeUser = (user: any) => ({
  ...user,
  password: undefined,
  portalAccessTokenHash: undefined,
});

const findUserByResetToken = (token: string) => {
  const tokenHash = buildResetTokenHash(token);
  const now = Date.now();
  return db.getUsers().find((user: any) => {
    const storedTokenHash = String(user?.resetPasswordTokenHash || '').trim();
    const expiresAt = String(user?.resetPasswordExpiresAt || '').trim();
    if (!storedTokenHash || storedTokenHash !== tokenHash || !expiresAt) return false;
    const expiresAtMs = new Date(expiresAt).getTime();
    if (Number.isNaN(expiresAtMs) || expiresAtMs <= now) return false;
    return true;
  });
};

const findDuplicateUser = (params: { email?: string; document?: string; ignoreUserId?: string }) => {
  const normalizedEmail = String(params.email || '').trim().toLowerCase();
  const normalizedDocument = normalizeDocument(params.document);
  return db.getUsers().find((user: any) => {
    if (params.ignoreUserId && user.id === params.ignoreUserId) return false;
    const sameEmail = normalizedEmail && String(user?.email || '').trim().toLowerCase() === normalizedEmail;
    const sameDocument = normalizedDocument && normalizeDocument(user?.document) === normalizedDocument;
    return Boolean(sameEmail || sameDocument);
  });
};

// Login
router.post('/login', async (req: Request, res: Response) => {
  console.log('\n🔐 [AUTH] Login attempt received');
  console.log('📧 Email:', req.body.email);
  
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password ?? '');

  // Validate email format
  if (!email || !isValidEmail(email)) {
    console.log('❌ [AUTH] Invalid email format:', email);
    return res.status(400).json({ error: 'Email inválido' });
  }

  // Validate password provided
  if (!password) {
    console.log('❌ [AUTH] Password not provided');
    return res.status(400).json({ error: 'Senha é obrigatória' });
  }

  console.log('🔍 [DB] Searching for user by email...');
  const user = db.getUserByEmail(email);
  
  if (!user) {
    console.log('❌ [AUTH] User not found in database');
    return res.status(401).json({ error: 'Email ou senha inválidos' });
  }

  if (user.isActive === false) {
    console.log('⛔ [AUTH] Inactive account login blocked:', user.email);
    return res.status(403).json({ error: 'Conta desativada. Entre em contato com o suporte.' });
  }

  if (isDateOnOrBeforeToday(user.expirationDate)) {
    if (user.isActive !== false) {
      db.updateUser(user.id, { isActive: false });
    }
    console.log('⛔ [AUTH] Expired account login blocked:', user.email, user.expirationDate);
    return res.status(403).json({ error: 'Acesso vencido. Renove a assinatura para voltar a acessar.' });
  }

  console.log('✅ [AUTH] User found:', user.email);
  
  // Compare password with stored hash
  try {
    let passwordMatch = await comparePassword(password, String(user.password || ''));

    if (!passwordMatch && !isBcryptHash(user.password) && password === String(user.password || '')) {
      const migratedHash = await hashPassword(password);
      db.updateUser(user.id, { password: migratedHash });
      passwordMatch = true;
      console.log('🔄 [AUTH] Legacy plaintext password migrated to bcrypt for user:', user.email);
    }
    
    if (!passwordMatch) {
      console.log('❌ [AUTH] Password mismatch!');
      return res.status(401).json({ error: 'Email ou senha inválidos' });
    }

    console.log('✅ [AUTH] Password matched!');
    
    // Generate JWT token
    const token = generateToken(user.id, user.role);
    console.log('🎫 [AUTH] JWT token generated');
    console.log('✅ [AUTH] Login successful for user:', user.email);
    
    res.json({ user: { ...user, password: undefined }, token });
  } catch (error) {
    console.log('❌ [AUTH] Password comparison error:', (error as Error).message);
    return res.status(500).json({ error: 'Erro ao validar credenciais' });
  }
});

// Register
router.post('/register', async (req: Request, res: Response) => {
  console.log('\n➕ [AUTH] Registration attempt received');
  console.log('📧 Email:', req.body.email);
  
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password ?? '');
  const name = String(req.body?.name ?? '');
  const role = req.body?.role || 'USER';

  // Validate email
  if (!email || !isValidEmail(email)) {
    console.log('❌ [AUTH] Invalid email format');
    return res.status(400).json({ error: 'Email inválido' });
  }

  // Validate name
  if (!name || name.trim().length === 0) {
    console.log('❌ [AUTH] Name not provided');
    return res.status(400).json({ error: 'Nome é obrigatório' });
  }

  // Validate password strength
  if (!password || !isStrongPassword(password)) {
    console.log('❌ [AUTH] Password does not meet security requirements');
    return res.status(400).json({ 
      error: 'Senha deve ter pelo menos 8 caracteres, 1 maiúscula, 1 minúscula e 1 número' 
    });
  }

  // Check if user already exists
  const existingUser = db.getUserByEmail(email);
  if (existingUser) {
    console.log('❌ [AUTH] User already exists:', email);
    return res.status(400).json({ error: 'Email já registrado' });
  }

  try {
    // Hash password
    const hashedPassword = await hashPassword(password);
    console.log('🔐 [AUTH] Password hashed successfully');

    // Create user with hashed password
    const newUser = db.createUser({
      email,
      password: hashedPassword,
      name,
      role,
    });

    console.log('✅ [AUTH] User created:', newUser.id);
    
    // Generate JWT token
    const token = generateToken(newUser.id, newUser.role);
    console.log('🎫 [AUTH] JWT token generated');

    res.status(201).json({ 
      user: { ...newUser, password: undefined }, 
      token 
    });
  } catch (error) {
    console.log('❌ [AUTH] Registration error:', (error as Error).message);
    return res.status(500).json({ error: 'Erro ao registrar usuário' });
  }
});

router.get('/reset-password/validate', (req: Request, res: Response) => {
  const token = String(req.query?.token || '').trim();
  if (!token) {
    return res.status(400).json({ error: 'Token de redefinição não informado.' });
  }

  const user = findUserByResetToken(token);
  if (!user) {
    return res.status(400).json({ error: 'Link de redefinição inválido ou expirado.' });
  }

  return res.json({
    valid: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
  });
});

router.post('/reset-password/complete', async (req: Request, res: Response) => {
  const token = String(req.body?.token || '').trim();
  const password = String(req.body?.password ?? '');
  const confirmPassword = String(req.body?.confirmPassword ?? '');

  if (!token) {
    return res.status(400).json({ error: 'Token de redefinição não informado.' });
  }

  if (!password || !confirmPassword) {
    return res.status(400).json({ error: 'Informe e confirme a nova senha.' });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'As senhas informadas não coincidem.' });
  }

  if (!isStrongPassword(password)) {
    return res.status(400).json({
      error: 'Senha deve ter pelo menos 8 caracteres, 1 maiúscula, 1 minúscula e 1 número',
    });
  }

  const user = findUserByResetToken(token);
  if (!user) {
    return res.status(400).json({ error: 'Link de redefinição inválido ou expirado.' });
  }

  try {
    const passwordHash = await hashPassword(password);
    const updatedUser = db.updateUser(user.id, {
      password: passwordHash,
      resetPasswordTokenHash: '',
      resetPasswordExpiresAt: '',
      resetPasswordRequestedAt: '',
      resetPasswordRequestedBy: '',
    });

    if (!updatedUser) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    return res.json({ message: 'Senha redefinida com sucesso.', user: sanitizeUser(updatedUser) });
  } catch {
    return res.status(500).json({ error: 'Erro ao redefinir a senha.' });
  }
});

router.post('/portal/access', (req: Request, res: Response) => {
  const rawToken = String(req.body?.token || '').trim();
  if (!rawToken) {
    return res.status(400).json({ error: 'Token de acesso não informado.' });
  }

  const tokenHash = buildPortalAccessTokenHash(rawToken);
  const user = db.getUsers().find((entry: any) => {
    return String(entry?.portalAccessTokenHash || '').trim() === tokenHash && entry?.portalAccessEnabled !== false;
  });

  if (!user) {
    return res.status(401).json({ error: 'Token de acesso inválido.' });
  }

  if (user.isActive === false) {
    return res.status(403).json({ error: 'Conta desativada. Entre em contato com o suporte.' });
  }

  if (isDateOnOrBeforeToday(user.expirationDate)) {
    if (user.isActive !== false) {
      db.updateUser(user.id, { isActive: false });
    }
    return res.status(403).json({ error: 'Acesso vencido. Renove a assinatura para voltar a acessar.' });
  }

  const token = generateToken(user.id, user.role);
  db.updateUser(user.id, {
    portalAccessTokenLastUsedAt: new Date().toISOString(),
  });

  return res.json({
    token,
    user: sanitizeUser(user),
  });
});

// Get all users
router.use(authMiddleware);

router.post('/:id/reset-password-link', (req: AuthRequest, res: Response) => {
  if (normalizeRole(req.userRole) !== 'SUPERADMIN') {
    return res.status(403).json({ error: 'Apenas SUPERADMIN pode gerar links de redefinição.' });
  }

  const targetUser = db.getUser(req.params.id);
  if (!targetUser) {
    return res.status(404).json({ error: 'Usuário não encontrado' });
  }

  const targetRole = normalizeRole(String(targetUser.role || ''));
  if (targetRole === 'SUPERADMIN') {
    return res.status(400).json({ error: 'Não é permitido gerar reset por link para outro SUPERADMIN.' });
  }

  const rawToken = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + RESET_PASSWORD_TOKEN_TTL_MS).toISOString();
  const updatedUser = db.updateUser(targetUser.id, {
    resetPasswordTokenHash: buildResetTokenHash(rawToken),
    resetPasswordExpiresAt: expiresAt,
    resetPasswordRequestedAt: new Date().toISOString(),
    resetPasswordRequestedBy: String(req.userId || '').trim(),
  });

  if (!updatedUser) {
    return res.status(404).json({ error: 'Usuário não encontrado' });
  }

  const resetLink = `${getResetBaseUrl(req)}?token=${encodeURIComponent(rawToken)}`;
  return res.json({
    resetLink,
    expiresAt,
    user: {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
    },
  });
});

router.post('/:id/portal-link', (req: AuthRequest, res: Response) => {
  const requesterRole = normalizeRole(req.userRole);
  if (!['SUPERADMIN', 'ADMIN_SISTEMA', 'OWNER', 'ADMIN'].includes(requesterRole)) {
    return res.status(403).json({ error: 'Sem permissão para gerar link fixo de portal.' });
  }

  const targetId = String(req.params.id || '').trim();
  let targetUser = db.getUser(targetId);
  let rawToken = '';

  if (!targetUser) {
    const ensuredFromClient = db.ensurePortalAccessForClientId(targetId, { regenerateToken: true });
    if (!ensuredFromClient?.user) {
      return res.status(404).json({ error: 'Usuário/cliente não encontrado para gerar link.' });
    }
    targetUser = ensuredFromClient.user;
    rawToken = String(ensuredFromClient.rawToken || '').trim();
  }

  const targetRole = normalizeRole(String(targetUser.role || ''));
  if (!['RESPONSAVEL', 'COLABORADOR', 'CLIENTE'].includes(targetRole)) {
    return res.status(400).json({ error: 'Link fixo disponível apenas para usuários de portal.' });
  }

  let updated = targetUser;
  if (!rawToken) {
    // Reuse existing raw token if stored (avoids breaking links already shared)
    const existingRaw = String(targetUser.portalAccessTokenRaw || '').trim();
    if (existingRaw && String(targetUser.portalAccessTokenHash || '').trim()) {
      rawToken = existingRaw;
    } else {
      rawToken = randomBytes(48).toString('hex');
      const tokenHash = buildPortalAccessTokenHash(rawToken);
      updated = db.updateUser(targetUser.id, {
        portalAccessEnabled: true,
        portalAccessTokenHash: tokenHash,
        portalAccessTokenRaw: rawToken,
        portalAccessTokenCreatedAt: new Date().toISOString(),
      }) || targetUser;
    }
  }

  if (!updated) {
    return res.status(404).json({ error: 'Usuário não encontrado' });
  }

  const accessLink = `${getPortalAccessBaseUrl(req)}?t=${encodeURIComponent(rawToken)}`;
  return res.json({
    accessLink,
    user: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
    },
  });
});

router.post('/portal-links/backfill', (req: AuthRequest, res: Response) => {
  const requesterRole = normalizeRole(req.userRole);
  if (!['SUPERADMIN', 'ADMIN_SISTEMA', 'OWNER', 'ADMIN'].includes(requesterRole)) {
    return res.status(403).json({ error: 'Sem permissão para gerar links em lote.' });
  }

  const requestedEnterpriseId = String(req.body?.enterpriseId || '').trim();
  const canAccessAll = canAccessAllEnterprises(req.userRole);
  const allowedEnterpriseIds = getRequesterEnterpriseIds(req);

  if (requestedEnterpriseId && !canAccessAll && !allowedEnterpriseIds.includes(requestedEnterpriseId)) {
    return res.status(403).json({ error: 'Sem permissão para gerar links nesta empresa.' });
  }

  const scopedEnterpriseIds = canAccessAll
    ? (requestedEnterpriseId ? [requestedEnterpriseId] : [])
    : (requestedEnterpriseId ? [requestedEnterpriseId] : allowedEnterpriseIds);

  const allClients = scopedEnterpriseIds.length > 0
    ? scopedEnterpriseIds.flatMap((enterpriseId) => db.getClients(enterpriseId))
    : db.getClients();

  const uniqueClients = new Map<string, any>();
  allClients.forEach((client: any) => {
    const clientId = String(client?.id || '').trim();
    if (!clientId) return;
    if (!uniqueClients.has(clientId)) uniqueClients.set(clientId, client);
  });

  const normalizeDigits = (value: unknown) => String(value || '').replace(/\D/g, '');
  const normalizeToken = (value: unknown) => String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  const directPortalClients = Array.from(uniqueClients.values()).filter((client: any) => {
    const type = normalizeRole(String(client?.type || ''));
    return type === 'RESPONSAVEL' || type === 'COLABORADOR';
  });

  const directByEnterprise = new Map<string, any[]>();
  directPortalClients.forEach((client: any) => {
    const enterpriseId = String(client?.enterpriseId || '').trim();
    if (!enterpriseId) return;
    const bucket = directByEnterprise.get(enterpriseId) || [];
    bucket.push(client);
    directByEnterprise.set(enterpriseId, bucket);
  });

  const materializedClients: any[] = [];

  Array.from(uniqueClients.values()).forEach((student: any) => {
    const type = normalizeRole(String(student?.type || ''));
    if (type !== 'ALUNO') return;

    const enterpriseId = String(student?.enterpriseId || '').trim();
    if (!enterpriseId) return;
    if (scopedEnterpriseIds.length > 0 && !scopedEnterpriseIds.includes(enterpriseId)) return;

    const parentName = String(student?.parentName || student?.guardianName || student?.guardians?.[0] || '').trim();
    const parentPhone = normalizeDigits(student?.parentWhatsapp || student?.guardianPhone || '');
    const parentEmail = normalizeEmail(student?.parentEmail || student?.guardianEmail || '');
    const parentCpf = normalizeDigits(student?.parentCpf || '');

    if (!parentName && !parentPhone) return;

    const candidates = directByEnterprise.get(enterpriseId) || [];
    const parentNameToken = normalizeToken(parentName);
    const found = candidates.find((candidate: any) => {
      const candidatePhone = normalizeDigits(candidate?.phone || candidate?.parentWhatsapp || '');
      const candidateEmail = normalizeEmail(candidate?.email || candidate?.parentEmail || '');
      const candidateCpf = getResponsibleCpf(candidate);
      const candidateNameToken = normalizeToken(candidate?.name);

      if (parentPhone && candidatePhone && parentPhone === candidatePhone) return true;
      if (parentCpf && candidateCpf && parentCpf === candidateCpf) return true;
      if (parentEmail && candidateEmail && parentEmail === candidateEmail && parentNameToken && candidateNameToken === parentNameToken) return true;
      if (!parentPhone && !parentCpf && parentNameToken && candidateNameToken === parentNameToken) return true;
      return false;
    });

    if (found) return;

    const generatedRegistrationId = `RESP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const createdResponsible = db.createClient({
      enterpriseId,
      type: 'RESPONSAVEL',
      registrationId: generatedRegistrationId,
      name: parentName || 'Responsável',
      class: String(student?.parentRelationship || 'PAIS').trim() || 'PAIS',
      servicePlans: ['PREPAGO'],
      selectedPlansConfig: [],
      planCreditBalances: {},
      balance: 0,
      spentToday: 0,
      isBlocked: false,
      restrictions: [],
      parentName: parentName || 'Responsável',
      parentRelationship: String(student?.parentRelationship || 'PAIS').trim() || 'PAIS',
      phone: parentPhone,
      parentWhatsappCountryCode: String(student?.parentWhatsappCountryCode || '55').replace(/\D/g, '') || '55',
      parentWhatsapp: parentPhone,
      email: parentEmail,
      parentEmail,
      cpf: parentCpf,
      parentCpf,
    });

    materializedClients.push(createdResponsible);
    const nextCandidates = directByEnterprise.get(enterpriseId) || [];
    nextCandidates.push(createdResponsible);
    directByEnterprise.set(enterpriseId, nextCandidates);
    uniqueClients.set(String(createdResponsible?.id || '').trim(), createdResponsible);
  });

  const generated: Array<any> = [];
  const skipped: Array<any> = [];

  uniqueClients.forEach((client) => {
    const type = normalizeRole(String(client?.type || ''));
    if (type !== 'RESPONSAVEL' && type !== 'COLABORADOR') {
      skipped.push({
        clientId: String(client?.id || '').trim(),
        name: String(client?.name || '').trim(),
        reason: 'Tipo sem acesso de portal',
      });
      return;
    }

    const ensured = db.ensurePortalAccessForClientId(String(client?.id || '').trim(), { regenerateToken: false });
    // If no raw token stored (created before this fix), regenerate to persist it
    const finalEnsured = (!ensured?.rawToken && ensured?.user)
      ? db.ensurePortalAccessForClientId(String(client?.id || '').trim(), { regenerateToken: true })
      : ensured;
    if (!finalEnsured?.user || !finalEnsured?.rawToken) {
      skipped.push({
        clientId: String(client?.id || '').trim(),
        name: String(client?.name || '').trim(),
        reason: 'Não foi possível gerar link',
      });
      return;
    }

    generated.push({
      clientId: String(client?.id || '').trim(),
      name: String(client?.name || '').trim(),
      type,
      userId: String(finalEnsured.user?.id || '').trim(),
      enterpriseId: String(client?.enterpriseId || '').trim(),
      accessLink: `${getPortalAccessBaseUrl(req)}?t=${encodeURIComponent(String(finalEnsured.rawToken || '').trim())}`,
    });
  });

  return res.json({
    materializedCount: materializedClients.length,
    generatedCount: generated.length,
    skippedCount: skipped.length,
    generated,
    skipped,
  });
});

// GET /auth/portal-links — return existing portal links without regenerating
router.get('/portal-links', (req: AuthRequest, res: Response) => {
  const requesterRole = normalizeRole(req.userRole);
  if (!['SUPERADMIN', 'ADMIN_SISTEMA', 'OWNER', 'ADMIN'].includes(requesterRole)) {
    return res.status(403).json({ error: 'Sem permissão.' });
  }

  const requestedEnterpriseId = String(req.query?.enterpriseId || '').trim();
  const canAccessAll = canAccessAllEnterprises(req.userRole);
  const allowedEnterpriseIds = getRequesterEnterpriseIds(req);

  const portalUsers = db.getUsers().filter((user: any) => {
    const role = normalizeRole(String(user?.role || ''));
    if (!['RESPONSAVEL', 'COLABORADOR', 'CLIENTE'].includes(role)) return false;
    if (!String(user?.portalAccessTokenRaw || '').trim()) return false;
    if (!user?.portalAccessEnabled) return false;

    if (canAccessAll) {
      if (!requestedEnterpriseId) return true;
      const enterpriseIds = Array.isArray(user?.enterpriseIds) ? user.enterpriseIds : [user?.enterpriseId].filter(Boolean);
      return enterpriseIds.includes(requestedEnterpriseId);
    }

    const enterpriseIds = Array.isArray(user?.enterpriseIds) ? user.enterpriseIds : [user?.enterpriseId].filter(Boolean);
    const allowed = requestedEnterpriseId
      ? allowedEnterpriseIds.includes(requestedEnterpriseId) && enterpriseIds.includes(requestedEnterpriseId)
      : enterpriseIds.some((id: string) => allowedEnterpriseIds.includes(id));
    return allowed;
  });

  const baseUrl = getPortalAccessBaseUrl(req);
  const links = portalUsers.map((user: any) => ({
    userId: String(user.id || '').trim(),
    clientId: String(user.linkedClientId || '').trim(),
    name: String(user.name || '').trim(),
    role: String(user.role || '').trim(),
    enterpriseId: String(user.enterpriseId || '').trim(),
    accessLink: `${baseUrl}?t=${encodeURIComponent(String(user.portalAccessTokenRaw || '').trim())}`,
  }));

  return res.json({ links });
});

// Get all users
router.get('/', (req: AuthRequest, res: Response) => {
  console.log('📋 [AUTH] Fetching all users');
  const users = db.getUsers();

  if (canAccessAllEnterprises(req.userRole)) {
    console.log('✅ [AUTH] Returning', users.length, 'users (global access)');
    return res.json(users.map(u => sanitizeUser(u)));
  }

  const requesterId = String(req.userId || '').trim();
  const allowedEnterpriseIds = getRequesterEnterpriseIds(req);
  const scopedUsers = users.filter((user: any) => {
    const userId = String(user?.id || '').trim();
    if (userId === requesterId) return true;

    const role = normalizeRole(String(user?.role || ''));
    if (role === 'SUPERADMIN' || role === 'ADMIN_SISTEMA') return false;
    if (role === 'OWNER') return false;

    return hasEnterpriseOverlap(user?.enterpriseIds, allowedEnterpriseIds);
  });

  console.log('✅ [AUTH] Returning', scopedUsers.length, 'users (scoped access)');
  return res.json(scopedUsers.map((u: any) => sanitizeUser(u)));
});

// Get user by ID
router.get('/:id', (req: AuthRequest, res: Response) => {
  console.log('🔍 [AUTH] Fetching user by ID:', req.params.id);
  const user = db.getUser(req.params.id);
  if (!user) {
    console.log('❌ [AUTH] User not found:', req.params.id);
    return res.status(404).json({ error: 'Usuário não encontrado' });
  }

  if (!canAccessAllEnterprises(req.userRole)) {
    const requesterId = String(req.userId || '').trim();
    const targetUserId = String(user?.id || '').trim();
    const allowedEnterpriseIds = getRequesterEnterpriseIds(req);
    const targetRole = normalizeRole(String(user?.role || ''));

    const canRead = targetUserId === requesterId
      || (targetRole !== 'OWNER' && targetRole !== 'SUPERADMIN' && targetRole !== 'ADMIN_SISTEMA'
        && hasEnterpriseOverlap(user?.enterpriseIds, allowedEnterpriseIds));

    if (!canRead) {
      return res.status(403).json({ error: 'Acesso negado para este usuário' });
    }
  }

  console.log('✅ [AUTH] User found:', user.email);
  res.json(sanitizeUser(user));
});

// Create user (admin only)
router.post('/', async (req: AuthRequest, res: Response) => {
  console.log('➕ [AUTH] Creating new user');
  console.log('📝 User data:', { ...req.body, password: '****' });
  
  const { role = 'USER', ...rest } = req.body;
  const requesterRole = normalizeRole(req.userRole);
  const requestedRole = normalizeRole(role);
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password ?? '');
  const name = String(req.body?.name ?? '');

  if (requestedRole === 'ADMIN_SISTEMA' && requesterRole !== 'SUPERADMIN') {
    return res.status(403).json({ error: 'Somente SUPERADMIN pode criar usuário do sistema.' });
  }

  // Validate inputs
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Email inválido' });
  }

  if (!name || name.trim().length === 0) {
    return res.status(400).json({ error: 'Nome é obrigatório' });
  }

  if (!password || !isStrongPassword(password)) {
    return res.status(400).json({ 
      error: 'Senha deve ter pelo menos 8 caracteres, 1 maiúscula, 1 minúscula e 1 número' 
    });
  }

  const duplicateUser = findDuplicateUser({ email, document: rest?.document });
  if (duplicateUser) {
    if (String(duplicateUser?.email || '').trim().toLowerCase() === String(email).trim().toLowerCase()) {
      return res.status(400).json({ error: 'Já existe uma conta cadastrada com este e-mail.' });
    }
    return res.status(400).json({ error: 'Já existe uma conta cadastrada com este CPF/CNPJ.' });
  }

  if (!canAccessAllEnterprises(req.userRole)) {
    const allowedEnterpriseIds = getRequesterEnterpriseIds(req);
    const requestedEnterpriseIds = Array.isArray(rest?.enterpriseIds)
      ? rest.enterpriseIds.map((id: unknown) => String(id || '').trim()).filter(Boolean)
      : [];

    const disallowedRole = ['SUPERADMIN', 'ADMIN_SISTEMA', 'OWNER'].includes(normalizeRole(role));
    if (disallowedRole) {
      return res.status(403).json({ error: 'Sem permissão para criar usuário com este perfil.' });
    }

    if (requesterRole === 'OWNER') {
      const allInsideScope = requestedEnterpriseIds.every((id: string) => allowedEnterpriseIds.includes(id));
      if (!allInsideScope) {
        return res.status(403).json({ error: 'Sem permissão para vincular usuário a esta empresa.' });
      }
    }
  }

  try {
    const hashedPassword = await hashPassword(password);
    const newUser = db.createUser({ email, password: hashedPassword, name, role, ...rest });
    console.log('✅ [AUTH] User created:', newUser.id);
    res.status(201).json(sanitizeUser(newUser));
  } catch (error) {
    console.log('❌ [AUTH] Error creating user:', (error as Error).message);
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

// Update user
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const { password, ...updateData } = req.body;
  const normalizedUpdateData = {
    ...updateData,
    ...(updateData?.email ? { email: normalizeEmail(updateData.email) } : {}),
  } as any;
  const existingUser = db.getUser(req.params.id);
  if (!existingUser) {
    return res.status(404).json({ error: 'Usuário não encontrado' });
  }

  const requesterRole = normalizeRole(req.userRole);
  const requesterId = String(req.userId || '').trim();
  const targetUserRole = normalizeRole(String(existingUser?.role || ''));
  const targetUserId = String(existingUser?.id || '').trim();

  if (targetUserRole === 'SUPERADMIN' && !(requesterRole === 'SUPERADMIN' && requesterId === targetUserId)) {
    return res.status(403).json({ error: 'Conta SUPERADMIN não pode ser editada por este usuário.' });
  }

  if (normalizeRole(normalizedUpdateData?.role) === 'SUPERADMIN' && requesterRole !== 'SUPERADMIN') {
    return res.status(403).json({ error: 'Somente SUPERADMIN pode definir este perfil.' });
  }

  if (normalizeRole(normalizedUpdateData?.role) === 'ADMIN_SISTEMA' && requesterRole !== 'SUPERADMIN') {
    return res.status(403).json({ error: 'Somente SUPERADMIN pode definir usuário do sistema.' });
  }

  if (!canAccessAllEnterprises(req.userRole)) {
    const allowedEnterpriseIds = getRequesterEnterpriseIds(req);

    const canEditSelf = targetUserId === requesterId;
    const canEditScopedUser = targetUserRole !== 'OWNER'
      && targetUserRole !== 'SUPERADMIN'
      && targetUserRole !== 'ADMIN_SISTEMA'
      && hasEnterpriseOverlap(existingUser?.enterpriseIds, allowedEnterpriseIds);

    if (!canEditSelf && !canEditScopedUser) {
      return res.status(403).json({ error: 'Acesso negado para atualizar este usuário' });
    }

    if (requesterRole === 'OWNER' && Array.isArray(normalizedUpdateData?.enterpriseIds)) {
      const nextEnterpriseIds = normalizedUpdateData.enterpriseIds
        .map((id: unknown) => String(id || '').trim())
        .filter(Boolean);
      const allInsideScope = nextEnterpriseIds.every((id: string) => allowedEnterpriseIds.includes(id));
      if (!allInsideScope) {
        return res.status(403).json({ error: 'Sem permissão para vincular usuário a esta empresa.' });
      }
    }
  }

  const duplicateUser = findDuplicateUser({
    email: normalizedUpdateData?.email,
    document: normalizedUpdateData?.document,
    ignoreUserId: req.params.id,
  });
  if (duplicateUser) {
    if (String(duplicateUser?.email || '').trim().toLowerCase() === String(normalizedUpdateData?.email || '').trim().toLowerCase()) {
      return res.status(400).json({ error: 'Já existe uma conta cadastrada com este e-mail.' });
    }
    return res.status(400).json({ error: 'Já existe uma conta cadastrada com este CPF/CNPJ.' });
  }
  

  if (normalizedUpdateData?.isActive === true) {
    const nextExpirationDate = String(normalizedUpdateData?.expirationDate || existingUser?.expirationDate || '').trim();
    if (isDateOnOrBeforeToday(nextExpirationDate)) {
      return res.status(400).json({
        error: 'Não é possível ativar conta vencida. Renove para uma data futura para reativar.',
      });
    }
  }
  // If password is being updated, validate and hash it
  if (password) {
    if (!isStrongPassword(password)) {
      return res.status(400).json({ 
        error: 'Senha deve ter pelo menos 8 caracteres, 1 maiúscula, 1 minúscula e 1 número' 
      });
    }
    
    try {
      normalizedUpdateData.password = await hashPassword(password);
    } catch (error) {
      console.log('❌ [AUTH] Error hashing password:', (error as Error).message);
      return res.status(500).json({ error: 'Erro ao atualizar usuário' });
    }
  }

  const updated = db.updateUser(req.params.id, normalizedUpdateData);
  if (!updated) return res.status(404).json({ error: 'Usuário não encontrado' });
  
  res.json(sanitizeUser(updated));
});

// Delete user
router.delete('/:id', (req: AuthRequest, res: Response) => {
  const targetUser = db.getUser(req.params.id);
  if (!targetUser) {
    return res.status(404).json({ error: 'Usuário não encontrado' });
  }

  const requesterRole = normalizeRole(req.userRole);
  const requesterId = String(req.userId || '').trim();
  const targetUserRole = normalizeRole(String(targetUser?.role || ''));
  const targetUserId = String(targetUser?.id || '').trim();

  if (targetUserRole === 'SUPERADMIN') {
    return res.status(403).json({ error: 'Conta SUPERADMIN não pode ser excluída.' });
  }

  if (targetUserRole === 'ADMIN_SISTEMA' && requesterRole !== 'SUPERADMIN') {
    return res.status(403).json({ error: 'Somente SUPERADMIN pode excluir usuário do sistema.' });
  }

  if (targetUserId === requesterId) {
    return res.status(400).json({ error: 'Não é possível excluir o próprio usuário.' });
  }

  if (!canAccessAllEnterprises(req.userRole)) {
    const allowedEnterpriseIds = getRequesterEnterpriseIds(req);
    const canDeleteScopedUser = targetUserRole !== 'OWNER'
      && targetUserRole !== 'SUPERADMIN'
      && targetUserRole !== 'ADMIN_SISTEMA'
      && hasEnterpriseOverlap(targetUser?.enterpriseIds, allowedEnterpriseIds);

    if (!canDeleteScopedUser) {
      return res.status(403).json({ error: 'Acesso negado para excluir este usuário' });
    }
  }

  const deleted = db.deleteUser(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Usuário não encontrado' });
  }
  res.json({ message: 'Usuário deletado com sucesso' });
});

export default router;
