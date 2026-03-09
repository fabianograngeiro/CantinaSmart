import { Router, Request, Response } from 'express';
import { whatsappSession } from '../utils/whatsappSession.js';

const router = Router();

router.get('/status', async (_req: Request, res: Response) => {
  res.json({
    success: true,
    ...whatsappSession.getSnapshot()
  });
});

router.post('/start', async (_req: Request, res: Response) => {
  const snapshot = await whatsappSession.start();
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
    res.json(result);
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao enviar mensagem no chat.'
    });
  }
});

export default router;
