import { Router, Request, Response } from 'express';
import { db } from '../database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { processOverduePlanConsumptions } from '../services/planConsumptionAutoProcessor.js';

const router = Router();

const onlyDigits = (value: unknown) => String(value || '').replace(/\D/g, '');
const HUB_CPF_TOKEN = process.env.HUB_CPF_TOKEN || '202268910WmiyUcBebX365190384';
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

router.post('/integrations/cnpj', async (req: Request, res: Response) => {
  try {
    const cnpj = onlyDigits(req.body?.cnpj);
    if (cnpj.length !== 14) {
      return res.status(400).json({ error: 'CNPJ inválido. Informe 14 dígitos.' });
    }

    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
    if (!response.ok) {
      return res.status(404).json({ error: 'CNPJ não encontrado na base pública.' });
    }

    const payload = await response.json() as any;
    const normalized = {
      cnpj,
      name: String(payload?.nome_fantasia || payload?.razao_social || '').trim(),
      legalName: String(payload?.razao_social || '').trim(),
      managerName: String(payload?.qsa?.[0]?.nome_socio || '').trim(),
      email: String(payload?.email || '').trim(),
      phone1: String(payload?.ddd_telefone_1 || '').trim(),
      phone2: String(payload?.ddd_telefone_2 || '').trim(),
      cep: String(payload?.cep || '').trim(),
      street: String(payload?.logradouro || '').trim(),
      number: String(payload?.numero || '').trim(),
      neighborhood: String(payload?.bairro || '').trim(),
      city: String(payload?.municipio || '').trim(),
      state: String(payload?.uf || '').trim(),
    };

    return res.json(normalized);
  } catch (err) {
    console.error('Erro ao consultar integração de CNPJ:', err);
    return res.status(500).json({ error: 'Falha ao consultar CNPJ.' });
  }
});

router.post('/integrations/cpf', async (req: Request, res: Response) => {
  try {
    const cpf = onlyDigits(req.body?.cpf);
    if (cpf.length !== 11) {
      return res.status(400).json({ error: 'CPF inválido. Informe 11 dígitos.' });
    }

    const url = `https://ws.hubdodesenvolvedor.com.br/v2/cadastropf/?cpf=${cpf}&token=${encodeURIComponent(HUB_CPF_TOKEN)}`;
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(404).json({ error: 'CPF não encontrado no serviço informado.' });
    }

    const payload = await response.json() as any;
    if (!payload?.status || !payload?.result) {
      return res.status(404).json({ error: 'CPF não encontrado no serviço informado.' });
    }

    const firstPhone = Array.isArray(payload.result?.listaTelefones) ? payload.result.listaTelefones[0] : null;
    const firstEmail = Array.isArray(payload.result?.listaEmails) ? payload.result.listaEmails[0] : null;
    const firstAddress = Array.isArray(payload.result?.listaEnderecos) ? payload.result.listaEnderecos[0] : null;

    return res.json({
      cpf,
      name: String(payload.result?.nomeCompleto || '').trim(),
      email: String(firstEmail?.enderecoEmail || '').trim(),
      phone: String(firstPhone?.telefoneComDDD || '').trim(),
      cep: String(firstAddress?.cep || '').trim(),
      street: String(firstAddress?.logradouro || '').trim(),
      number: String(firstAddress?.numero || '').trim(),
      neighborhood: String(firstAddress?.bairro || '').trim(),
      complement: String(firstAddress?.complemento || '').trim(),
      city: String(firstAddress?.cidade || '').trim(),
      state: String(firstAddress?.uf || '').trim(),
    });
  } catch (err) {
    console.error('Erro ao consultar integração de CPF:', err);
    return res.status(500).json({ error: 'Falha ao consultar CPF.' });
  }
});

router.post('/integrations/cep', async (req: Request, res: Response) => {
  try {
    const cep = onlyDigits(req.body?.cep);
    if (cep.length !== 8) {
      return res.status(400).json({ error: 'CEP inválido. Informe 8 dígitos.' });
    }

    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (!response.ok) {
      return res.status(404).json({ error: 'CEP não encontrado na base pública.' });
    }

    const payload = await response.json() as any;
    if (payload?.erro) {
      return res.status(404).json({ error: 'CEP não encontrado na base pública.' });
    }
    return res.json({
      cep: String(payload?.cep || cep).trim(),
      street: String(payload?.logradouro || '').trim(),
      neighborhood: String(payload?.bairro || '').trim(),
      complement: String(payload?.complemento || '').trim(),
      city: String(payload?.localidade || '').trim(),
      state: String(payload?.uf || '').trim(),
    });
  } catch (err) {
    console.error('Erro ao consultar integração de CEP:', err);
    return res.status(500).json({ error: 'Falha ao consultar CEP.' });
  }
});

// Get all enterprises
router.get('/', (req: AuthRequest, res: Response) => {
  const enterprises = db.getEnterprises();
  if (canAccessAllEnterprises(req.userRole)) {
    return res.json(enterprises);
  }
  const allowed = new Set(getRequesterEnterpriseIds(req));
  return res.json(enterprises.filter((enterprise: any) => allowed.has(String(enterprise?.id || '').trim())));
});

// Get enterprise by ID
router.get('/:id', (req: AuthRequest, res: Response) => {
  if (!requesterCanAccessEnterprise(req, req.params.id)) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }
  const enterprise = db.getEnterprise(req.params.id);
  if (!enterprise) {
    return res.status(404).json({ error: 'Empresa não encontrada' });
  }
  res.json(enterprise);
});

// Create enterprise
router.post('/', (req: AuthRequest, res: Response) => {
  const requester = getRequesterUser(req);
  if (!requester) {
    return res.status(401).json({ error: 'Usuário não autenticado' });
  }

  const payload = {
    ...(req.body || {}),
  };

  if (!canAccessAllEnterprises(req.userRole)) {
    if (normalizeRole(requester.role) !== 'OWNER') {
      return res.status(403).json({ error: 'Apenas SUPERADMIN/ADMIN_SISTEMA/OWNER podem criar empresas' });
    }
    if (!String(payload.ownerName || '').trim()) {
      payload.ownerName = String(requester.name || '').trim();
    }
  }

  const newEnterprise = db.createEnterprise(payload);

  if (!canAccessAllEnterprises(req.userRole) && normalizeRole(requester.role) === 'OWNER') {
    const currentEnterpriseIds = Array.isArray(requester.enterpriseIds) ? requester.enterpriseIds : [];
    const normalizedCurrentIds = currentEnterpriseIds.map((id: unknown) => String(id || '').trim()).filter(Boolean);
    if (!normalizedCurrentIds.includes(String(newEnterprise.id || '').trim())) {
      db.updateUser(requester.id, {
        enterpriseIds: [...normalizedCurrentIds, String(newEnterprise.id || '').trim()],
      });
    }
  }

  res.status(201).json(newEnterprise);
});

// Update enterprise
router.put('/:id', async (req: AuthRequest, res: Response) => {
  if (!requesterCanAccessEnterprise(req, req.params.id)) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }
  try {
    const updated = db.updateEnterprise(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Empresa não encontrada' });
    }
    await processOverduePlanConsumptions({ enterpriseId: req.params.id, force: true });
    res.json(updated);
  } catch (error) {
    console.error('Erro ao atualizar empresa:', error);
    res.status(500).json({ error: 'Erro ao atualizar empresa' });
  }
});

// Delete enterprise
router.delete('/:id', (req: AuthRequest, res: Response) => {
  if (!requesterCanAccessEnterprise(req, req.params.id)) {
    return res.status(403).json({ error: 'Acesso negado para esta empresa' });
  }
  const deleted = db.deleteEnterprise(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Empresa não encontrada' });
  }
  res.json({ message: 'Empresa deletada com sucesso' });
});

export default router;
