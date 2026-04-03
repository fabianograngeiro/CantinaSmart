import { Router, Request, Response } from 'express';
import { whatsappSession } from '../utils/whatsappSession.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { canAccessAllEnterprises, requesterCanAccessEnterprise } from '../utils/enterpriseAccess.js';
import {
  buildDispatchAudience,
  DispatchAudienceFilter,
  DispatchProfileType,
  DispatchPeriodMode,
} from '../services/dispatchAudienceService.js';
import { db } from '../database.js';

const router = Router();
router.use(authMiddleware);

const normalizePhoneDigits = (value: unknown) => String(value ?? '').replace(/\D/g, '');

const getRequestedEnterpriseId = (req: AuthRequest) => {
  const queryEnterpriseId = String(req.query?.enterpriseId || '').trim();
  if (queryEnterpriseId) return queryEnterpriseId;
  return String((req.body as any)?.enterpriseId || '').trim();
};

const resolveEnterpriseIdOrReject = (req: AuthRequest, res: Response) => {
  const enterpriseId = getRequestedEnterpriseId(req);
  if (!enterpriseId) {
    res.status(400).json({ success: false, message: 'enterpriseId é obrigatório.' });
    return null;
  }
  if (!requesterCanAccessEnterprise(req, enterpriseId)) {
    res.status(403).json({ success: false, message: 'Acesso negado para esta unidade.' });
    return null;
  }
  return enterpriseId;
};

const getEnterprisePhoneSet = (enterpriseId: string) => {
  const clients = db.getClients(enterpriseId);
  const phones = new Set<string>();
  (Array.isArray(clients) ? clients : []).forEach((client: any) => {
    const phone = normalizePhoneDigits(client?.phone);
    const parentWhatsapp = normalizePhoneDigits(client?.parentWhatsapp);
    if (phone) phones.add(phone);
    if (parentWhatsapp) phones.add(parentWhatsapp);
  });
  return phones;
};

const extractPhoneFromChatId = (chatId: string) => {
  const normalized = String(chatId || '').replace(/__AT__/g, '@').trim();
  const [jidUser] = normalized.split('@');
  return normalizePhoneDigits(jidUser || normalized);
};

const isChatAllowedForEnterprise = (chatId: string, enterpriseId: string) => {
  const phone = extractPhoneFromChatId(chatId);
  if (!phone) return false;
  const phoneSet = getEnterprisePhoneSet(enterpriseId);
  return phoneSet.has(phone);
};

const getBoundEnterpriseId = () => {
  const store = db.getWhatsAppStore() as any;
  return String(store?.sessionBoundEnterpriseId || '').trim();
};

const bindSessionToEnterprise = (enterpriseId: string) => {
  db.updateWhatsAppStore({
    sessionBoundEnterpriseId: String(enterpriseId || '').trim(),
    sessionBoundAt: new Date().toISOString(),
  });
};

const clearSessionEnterpriseBinding = () => {
  db.updateWhatsAppStore({
    sessionBoundEnterpriseId: '',
    sessionBoundAt: '',
  });
};

const buildScopedSnapshot = (enterpriseId: string) => {
  const snapshot = whatsappSession.getSnapshot() as any;
  const boundEnterpriseId = getBoundEnterpriseId();
  const hasActiveBinding = Boolean(boundEnterpriseId);
  const isSameEnterprise = hasActiveBinding && boundEnterpriseId === enterpriseId;

  if (!hasActiveBinding || isSameEnterprise) {
    return {
      ...snapshot,
      sessionBoundEnterpriseId: boundEnterpriseId || enterpriseId,
    };
  }

  return {
    ...snapshot,
    connected: false,
    qrAvailable: false,
    qrDataUrl: null,
    state: 'DISCONNECTED',
    sessionBoundEnterpriseId: boundEnterpriseId,
  };
};

const normalizeDispatchProfileList = (raw: unknown) => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === 'object')
    .map((item: any) => ({
      ...item,
      id: String(item.id || `auto_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
      nome_perfil: String(item.nome_perfil || 'Automação sem nome').trim(),
      paused: Boolean(item.paused),
      createdAt: String(item.createdAt || item.updatedAt || new Date().toISOString()),
      updatedAt: String(item.updatedAt || new Date().toISOString()),
    }));
};

router.get('/dispatch/audience', async (req: AuthRequest, res: Response) => {
  try {
    const enterpriseId = resolveEnterpriseIdOrReject(req, res);
    if (!enterpriseId) return;

    const filter = String(req.query.filter || 'TODOS').toUpperCase() as DispatchAudienceFilter;
    const profileType = String(req.query.profileType || 'RESPONSAVEL_PARENTESCO').toUpperCase() as DispatchProfileType;
    const periodMode = String(req.query.periodMode || 'SEMANAL').toUpperCase() as DispatchPeriodMode;
    const businessDaysOnly = String(req.query.businessDaysOnly || '').toLowerCase() === 'true';
    const data = buildDispatchAudience({
      enterpriseId,
      filter,
      profileType,
      periodMode,
      businessDaysOnly,
    });

    res.json({
      success: true,
      ...data,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao montar audiência de disparo.',
    });
  }
});

router.get('/dispatch/config', async (req: AuthRequest, res: Response) => {
  try {
    const enterpriseId = resolveEnterpriseIdOrReject(req, res);
    if (!enterpriseId) return;

    const store = db.getWhatsAppStore();
    const configs = (store as any)?.dispatchAutomationsByEnterprise || {};
    const config = configs[enterpriseId] || null;
    return res.json({
      success: true,
      config,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao carregar configuração de disparo.',
    });
  }
});

router.put('/dispatch/config', async (req: AuthRequest, res: Response) => {
  try {
    const enterpriseId = resolveEnterpriseIdOrReject(req, res);
    if (!enterpriseId) return;

    const incomingConfig = req.body?.config && typeof req.body.config === 'object' ? req.body.config : null;
    if (!incomingConfig) {
      return res.status(400).json({
        success: false,
        message: 'config é obrigatório.',
      });
    }

    const store = db.getWhatsAppStore();
    const currentConfigs = (store as any)?.dispatchAutomationsByEnterprise || {};
    const currentProfilesByEnterprise = (store as any)?.dispatchAutomationProfilesByEnterprise || {};
    const currentProfiles = normalizeDispatchProfileList(currentProfilesByEnterprise[enterpriseId]);
    const nextConfig = {
      ...incomingConfig,
      enterpriseId,
      createdAt: String((incomingConfig as any)?.createdAt || new Date().toISOString()),
      paused: Boolean((incomingConfig as any)?.paused),
      updatedAt: new Date().toISOString(),
    };

    const existingIndex = currentProfiles.findIndex((item: any) => item.id === nextConfig.id);
    const nextProfiles = [...currentProfiles];
    if (existingIndex >= 0) {
      nextProfiles[existingIndex] = {
        ...nextProfiles[existingIndex],
        ...nextConfig,
        updatedAt: new Date().toISOString(),
      };
    } else {
      nextProfiles.unshift({
        ...nextConfig,
        createdAt: String((nextConfig as any)?.createdAt || new Date().toISOString()),
      });
    }

    db.updateWhatsAppStore({
      dispatchAutomationsByEnterprise: {
        ...currentConfigs,
        [enterpriseId]: nextConfig,
      },
      dispatchAutomationProfilesByEnterprise: {
        ...currentProfilesByEnterprise,
        [enterpriseId]: nextProfiles.slice(0, 200),
      },
    });

    return res.json({
      success: true,
      config: nextConfig,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao salvar configuração de disparo.',
    });
  }
});

router.get('/dispatch/profiles', async (req: AuthRequest, res: Response) => {
  try {
    const enterpriseId = resolveEnterpriseIdOrReject(req, res);
    if (!enterpriseId) return;

    const store = db.getWhatsAppStore();
    const profilesByEnterprise = (store as any)?.dispatchAutomationProfilesByEnterprise || {};
    const profiles = normalizeDispatchProfileList(profilesByEnterprise[enterpriseId]);

    return res.json({
      success: true,
      profiles,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao carregar perfis de disparo.',
    });
  }
});

router.put('/dispatch/profiles', async (req: AuthRequest, res: Response) => {
  try {
    const enterpriseId = resolveEnterpriseIdOrReject(req, res);
    if (!enterpriseId) return;

    const incomingProfile = req.body?.profile && typeof req.body.profile === 'object' ? req.body.profile : null;
    if (!incomingProfile) {
      return res.status(400).json({
        success: false,
        message: 'profile é obrigatório.',
      });
    }

    const profileId = String(incomingProfile.id || `auto_${Date.now()}`).trim();
    if (!profileId) {
      return res.status(400).json({
        success: false,
        message: 'id do profile é obrigatório.',
      });
    }

    const store = db.getWhatsAppStore();
    const profilesByEnterprise = (store as any)?.dispatchAutomationProfilesByEnterprise || {};
    const currentConfigs = (store as any)?.dispatchAutomationsByEnterprise || {};
    const currentProfiles = normalizeDispatchProfileList(profilesByEnterprise[enterpriseId]);

    const nowIso = new Date().toISOString();
    const existing = currentProfiles.find((item: any) => item.id === profileId);
    const nextProfile = {
      ...incomingProfile,
      id: profileId,
      enterpriseId,
      nome_perfil: String((incomingProfile as any).nome_perfil || 'Automação sem nome').trim(),
      paused: Boolean((incomingProfile as any).paused),
      createdAt: String((incomingProfile as any).createdAt || existing?.createdAt || nowIso),
      updatedAt: nowIso,
    };

    const index = currentProfiles.findIndex((item: any) => item.id === profileId);
    const nextProfiles = [...currentProfiles];
    if (index >= 0) {
      nextProfiles[index] = {
        ...nextProfiles[index],
        ...nextProfile,
      };
    } else {
      nextProfiles.unshift(nextProfile);
    }

    db.updateWhatsAppStore({
      dispatchAutomationProfilesByEnterprise: {
        ...profilesByEnterprise,
        [enterpriseId]: nextProfiles.slice(0, 200),
      },
      dispatchAutomationsByEnterprise: {
        ...currentConfigs,
        [enterpriseId]: nextProfile,
      },
    });

    return res.json({
      success: true,
      profile: nextProfile,
      profiles: nextProfiles.slice(0, 200),
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao salvar perfil de disparo.',
    });
  }
});

router.patch('/dispatch/profiles/:id/status', async (req: AuthRequest, res: Response) => {
  try {
    const enterpriseId = resolveEnterpriseIdOrReject(req, res);
    const profileId = String(req.params.id || '').trim();
    if (!enterpriseId) return;
    if (!profileId) {
      return res.status(400).json({
        success: false,
        message: 'id do perfil é obrigatório.',
      });
    }

    const paused = Boolean(req.body?.paused);
    const store = db.getWhatsAppStore();
    const profilesByEnterprise = (store as any)?.dispatchAutomationProfilesByEnterprise || {};
    const currentConfigs = (store as any)?.dispatchAutomationsByEnterprise || {};
    const currentProfiles = normalizeDispatchProfileList(profilesByEnterprise[enterpriseId]);
    const targetIndex = currentProfiles.findIndex((item: any) => item.id === profileId);

    if (targetIndex < 0) {
      return res.status(404).json({
        success: false,
        message: 'Perfil não encontrado.',
      });
    }

    const nowIso = new Date().toISOString();
    const updatedProfile = {
      ...currentProfiles[targetIndex],
      paused,
      updatedAt: nowIso,
    };
    const nextProfiles = [...currentProfiles];
    nextProfiles[targetIndex] = updatedProfile;

    const currentConfig = currentConfigs[enterpriseId];
    const nextConfig = currentConfig && currentConfig.id === profileId
      ? {
        ...currentConfig,
        paused,
        updatedAt: nowIso,
      }
      : currentConfig;

    db.updateWhatsAppStore({
      dispatchAutomationProfilesByEnterprise: {
        ...profilesByEnterprise,
        [enterpriseId]: nextProfiles,
      },
      dispatchAutomationsByEnterprise: {
        ...currentConfigs,
        [enterpriseId]: nextConfig,
      },
    });

    return res.json({
      success: true,
      profile: updatedProfile,
      profiles: nextProfiles,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao atualizar status do perfil.',
    });
  }
});

router.delete('/dispatch/profiles/:id', async (req: AuthRequest, res: Response) => {
  try {
    const enterpriseId = resolveEnterpriseIdOrReject(req, res);
    const profileId = String(req.params.id || '').trim();
    if (!enterpriseId) return;
    if (!profileId) {
      return res.status(400).json({
        success: false,
        message: 'id do perfil é obrigatório.',
      });
    }

    const store = db.getWhatsAppStore();
    const profilesByEnterprise = (store as any)?.dispatchAutomationProfilesByEnterprise || {};
    const currentConfigs = (store as any)?.dispatchAutomationsByEnterprise || {};
    const currentProfiles = normalizeDispatchProfileList(profilesByEnterprise[enterpriseId]);
    const nextProfiles = currentProfiles.filter((item: any) => item.id !== profileId);

    const currentConfig = currentConfigs[enterpriseId];
    const nextConfig = currentConfig && currentConfig.id === profileId ? null : currentConfig;

    db.updateWhatsAppStore({
      dispatchAutomationProfilesByEnterprise: {
        ...profilesByEnterprise,
        [enterpriseId]: nextProfiles,
      },
      dispatchAutomationsByEnterprise: {
        ...currentConfigs,
        [enterpriseId]: nextConfig,
      },
    });

    return res.json({
      success: true,
      profiles: nextProfiles,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao remover perfil de disparo.',
    });
  }
});

router.get('/dispatch/logs', async (req: AuthRequest, res: Response) => {
  try {
    const enterpriseId = resolveEnterpriseIdOrReject(req, res);
    if (!enterpriseId) return;

    const limit = Math.max(1, Math.min(500, Number(req.query.limit || 100)));
    const store = db.getWhatsAppStore();
    const logsByEnterprise = (store as any)?.dispatchLogsByEnterprise || {};
    const logs = Array.isArray(logsByEnterprise[enterpriseId]) ? logsByEnterprise[enterpriseId] : [];

    return res.json({
      success: true,
      logs: logs.slice(0, limit),
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao carregar logs de disparo.',
    });
  }
});

router.post('/dispatch/logs', async (req: AuthRequest, res: Response) => {
  try {
    const enterpriseId = resolveEnterpriseIdOrReject(req, res);
    if (!enterpriseId) return;

    const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
    if (entries.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'entries é obrigatório.',
      });
    }

    const store = db.getWhatsAppStore();
    const logsByEnterprise = (store as any)?.dispatchLogsByEnterprise || {};
    const current = Array.isArray(logsByEnterprise[enterpriseId]) ? logsByEnterprise[enterpriseId] : [];
    const normalizedEntries = entries
      .filter((entry: any) => entry && typeof entry === 'object')
      .map((entry: any) => ({
        ...entry,
        id: String(entry.id || `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
        timestamp: entry.timestamp || Date.now(),
      }));

    const next = [...normalizedEntries, ...current].slice(0, 1000);
    db.updateWhatsAppStore({
      dispatchLogsByEnterprise: {
        ...logsByEnterprise,
        [enterpriseId]: next,
      },
    });

    return res.json({
      success: true,
      count: normalizedEntries.length,
      total: next.length,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao salvar logs de disparo.',
    });
  }
});

router.delete('/dispatch/logs', async (req: AuthRequest, res: Response) => {
  try {
    const enterpriseId = resolveEnterpriseIdOrReject(req, res);
    if (!enterpriseId) return;

    const store = db.getWhatsAppStore();
    const logsByEnterprise = (store as any)?.dispatchLogsByEnterprise || {};
    const nextLogs = {
      ...logsByEnterprise,
      [enterpriseId]: [],
    };

    db.updateWhatsAppStore({
      dispatchLogsByEnterprise: nextLogs,
    });

    return res.json({
      success: true,
      message: 'Logs de disparo limpos com sucesso.',
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao limpar logs de disparo.',
    });
  }
});

router.get('/ai-config', async (_req: Request, res: Response) => {
  const req = _req as AuthRequest;
  const enterpriseId = resolveEnterpriseIdOrReject(req, res);
  if (!enterpriseId) return;
  try {
    const config = whatsappSession.getAiConfig();
    res.json({
      success: true,
      enterpriseId,
      config
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao carregar configuração de AI.'
    });
  }
});

router.put('/ai-config', async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const enterpriseId = resolveEnterpriseIdOrReject(authReq, res);
  if (!enterpriseId) return;
  try {
    const config = await whatsappSession.updateAiConfig(req.body || {});
    res.json({
      success: true,
      enterpriseId,
      config
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao salvar configuração de AI.'
    });
  }
});

router.get('/ai-flow-nodes', async (_req: Request, res: Response) => {
  const req = _req as AuthRequest;
  const enterpriseId = resolveEnterpriseIdOrReject(req, res);
  if (!enterpriseId) return;
  try {
    const config = whatsappSession.getAiConfig();
    const nodes = [
      {
        id: 'webhook_whatsapp_in',
        type: 'webhook',
        name: 'WhatsApp Incoming Message',
        next: 'context_classifier',
      },
      {
        id: 'context_classifier',
        type: 'llm_classification',
        model: `${config.provider || 'openai'}:${config.model || (
          config.provider === 'gemini'
            ? 'gemini-2.0-flash'
            : config.provider === 'groq'
              ? 'llama-3.1-8b-instant'
              : 'gpt-4.1-mini'
        )}`,
        next: 'intent_switch',
      },
      {
        id: 'intent_switch',
        type: 'switch',
        name: 'Intent Switch',
        conditions: [
          { key: 'CONSULTAR_NOME', label: 'Consultar nome' },
          { key: 'CONSULTAR_SALDO_CANTINA', label: 'Consultar saldo cantina' },
          { key: 'CONSULTAR_RELATORIO_CONSUMO', label: 'Consultar relatório de consumo' },
          { key: 'NAO_CORRESPONDE', label: 'Não corresponde a nenhum' },
        ],
        next: 'action_executor',
      },
      {
        id: 'action_executor',
        type: 'context_actions',
        contexts: config.contexts.map((ctx) => ({
          id: ctx.id,
          name: ctx.name,
          enabled: ctx.enabled,
          conditionKeywords: ctx.conditionKeywords || [],
          actionType: ctx.actionType,
          dataSelections: ctx.dataSelections,
          routingMode: ctx.routingMode || 'INTENT_SWITCH',
          responsePrompt: ctx.responsePrompt || '',
          subSwitches: Array.isArray(ctx.subSwitches)
            ? ctx.subSwitches.map((sub: any) => ({
                id: sub.id,
                name: sub.name,
                enabled: sub.enabled,
                conditionKeywords: sub.conditionKeywords || [],
                dataSelections: sub.dataSelections || [],
                responsePrompt: sub.responsePrompt || ''
              }))
            : [],
        })),
        next: 'reply_sender',
      },
      {
        id: 'reply_sender',
        type: 'whatsapp_send',
        mode: 'CONTEXT_ACTION',
        responseDelaySeconds: Number(config.responseDelaySeconds || 0),
        conversationSessionMinutes: Number(config.conversationSessionMinutes || 60),
        next: null,
      }
    ];

    res.json({
      success: true,
      enterpriseId,
      flow: {
        version: 1,
        generatedAt: new Date().toISOString(),
        nodes
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao gerar nodes do fluxo de AI.'
    });
  }
});

router.get('/ai-audit', async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const enterpriseId = resolveEnterpriseIdOrReject(authReq, res);
  if (!enterpriseId) return;
  try {
    const limit = Number(req.query.limit || 50);
    const logs = whatsappSession.getAiAuditLogs(limit);
    res.json({
      success: true,
      enterpriseId,
      logs
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao carregar auditoria da IA.'
    });
  }
});

router.get('/sync-diagnostics', async (req: AuthRequest, res: Response) => {
  try {
    const enterpriseId = resolveEnterpriseIdOrReject(req, res);
    if (!enterpriseId) return;
    const limit = Number(req.query.limit || 100);
    const reason = String(req.query.reason || '').trim();
    const fromRaw = String(req.query.from || req.query.startDate || '').trim();
    const toRaw = String(req.query.to || req.query.endDate || '').trim();

    const parseToMs = (raw: string) => {
      if (!raw) return null;
      const numeric = Number(raw);
      if (Number.isFinite(numeric) && numeric > 0) {
        return numeric > 1_000_000_000_000 ? numeric : (numeric * 1000);
      }
      const parsed = Date.parse(raw);
      if (!Number.isFinite(parsed) || parsed <= 0) return null;
      return parsed;
    };

    const fromMs = parseToMs(fromRaw);
    const toMs = parseToMs(toRaw);
    const diagnostics = whatsappSession.getSyncDiagnostics({
      limit,
      reason,
      fromMs: fromMs || undefined,
      toMs: toMs || undefined,
    });
    res.json({
      success: true,
      ...diagnostics
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao carregar diagnóstico de sync.'
    });
  }
});

router.get('/status', async (_req: Request, res: Response) => {
  const req = _req as AuthRequest;
  const enterpriseId = resolveEnterpriseIdOrReject(req, res);
  if (!enterpriseId) return;
  res.json({
    success: true,
    enterpriseId,
    ...buildScopedSnapshot(enterpriseId)
  });
});

router.get('/qr', async (_req: Request, res: Response) => {
  const req = _req as AuthRequest;
  const enterpriseId = resolveEnterpriseIdOrReject(req, res);
  if (!enterpriseId) return;
  const snapshot = buildScopedSnapshot(enterpriseId) as any;
  res.json({
    success: true,
    enterpriseId,
    state: snapshot.state,
    connected: snapshot.connected,
    qrAvailable: snapshot.qrAvailable,
    qrDataUrl: snapshot.qrDataUrl,
    phoneNumber: snapshot.phoneNumber,
    lastError: snapshot.lastError,
    sessionName: snapshot.sessionName,
    startDate: snapshot.startDate,
    endDate: snapshot.endDate,
    syncFullHistory: snapshot.syncFullHistory,
    safeSyncMode: snapshot.safeSyncMode,
    syncProgress: snapshot.syncProgress
  });
});

router.post('/start', async (_req: Request, res: Response) => {
  const req = _req as AuthRequest;
  const enterpriseId = resolveEnterpriseIdOrReject(req, res);
  if (!enterpriseId) return;
  const boundEnterpriseId = getBoundEnterpriseId();
  const hasCrossEnterpriseBinding = boundEnterpriseId
    && boundEnterpriseId !== enterpriseId
    && !canAccessAllEnterprises(req.userRole);
  if (hasCrossEnterpriseBinding) {
    return res.status(409).json({
      success: false,
      message: 'WhatsApp já está conectado em outra unidade. Desconecte primeiro na unidade ativa.',
      sessionBoundEnterpriseId: boundEnterpriseId,
    });
  }

  const forceNewSession = Boolean(_req.body?.forceNewSession);
  const sessionName = String(_req.body?.sessionName || '').trim();
  const startDate = String(_req.body?.startDate || '').trim();
  const endDate = String(_req.body?.endDate || '').trim();
  const syncFullHistory = Boolean(_req.body?.syncFullHistory);
  const safeSyncMode = _req.body?.safeSyncMode !== false;
  const syncContacts = _req.body?.syncContacts !== false;
  const syncHistories = _req.body?.syncHistories !== false;
  const snapshot = await whatsappSession.start({
    forceNewSession,
    sessionName,
    startDate,
    endDate,
    syncFullHistory,
    safeSyncMode,
    syncContacts,
    syncHistories
  });
  bindSessionToEnterprise(enterpriseId);
  res.json({
    success: true,
    enterpriseId,
    sessionBoundEnterpriseId: enterpriseId,
    ...snapshot
  });
});

router.post('/init', async (_req: Request, res: Response) => {
  const req = _req as AuthRequest;
  const enterpriseId = resolveEnterpriseIdOrReject(req, res);
  if (!enterpriseId) return;
  const boundEnterpriseId = getBoundEnterpriseId();
  const hasCrossEnterpriseBinding = boundEnterpriseId
    && boundEnterpriseId !== enterpriseId
    && !canAccessAllEnterprises(req.userRole);
  if (hasCrossEnterpriseBinding) {
    return res.status(409).json({
      success: false,
      message: 'WhatsApp já está conectado em outra unidade. Desconecte primeiro na unidade ativa.',
      sessionBoundEnterpriseId: boundEnterpriseId,
    });
  }

  const snapshot = await whatsappSession.initializeOnBoot();
  bindSessionToEnterprise(enterpriseId);
  res.json({
    success: true,
    enterpriseId,
    sessionBoundEnterpriseId: enterpriseId,
    ...snapshot
  });
});

router.post('/stop', async (_req: Request, res: Response) => {
  const req = _req as AuthRequest;
  const enterpriseId = resolveEnterpriseIdOrReject(req, res);
  if (!enterpriseId) return;
  const boundEnterpriseId = getBoundEnterpriseId();
  const hasCrossEnterpriseBinding = boundEnterpriseId
    && boundEnterpriseId !== enterpriseId
    && !canAccessAllEnterprises(req.userRole);
  if (hasCrossEnterpriseBinding) {
    return res.status(409).json({
      success: false,
      message: 'Esta unidade não possui a sessão ativa do WhatsApp para desconectar.',
      sessionBoundEnterpriseId: boundEnterpriseId,
    });
  }

  const snapshot = await whatsappSession.stop();
  clearSessionEnterpriseBinding();
  res.json({
    success: true,
    enterpriseId,
    sessionBoundEnterpriseId: '',
    ...snapshot
  });
});

router.post('/send', async (req: AuthRequest, res: Response) => {
  try {
    const enterpriseId = resolveEnterpriseIdOrReject(req, res);
    if (!enterpriseId) return;
    const { phone, message } = req.body || {};
    if (!phone || !message) {
      return res.status(400).json({
        success: false,
        message: 'Informe telefone e mensagem.'
      });
    }
    if (!getEnterprisePhoneSet(enterpriseId).has(normalizePhoneDigits(phone))) {
      return res.status(403).json({
        success: false,
        message: 'Telefone não pertence à unidade selecionada.',
      });
    }

    const result = await whatsappSession.sendMessage(String(phone), String(message));
    res.json(result);
  } catch (err) {
    console.error('❌ [WHATSAPP] Erro no envio:', err);
    res.status(400).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao enviar mensagem'
    });
  }
});

router.post('/send-bulk', async (req: AuthRequest, res: Response) => {
  try {
    const enterpriseId = resolveEnterpriseIdOrReject(req, res);
    if (!enterpriseId) return;
    const { recipients, message } = req.body || {};
    const list = Array.isArray(recipients) ? recipients : [];
    if (list.length === 0 || !message) {
      return res.status(400).json({
        success: false,
        message: 'Informe destinatários e mensagem.'
      });
    }

    const allowedPhones = getEnterprisePhoneSet(enterpriseId);
    const blockedRecipient = list.find((rawPhone) => !allowedPhones.has(normalizePhoneDigits(rawPhone)));
    if (blockedRecipient) {
      return res.status(403).json({
        success: false,
        message: `Telefone fora da unidade selecionada: ${String(blockedRecipient)}`,
      });
    }

    const results: Array<any> = [];
    for (const rawPhone of list) {
      try {
        const sent = await whatsappSession.sendMessage(String(rawPhone), String(message));
        results.push({ ...sent, success: true });
      } catch (err) {
        results.push({
          success: false,
          phone: String(rawPhone),
          message: err instanceof Error ? err.message : 'Falha no envio'
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    res.json({
      success: true,
      successCount,
      total: results.length,
      results
    });
  } catch (err) {
    console.error('❌ [WHATSAPP] Erro no envio em lote:', err);
    res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha no envio em lote'
    });
  }
});

router.get('/chats', async (_req: Request, res: Response) => {
  try {
    const req = _req as AuthRequest;
    const enterpriseId = resolveEnterpriseIdOrReject(req, res);
    if (!enterpriseId) return;

    const allowedPhones = getEnterprisePhoneSet(enterpriseId);
    const chats = await whatsappSession.getClientChats();
    res.json({
      success: true,
      chats: (Array.isArray(chats) ? chats : []).filter((chat: any) => {
        const phone = normalizePhoneDigits(chat?.phone || extractPhoneFromChatId(String(chat?.chatId || '')));
        return phone && allowedPhones.has(phone);
      })
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao listar conversas.'
    });
  }
});

router.get('/agenda', async (req: AuthRequest, res: Response) => {
  try {
    const enterpriseId = resolveEnterpriseIdOrReject(req, res);
    if (!enterpriseId) return;
    const type = String(req.query.type || '').trim().toUpperCase();
    const agenda = db.getAgendaWpp(enterpriseId, type || undefined);
    return res.json({ success: true, agenda });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao carregar agenda WPP.',
    });
  }
});

router.post('/agenda/sync', async (req: AuthRequest, res: Response) => {
  try {
    const enterpriseId = resolveEnterpriseIdOrReject(req, res);
    if (!enterpriseId) return;

    const unitType = String(req.body?.unitType || 'CANTINA').trim().toUpperCase();
    const incomingContacts = Array.isArray(req.body?.contacts) ? req.body.contacts : null;
    const contacts = incomingContacts || (await whatsappSession.getClientChats());

    const normalized = (Array.isArray(contacts) ? contacts : []).map((entry: any) => ({
      phone: String(entry?.phone || extractPhoneFromChatId(String(entry?.chatId || ''))).trim(),
      name: String(entry?.name || entry?.contactName || '').trim(),
      chatId: String(entry?.chatId || '').trim(),
      metadata: entry?.metadata && typeof entry.metadata === 'object' ? entry.metadata : {},
    }));

    const agenda = db.syncAgendaWppContacts({
      enterpriseId,
      unitType,
      contacts: normalized,
      syncedByUserId: String(req.userId || '').trim(),
      syncedByName: String((req.userId ? db.getUser(String(req.userId || '').trim())?.name : '') || '').trim(),
    });

    return res.json({
      success: true,
      count: Array.isArray(agenda) ? agenda.length : 0,
      agenda,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao sincronizar agenda WPP.',
    });
  }
});

router.get('/chats/:chatId/messages', async (req: AuthRequest, res: Response) => {
  try {
    const enterpriseId = resolveEnterpriseIdOrReject(req, res);
    if (!enterpriseId) return;
    const chatId = String(req.params.chatId || '').replace(/__AT__/g, '@');
    if (!isChatAllowedForEnterprise(chatId, enterpriseId)) {
      return res.status(403).json({ success: false, message: 'Conversa não pertence à unidade selecionada.' });
    }
    const limit = Number(req.query.limit || 80);
    const messages = await whatsappSession.getChatMessages(chatId, limit);
    res.json({
      success: true,
      chatId,
      messages
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao carregar mensagens.'
    });
  }
});

router.delete('/chats/:chatId/messages', async (req: AuthRequest, res: Response) => {
  try {
    const enterpriseId = resolveEnterpriseIdOrReject(req, res);
    if (!enterpriseId) return;
    const chatId = String(req.params.chatId || '').replace(/__AT__/g, '@');
    if (!isChatAllowedForEnterprise(chatId, enterpriseId)) {
      return res.status(403).json({ success: false, message: 'Conversa não pertence à unidade selecionada.' });
    }
    const result = await whatsappSession.clearChatMessages(chatId);
    res.json(result);
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao limpar mensagens da conversa.'
    });
  }
});

router.delete('/chats/:chatId', async (req: AuthRequest, res: Response) => {
  try {
    const enterpriseId = resolveEnterpriseIdOrReject(req, res);
    if (!enterpriseId) return;
    const chatId = String(req.params.chatId || '').replace(/__AT__/g, '@');
    if (!isChatAllowedForEnterprise(chatId, enterpriseId)) {
      return res.status(403).json({ success: false, message: 'Conversa não pertence à unidade selecionada.' });
    }
    const result = await whatsappSession.deleteChat(chatId);
    res.json(result);
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao excluir conversa.'
    });
  }
});

router.post('/send-to-chat', async (req: AuthRequest, res: Response) => {
  try {
    const enterpriseId = resolveEnterpriseIdOrReject(req, res);
    if (!enterpriseId) return;
    const { chatId, message } = req.body || {};
    if (!chatId || !message) {
      return res.status(400).json({
        success: false,
        message: 'Informe chatId e message.'
      });
    }
    if (!isChatAllowedForEnterprise(String(chatId || ''), enterpriseId)) {
      return res.status(403).json({ success: false, message: 'Conversa não pertence à unidade selecionada.' });
    }

    const result = await whatsappSession.sendMessageToChat(
      String(chatId),
      String(message),
      {
        source: 'human',
        disableAiAgentOnHumanSend: true
      }
    );
    console.log('✅ [WHATSAPP] /send-to-chat sucesso:', result);
    res.json(result);
  } catch (err) {
    console.error('❌ [WHATSAPP] /send-to-chat erro:', err);
    res.status(400).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao enviar mensagem no chat.'
    });
  }
});

router.post('/ai/improve-text', async (req: AuthRequest, res: Response) => {
  try {
    const enterpriseId = resolveEnterpriseIdOrReject(req, res);
    if (!enterpriseId) return;
    const { chatId, text } = req.body || {};
    if (!isChatAllowedForEnterprise(String(chatId || ''), enterpriseId)) {
      return res.status(403).json({ success: false, message: 'Conversa não pertence à unidade selecionada.' });
    }
    const result = await whatsappSession.improveOutgoingText(String(chatId || ''), String(text || ''));
    res.json(result);
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao melhorar texto com IA.'
    });
  }
});

router.get('/chats/:chatId/ai-agent', async (req: AuthRequest, res: Response) => {
  try {
    const enterpriseId = resolveEnterpriseIdOrReject(req, res);
    if (!enterpriseId) return;
    const chatId = String(req.params.chatId || '').replace(/__AT__/g, '@');
    if (!isChatAllowedForEnterprise(chatId, enterpriseId)) {
      return res.status(403).json({ success: false, message: 'Conversa não pertence à unidade selecionada.' });
    }
    const result = whatsappSession.isAiAgentEnabled(chatId);
    res.json(result);
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao buscar estado do agente IA.'
    });
  }
});

router.put('/chats/:chatId/ai-agent', async (req: AuthRequest, res: Response) => {
  try {
    const enterpriseId = resolveEnterpriseIdOrReject(req, res);
    if (!enterpriseId) return;
    const chatId = String(req.params.chatId || '').replace(/__AT__/g, '@');
    if (!isChatAllowedForEnterprise(chatId, enterpriseId)) {
      return res.status(403).json({ success: false, message: 'Conversa não pertence à unidade selecionada.' });
    }
    const enabled = Boolean(req.body?.enabled);
    const result = await whatsappSession.setAiAgentEnabled(chatId, enabled);
    res.json(result);
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao atualizar estado do agente IA.'
    });
  }
});

router.get('/ai/handoff-requests', async (_req: Request, res: Response) => {
  const req = _req as AuthRequest;
  const enterpriseId = resolveEnterpriseIdOrReject(req, res);
  if (!enterpriseId) return;
  try {
    const requests = whatsappSession.listPendingAiHumanHandoffRequests();
    res.json({
      success: true,
      enterpriseId,
      requests,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao carregar solicitações pendentes de atendimento IA.',
    });
  }
});

router.post('/ai/handoff-requests/:id/decision', async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const enterpriseId = resolveEnterpriseIdOrReject(authReq, res);
  if (!enterpriseId) return;
  try {
    const id = String(req.params.id || '').trim();
    const accept = Boolean(req.body?.accept);
    const result = await whatsappSession.decideAiHumanHandoffRequest(id, accept);
    res.json({
      ...result,
      enterpriseId,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao registrar decisão de atendimento IA.',
    });
  }
});

router.post('/send-media-to-chat', async (req: AuthRequest, res: Response) => {
  try {
    const enterpriseId = resolveEnterpriseIdOrReject(req, res);
    if (!enterpriseId) return;
    const { chatId, message, attachment } = req.body || {};
    if (!chatId || !attachment?.mediaType || !attachment?.base64Data) {
      return res.status(400).json({
        success: false,
        message: 'Informe chatId e attachment válido.'
      });
    }

    if (!isChatAllowedForEnterprise(String(chatId || ''), enterpriseId)) {
      return res.status(403).json({ success: false, message: 'Conversa não pertence à unidade selecionada.' });
    }

    const result = await whatsappSession.sendMediaToChat(
      String(chatId),
      {
        mediaType: String(attachment.mediaType) as 'image' | 'document' | 'audio',
        base64Data: String(attachment.base64Data),
        mimeType: attachment?.mimeType ? String(attachment.mimeType) : undefined,
        fileName: attachment?.fileName ? String(attachment.fileName) : undefined
      },
      String(message || ''),
      {
        source: 'human',
        disableAiAgentOnHumanSend: true
      }
    );

    res.json(result);
  } catch (err) {
    console.error('❌ [WHATSAPP] /send-media-to-chat erro:', err);
    res.status(400).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao enviar anexo no chat.'
    });
  }
});

router.post('/transcribe-audio', async (req: AuthRequest, res: Response) => {
  try {
    const enterpriseId = resolveEnterpriseIdOrReject(req, res);
    if (!enterpriseId) return;
    const { chatId, messageId, mediaDataUrl, mimeType, fileName } = req.body || {};
    if (!mediaDataUrl) {
      return res.status(400).json({
        success: false,
        message: 'Informe mediaDataUrl do áudio para transcrição.'
      });
    }

    if (chatId && !isChatAllowedForEnterprise(String(chatId || ''), enterpriseId)) {
      return res.status(403).json({ success: false, message: 'Conversa não pertence à unidade selecionada.' });
    }

    const result = await whatsappSession.transcribeAudioMessage({
      chatId: chatId ? String(chatId) : undefined,
      messageId: messageId ? String(messageId) : undefined,
      mediaDataUrl: String(mediaDataUrl),
      mimeType: mimeType ? String(mimeType) : undefined,
      fileName: fileName ? String(fileName) : undefined,
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao transcrever áudio.'
    });
  }
});

router.post('/schedule', async (req: AuthRequest, res: Response) => {
  try {
    const enterpriseId = resolveEnterpriseIdOrReject(req, res);
    if (!enterpriseId) return;
    const { chatId, message, scheduleAt, attachment } = req.body || {};
    if (!isChatAllowedForEnterprise(String(chatId || ''), enterpriseId)) {
      return res.status(403).json({ success: false, message: 'Conversa não pertence à unidade selecionada.' });
    }
    const result = await whatsappSession.scheduleMessage({
      chatId: String(chatId || ''),
      message: String(message || ''),
      scheduleAt: scheduleAt,
      attachment: attachment?.mediaType && attachment?.base64Data
        ? {
            mediaType: String(attachment.mediaType) as 'image' | 'document' | 'audio',
            base64Data: String(attachment.base64Data),
            mimeType: attachment?.mimeType ? String(attachment.mimeType) : undefined,
            fileName: attachment?.fileName ? String(attachment.fileName) : undefined
          }
        : null
    });
    res.json(result);
  } catch (err) {
    console.error('❌ [WHATSAPP] /schedule erro:', err);
    res.status(400).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao agendar mensagem.'
    });
  }
});

router.get('/schedule', async (req: AuthRequest, res: Response) => {
  try {
    const enterpriseId = resolveEnterpriseIdOrReject(req, res);
    if (!enterpriseId) return;
    const allowedPhones = getEnterprisePhoneSet(enterpriseId);
    const chatId = String(req.query.chatId || '').trim();
    if (chatId && !isChatAllowedForEnterprise(chatId, enterpriseId)) {
      return res.status(403).json({ success: false, message: 'Conversa não pertence à unidade selecionada.' });
    }
    const schedules = whatsappSession.getScheduledMessages(chatId || undefined);
    res.json({
      success: true,
      schedules: (Array.isArray(schedules) ? schedules : []).filter((item: any) => {
        const phone = extractPhoneFromChatId(String(item?.chatId || ''));
        return phone && allowedPhones.has(phone);
      })
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao listar agendamentos.'
    });
  }
});

router.delete('/schedule/:id', async (req: AuthRequest, res: Response) => {
  try {
    const enterpriseId = resolveEnterpriseIdOrReject(req, res);
    if (!enterpriseId) return;
    const result = await whatsappSession.cancelScheduledMessage(String(req.params.id || ''));
    res.json(result);
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao cancelar agendamento.'
    });
  }
});

export default router;
