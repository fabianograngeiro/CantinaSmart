import path from 'path';
import { fileURLToPath } from 'url';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode';
import P from 'pino';

type SessionState = 'DISCONNECTED' | 'INITIALIZING' | 'QR_READY' | 'CONNECTED' | 'ERROR';

type SessionSnapshot = {
  state: SessionState;
  connected: boolean;
  qrAvailable: boolean;
  qrDataUrl: string | null;
  phoneNumber: string | null;
  lastError: string | null;
};

type ChatSummary = {
  chatId: string;
  phone: string;
  name: string;
  unreadCount: number;
  lastMessage: string;
  lastTimestamp: number;
  initiatedByClient: boolean;
};

type ChatMessage = {
  id: string;
  body: string;
  fromMe: boolean;
  timestamp: number;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class WhatsAppSessionManager {
  private sock: any = null;
  private state: SessionState = 'DISCONNECTED';
  private qrDataUrl: string | null = null;
  private phoneNumber: string | null = null;
  private lastError: string | null = null;
  private startPromise: Promise<SessionSnapshot> | null = null;
  private manualStop = false;

  private chatMap = new Map<string, ChatSummary>();
  private messageMap = new Map<string, ChatMessage[]>();

  private setState(next: SessionState) {
    this.state = next;
  }

  private toExternalChatId(jid: string) {
    return String(jid || '').replace('@s.whatsapp.net', '@c.us');
  }

  private toBaileysJid(chatOrPhone: string) {
    const raw = String(chatOrPhone || '').trim();
    if (!raw) return '';

    if (raw.endsWith('@s.whatsapp.net')) return raw;
    if (raw.endsWith('@c.us')) {
      return raw.replace('@c.us', '@s.whatsapp.net');
    }

    const digits = raw.replace(/\D/g, '');
    if (!digits) return '';
    const withCountry = (digits.length === 10 || digits.length === 11) ? `55${digits}` : digits;
    return `${withCountry}@s.whatsapp.net`;
  }

  private getPhoneFromJid(jid: string) {
    return String(jid || '')
      .replace('@s.whatsapp.net', '')
      .replace(/:[0-9]+$/, '');
  }

  private isClientJid(jid: string) {
    return jid.endsWith('@s.whatsapp.net') && !jid.includes('status@broadcast');
  }

  private extractBody(msg: any) {
    const message = msg?.message || {};
    return String(
      message?.conversation
      || message?.extendedTextMessage?.text
      || message?.imageMessage?.caption
      || message?.videoMessage?.caption
      || message?.documentMessage?.caption
      || message?.buttonsResponseMessage?.selectedDisplayText
      || message?.listResponseMessage?.title
      || ''
    ).trim();
  }

  private pushMessage(chatJid: string, data: ChatMessage) {
    const list = this.messageMap.get(chatJid) || [];
    list.push(data);
    if (list.length > 200) {
      list.splice(0, list.length - 200);
    }
    this.messageMap.set(chatJid, list);
  }

  private upsertChat(chatJid: string, patch: Partial<ChatSummary>) {
    const current = this.chatMap.get(chatJid) || {
      chatId: this.toExternalChatId(chatJid),
      phone: this.getPhoneFromJid(chatJid),
      name: this.getPhoneFromJid(chatJid),
      unreadCount: 0,
      lastMessage: '',
      lastTimestamp: 0,
      initiatedByClient: false
    };

    const next: ChatSummary = {
      ...current,
      ...patch,
      chatId: this.toExternalChatId(chatJid),
      phone: this.getPhoneFromJid(chatJid)
    };

    this.chatMap.set(chatJid, next);
  }

  getSnapshot(): SessionSnapshot {
    return {
      state: this.state,
      connected: this.state === 'CONNECTED',
      qrAvailable: Boolean(this.qrDataUrl),
      qrDataUrl: this.qrDataUrl,
      phoneNumber: this.phoneNumber,
      lastError: this.lastError,
    };
  }

  async start() {
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.startInternal();
    try {
      return await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  private async startInternal() {
    if (this.sock && this.state === 'CONNECTED') {
      return this.getSnapshot();
    }

    try {
      this.manualStop = false;
      this.lastError = null;
      this.setState('INITIALIZING');

      const sessionId = process.env.WHATSAPP_SESSION_ID || 'cantina-smart-admin';
      const authDir = path.resolve(__dirname, `../data/.baileys_auth/${sessionId}`);
      const { state, saveCreds } = await useMultiFileAuthState(authDir);
      const { version } = await fetchLatestBaileysVersion();

      this.sock = makeWASocket({
        auth: state,
        version,
        printQRInTerminal: false,
        logger: P({ level: 'silent' }),
        browser: ['Cantina Smart', 'Chrome', '1.0.0'],
        syncFullHistory: false,
        markOnlineOnConnect: false
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update: any) => {
        const connection = update?.connection;
        const qr = update?.qr;

        if (qr) {
          this.qrDataUrl = await qrcode.toDataURL(qr, { margin: 1, scale: 6 });
          this.lastError = null;
          this.setState('QR_READY');
          console.log('📲 [WHATSAPP/BAILEYS] QR gerado e pronto para escaneamento.');
        }

        if (connection === 'open') {
          this.qrDataUrl = null;
          this.lastError = null;
          this.setState('CONNECTED');
          const jid = String(this.sock?.user?.id || '');
          this.phoneNumber = jid ? `+${this.getPhoneFromJid(jid)}` : null;
          console.log(`✅ [WHATSAPP/BAILEYS] Conectado ${this.phoneNumber ? `(${this.phoneNumber})` : ''}`);
        }

        if (connection === 'close') {
          const code = Number(update?.lastDisconnect?.error?.output?.statusCode || 0);
          const loggedOut = code === DisconnectReason.loggedOut;
          const shouldReconnect =
            code === DisconnectReason.restartRequired
            || code === DisconnectReason.connectionClosed
            || code === DisconnectReason.connectionLost
            || code === DisconnectReason.timedOut;

          this.sock = null;
          this.qrDataUrl = null;
          this.phoneNumber = null;

          if (this.manualStop || loggedOut) {
            this.setState('DISCONNECTED');
            this.lastError = loggedOut ? 'Sessão desconectada (logout).' : null;
            return;
          }

          if (shouldReconnect) {
            this.lastError = null;
            this.setState('INITIALIZING');
            setTimeout(() => {
              if (!this.manualStop) {
                this.start().catch((err) => {
                  this.lastError = err instanceof Error ? err.message : 'Falha ao reconectar';
                  this.setState('ERROR');
                });
              }
            }, 500);
            return;
          }

          this.lastError = update?.lastDisconnect?.error?.message || 'Conexão encerrada';
          this.setState('ERROR');
        }
      });

      this.sock.ev.on('messages.upsert', (payload: any) => {
        const msgs = Array.isArray(payload?.messages) ? payload.messages : [];

        for (const msg of msgs) {
          const remoteJid = String(msg?.key?.remoteJid || '');
          if (!this.isClientJid(remoteJid)) continue;

          const fromMe = Boolean(msg?.key?.fromMe);
          const timestamp = Number(msg?.messageTimestamp || Math.floor(Date.now() / 1000));
          const body = this.extractBody(msg);
          const msgId = String(msg?.key?.id || `${timestamp}_${Math.random()}`);

          this.pushMessage(remoteJid, {
            id: msgId,
            body,
            fromMe,
            timestamp
          });

          const existing = this.chatMap.get(remoteJid);
          this.upsertChat(remoteJid, {
            name: String(msg?.pushName || existing?.name || this.getPhoneFromJid(remoteJid)),
            lastMessage: body || existing?.lastMessage || '',
            lastTimestamp: timestamp,
            unreadCount: fromMe ? Number(existing?.unreadCount || 0) : Number(existing?.unreadCount || 0) + 1,
            initiatedByClient: fromMe ? Boolean(existing?.initiatedByClient) : true
          });
        }
      });

      this.sock.ev.on('chats.upsert', (chats: any[]) => {
        for (const chat of Array.isArray(chats) ? chats : []) {
          const jid = String(chat?.id || '');
          if (!this.isClientJid(jid)) continue;
          const existing = this.chatMap.get(jid);
          this.upsertChat(jid, {
            name: String(chat?.name || existing?.name || this.getPhoneFromJid(jid)),
            unreadCount: Number(chat?.unreadCount ?? existing?.unreadCount ?? 0),
            lastTimestamp: Number(chat?.conversationTimestamp ?? existing?.lastTimestamp ?? 0)
          });
        }
      });

      this.sock.ev.on('chats.update', (chats: any[]) => {
        for (const chat of Array.isArray(chats) ? chats : []) {
          const jid = String(chat?.id || '');
          if (!this.isClientJid(jid)) continue;
          const existing = this.chatMap.get(jid);
          this.upsertChat(jid, {
            name: String(chat?.name || existing?.name || this.getPhoneFromJid(jid)),
            unreadCount: Number(chat?.unreadCount ?? existing?.unreadCount ?? 0),
            lastTimestamp: Number(chat?.conversationTimestamp ?? existing?.lastTimestamp ?? 0)
          });
        }
      });

      return this.getSnapshot();
    } catch (err) {
      this.sock = null;
      this.lastError = err instanceof Error ? err.message : 'Falha ao iniciar sessão WhatsApp';
      this.setState('ERROR');
      console.error('❌ [WHATSAPP/BAILEYS] Erro ao iniciar sessão:', err);
      return this.getSnapshot();
    }
  }

  async stop() {
    this.manualStop = true;
    try {
      if (this.sock?.ws) {
        this.sock.ws.close();
      }
    } catch (err) {
      console.error('⚠️ [WHATSAPP/BAILEYS] Erro ao encerrar sessão:', err);
    } finally {
      this.sock = null;
      this.qrDataUrl = null;
      this.phoneNumber = null;
      this.lastError = null;
      this.setState('DISCONNECTED');
    }
    return this.getSnapshot();
  }

  private ensureConnected() {
    if (!this.sock || this.state !== 'CONNECTED') {
      throw new Error('WhatsApp não conectado.');
    }
  }

  async sendMessage(phone: string, message: string) {
    this.ensureConnected();

    const jid = this.toBaileysJid(phone);
    if (!jid) throw new Error('Telefone inválido.');

    const sent = await this.sock.sendMessage(jid, { text: String(message || '') });

    const timestamp = Math.floor(Date.now() / 1000);
    const msgId = String(sent?.key?.id || `${timestamp}_${Math.random()}`);
    this.pushMessage(jid, { id: msgId, body: String(message || ''), fromMe: true, timestamp });

    const existing = this.chatMap.get(jid);
    this.upsertChat(jid, {
      lastMessage: String(message || ''),
      lastTimestamp: timestamp,
      unreadCount: Number(existing?.unreadCount || 0)
    });

    return {
      success: true,
      phone: this.getPhoneFromJid(jid),
      chatId: this.toExternalChatId(jid),
      messageId: msgId
    };
  }

  async getClientChats(): Promise<ChatSummary[]> {
    this.ensureConnected();
    return Array.from(this.chatMap.values())
      .filter((chat) => chat.initiatedByClient)
      .sort((a, b) => Number(b.lastTimestamp || 0) - Number(a.lastTimestamp || 0))
      .slice(0, 120);
  }

  async getChatMessages(chatId: string, limit = 80): Promise<ChatMessage[]> {
    this.ensureConnected();
    const jid = this.toBaileysJid(chatId);
    if (!jid || !this.isClientJid(jid)) throw new Error('Chat inválido.');

    const messages = this.messageMap.get(jid) || [];
    const safeLimit = Math.max(10, Math.min(200, Number(limit) || 80));
    return messages.slice(-safeLimit);
  }

  async sendMessageToChat(chatId: string, message: string) {
    this.ensureConnected();
    const jid = this.toBaileysJid(chatId);
    if (!jid || !this.isClientJid(jid)) throw new Error('Chat inválido.');

    const sent = await this.sock.sendMessage(jid, { text: String(message || '') });
    const timestamp = Math.floor(Date.now() / 1000);
    const msgId = String(sent?.key?.id || `${timestamp}_${Math.random()}`);

    this.pushMessage(jid, {
      id: msgId,
      body: String(message || ''),
      fromMe: true,
      timestamp
    });

    const existing = this.chatMap.get(jid);
    this.upsertChat(jid, {
      lastMessage: String(message || ''),
      lastTimestamp: timestamp,
      unreadCount: Number(existing?.unreadCount || 0)
    });

    return {
      success: true,
      chatId: this.toExternalChatId(jid),
      messageId: msgId
    };
  }
}

export const whatsappSession = new WhatsAppSessionManager();
