import path from 'path';
import fs from 'fs/promises';
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
  sessionName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  syncFullHistory?: boolean;
};

type ChatSummary = {
  chatId: string;
  phone: string;
  name: string;
  unreadCount: number;
  lastMessage: string;
  lastTimestamp: number;
  initiatedByClient: boolean;
  labels: string[];
  avatarUrl?: string | null;
};

type ChatMessage = {
  id: string;
  body: string;
  fromMe: boolean;
  timestamp: number;
};

type StartOptions = {
  forceNewSession?: boolean;
  sessionName?: string;
  startDate?: string;
  endDate?: string;
  syncFullHistory?: boolean;
};

type MediaType = 'image' | 'document' | 'audio';

type MediaAttachmentInput = {
  mediaType: MediaType;
  base64Data: string;
  mimeType?: string;
  fileName?: string;
};

type ScheduledMessage = {
  id: string;
  chatId: string;
  message: string;
  scheduleAt: number;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  attachment?: {
    mediaType: MediaType;
    base64Data: string;
    mimeType: string | null;
    fileName: string | null;
  } | null;
  createdAt: number;
  sentAt?: number | null;
  error?: string | null;
};

const hasOwn = (obj: unknown, key: string) =>
  Object.prototype.hasOwnProperty.call(obj ?? {}, key);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class WhatsAppSessionManager {
  private static readonly MAX_CONNECTION_FAILURE_RETRIES = 4;
  private static readonly SCHEDULE_FILE_PATH = path.resolve(__dirname, '../data/whatsapp-schedules.json');

  private sock: any = null;
  private state: SessionState = 'DISCONNECTED';
  private qrDataUrl: string | null = null;
  private phoneNumber: string | null = null;
  private lastError: string | null = null;
  private startPromise: Promise<SessionSnapshot> | null = null;
  private manualStop = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionFailureStreak = 0;
  private scheduleTimer: ReturnType<typeof setInterval> | null = null;
  private scheduledMessages: ScheduledMessage[] = [];

  private chatMap = new Map<string, ChatSummary>();
  private messageMap = new Map<string, ChatMessage[]>();
  private labelCatalog = new Map<string, { id: string; name: string; deleted?: boolean }>();
  private chatLabelMap = new Map<string, Set<string>>();
  private profilePictureMap = new Map<string, string | null>();
  private profilePictureInFlight = new Set<string>();
  private static readonly APP_STATE_PATCHES = ['critical_block', 'critical_unblock_low', 'regular_high', 'regular_low', 'regular'] as const;
  private sessionConfig: {
    sessionName: string | null;
    startDate: string | null;
    endDate: string | null;
    syncFullHistory: boolean;
  } = {
      sessionName: null,
      startDate: null,
      endDate: null,
      syncFullHistory: false
    };

  constructor() {
    this.loadScheduledMessages().catch((err) => {
      this.logWarn('Falha ao carregar mensagens agendadas na inicialização.', err);
    });
    this.scheduleTimer = setInterval(() => {
      this.processScheduledMessages().catch((err) => {
        this.logWarn('Falha no processamento de mensagens agendadas.', err);
      });
    }, 5000);
  }

  private clearInMemoryChats() {
    this.chatMap.clear();
    this.messageMap.clear();
    this.labelCatalog.clear();
    this.chatLabelMap.clear();
    this.profilePictureMap.clear();
    this.profilePictureInFlight.clear();
  }

  private logInfo(message: string, meta?: unknown) {
    console.log(`ℹ️ [WHATSAPP/BAILEYS] ${message}`, meta ?? '');
  }

  private logWarn(message: string, meta?: unknown) {
    console.warn(`⚠️ [WHATSAPP/BAILEYS] ${message}`, meta ?? '');
  }

  private logError(message: string, error?: unknown) {
    console.error(`❌ [WHATSAPP/BAILEYS] ${message}`, error ?? '');
  }

  private decodeBase64Attachment(raw: string) {
    const value = String(raw || '');
    const cleaned = value.includes(',') ? value.split(',').pop() || '' : value;
    return Buffer.from(cleaned, 'base64');
  }

  private async persistScheduledMessages() {
    const payload = JSON.stringify(this.scheduledMessages, null, 2);
    await fs.writeFile(WhatsAppSessionManager.SCHEDULE_FILE_PATH, payload, 'utf-8');
  }

  private async loadScheduledMessages() {
    try {
      const raw = await fs.readFile(WhatsAppSessionManager.SCHEDULE_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      this.scheduledMessages = Array.isArray(parsed)
        ? parsed.map((item: any) => ({
            id: String(item?.id || ''),
            chatId: String(item?.chatId || ''),
            message: String(item?.message || ''),
            scheduleAt: Number(item?.scheduleAt || 0),
            status: ['pending', 'sent', 'failed', 'cancelled'].includes(String(item?.status || ''))
              ? item.status
              : 'pending',
            attachment: item?.attachment && typeof item.attachment === 'object'
              ? {
                  mediaType: String(item.attachment.mediaType || 'document') as MediaType,
                  base64Data: String(item.attachment.base64Data || ''),
                  mimeType: item.attachment.mimeType ? String(item.attachment.mimeType) : null,
                  fileName: item.attachment.fileName ? String(item.attachment.fileName) : null
                }
              : null,
            createdAt: Number(item?.createdAt || Date.now()),
            sentAt: item?.sentAt ? Number(item.sentAt) : null,
            error: item?.error ? String(item.error) : null
          })).filter((item: ScheduledMessage) => item.id && item.chatId && item.scheduleAt > 0)
        : [];
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        this.logWarn('Falha ao ler arquivo de mensagens agendadas.', err);
      }
      this.scheduledMessages = [];
    }
  }

  private async processScheduledMessages() {
    if (this.state !== 'CONNECTED' || !this.sock) return;
    const now = Date.now();
    const due = this.scheduledMessages.filter((item) => item.status === 'pending' && item.scheduleAt <= now);
    if (due.length === 0) return;

    for (const item of due) {
      try {
        if (item.attachment?.base64Data) {
          await this.sendMediaToChat(item.chatId, item.attachment, item.message || '');
        } else {
          await this.sendMessageToChat(item.chatId, item.message || '');
        }
        item.status = 'sent';
        item.sentAt = Date.now();
        item.error = null;
      } catch (err) {
        item.status = 'failed';
        item.error = err instanceof Error ? err.message : 'Falha no envio agendado';
      }
    }

    await this.persistScheduledMessages();
  }

  private stripDeviceSuffix(value: string) {
    return String(value || '').replace(/:[0-9]+$/, '');
  }

  private normalizeExternalNumber(value: string) {
    const raw = this.stripDeviceSuffix(String(value || '').trim());
    const digits = raw.replace(/\D/g, '');
    return digits || raw;
  }

  private setState(next: SessionState) {
    this.state = next;
  }

  private getAuthDir() {
    const requested = String(this.sessionConfig.sessionName || '').trim();
    const slug = requested
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const sessionId = slug || process.env.WHATSAPP_SESSION_ID || 'cantina-smart-admin';
    return path.resolve(__dirname, `../data/whatsapp-auth/${sessionId}`);
  }

  private toExternalChatId(jid: string) {
    const normalizedJid = this.stripDeviceSuffix(String(jid || '').trim());
    return normalizedJid
      .replace('@s.whatsapp.net', '@c.us')
      .replace('@lid', '@c.us');
  }

  private toBaileysJid(chatOrPhone: string) {
    const raw = String(chatOrPhone || '').trim();
    if (!raw) return '';

    if (raw.endsWith('@lid')) {
      return '';
    }
    if (raw.endsWith('@s.whatsapp.net')) {
      return this.stripDeviceSuffix(raw);
    }
    if (raw.endsWith('@c.us')) {
      const base = this.stripDeviceSuffix(raw.replace('@c.us', ''));
      const normalized = this.normalizeExternalNumber(base);
      return `${normalized}@s.whatsapp.net`;
    }

    const digits = this.normalizeExternalNumber(raw);
    if (!digits) return '';
    const withCountry = (digits.length === 10 || digits.length === 11) ? `55${digits}` : digits;
    return `${withCountry}@s.whatsapp.net`;
  }

  private getPhoneFromJid(jid: string) {
    return this.stripDeviceSuffix(String(jid || '')
      .replace('@s.whatsapp.net', '')
      .replace('@lid', '')
      .replace(/:[0-9]+$/, ''));
  }

  private isClientJid(jid: string) {
    const value = String(jid || '');
    return (
      value.endsWith('@s.whatsapp.net')
      && !value.includes('status@broadcast')
    );
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
    const alreadyExists = list.some((message) => message.id === data.id);
    if (alreadyExists) {
      return;
    }
    list.push(data);
    list.sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
    if (list.length > 200) {
      list.splice(0, list.length - 200);
    }
    this.messageMap.set(chatJid, list);
  }

  private upsertChat(chatJid: string, patch: Partial<ChatSummary>) {
    const labelIds = this.chatLabelMap.get(chatJid) || new Set<string>();
    const labels = Array.from(labelIds)
      .map((labelId) => this.labelCatalog.get(labelId))
      .filter((entry) => entry && !entry.deleted)
      .map((entry) => String(entry?.name || '').trim())
      .filter(Boolean);

    const current = this.chatMap.get(chatJid) || {
      chatId: this.toExternalChatId(chatJid),
      phone: this.getPhoneFromJid(chatJid),
      name: this.getPhoneFromJid(chatJid),
      unreadCount: 0,
      lastMessage: '',
      lastTimestamp: 0,
      initiatedByClient: false,
      labels: [],
      avatarUrl: null
    };

    const next: ChatSummary = {
      ...current,
      ...patch,
      chatId: this.toExternalChatId(chatJid),
      phone: this.getPhoneFromJid(chatJid),
      labels,
      avatarUrl: patch.avatarUrl ?? this.profilePictureMap.get(chatJid) ?? current.avatarUrl ?? null
    };

    this.chatMap.set(chatJid, next);
  }

  private async refreshProfilePicture(chatJid: string, force = false) {
    if (!this.sock || !this.isClientJid(chatJid)) return;
    if (!force && this.profilePictureMap.has(chatJid)) return;
    if (this.profilePictureInFlight.has(chatJid)) return;

    this.profilePictureInFlight.add(chatJid);
    try {
      const url = await this.sock.profilePictureUrl(chatJid, 'image');
      this.profilePictureMap.set(chatJid, url || null);
    } catch (_err) {
      this.profilePictureMap.set(chatJid, null);
    } finally {
      this.profilePictureInFlight.delete(chatJid);
      this.upsertChat(chatJid, {});
    }
  }

  private async resyncLabelsFromAppState() {
    if (!this.sock?.resyncAppState) return;
    try {
      this.logInfo('Iniciando resync de App State para sincronizar etiquetas existentes.');
      await this.sock.resyncAppState(WhatsAppSessionManager.APP_STATE_PATCHES, true);
      this.logInfo('Resync de etiquetas concluído.');
    } catch (err) {
      this.logWarn('Falha no resync de etiquetas do App State.', err instanceof Error ? err.message : err);
    }
  }

  private normalizeLabelChatJid(rawChatId: string) {
    const raw = String(rawChatId || '').trim();
    if (!raw) return '';
    if (raw.endsWith('@s.whatsapp.net')) {
      return this.stripDeviceSuffix(raw);
    }
    if (raw.endsWith('@lid')) return '';
    if (raw.endsWith('@c.us')) {
      const base = this.stripDeviceSuffix(raw.replace('@c.us', ''));
      const normalized = this.normalizeExternalNumber(base);
      return normalized ? `${normalized}@s.whatsapp.net` : '';
    }
    return this.toBaileysJid(raw);
  }

  private async sendMessageWithTimeout(jid: string, text: string, timeoutMs = 15000) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Timeout ao enviar mensagem (${timeoutMs}ms)`)), timeoutMs);
    });

    return Promise.race([
      this.sock.sendMessage(jid, { text }),
      timeoutPromise
    ]) as Promise<any>;
  }

  private async sendMediaMessageWithTimeout(
    jid: string,
    attachment: MediaAttachmentInput,
    caption = '',
    timeoutMs = 25000
  ) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Timeout ao enviar anexo (${timeoutMs}ms)`)), timeoutMs);
    });

    const fileBuffer = this.decodeBase64Attachment(attachment.base64Data);
    const mimeType = String(attachment.mimeType || '').trim();
    const fileName = String(attachment.fileName || '').trim() || 'arquivo';
    const textCaption = String(caption || '').trim();

    let payload: any;
    if (attachment.mediaType === 'image') {
      payload = { image: fileBuffer, caption: textCaption };
    } else if (attachment.mediaType === 'audio') {
      payload = { audio: fileBuffer, mimetype: mimeType || 'audio/ogg; codecs=opus', ptt: false };
    } else {
      payload = { document: fileBuffer, mimetype: mimeType || 'application/octet-stream', fileName, caption: textCaption };
    }

    return Promise.race([
      this.sock.sendMessage(jid, payload),
      timeoutPromise
    ]) as Promise<any>;
  }

  private async resolveRecipientJid(baseJid: string) {
    const normalized = this.toBaileysJid(baseJid);
    if (!normalized) {
      throw new Error('Destinatário inválido para envio.');
    }

    const phone = this.getPhoneFromJid(normalized);
    const lookupJid = `${phone}@s.whatsapp.net`;

    try {
      const result = await this.sock.onWhatsApp(lookupJid);
      const first = Array.isArray(result) ? result[0] : null;
      const exists = Boolean(first?.exists);
      const resolvedJid = String(first?.jid || normalized);

      if (!exists) {
        throw new Error(`Número ${phone} não foi encontrado no WhatsApp.`);
      }

      this.logInfo('Destinatário resolvido via onWhatsApp.', {
        lookupJid,
        resolvedJid,
        exists
      });

      return resolvedJid;
    } catch (err) {
      this.logWarn('Falha ao resolver destinatário via onWhatsApp. Usando jid normalizado.', {
        lookupJid,
        normalized,
        error: err instanceof Error ? err.message : String(err)
      });
      return normalized;
    }
  }

  getSnapshot(): SessionSnapshot {
    return {
      state: this.state,
      connected: this.state === 'CONNECTED',
      qrAvailable: Boolean(this.qrDataUrl),
      qrDataUrl: this.qrDataUrl,
      phoneNumber: this.phoneNumber,
      lastError: this.lastError,
      sessionName: this.sessionConfig.sessionName,
      startDate: this.sessionConfig.startDate,
      endDate: this.sessionConfig.endDate,
      syncFullHistory: this.sessionConfig.syncFullHistory,
    };
  }

  private async clearPersistedSession() {
    const authDir = this.getAuthDir();
    await fs.rm(authDir, { recursive: true, force: true });
    this.logWarn('Sessão persistida removida para forçar novo QR Code.', { authDir });
  }

  async start(options: StartOptions = {}) {
    const nextSessionName = hasOwn(options, 'sessionName')
      ? (String(options.sessionName || '').trim() || null)
      : this.sessionConfig.sessionName;
    const nextStartDate = hasOwn(options, 'startDate')
      ? (String(options.startDate || '').trim() || null)
      : this.sessionConfig.startDate;
    const nextEndDate = hasOwn(options, 'endDate')
      ? (String(options.endDate || '').trim() || null)
      : this.sessionConfig.endDate;
    const nextSyncFullHistory = hasOwn(options, 'syncFullHistory')
      ? Boolean(options.syncFullHistory)
      : this.sessionConfig.syncFullHistory;

    this.sessionConfig = {
      sessionName: nextSessionName,
      startDate: nextStartDate,
      endDate: nextEndDate,
      syncFullHistory: nextSyncFullHistory
    };

    if (this.startPromise) return this.startPromise;
    this.startPromise = this.startInternal(options);
    try {
      return await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  private async startInternal(options: StartOptions = {}) {
    if (this.sock && this.state === 'CONNECTED') {
      this.logInfo('Sessão já está conectada, reutilizando estado atual.');
      return this.getSnapshot();
    }

    try {
      this.manualStop = false;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.lastError = null;
      this.qrDataUrl = null;
      this.phoneNumber = null;
      this.setState('INITIALIZING');

      if (this.sock?.ws) {
        try {
          this.sock.ws.close();
        } catch (err) {
          this.logWarn('Erro ao fechar socket anterior antes de reiniciar sessão.', err);
        }
      }
      this.sock = null;

      if (options.forceNewSession) {
        await this.clearPersistedSession();
      }

      const authDir = this.getAuthDir();
      await fs.mkdir(authDir, { recursive: true });
      this.logInfo('Inicializando sessão WhatsApp.', { authDir, forceNewSession: Boolean(options.forceNewSession) });
      const { state, saveCreds } = await useMultiFileAuthState(authDir);
      const { version } = await fetchLatestBaileysVersion();

      const sock = makeWASocket({
        auth: state,
        version,
        printQRInTerminal: false,
        logger: P({ level: 'silent' }),
        browser: ['Cantina Smart', 'Chrome', '1.0.0'],
        syncFullHistory: this.sessionConfig.syncFullHistory,
        markOnlineOnConnect: false
      });
      this.sock = sock;

      sock.ev.on('creds.update', async () => {
        if (this.sock !== sock) return;
        try {
          await saveCreds();
          this.logInfo('Credenciais da sessão persistidas com sucesso.');
        } catch (err) {
          this.lastError = err instanceof Error ? err.message : 'Falha ao persistir credenciais';
          this.logError('Erro ao persistir credenciais da sessão.', err);
        }
      });

      sock.ev.on('connection.update', async (update: any) => {
        if (this.sock !== sock && update?.connection !== 'close') {
          return;
        }
        const connection = update?.connection;
        const qr = update?.qr;

        if (qr) {
          try {
            this.qrDataUrl = await qrcode.toDataURL(qr, { margin: 1, scale: 6 });
            this.lastError = null;
            this.setState('QR_READY');
            this.logInfo('QR gerado e pronto para escaneamento.');
          } catch (err) {
            this.qrDataUrl = null;
            this.lastError = err instanceof Error ? err.message : 'Falha ao gerar QR Code';
            this.setState('ERROR');
            this.logError('Erro ao converter QR Code em data URL.', err);
          }
        }

        if (connection === 'open') {
          if (this.sock !== sock) return;
          if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
          }
          this.connectionFailureStreak = 0;
          this.qrDataUrl = null;
          this.lastError = null;
          this.setState('CONNECTED');
          const jid = String(sock?.user?.id || '');
          this.phoneNumber = jid ? `+${this.getPhoneFromJid(jid)}` : null;
          this.logInfo(`Conectado ${this.phoneNumber ? `(${this.phoneNumber})` : ''}`);
          setTimeout(() => {
            this.resyncLabelsFromAppState().catch(() => {});
          }, 1200);
        }

        if (connection === 'close') {
          if (this.sock !== sock) {
            return;
          }
          const code = Number(update?.lastDisconnect?.error?.output?.statusCode || 0);
          const reasonText = String(update?.lastDisconnect?.error?.message || '').toLowerCase();
          const connectionFailure401 =
            code === DisconnectReason.loggedOut
            && (reasonText.includes('connection failure') || reasonText.includes('stream errored'));
          const loggedOut = code === DisconnectReason.loggedOut && !connectionFailure401;
          const shouldReconnect =
            code === DisconnectReason.restartRequired
            || code === DisconnectReason.connectionClosed
            || code === DisconnectReason.connectionLost
            || code === DisconnectReason.timedOut
            || connectionFailure401;

          this.sock = null;
          this.qrDataUrl = null;
          this.phoneNumber = null;

          this.logWarn('Conexão encerrada.', {
            code,
            loggedOut,
            shouldReconnect,
            connectionFailureStreak: this.connectionFailureStreak,
            manualStop: this.manualStop,
            reason: update?.lastDisconnect?.error?.message || null
          });

          if (this.manualStop || loggedOut) {
            this.connectionFailureStreak = 0;
            this.setState('DISCONNECTED');
            this.lastError = loggedOut ? 'Sessão desconectada (logout).' : null;
            return;
          }

          if (shouldReconnect) {
            if (connectionFailure401) {
              this.connectionFailureStreak += 1;
            } else {
              this.connectionFailureStreak = 0;
            }

            if (this.connectionFailureStreak >= WhatsAppSessionManager.MAX_CONNECTION_FAILURE_RETRIES) {
              this.logWarn('Muitas falhas 401 consecutivas. Forçando limpeza da sessão para gerar novo QR.', {
                retries: this.connectionFailureStreak,
                authDir: this.getAuthDir()
              });
              this.connectionFailureStreak = 0;
              this.lastError = 'Sessão inválida detectada. Gere e escaneie um novo QR Code.';
              this.setState('INITIALIZING');
              if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
              }
              this.reconnectTimer = setTimeout(() => {
                this.reconnectTimer = null;
                if (!this.manualStop) {
                  this.start({ forceNewSession: true }).catch((err) => {
                    this.lastError = err instanceof Error ? err.message : 'Falha ao renovar sessão';
                    this.setState('ERROR');
                    this.logError('Erro ao forçar nova sessão após falhas de conexão.', err);
                  });
                }
              }, 600);
              return;
            }

            this.lastError = null;
            this.setState('INITIALIZING');
            if (this.reconnectTimer) {
              clearTimeout(this.reconnectTimer);
            }
            this.reconnectTimer = setTimeout(() => {
              this.reconnectTimer = null;
              if (!this.manualStop) {
                this.start().catch((err) => {
                  this.lastError = err instanceof Error ? err.message : 'Falha ao reconectar';
                  this.setState('ERROR');
                  this.logError('Erro na tentativa de reconexão automática.', err);
                });
              }
            }, 500);
            return;
          }

          this.lastError = update?.lastDisconnect?.error?.message || 'Conexão encerrada';
          this.setState('ERROR');
          this.logError('Sessão encerrada em estado de erro.', update?.lastDisconnect?.error);
        }
      });

      sock.ev.on('messages.upsert', (payload: any) => {
        if (this.sock !== sock) return;
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
          this.refreshProfilePicture(remoteJid).catch(() => {});
        }
      });

      sock.ev.on('chats.upsert', (chats: any[]) => {
        if (this.sock !== sock) return;
        for (const chat of Array.isArray(chats) ? chats : []) {
          const jid = String(chat?.id || '');
          if (!this.isClientJid(jid)) continue;
          const existing = this.chatMap.get(jid);
          this.upsertChat(jid, {
            name: String(chat?.name || existing?.name || this.getPhoneFromJid(jid)),
            unreadCount: Number(chat?.unreadCount ?? existing?.unreadCount ?? 0),
            lastTimestamp: Number(chat?.conversationTimestamp ?? existing?.lastTimestamp ?? 0)
          });
          this.refreshProfilePicture(jid).catch(() => {});
        }
      });

      sock.ev.on('chats.update', (chats: any[]) => {
        if (this.sock !== sock) return;
        for (const chat of Array.isArray(chats) ? chats : []) {
          const jid = String(chat?.id || '');
          if (!this.isClientJid(jid)) continue;
          const existing = this.chatMap.get(jid);
          this.upsertChat(jid, {
            name: String(chat?.name || existing?.name || this.getPhoneFromJid(jid)),
            unreadCount: Number(chat?.unreadCount ?? existing?.unreadCount ?? 0),
            lastTimestamp: Number(chat?.conversationTimestamp ?? existing?.lastTimestamp ?? 0)
          });
          this.refreshProfilePicture(jid).catch(() => {});
        }
      });

      sock.ev.on('contacts.update', (updates: any[]) => {
        if (this.sock !== sock) return;
        for (const update of Array.isArray(updates) ? updates : []) {
          const jid = this.toBaileysJid(String(update?.id || ''));
          if (!jid || !this.isClientJid(jid)) continue;

          const imgUrl = String(update?.imgUrl || '').trim();
          if (imgUrl) {
            this.profilePictureMap.set(jid, imgUrl);
            this.upsertChat(jid, {});
          }
        }
      });

      sock.ev.on('labels.edit', (label: any) => {
        if (this.sock !== sock) return;
        const id = String(label?.id || '').trim();
        if (!id) return;
        this.labelCatalog.set(id, {
          id,
          name: String(label?.name || '').trim(),
          deleted: Boolean(label?.deleted)
        });

        // Refresh labels in all chats where this label is associated
        for (const jid of this.chatLabelMap.keys()) {
          this.upsertChat(jid, {});
        }
      });

      sock.ev.on('labels.association', (payload: any) => {
        if (this.sock !== sock) return;
        const association = payload?.association || {};
        const type = String(payload?.type || '').toLowerCase();
        const associationType = String(association?.type || '');
        const chatId = String(association?.chatId || '').trim();
        const labelId = String(association?.labelId || '').trim();
        if (!chatId || !labelId) return;
        if (associationType !== 'label_jid' && associationType !== 'label_message') return;

        const chatJid = this.normalizeLabelChatJid(chatId);
        if (!chatJid) {
          this.logWarn('Etiqueta recebida, mas chatId não pôde ser normalizado.', { chatId, labelId, associationType });
          return;
        }

        const applyLabel = (jid: string) => {
          const current = this.chatLabelMap.get(jid) || new Set<string>();
          if (type === 'remove') {
            current.delete(labelId);
          } else {
            current.add(labelId);
          }
          this.chatLabelMap.set(jid, current);
          this.upsertChat(jid, {});
        };

        applyLabel(chatJid);

        // Propaga para aliases da mesma conversa (ex.: @c.us / @s.whatsapp.net / variações)
        const targetExternal = this.toExternalChatId(chatJid);
        const targetPhone = this.getPhoneFromJid(chatJid);
        for (const existingJid of this.chatMap.keys()) {
          if (existingJid === chatJid) continue;
          const sameExternal = this.toExternalChatId(existingJid) === targetExternal;
          const samePhone = targetPhone && this.getPhoneFromJid(existingJid) === targetPhone;
          if (sameExternal || samePhone) {
            applyLabel(existingJid);
          }
        }
      });

      return this.getSnapshot();
    } catch (err) {
      this.sock = null;
      this.lastError = err instanceof Error ? err.message : 'Falha ao iniciar sessão WhatsApp';
      this.setState('ERROR');
      this.logError('Erro ao iniciar sessão.', err);
      return this.getSnapshot();
    }
  }

  async initializeOnBoot() {
    const shouldAutoStart = String(process.env.WHATSAPP_AUTO_START || 'true').toLowerCase() !== 'false';
    if (!shouldAutoStart) {
      this.logInfo('Inicialização automática desativada por configuração.');
      return this.getSnapshot();
    }

    this.logInfo('Inicialização automática da sessão habilitada.');
    return this.start();
  }

  async stop() {
    this.manualStop = true;
    this.connectionFailureStreak = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      if (this.sock) {
        try {
          await this.sock.logout();
          this.logInfo('Logout da sessao WhatsApp executado.');
        } catch (logoutErr) {
          this.logWarn('Falha no logout da sessao WhatsApp, tentando encerrar socket.', logoutErr);
        }
      }

      if (this.sock?.ws) {
        this.sock.ws.close();
      }
    } catch (err) {
      this.logError('Erro ao encerrar sessão.', err);
    } finally {
      this.sock = null;
      this.qrDataUrl = null;
      this.phoneNumber = null;
      this.lastError = null;
      this.clearInMemoryChats();
      this.setState('DISCONNECTED');
      this.logInfo('Sessão encerrada e estado local limpo.');
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

    const jid = await this.resolveRecipientJid(phone);
    if (!jid) throw new Error('Telefone inválido.');
    this.logInfo('Enviando mensagem por telefone.', {
      phone,
      normalizedJid: jid,
      messageLength: String(message || '').length
    });

    const sent = await this.sendMessageWithTimeout(jid, String(message || ''));

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
      .filter((chat) => String(chat.chatId || '').endsWith('@c.us'))
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

  async deleteChat(chatId: string) {
    const jid = this.toBaileysJid(chatId);
    if (!jid || !this.isClientJid(jid)) {
      throw new Error('Chat inválido para exclusão.');
    }

    const existedChat = this.chatMap.delete(jid);
    const existedMessages = this.messageMap.delete(jid);

    return {
      success: true,
      chatId: this.toExternalChatId(jid),
      deleted: Boolean(existedChat || existedMessages)
    };
  }

  async sendMessageToChat(chatId: string, message: string) {
    this.ensureConnected();
    const jid = await this.resolveRecipientJid(chatId);
    if (!jid || !this.isClientJid(jid)) throw new Error('Chat inválido.');
    const text = String(message || '');
    this.logInfo('Enviando mensagem para conversa.', {
      chatId,
      normalizedJid: jid,
      messageLength: text.length
    });

    try {
      const sent = await this.sendMessageWithTimeout(jid, text);
      const timestamp = Math.floor(Date.now() / 1000);
      const msgId = String(sent?.key?.id || `${timestamp}_${Math.random()}`);

      this.pushMessage(jid, {
        id: msgId,
        body: text,
        fromMe: true,
        timestamp
      });

      const existing = this.chatMap.get(jid);
      this.upsertChat(jid, {
        lastMessage: text,
        lastTimestamp: timestamp,
        unreadCount: Number(existing?.unreadCount || 0)
      });

      const result = {
        success: true,
        chatId: this.toExternalChatId(jid),
        messageId: msgId
      };
      this.logInfo('Mensagem enviada com sucesso para conversa.', result);
      return result;
    } catch (err) {
      this.logWarn('Falha ao enviar por chatId. Tentando fallback por telefone.', {
        chatId,
        normalizedJid: jid,
        error: err instanceof Error ? err.message : String(err)
      });

      const fallbackPhone = this.getPhoneFromJid(jid);
      const fallbackResult = await this.sendMessage(fallbackPhone, text);
      this.logInfo('Mensagem enviada via fallback por telefone.', fallbackResult);
      return {
        ...fallbackResult,
        fallbackUsed: true
      };
    }
  }

  async sendMediaToChat(chatId: string, attachment: MediaAttachmentInput, caption = '') {
    this.ensureConnected();
    const jid = await this.resolveRecipientJid(chatId);
    if (!jid || !this.isClientJid(jid)) throw new Error('Chat inválido.');
    if (!attachment?.base64Data || !attachment?.mediaType) {
      throw new Error('Anexo inválido.');
    }

    const sent = await this.sendMediaMessageWithTimeout(jid, attachment, caption);
    const timestamp = Math.floor(Date.now() / 1000);
    const msgId = String(sent?.key?.id || `${timestamp}_${Math.random()}`);
    const fileName = String(attachment.fileName || '').trim();
    const preview = caption?.trim()
      || (fileName ? `[Arquivo enviado: ${fileName}]` : '[Arquivo enviado]');

    this.pushMessage(jid, {
      id: msgId,
      body: preview,
      fromMe: true,
      timestamp
    });

    const existing = this.chatMap.get(jid);
    this.upsertChat(jid, {
      lastMessage: preview,
      lastTimestamp: timestamp,
      unreadCount: Number(existing?.unreadCount || 0)
    });

    return {
      success: true,
      chatId: this.toExternalChatId(jid),
      messageId: msgId
    };
  }

  async scheduleMessage(input: {
    chatId: string;
    message?: string;
    scheduleAt: string | number;
    attachment?: MediaAttachmentInput | null;
  }) {
    const chatId = String(input.chatId || '').trim();
    if (!chatId) throw new Error('Informe o chatId para agendamento.');

    const scheduleAtMs = typeof input.scheduleAt === 'number'
      ? Number(input.scheduleAt)
      : new Date(String(input.scheduleAt || '')).getTime();
    if (!Number.isFinite(scheduleAtMs) || scheduleAtMs <= Date.now()) {
      throw new Error('Informe uma data/hora futura para agendamento.');
    }

    const message = String(input.message || '');
    const attachment = input.attachment && input.attachment.base64Data
      ? {
          mediaType: input.attachment.mediaType,
          base64Data: String(input.attachment.base64Data || ''),
          mimeType: String(input.attachment.mimeType || '').trim() || null,
          fileName: String(input.attachment.fileName || '').trim() || null
        }
      : null;

    if (!message.trim() && !attachment) {
      throw new Error('Informe uma mensagem ou anexo para agendar.');
    }

    const item: ScheduledMessage = {
      id: `wa_sched_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
      chatId,
      message,
      scheduleAt: scheduleAtMs,
      status: 'pending',
      attachment,
      createdAt: Date.now(),
      sentAt: null,
      error: null
    };

    this.scheduledMessages.push(item);
    this.scheduledMessages.sort((a, b) => Number(a.scheduleAt || 0) - Number(b.scheduleAt || 0));
    await this.persistScheduledMessages();

    return {
      success: true,
      scheduled: item
    };
  }

  getScheduledMessages(chatId?: string) {
    const normalizedChatId = String(chatId || '').trim();
    return this.scheduledMessages
      .filter((item) => !normalizedChatId || item.chatId === normalizedChatId)
      .sort((a, b) => Number(a.scheduleAt || 0) - Number(b.scheduleAt || 0));
  }

  async cancelScheduledMessage(id: string) {
    const targetId = String(id || '').trim();
    const target = this.scheduledMessages.find((item) => item.id === targetId);
    if (!target) throw new Error('Agendamento não encontrado.');
    if (target.status === 'sent') throw new Error('Não é possível cancelar mensagem já enviada.');

    target.status = 'cancelled';
    target.error = null;
    await this.persistScheduledMessages();

    return {
      success: true,
      id: target.id,
      status: target.status
    };
  }
}

export const whatsappSession = new WhatsAppSessionManager();
