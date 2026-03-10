import { Router, Request, Response } from 'express';
import { whatsappSession } from '../utils/whatsappSession.js';

const router = Router();

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
    const result = await whatsappSession.sendMessageToChat(String(chatId), String(message));
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
      String(message || '')
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
