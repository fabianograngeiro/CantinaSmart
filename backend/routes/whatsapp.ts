import { Router, Request, Response } from 'express';
import { whatsappSession } from '../utils/whatsappSession.js';
import {
  buildDispatchAudience,
  DispatchAudienceFilter,
  DispatchProfileType,
  DispatchPeriodMode,
} from '../services/dispatchAudienceService.js';
import { db } from '../database.js';

const router = Router();

router.get('/dispatch/audience', async (req: Request, res: Response) => {
  try {
    const enterpriseId = String(req.query.enterpriseId || '').trim();
    if (!enterpriseId) {
      return res.status(400).json({
        success: false,
        message: 'enterpriseId é obrigatório.',
      });
    }

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

router.get('/dispatch/config', async (req: Request, res: Response) => {
  try {
    const enterpriseId = String(req.query.enterpriseId || '').trim();
    if (!enterpriseId) {
      return res.status(400).json({
        success: false,
        message: 'enterpriseId é obrigatório.',
      });
    }

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

router.put('/dispatch/config', async (req: Request, res: Response) => {
  try {
    const enterpriseId = String(req.body?.enterpriseId || '').trim();
    if (!enterpriseId) {
      return res.status(400).json({
        success: false,
        message: 'enterpriseId é obrigatório.',
      });
    }

    const incomingConfig = req.body?.config && typeof req.body.config === 'object' ? req.body.config : null;
    if (!incomingConfig) {
      return res.status(400).json({
        success: false,
        message: 'config é obrigatório.',
      });
    }

    const store = db.getWhatsAppStore();
    const currentConfigs = (store as any)?.dispatchAutomationsByEnterprise || {};
    const nextConfig = {
      ...incomingConfig,
      enterpriseId,
      updatedAt: new Date().toISOString(),
    };

    db.updateWhatsAppStore({
      dispatchAutomationsByEnterprise: {
        ...currentConfigs,
        [enterpriseId]: nextConfig,
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

router.get('/dispatch/logs', async (req: Request, res: Response) => {
  try {
    const enterpriseId = String(req.query.enterpriseId || '').trim();
    if (!enterpriseId) {
      return res.status(400).json({
        success: false,
        message: 'enterpriseId é obrigatório.',
      });
    }

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

router.post('/dispatch/logs', async (req: Request, res: Response) => {
  try {
    const enterpriseId = String(req.body?.enterpriseId || '').trim();
    if (!enterpriseId) {
      return res.status(400).json({
        success: false,
        message: 'enterpriseId é obrigatório.',
      });
    }

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

router.delete('/dispatch/logs', async (req: Request, res: Response) => {
  try {
    const enterpriseId = String(req.query.enterpriseId || '').trim();
    if (!enterpriseId) {
      return res.status(400).json({
        success: false,
        message: 'enterpriseId é obrigatório.',
      });
    }

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
  try {
    const config = whatsappSession.getAiConfig();
    res.json({
      success: true,
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
  try {
    const config = await whatsappSession.updateAiConfig(req.body || {});
    res.json({
      success: true,
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
  try {
    const limit = Number(req.query.limit || 50);
    const logs = whatsappSession.getAiAuditLogs(limit);
    res.json({
      success: true,
      logs
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao carregar auditoria da IA.'
    });
  }
});

router.get('/status', async (_req: Request, res: Response) => {
  res.json({
    success: true,
    ...whatsappSession.getSnapshot()
  });
});

router.get('/qr', async (_req: Request, res: Response) => {
  const snapshot = whatsappSession.getSnapshot();
  res.json({
    success: true,
    state: snapshot.state,
    connected: snapshot.connected,
    qrAvailable: snapshot.qrAvailable,
    qrDataUrl: snapshot.qrDataUrl,
    phoneNumber: snapshot.phoneNumber,
    lastError: snapshot.lastError,
    sessionName: snapshot.sessionName,
    startDate: snapshot.startDate,
    endDate: snapshot.endDate,
    syncFullHistory: snapshot.syncFullHistory
  });
});

router.post('/start', async (_req: Request, res: Response) => {
  const forceNewSession = Boolean(_req.body?.forceNewSession);
  const sessionName = String(_req.body?.sessionName || '').trim();
  const startDate = String(_req.body?.startDate || '').trim();
  const endDate = String(_req.body?.endDate || '').trim();
  const syncFullHistory = Boolean(_req.body?.syncFullHistory);
  const snapshot = await whatsappSession.start({
    forceNewSession,
    sessionName,
    startDate,
    endDate,
    syncFullHistory
  });
  res.json({
    success: true,
    ...snapshot
  });
});

router.post('/init', async (_req: Request, res: Response) => {
  const snapshot = await whatsappSession.initializeOnBoot();
  res.json({
    success: true,
    ...snapshot
  });
});

router.post('/stop', async (_req: Request, res: Response) => {
  const snapshot = await whatsappSession.stop();
  res.json({
    success: true,
    ...snapshot
  });
});

router.post('/send', async (req: Request, res: Response) => {
  try {
    const { phone, message } = req.body || {};
    if (!phone || !message) {
      return res.status(400).json({
        success: false,
        message: 'Informe telefone e mensagem.'
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

router.post('/send-bulk', async (req: Request, res: Response) => {
  try {
    const { recipients, message } = req.body || {};
    const list = Array.isArray(recipients) ? recipients : [];
    if (list.length === 0 || !message) {
      return res.status(400).json({
        success: false,
        message: 'Informe destinatários e mensagem.'
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
    const chats = await whatsappSession.getClientChats();
    res.json({
      success: true,
      chats
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao listar conversas.'
    });
  }
});

router.get('/chats/:chatId/messages', async (req: Request, res: Response) => {
  try {
    const chatId = String(req.params.chatId || '').replace(/__AT__/g, '@');
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

router.delete('/chats/:chatId/messages', async (req: Request, res: Response) => {
  try {
    const chatId = String(req.params.chatId || '').replace(/__AT__/g, '@');
    const result = await whatsappSession.clearChatMessages(chatId);
    res.json(result);
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao limpar mensagens da conversa.'
    });
  }
});

router.delete('/chats/:chatId', async (req: Request, res: Response) => {
  try {
    const chatId = String(req.params.chatId || '').replace(/__AT__/g, '@');
    const result = await whatsappSession.deleteChat(chatId);
    res.json(result);
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao excluir conversa.'
    });
  }
});

router.post('/send-to-chat', async (req: Request, res: Response) => {
  try {
    const { chatId, message } = req.body || {};
    if (!chatId || !message) {
      return res.status(400).json({
        success: false,
        message: 'Informe chatId e message.'
      });
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

router.post('/ai/improve-text', async (req: Request, res: Response) => {
  try {
    const { chatId, text } = req.body || {};
    const result = await whatsappSession.improveOutgoingText(String(chatId || ''), String(text || ''));
    res.json(result);
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao melhorar texto com IA.'
    });
  }
});

router.get('/chats/:chatId/ai-agent', async (req: Request, res: Response) => {
  try {
    const chatId = String(req.params.chatId || '').replace(/__AT__/g, '@');
    const result = whatsappSession.isAiAgentEnabled(chatId);
    res.json(result);
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao buscar estado do agente IA.'
    });
  }
});

router.put('/chats/:chatId/ai-agent', async (req: Request, res: Response) => {
  try {
    const chatId = String(req.params.chatId || '').replace(/__AT__/g, '@');
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
  try {
    const requests = whatsappSession.listPendingAiHumanHandoffRequests();
    res.json({
      success: true,
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
  try {
    const id = String(req.params.id || '').trim();
    const accept = Boolean(req.body?.accept);
    const result = await whatsappSession.decideAiHumanHandoffRequest(id, accept);
    res.json(result);
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao registrar decisão de atendimento IA.',
    });
  }
});

router.post('/send-media-to-chat', async (req: Request, res: Response) => {
  try {
    const { chatId, message, attachment } = req.body || {};
    if (!chatId || !attachment?.mediaType || !attachment?.base64Data) {
      return res.status(400).json({
        success: false,
        message: 'Informe chatId e attachment válido.'
      });
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

router.post('/transcribe-audio', async (req: Request, res: Response) => {
  try {
    const { chatId, messageId, mediaDataUrl, mimeType, fileName } = req.body || {};
    if (!mediaDataUrl) {
      return res.status(400).json({
        success: false,
        message: 'Informe mediaDataUrl do áudio para transcrição.'
      });
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

router.post('/schedule', async (req: Request, res: Response) => {
  try {
    const { chatId, message, scheduleAt, attachment } = req.body || {};
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

router.get('/schedule', async (req: Request, res: Response) => {
  try {
    const chatId = String(req.query.chatId || '').trim();
    const schedules = whatsappSession.getScheduledMessages(chatId || undefined);
    res.json({
      success: true,
      schedules
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao listar agendamentos.'
    });
  }
});

router.delete('/schedule/:id', async (req: Request, res: Response) => {
  try {
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
