import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import makeWASocket, {
  downloadContentFromMessage,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode';
import P from 'pino';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { db } from '../database.js';

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
  mediaType?: MediaType | null;
  mimeType?: string | null;
  fileName?: string | null;
  mediaDataUrl?: string | null;
  location?: {
    latitude: number;
    longitude: number;
    name?: string | null;
    address?: string | null;
    url?: string | null;
    mapThumbnailDataUrl?: string | null;
  } | null;
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

type SendChatOptions = {
  source?: 'human' | 'ai' | 'system';
  disableAiAgentOnHumanSend?: boolean;
};

type ExtractedMedia = {
  mediaType: MediaType;
  mimeType: string | null;
  fileName: string | null;
  mediaDataUrl: string | null;
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

type AiProvider = 'openai' | 'gemini' | 'groq';
type AiContextActionType = 'RESPONDER_CLIENTE' | 'ATENDIMENTO_HUMANO';
type AiContextRoutingMode = 'DIRECT' | 'INTENT_SWITCH';

type AiDatabaseSearchToolResult = {
  tool: string;
  summary: string;
  total: number;
  items: Array<Record<string, unknown>>;
};

type AiSubSwitchItem = {
  id: number;
  name: string;
  description: string;
  enabled: boolean;
  conditionKeywords: string[];
  dataSelections: string[];
  responsePrompt: string;
};

type AiContextItem = {
  id: number;
  name: string;
  description: string;
  enabled: boolean;
  conditionKeywords: string[];
  prompt: string;
  responsePrompt: string;
  dataSelections: string[];
  actionType: AiContextActionType;
  routingMode: AiContextRoutingMode;
  subSwitches: AiSubSwitchItem[];
};

type AiToolsConfig = {
  dbStats: boolean;
  companyInfo: boolean;
  businessHours: boolean;
  searchClients: boolean;
  searchProducts: boolean;
  searchPlans: boolean;
  searchPlanValues: boolean;
  searchMenu: boolean;
  searchNutritionalBase: boolean;
  searchAvailableProducts: boolean;
  searchTransactions: boolean;
  searchOrders: boolean;
  autoSendPdfReport: boolean;
};

type AiConfig = {
  provider: AiProvider;
  model: string;
  openAiToken: string;
  geminiToken: string;
  groqToken: string;
  sttEnabled: boolean;
  sttModel: string;
  companyName: string;
  assistantName: string;
  tools: AiToolsConfig;
  onlyOutsideBusinessHours: boolean;
  responseDelaySeconds: number;
  conversationSessionMinutes: number;
  globalPrompt: string;
  contexts: AiContextItem[];
};

type AiConversationSession = {
  lastActivityAt: number;
  targetClientId?: string | null;
  outsideHoursIntroSent?: boolean;
  pendingIntentLearning?: {
    askedAt: number;
    sourceMessage: string;
  } | null;
  history: Array<{
    from: 'client' | 'assistant';
    text: string;
    timestamp: number;
  }>;
};

type AiCachedPlanEntry = {
  planName: string;
  balance: number;
};

type AiCachedProductEntry = {
  name: string;
  price: number;
  description?: string;
  category?: string;
};

type AiCachedTransactionEntry = {
  amount: number;
  date: string;
  timestamp: string;
  description: string;
  productName: string;
  type: string;
};

type AiDataCacheEntry = {
  chatJid: string;
  clientId: string;
  staticExpiresAt: number;
  dynamicExpiresAt: number;
  staticData: {
    responsibleName: string;
    className: string;
    restrictionText: string;
    relatedClientsText: string;
    enterpriseName: string;
    schoolName: string;
    phone: string;
  };
  dynamicData: {
    totalBalance: number;
    planEntries: AiCachedPlanEntry[];
    transactions: AiCachedTransactionEntry[];
    products: AiCachedProductEntry[];
    deliveryText: string;
  };
};

type AiAuditReason = 'SECURITY_DESTRUCTIVE' | 'PRIVACY_OUT_OF_SCOPE';

type AiAuditEntry = {
  id: string;
  timestamp: number;
  reason: AiAuditReason;
  chatId: string;
  contactName: string;
  excerpt: string;
  details: string;
};

type AutoReportPdfResult = {
  sent: boolean;
  fileName?: string;
  reason?: string;
};

const hasOwn = (obj: unknown, key: string) =>
  Object.prototype.hasOwnProperty.call(obj ?? {}, key);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const getDefaultAiToolsConfig = (): AiToolsConfig => ({
  dbStats: true,
  companyInfo: true,
  businessHours: true,
  searchClients: true,
  searchProducts: true,
  searchPlans: true,
  searchPlanValues: true,
  searchMenu: true,
  searchNutritionalBase: true,
  searchAvailableProducts: true,
  searchTransactions: true,
  searchOrders: true,
  autoSendPdfReport: true,
});

class WhatsAppSessionManager {
  private static readonly AI_STATIC_CACHE_TTL_MS = 10 * 60 * 1000;
  private static readonly AI_DYNAMIC_CACHE_TTL_MS = 45 * 1000;
  private static readonly MAX_CONNECTION_FAILURE_RETRIES = 4;
  private static readonly LEGACY_SCHEDULE_FILE_PATH = path.resolve(__dirname, '../data/whatsapp-schedules.json');
  private static readonly LEGACY_CHAT_HISTORY_FILE_PATH = path.resolve(__dirname, '../data/whatsapp-history.json');
  private static readonly LEGACY_AI_CONFIG_FILE_PATH = path.resolve(__dirname, '../data/whatsapp-ai-config.json');
  private static readonly AI_AUDIT_MAX_ITEMS = 300;
  private static readonly AI_AGENT_AUTO_RESUME_MS = 6 * 60 * 60 * 1000;

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
  private chatPersistTimer: ReturnType<typeof setTimeout> | null = null;

  private chatMap = new Map<string, ChatSummary>();
  private messageMap = new Map<string, ChatMessage[]>();
  private aiAgentEnabledChats = new Set<string>();
  private aiAgentAutoResumeAtByChat = new Map<string, number>();
  private backendSentMessageIds = new Map<string, number>();
  private labelCatalog = new Map<string, { id: string; name: string; deleted?: boolean }>();
  private chatLabelMap = new Map<string, Set<string>>();
  private profilePictureMap = new Map<string, string | null>();
  private lidToPhoneJidMap = new Map<string, string>();
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
  private aiConfig: AiConfig = {
    provider: 'openai',
    model: 'gpt-4.1-mini',
    openAiToken: '',
    geminiToken: '',
    groqToken: '',
    sttEnabled: true,
    sttModel: '',
    companyName: '',
    assistantName: '',
    tools: getDefaultAiToolsConfig(),
    onlyOutsideBusinessHours: false,
    responseDelaySeconds: 2,
    conversationSessionMinutes: 60,
    globalPrompt: 'Você é o assistente da cantina. Responda de forma clara, educada e objetiva, usando dados reais do sistema quando disponíveis. Nunca ofereça ações destrutivas e nunca exponha dados de contatos fora do responsável atual e seus relacionados.',
    contexts: [
      {
        id: 1,
        name: 'Atendimento Geral',
        description: 'Fluxo padrão para dúvidas de saldo, consumo e mensagens rápidas.',
        enabled: true,
        conditionKeywords: ['saldo', 'consumo', 'relatorio', 'cantina'],
        prompt: 'Sempre chame o responsável pelo nome e priorize informar saldo atual e próximo passo.',
        responsePrompt: 'Responda com dados reais do sistema, de forma objetiva e em português do Brasil.',
        dataSelections: ['NOME', 'RESPONSAVEL_SETOR', 'TELEFONE_RESPONSAVEL', 'SALDO_CARTEIRA', 'SALDO_PLANOS'],
        actionType: 'RESPONDER_CLIENTE',
        routingMode: 'INTENT_SWITCH',
        subSwitches: [
          {
            id: 101,
            name: 'Consultar Nome',
            description: 'Confirma nome do aluno/colaborador e responsável.',
            enabled: true,
            conditionKeywords: ['nome', 'quem'],
            dataSelections: ['NOME', 'RESPONSAVEL_SETOR', 'TELEFONE_RESPONSAVEL', 'TIPO_CONTATO'],
            responsePrompt: 'Confirme nome do aluno/colaborador e nome do responsável.',
          },
          {
            id: 102,
            name: 'Consultar Saldo Cantina',
            description: 'Informa saldo de carteira e planos.',
            enabled: true,
            conditionKeywords: ['saldo', 'carteira', 'credito', 'crédito', 'plano'],
            dataSelections: ['NOME', 'RESPONSAVEL_SETOR', 'SALDO_CARTEIRA', 'SALDO_PLANOS', 'DATA_INICIAL', 'DATA_FINAL'],
            responsePrompt: 'Informe saldo da carteira e dos planos de forma clara.',
          },
          {
            id: 103,
            name: 'Consultar Relatório de Consumo',
            description: 'Mostra consumos e transações conforme período solicitado.',
            enabled: true,
            conditionKeywords: ['consumo', 'gasto', 'transacao', 'transações', 'extrato', 'relatorio', 'relatório'],
            dataSelections: ['NOME', 'RESPONSAVEL_SETOR', 'TRANSACOES', 'SALDO_CARTEIRA', 'SALDO_PLANOS', 'DATA_INICIAL', 'DATA_FINAL'],
            responsePrompt: 'Liste os consumos e transações do período pedido. Se não houver período, pergunte o período desejado.',
          },
          {
            id: 104,
            name: 'Não corresponde a nenhum',
            description: 'Fallback quando não casar com regras anteriores.',
            enabled: true,
            conditionKeywords: [],
            dataSelections: [],
            responsePrompt: 'Se a solicitação não se enquadrar, faça pergunta de esclarecimento antes de responder.',
          },
        ],
      }
    ]
  };
  private processedIncomingAutoReplyIds = new Set<string>();
  private aiConversationSessions = new Map<string, AiConversationSession>();
  private aiDataCache = new Map<string, AiDataCacheEntry>();
  private aiAuditLog: AiAuditEntry[] = [];

  constructor() {
    this.loadPersistedChatHistory().catch((err) => {
      this.logWarn('Falha ao carregar histórico persistido do WhatsApp na inicialização.', err);
    });
    this.loadScheduledMessages().catch((err) => {
      this.logWarn('Falha ao carregar mensagens agendadas na inicialização.', err);
    });
    this.loadAiConfig().catch((err) => {
      this.logWarn('Falha ao carregar configuração de AI na inicialização.', err);
    });
    this.scheduleTimer = setInterval(() => {
      this.processScheduledMessages().catch((err) => {
        this.logWarn('Falha no processamento de mensagens agendadas.', err);
      });
      this.pruneExpiredAiConversationSessions();
      this.processAiAgentAutoResumeTimers();
    }, 5000);
  }

  private schedulePersistChatHistory() {
    if (this.chatPersistTimer) {
      clearTimeout(this.chatPersistTimer);
    }
    this.chatPersistTimer = setTimeout(() => {
      this.chatPersistTimer = null;
      this.persistChatHistory().catch((err) => {
        this.logWarn('Falha ao persistir histórico de conversas.', err);
      });
    }, 800);
  }

  private getPersistedWhatsAppStore() {
    const store = db.getWhatsAppStore();
    return store && typeof store === 'object' ? store : {};
  }

  private async persistChatHistory() {
    const payload = {
      chats: Array.from(this.chatMap.entries()),
      messages: Array.from(this.messageMap.entries()),
      aiAgents: Array.from(this.aiAgentEnabledChats.values()),
      aiAgentAutoResumeAt: Array.from(this.aiAgentAutoResumeAtByChat.entries()),
      labels: Array.from(this.labelCatalog.entries()),
      chatLabels: Array.from(this.chatLabelMap.entries()).map(([jid, set]) => [jid, Array.from(set)]),
      profilePictures: Array.from(this.profilePictureMap.entries()),
      lidMappings: Array.from(this.lidToPhoneJidMap.entries()),
      persistedAt: new Date().toISOString()
    };
    db.updateWhatsAppStore({ history: payload });
  }

  private async loadPersistedChatHistory() {
    try {
      let parsed: any = this.getPersistedWhatsAppStore()?.history || null;
      if (!parsed) {
        try {
          const rawLegacy = await fs.readFile(WhatsAppSessionManager.LEGACY_CHAT_HISTORY_FILE_PATH, 'utf-8');
          parsed = JSON.parse(rawLegacy || '{}');
          db.updateWhatsAppStore({ history: parsed });
          this.logInfo('Histórico WhatsApp migrado do arquivo legado para database.json.');
        } catch (_legacyErr: any) {
          parsed = {};
        }
      }

      const chatEntries = Array.isArray(parsed?.chats) ? parsed.chats : [];
      const messageEntries = Array.isArray(parsed?.messages) ? parsed.messages : [];
      const aiAgentEntries = Array.isArray(parsed?.aiAgents) ? parsed.aiAgents : [];
      const aiAgentAutoResumeEntries = Array.isArray(parsed?.aiAgentAutoResumeAt) ? parsed.aiAgentAutoResumeAt : [];
      const labelEntries = Array.isArray(parsed?.labels) ? parsed.labels : [];
      const chatLabelEntries = Array.isArray(parsed?.chatLabels) ? parsed.chatLabels : [];
      const profilePictureEntries = Array.isArray(parsed?.profilePictures) ? parsed.profilePictures : [];
      const lidMappingEntries = Array.isArray(parsed?.lidMappings) ? parsed.lidMappings : [];

      this.chatMap = new Map(chatEntries);
      this.messageMap = new Map(messageEntries);
      this.aiAgentEnabledChats = new Set(aiAgentEntries.map((item: any) => String(item || '')).filter(Boolean));
      this.aiAgentAutoResumeAtByChat = new Map(
        aiAgentAutoResumeEntries
          .map(([jid, ts]: [string, number]) => [String(jid || ''), Number(ts || 0)] as [string, number])
          .filter(([jid, ts]) => Boolean(jid) && Number.isFinite(ts) && ts > 0)
      );
      this.labelCatalog = new Map(labelEntries);
      this.chatLabelMap = new Map(chatLabelEntries.map(([jid, labels]: [string, string[]]) => [jid, new Set(labels || [])]));
      this.profilePictureMap = new Map(profilePictureEntries);
      this.lidToPhoneJidMap = new Map(lidMappingEntries);

      for (const [jid, messages] of Array.from(this.messageMap.entries())) {
        const list = Array.isArray(messages) ? messages : [];
        const normalized = list
          .filter((msg: any) => msg && msg.id)
          .slice(-200);
        this.messageMap.set(jid, normalized);
      }

      this.logInfo('Histórico de conversas restaurado do disco.', {
        chats: this.chatMap.size,
        messages: Array.from(this.messageMap.values()).reduce((acc, list) => acc + list.length, 0)
      });
    } catch (err: any) {
      this.logWarn('Falha ao ler histórico persistido do WhatsApp.', err);
    }
  }

  private clearInMemoryChats() {
    this.chatMap.clear();
    this.messageMap.clear();
    this.labelCatalog.clear();
    this.chatLabelMap.clear();
    this.profilePictureMap.clear();
    this.lidToPhoneJidMap.clear();
    this.profilePictureInFlight.clear();
    this.aiConversationSessions.clear();
    this.processedIncomingAutoReplyIds.clear();
    this.aiDataCache.clear();
    this.aiAgentAutoResumeAtByChat.clear();
    this.backendSentMessageIds.clear();
  }

  private rememberBackendSentMessageId(msgId: string) {
    const id = String(msgId || '').trim();
    if (!id) return;
    this.backendSentMessageIds.set(id, Date.now() + (15 * 60 * 1000));
    if (this.backendSentMessageIds.size > 2000) {
      const now = Date.now();
      for (const [key, until] of Array.from(this.backendSentMessageIds.entries())) {
        if (!Number.isFinite(until) || until <= now) {
          this.backendSentMessageIds.delete(key);
        }
      }
    }
  }

  private isBackendSentMessageId(msgId: string) {
    const id = String(msgId || '').trim();
    if (!id) return false;
    const until = Number(this.backendSentMessageIds.get(id) || 0);
    if (!Number.isFinite(until) || until <= Date.now()) {
      this.backendSentMessageIds.delete(id);
      return false;
    }
    return true;
  }

  private isAiAgentCoolingDown(chatJid: string) {
    const until = Number(this.aiAgentAutoResumeAtByChat.get(chatJid) || 0);
    if (!Number.isFinite(until) || until <= 0) return false;
    if (until <= Date.now()) {
      this.aiAgentAutoResumeAtByChat.delete(chatJid);
      return false;
    }
    return true;
  }

  private async disableAiAgentTemporarily(chatJid: string, reason: 'human_send' | 'human_device') {
    const until = Date.now() + WhatsAppSessionManager.AI_AGENT_AUTO_RESUME_MS;
    this.aiAgentEnabledChats.delete(chatJid);
    this.aiAgentAutoResumeAtByChat.set(chatJid, until);
    await this.persistChatHistory();
    this.logInfo('Agente IA pausado temporariamente por ação humana.', {
      chatId: this.toExternalChatId(chatJid),
      reason,
      resumeAt: new Date(until).toISOString()
    });
    return until;
  }

  private processAiAgentAutoResumeTimers() {
    const now = Date.now();
    let changed = false;
    for (const [jid, until] of Array.from(this.aiAgentAutoResumeAtByChat.entries())) {
      if (!Number.isFinite(until) || until <= 0 || until > now) continue;
      this.aiAgentAutoResumeAtByChat.delete(jid);
      this.aiAgentEnabledChats.add(jid);
      changed = true;
      this.logInfo('Agente IA reativado automaticamente após cooldown.', {
        chatId: this.toExternalChatId(jid),
        resumedAt: new Date(now).toISOString()
      });
    }
    if (changed) {
      this.persistChatHistory().catch((err) => {
        this.logWarn('Falha ao persistir reativação automática do agente IA.', err instanceof Error ? err.message : err);
      });
    }
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

  private ensureDataUrl(raw: string, mimeType?: string | null) {
    const value = String(raw || '').trim();
    if (!value) return null;
    if (value.startsWith('data:')) return value;
    const cleaned = value.includes(',') ? value.split(',').pop() || '' : value;
    return `data:${String(mimeType || 'application/octet-stream')};base64,${cleaned}`;
  }

  private async streamToBuffer(stream: AsyncIterable<Buffer | Uint8Array>) {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  private getRawMessageContent(msg: any) {
    let content = msg?.message || {};
    if (content?.ephemeralMessage?.message) {
      content = content.ephemeralMessage.message;
    }
    if (content?.viewOnceMessage?.message) {
      content = content.viewOnceMessage.message;
    }
    if (content?.viewOnceMessageV2?.message) {
      content = content.viewOnceMessageV2.message;
    }
    if (content?.documentWithCaptionMessage?.message) {
      content = content.documentWithCaptionMessage.message;
    }
    return content || {};
  }

  private async extractMediaFromMessage(msg: any): Promise<ExtractedMedia | null> {
    const content = this.getRawMessageContent(msg);
    const imageMessage = content?.imageMessage;
    const audioMessage = content?.audioMessage;
    const documentMessage = content?.documentMessage;
    const videoMessage = content?.videoMessage;

    let mediaNode: any = null;
    let mediaType: MediaType | null = null;
    let downloadType: 'image' | 'audio' | 'document' | 'video' | null = null;

    if (imageMessage) {
      mediaNode = imageMessage;
      mediaType = 'image';
      downloadType = 'image';
    } else if (audioMessage) {
      mediaNode = audioMessage;
      mediaType = 'audio';
      downloadType = 'audio';
    } else if (documentMessage) {
      mediaNode = documentMessage;
      mediaType = 'document';
      downloadType = 'document';
    } else if (videoMessage) {
      mediaNode = videoMessage;
      mediaType = 'document';
      downloadType = 'video';
    }

    if (!mediaNode || !mediaType || !downloadType) return null;

    const mimeType = String(mediaNode?.mimetype || '').trim() || null;
    const fileName = String(mediaNode?.fileName || '').trim() || null;
    let mediaDataUrl: string | null = null;

    try {
      const stream = await downloadContentFromMessage(mediaNode, downloadType);
      const buffer = await this.streamToBuffer(stream as AsyncIterable<Buffer | Uint8Array>);
      if (buffer.length > 0 && buffer.length <= 12 * 1024 * 1024) {
        mediaDataUrl = `data:${mimeType || 'application/octet-stream'};base64,${buffer.toString('base64')}`;
      }
    } catch (err) {
      this.logWarn('Falha ao baixar mídia da mensagem para visualização.', err instanceof Error ? err.message : err);
    }

    return {
      mediaType,
      mimeType,
      fileName,
      mediaDataUrl
    };
  }

  private async persistScheduledMessages() {
    db.updateWhatsAppStore({
      schedules: {
        items: this.scheduledMessages,
        persistedAt: new Date().toISOString(),
      }
    });
  }

  private async loadScheduledMessages() {
    try {
      let parsed: any = this.getPersistedWhatsAppStore()?.schedules || null;
      if (!parsed) {
        try {
          const rawLegacy = await fs.readFile(WhatsAppSessionManager.LEGACY_SCHEDULE_FILE_PATH, 'utf-8');
          parsed = JSON.parse(rawLegacy || '[]');
          db.updateWhatsAppStore({ schedules: Array.isArray(parsed) ? { items: parsed } : parsed });
          this.logInfo('Agendamentos WhatsApp migrados do arquivo legado para database.json.');
        } catch (_legacyErr: any) {
          parsed = [];
        }
      }

      const items = Array.isArray(parsed)
        ? parsed
        : (Array.isArray(parsed?.items) ? parsed.items : []);

      this.scheduledMessages = items
        .map((item: any) => ({
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
        }))
        .filter((item: ScheduledMessage) => item.id && item.chatId && item.scheduleAt > 0);
    } catch (err: any) {
      this.logWarn('Falha ao carregar mensagens agendadas do database.json.', err);
      this.scheduledMessages = [];
    }
  }

  private sanitizeAiContext(context: any, index: number): AiContextItem {
    const legacyActionType = String(context?.actionType || '').trim();
    const legacyActions = Array.isArray(context?.actions) ? context.actions : [];
    const derivedSelections = legacyActions
      .map((action: any) => this.mapVariableToSelection(String(action?.variableKey || '').trim()))
      .filter(Boolean) as string[];
    const explicitSelections = Array.isArray(context?.dataSelections)
      ? context.dataSelections.map((item: any) => String(item || '').trim()).filter(Boolean)
      : [];
    const actionType: AiContextActionType =
      legacyActionType === 'ATENDIMENTO_HUMANO'
        ? 'ATENDIMENTO_HUMANO'
        : 'RESPONDER_CLIENTE';
    const routingMode: AiContextRoutingMode =
      String(context?.routingMode || '').trim().toUpperCase() === 'DIRECT'
        ? 'DIRECT'
        : 'INTENT_SWITCH';
    const conditionKeywords = Array.isArray(context?.conditionKeywords)
      ? context.conditionKeywords.map((item: any) => this.normalizeSearchText(String(item || ''))).filter(Boolean)
      : [];
    const responsePrompt = String(context?.responsePrompt || '').trim();
    const subSwitches: AiSubSwitchItem[] = Array.isArray(context?.subSwitches)
      ? context.subSwitches.map((item: any, idx: number) => ({
          id: Number(item?.id || Date.now() + idx),
          name: String(item?.name || `Sub Switch ${idx + 1}`).trim() || `Sub Switch ${idx + 1}`,
          description: String(item?.description || '').trim(),
          enabled: Boolean(item?.enabled),
          conditionKeywords: Array.isArray(item?.conditionKeywords)
            ? item.conditionKeywords.map((kw: any) => this.normalizeSearchText(String(kw || ''))).filter(Boolean)
            : [],
          dataSelections: Array.isArray(item?.dataSelections)
            ? item.dataSelections.map((sel: any) => String(sel || '').trim()).filter(Boolean)
            : [],
          responsePrompt: String(item?.responsePrompt || '').trim(),
        }))
      : [];

    return {
      id: Number(context?.id || Date.now() + index),
      name: String(context?.name || `Contexto ${index + 1}`).trim() || `Contexto ${index + 1}`,
      description: String(context?.description || '').trim(),
      enabled: Boolean(context?.enabled),
      conditionKeywords,
      prompt: String(context?.prompt || '').trim(),
      responsePrompt,
      dataSelections: explicitSelections.length > 0 ? explicitSelections : derivedSelections,
      actionType,
      routingMode,
      subSwitches,
    };
  }

  private mapVariableToSelection(variableKey: string) {
    const key = String(variableKey || '').trim().toLowerCase();
    if (!key) return '';
    if (key === '{cliente_nome}') return 'NOME';
    if (key === '{responsavel_nome}') return 'RESPONSAVEL_SETOR';
    if (key === '{telefone}') return 'TELEFONE_RESPONSAVEL';
    if (key === '{turma}') return 'TURMA';
    if (key === '{escola_nome}') return 'UNIDADE_ESCOLA';
    if (key === '{restricao}') return 'RESTRICAO';
    if (key === '{saldo_carteira}' || key === '{saldo_total}') return 'SALDO_CARTEIRA';
    if (key === '{saldo_planos}') return 'SALDO_PLANOS';
    if (key === '{transacoes}') return 'TRANSACOES';
    if (key === '{entrega_dia}') return 'ENTREGA_DIA';
    if (key === '{produtos_valores}') return 'PRODUTOS_VALORES';
    if (key === '{tipo_contato}') return 'TIPO_CONTATO';
    if (key === '{empresa_nome}') return 'EMPRESA';
    if (key === '{data_inicial}') return 'DATA_INICIAL';
    if (key === '{data_final}') return 'DATA_FINAL';
    return '';
  }

  private sanitizeAiConfig(raw: any): AiConfig {
    const providerRaw = String(raw?.provider || '').trim().toLowerCase();
    const provider: AiProvider = providerRaw === 'gemini'
      ? 'gemini'
      : providerRaw === 'groq'
        ? 'groq'
        : 'openai';

    const model = String(raw?.model || '').trim()
      || (
        provider === 'gemini'
          ? 'gemini-2.0-flash'
          : provider === 'groq'
            ? 'llama-3.1-8b-instant'
            : 'gpt-4.1-mini'
      );

    const legacyPrimary = String(raw?.primaryAction || '').trim().toUpperCase();
    const contexts = Array.isArray(raw?.contexts)
      ? raw.contexts.map((context: any, index: number) => this.sanitizeAiContext(context, index))
      : [];
    const migratedContexts = contexts.map((ctx) => {
      if (legacyPrimary === 'ESCALATE_HUMAN') {
        return { ...ctx, actionType: 'ATENDIMENTO_HUMANO' as AiContextActionType };
      }
      return ctx;
    });

    return {
      provider,
      model,
      openAiToken: String(raw?.openAiToken || '').trim(),
      geminiToken: String(raw?.geminiToken || '').trim(),
      groqToken: String(raw?.groqToken || '').trim(),
      sttEnabled: raw?.sttEnabled === undefined ? true : Boolean(raw?.sttEnabled),
      sttModel: String(raw?.sttModel || '').trim(),
      companyName: String(raw?.companyName || '').trim(),
      assistantName: String(raw?.assistantName || '').trim(),
      tools: {
        ...getDefaultAiToolsConfig(),
        ...(raw?.tools && typeof raw.tools === 'object' ? {
          dbStats: raw.tools.dbStats === undefined ? getDefaultAiToolsConfig().dbStats : Boolean(raw.tools.dbStats),
          companyInfo: raw.tools.companyInfo === undefined ? getDefaultAiToolsConfig().companyInfo : Boolean(raw.tools.companyInfo),
          businessHours: raw.tools.businessHours === undefined ? getDefaultAiToolsConfig().businessHours : Boolean(raw.tools.businessHours),
          searchClients: raw.tools.searchClients === undefined ? getDefaultAiToolsConfig().searchClients : Boolean(raw.tools.searchClients),
          searchProducts: raw.tools.searchProducts === undefined ? getDefaultAiToolsConfig().searchProducts : Boolean(raw.tools.searchProducts),
          searchPlans: raw.tools.searchPlans === undefined ? getDefaultAiToolsConfig().searchPlans : Boolean(raw.tools.searchPlans),
          searchPlanValues: raw.tools.searchPlanValues === undefined ? getDefaultAiToolsConfig().searchPlanValues : Boolean(raw.tools.searchPlanValues),
          searchMenu: raw.tools.searchMenu === undefined ? getDefaultAiToolsConfig().searchMenu : Boolean(raw.tools.searchMenu),
          searchNutritionalBase: raw.tools.searchNutritionalBase === undefined ? getDefaultAiToolsConfig().searchNutritionalBase : Boolean(raw.tools.searchNutritionalBase),
          searchAvailableProducts: raw.tools.searchAvailableProducts === undefined ? getDefaultAiToolsConfig().searchAvailableProducts : Boolean(raw.tools.searchAvailableProducts),
          searchTransactions: raw.tools.searchTransactions === undefined ? getDefaultAiToolsConfig().searchTransactions : Boolean(raw.tools.searchTransactions),
          searchOrders: raw.tools.searchOrders === undefined ? getDefaultAiToolsConfig().searchOrders : Boolean(raw.tools.searchOrders),
          autoSendPdfReport: raw.tools.autoSendPdfReport === undefined ? getDefaultAiToolsConfig().autoSendPdfReport : Boolean(raw.tools.autoSendPdfReport),
        } : {}),
      },
      onlyOutsideBusinessHours: Boolean(raw?.onlyOutsideBusinessHours),
      responseDelaySeconds: Math.max(0, Math.min(120, Number(raw?.responseDelaySeconds ?? this.aiConfig.responseDelaySeconds ?? 2) || 0)),
      conversationSessionMinutes: Math.max(1, Math.min(1440, Number(raw?.conversationSessionMinutes ?? this.aiConfig.conversationSessionMinutes ?? 60) || 60)),
      globalPrompt: String(raw?.globalPrompt || '').trim().slice(0, 5000),
      contexts: migratedContexts.length > 0 ? migratedContexts : this.aiConfig.contexts,
    };
  }

  private async loadAiConfig() {
    try {
      let parsed: any = this.getPersistedWhatsAppStore()?.aiConfig || null;
      if (!parsed) {
        try {
          const rawLegacy = await fs.readFile(WhatsAppSessionManager.LEGACY_AI_CONFIG_FILE_PATH, 'utf-8');
          parsed = JSON.parse(rawLegacy || '{}');
          db.updateWhatsAppStore({ aiConfig: parsed });
          this.logInfo('Configuração AI WhatsApp migrada do arquivo legado para database.json.');
        } catch (_legacyErr: any) {
          parsed = null;
        }
      }
      if (parsed && typeof parsed === 'object') {
        this.aiConfig = this.sanitizeAiConfig(parsed);
      }
      this.logInfo('Configuração de AI carregada do disco.', {
        contexts: this.aiConfig.contexts.length,
        hasOpenAiToken: Boolean(this.aiConfig.openAiToken),
        hasGeminiToken: Boolean(this.aiConfig.geminiToken),
        hasGroqToken: Boolean(this.aiConfig.groqToken),
        sttEnabled: Boolean(this.aiConfig.sttEnabled),
      });
    } catch (err: any) {
      this.logWarn('Falha ao carregar configuração de AI do database.json.', err instanceof Error ? err.message : err);
    }
  }

  private async persistAiConfig() {
    db.updateWhatsAppStore({
      aiConfig: this.aiConfig
    });
  }

  getAiConfig() {
    return this.aiConfig;
  }

  getAiAuditLogs(limit = 50) {
    const safeLimit = Math.max(1, Math.min(200, Number(limit || 50)));
    return this.aiAuditLog.slice(0, safeLimit);
  }

  async updateAiConfig(next: any) {
    this.aiConfig = this.sanitizeAiConfig(next);
    await this.persistAiConfig();
    return this.aiConfig;
  }

  async improveOutgoingText(chatId: string, draftText: string) {
    const text = String(draftText || '').trim();
    if (!text) throw new Error('Informe um texto para melhorar.');

    const provider: AiProvider = this.aiConfig.provider === 'gemini'
      ? 'gemini'
      : this.aiConfig.provider === 'groq'
        ? 'groq'
        : 'openai';
    const tokenOpenAi = String(this.aiConfig.openAiToken || '').trim();
    const tokenGemini = String(this.aiConfig.geminiToken || '').trim();
    const tokenGroq = String(this.aiConfig.groqToken || '').trim();
    const model = String(this.aiConfig.model || '').trim();

    if (provider === 'openai' && !tokenOpenAi) {
      throw new Error('Configure o token da OpenAI no AI Config para usar melhorar texto.');
    }
    if (provider === 'gemini' && !tokenGemini) {
      throw new Error('Configure o token do Gemini no AI Config para usar melhorar texto.');
    }
    if (provider === 'groq' && !tokenGroq) {
      throw new Error('Configure o token da Groq no AI Config para usar melhorar texto.');
    }

    const normalizedChatId = String(chatId || '').trim();
    let contextHints = '';
    if (normalizedChatId) {
      const jid = this.toBaileysJid(normalizedChatId);
      if (jid && this.isClientJid(jid)) {
        const client = this.findClientByChatJid(jid);
        const vars = client ? this.buildAiVariables(jid, client, text) : null;
        if (vars) {
          contextHints = [
            `Contato: ${String(vars['{cliente_nome}'] || '-')}`,
            `Responsável: ${String(vars['{responsavel_nome}'] || '-')}`,
            `Tipo: ${String(vars['{tipo_contato}'] || '-')}`,
          ].join('\n');
        }
      }
    }

    const systemPrompt = [
      'Você é um assistente de escrita para atendimento via WhatsApp.',
      'Melhore o texto do atendente mantendo o mesmo significado e intenção.',
      'Escreva em português do Brasil, com clareza e tom profissional.',
      'Não invente informações que não estejam no texto original.',
      this.getAiHardSafetyPolicyPrompt(),
      this.aiConfig.globalPrompt ? `Diretriz global: ${this.aiConfig.globalPrompt}` : '',
      'Retorne apenas o texto final melhorado, sem aspas e sem explicações.'
    ].filter(Boolean).join('\n');

    const userPrompt = [
      contextHints ? `Contexto do contato:\n${contextHints}` : '',
      `Texto original:\n${text}`
    ].filter(Boolean).join('\n\n');

    let improved = '';
    if (provider === 'openai') {
      improved = await this.callOpenAiJson(systemPrompt, userPrompt, tokenOpenAi, model || 'gpt-4.1-mini');
    } else if (provider === 'gemini') {
      improved = await this.callGeminiJson(systemPrompt, userPrompt, tokenGemini, model || 'gemini-2.0-flash');
    } else {
      improved = await this.callGroqJson(systemPrompt, userPrompt, tokenGroq, model || 'llama-3.1-8b-instant');
    }

    const finalText = String(improved || '').trim();
    return {
      success: true,
      text: finalText || text,
    };
  }

  isAiAgentEnabled(chatId: string) {
    const jid = this.toBaileysJid(chatId);
    if (!jid || !this.isClientJid(jid)) throw new Error('Chat inválido.');
    const coolingDown = this.isAiAgentCoolingDown(jid);
    const autoResumeAt = Number(this.aiAgentAutoResumeAtByChat.get(jid) || 0);
    return {
      success: true,
      chatId: this.toExternalChatId(jid),
      enabled: this.aiAgentEnabledChats.has(jid),
      coolingDown,
      autoResumeAt: coolingDown && Number.isFinite(autoResumeAt) ? new Date(autoResumeAt).toISOString() : null
    };
  }

  async setAiAgentEnabled(chatId: string, enabled: boolean) {
    const jid = this.toBaileysJid(chatId);
    if (!jid || !this.isClientJid(jid)) throw new Error('Chat inválido.');
    if (enabled) {
      this.aiAgentEnabledChats.add(jid);
      this.aiAgentAutoResumeAtByChat.delete(jid);
    } else {
      this.aiAgentEnabledChats.delete(jid);
      this.aiAgentAutoResumeAtByChat.delete(jid);
    }
    await this.persistChatHistory();
    return {
      success: true,
      chatId: this.toExternalChatId(jid),
      enabled: this.aiAgentEnabledChats.has(jid),
      coolingDown: this.isAiAgentCoolingDown(jid)
    };
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

  private normalizeLidJid(value: string) {
    const normalized = this.stripDeviceSuffix(String(value || '').trim());
    return normalized.endsWith('@lid') ? normalized : '';
  }

  private resolveMappedPhoneJidFromLid(value: string) {
    const lid = this.normalizeLidJid(value);
    if (!lid) return '';
    const mapped = this.stripDeviceSuffix(String(this.lidToPhoneJidMap.get(lid) || '').trim());
    if (!this.isClientJid(mapped) || this.isSelfJid(mapped)) return '';
    return mapped;
  }

  private rememberLidMapping(lidValue: string, jidValue: string) {
    const lid = this.normalizeLidJid(lidValue);
    if (!lid) return;
    const normalizedJid = this.stripDeviceSuffix(String(jidValue || '').trim());
    if (!this.isClientJid(normalizedJid) || this.isSelfJid(normalizedJid)) return;
    if (this.lidToPhoneJidMap.get(lid) === normalizedJid) return;
    this.lidToPhoneJidMap.set(lid, normalizedJid);
    this.schedulePersistChatHistory();
  }

  private rememberLidPnPair(lidValue: string, pnValue: string) {
    const lid = this.normalizeLidJid(lidValue);
    if (!lid) return;
    const pnJid = this.toBaileysJid(String(pnValue || ''));
    if (!pnJid || !this.isClientJid(pnJid) || this.isSelfJid(pnJid)) return;
    this.rememberLidMapping(lid, pnJid);
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
      return this.resolveMappedPhoneJidFromLid(raw);
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

  private getChatAliasJids(chatIdOrJid: string) {
    const primaryJid = this.toBaileysJid(chatIdOrJid);
    if (!primaryJid || !this.isClientJid(primaryJid)) return [] as string[];

    const externalChatId = this.toExternalChatId(primaryJid);
    const aliases = new Set<string>([primaryJid]);

    const includeIfSameExternal = (raw: string) => {
      const normalized = this.toBaileysJid(raw);
      if (!normalized || !this.isClientJid(normalized)) return;
      if (this.toExternalChatId(normalized) === externalChatId) {
        aliases.add(normalized);
      }
    };

    for (const jid of this.chatMap.keys()) includeIfSameExternal(jid);
    for (const jid of this.messageMap.keys()) includeIfSameExternal(jid);
    for (const jid of this.aiConversationSessions.keys()) includeIfSameExternal(jid);
    for (const jid of this.aiAgentEnabledChats.values()) includeIfSameExternal(jid);
    for (const mappedJid of this.lidToPhoneJidMap.values()) includeIfSameExternal(mappedJid);

    return Array.from(aliases);
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

  private isSelfJid(jid: string) {
    const normalized = this.stripDeviceSuffix(String(jid || '').trim());
    if (!normalized.endsWith('@s.whatsapp.net')) return false;
    const ownFromSock = this.stripDeviceSuffix(String(this.sock?.user?.id || '').trim());
    if (ownFromSock && normalized === ownFromSock) return true;

    const ownPhoneDigits = String(this.phoneNumber || '').replace(/\D/g, '');
    if (!ownPhoneDigits) return false;
    const jidPhone = this.getPhoneFromJid(normalized);
    return jidPhone === ownPhoneDigits;
  }

  private collectLidCandidates(values: string[]) {
    const unique = new Set<string>();
    for (const value of values) {
      const lid = this.normalizeLidJid(value);
      if (!lid) continue;
      unique.add(lid);
    }
    return Array.from(unique);
  }

  private rememberLidCandidates(candidates: string[], resolvedJid: string) {
    for (const lid of this.collectLidCandidates(candidates)) {
      this.rememberLidMapping(lid, resolvedJid);
    }
  }

  private learnLidMappingsFromMessage(msg: any) {
    const key = msg?.key || {};
    this.rememberLidPnPair(String(key?.senderLid || ''), String(key?.senderPn || ''));
    this.rememberLidPnPair(String(key?.participantLid || ''), String(key?.participantPn || ''));
    this.rememberLidPnPair(String(msg?.senderLid || ''), String(msg?.senderPn || ''));
    this.rememberLidPnPair(String(msg?.participantLid || ''), String(msg?.participantPn || ''));

    const content = this.getRawMessageContent(msg);
    const protocolKey = content?.protocolMessage?.key || {};
    const reactionKey = content?.reactionMessage?.key || {};
    const receiptKey = content?.receiptMessage?.key || {};
    this.rememberLidPnPair(String(protocolKey?.participantLid || ''), String(protocolKey?.participantPn || ''));
    this.rememberLidPnPair(String(reactionKey?.participantLid || ''), String(reactionKey?.participantPn || ''));
    this.rememberLidPnPair(String(receiptKey?.participantLid || ''), String(receiptKey?.participantPn || ''));
  }

  private collectMessagePeerCandidates(msg: any) {
    this.learnLidMappingsFromMessage(msg);
    const content = this.getRawMessageContent(msg);
    const protocolKey = content?.protocolMessage?.key || {};
    const reactionKey = content?.reactionMessage?.key || {};
    const receiptKey = content?.receiptMessage?.key || {};

    return [
      msg?.key?.participant,
      msg?.key?.participantPn,
      msg?.key?.participantLid,
      msg?.key?.senderPn,
      msg?.key?.senderLid,
      msg?.participant,
      msg?.participantPn,
      msg?.participantLid,
      msg?.senderPn,
      msg?.senderLid,
      content?.extendedTextMessage?.contextInfo?.participant,
      content?.extendedTextMessage?.contextInfo?.remoteJid,
      content?.imageMessage?.contextInfo?.participant,
      content?.imageMessage?.contextInfo?.remoteJid,
      content?.videoMessage?.contextInfo?.participant,
      content?.videoMessage?.contextInfo?.remoteJid,
      content?.documentMessage?.contextInfo?.participant,
      content?.documentMessage?.contextInfo?.remoteJid,
      protocolKey?.participant,
      protocolKey?.participantPn,
      protocolKey?.participantLid,
      protocolKey?.senderPn,
      protocolKey?.senderLid,
      protocolKey?.remoteJid,
      reactionKey?.participant,
      reactionKey?.participantPn,
      reactionKey?.participantLid,
      reactionKey?.senderPn,
      reactionKey?.senderLid,
      reactionKey?.remoteJid,
      receiptKey?.participant,
      receiptKey?.participantPn,
      receiptKey?.participantLid,
      receiptKey?.senderPn,
      receiptKey?.senderLid,
      receiptKey?.remoteJid
    ]
      .map((value: any) => String(value || '').trim())
      .filter(Boolean);
  }

  private resolveClientJidFromCandidates(candidates: string[]) {
    for (const candidate of candidates) {
      const jid = this.toBaileysJid(candidate);
      if (jid && this.isClientJid(jid) && !this.isSelfJid(jid)) {
        return jid;
      }
    }
    return '';
  }

  private pruneSelfChatsFromCache() {
    let removed = 0;
    for (const jid of Array.from(this.chatMap.keys())) {
      if (!this.isSelfJid(jid)) continue;
      removed += 1;
      this.chatMap.delete(jid);
      this.messageMap.delete(jid);
      this.chatLabelMap.delete(jid);
      this.profilePictureMap.delete(jid);
    }

    let removedMappings = 0;
    for (const [lid, mappedJid] of Array.from(this.lidToPhoneJidMap.entries())) {
      const normalized = this.stripDeviceSuffix(String(mappedJid || '').trim());
      if (this.isClientJid(normalized) && !this.isSelfJid(normalized)) continue;
      this.lidToPhoneJidMap.delete(lid);
      removedMappings += 1;
    }

    if (removed > 0 || removedMappings > 0) {
      this.logInfo('Dados do próprio número removidos do cache local.', { removedChats: removed, removedMappings });
      this.schedulePersistChatHistory();
    }
  }

  private resolveIncomingChatJid(msg: any) {
    const rawRemote = String(msg?.key?.remoteJid || '').trim();
    if (!rawRemote) return '';

    const fromMe = Boolean(msg?.key?.fromMe);
    const candidates = this.collectMessagePeerCandidates(msg);

    if (rawRemote.endsWith('@s.whatsapp.net')) {
      const normalized = this.stripDeviceSuffix(rawRemote);
      if (!this.isSelfJid(normalized)) {
        this.rememberLidCandidates(candidates, normalized);
        return normalized;
      }
      const resolvedFromCandidates = this.resolveClientJidFromCandidates(candidates);
      if (resolvedFromCandidates) {
        this.rememberLidCandidates(candidates, resolvedFromCandidates);
        return resolvedFromCandidates;
      }
      if (fromMe) {
        this.logWarn('Mensagem enviada pelo celular apontou para o próprio JID e sem destinatário resolvível. Ignorando.', {
          remoteJid: rawRemote,
          keyId: String(msg?.key?.id || ''),
          candidateCount: candidates.length
        });
      }
      return '';
    }
    if (rawRemote.endsWith('@c.us')) {
      const normalized = this.toBaileysJid(rawRemote);
      if (normalized && !this.isSelfJid(normalized)) {
        this.rememberLidCandidates(candidates, normalized);
        return normalized;
      }
      const resolvedFromCandidates = this.resolveClientJidFromCandidates(candidates);
      if (resolvedFromCandidates) {
        this.rememberLidCandidates(candidates, resolvedFromCandidates);
        return resolvedFromCandidates;
      }
      if (fromMe) {
        this.logWarn('Mensagem enviada pelo celular com @c.us do próprio número sem destinatário resolvível. Ignorando.', {
          remoteJid: rawRemote,
          keyId: String(msg?.key?.id || ''),
          candidateCount: candidates.length
        });
      }
      return '';
    }
    if (!rawRemote.endsWith('@lid')) {
      return '';
    }

    const mappedFromLid = this.resolveMappedPhoneJidFromLid(rawRemote);
    if (mappedFromLid) {
      this.rememberLidCandidates(candidates, mappedFromLid);
      return mappedFromLid;
    }

    const resolvedFromCandidates = this.resolveClientJidFromCandidates(candidates);
    if (resolvedFromCandidates) {
      this.rememberLidMapping(rawRemote, resolvedFromCandidates);
      this.rememberLidCandidates(candidates, resolvedFromCandidates);
      return resolvedFromCandidates;
    }

    if (fromMe) {
      this.logWarn('Mensagem @lid enviada pelo celular sem mapeamento de destinatário. Ignorando para evitar conversa fantasma.', {
        remoteJid: rawRemote,
        keyId: String(msg?.key?.id || ''),
        candidateCount: candidates.length
      });
    }

    return '';
  }

  private extractBody(msg: any) {
    const message = this.getRawMessageContent(msg);
    return String(
      message?.conversation
      || message?.extendedTextMessage?.text
      || message?.imageMessage?.caption
      || message?.videoMessage?.caption
      || message?.documentMessage?.caption
      || message?.locationMessage?.name
      || message?.locationMessage?.address
      || message?.liveLocationMessage?.caption
      || message?.buttonsResponseMessage?.selectedDisplayText
      || message?.listResponseMessage?.title
      || ''
    ).trim();
  }

  private extractLocationFromMessage(msg: any) {
    const content = this.getRawMessageContent(msg);
    const locationMessage = content?.locationMessage || content?.liveLocationMessage;
    if (!locationMessage) return null;

    const latitude = Number(locationMessage?.degreesLatitude ?? locationMessage?.latitude ?? NaN);
    const longitude = Number(locationMessage?.degreesLongitude ?? locationMessage?.longitude ?? NaN);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    const name = String(locationMessage?.name || '').trim() || null;
    const address = String(locationMessage?.address || locationMessage?.caption || '').trim() || null;
    const url = String(locationMessage?.url || '').trim() || null;

    let mapThumbnailDataUrl: string | null = null;
    const thumb = locationMessage?.jpegThumbnail;
    if (thumb) {
      try {
        const thumbBuffer = Buffer.isBuffer(thumb) ? thumb : Buffer.from(thumb);
        if (thumbBuffer.length > 0) {
          mapThumbnailDataUrl = `data:image/jpeg;base64,${thumbBuffer.toString('base64')}`;
        }
      } catch {
        mapThumbnailDataUrl = null;
      }
    }

    return {
      latitude,
      longitude,
      name,
      address,
      url,
      mapThumbnailDataUrl
    };
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
    this.schedulePersistChatHistory();
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
    this.schedulePersistChatHistory();
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
    const effectiveTimeoutMs = attachment.mediaType === 'document'
      ? Math.max(timeoutMs, 60000)
      : timeoutMs;
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Timeout ao enviar anexo (${effectiveTimeoutMs}ms)`)), effectiveTimeoutMs);
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
    if (this.isSelfJid(normalized)) {
      throw new Error('Destinatário inválido: número da própria sessão.');
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
      if (this.isSelfJid(resolvedJid)) {
        throw new Error('Destinatário inválido: número da própria sessão.');
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

  private buildPhoneVariants(raw: string) {
    const digits = String(raw || '').replace(/\D/g, '');
    const variants = new Set<string>();
    if (!digits) return variants;
    variants.add(digits);
    if (digits.startsWith('55') && digits.length > 2) {
      variants.add(digits.slice(2));
    }

    const withoutCountry = digits.startsWith('55') ? digits.slice(2) : digits;
    if (withoutCountry.length >= 10) {
      variants.add(`55${withoutCountry}`);
      if (withoutCountry.length === 11) {
        const ddd = withoutCountry.slice(0, 2);
        const local = withoutCountry.slice(2);
        if (local.startsWith('9')) {
          const withoutNinth = `${ddd}${local.slice(1)}`;
          variants.add(withoutNinth);
          variants.add(`55${withoutNinth}`);
        }
      }
      if (withoutCountry.length === 10) {
        const ddd = withoutCountry.slice(0, 2);
        const local = withoutCountry.slice(2);
        const withNinth = `${ddd}9${local}`;
        variants.add(withNinth);
        variants.add(`55${withNinth}`);
      }
    }

    return variants;
  }

  private normalizeSearchText(value: string) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  private extractSearchTerms(input: string) {
    const stopWords = new Set([
      'o', 'a', 'os', 'as', 'de', 'da', 'do', 'das', 'dos', 'e', 'ou', 'em', 'no', 'na', 'nos', 'nas',
      'um', 'uma', 'uns', 'umas', 'por', 'para', 'com', 'sem', 'meu', 'minha', 'meus', 'minhas',
      'quero', 'preciso', 'gostaria', 'saber', 'qual', 'quanto', 'valor', 'preco', 'preço', 'saldo',
      'mostrar', 'consumo', 'transacoes', 'transações', 'relatorio', 'relatório'
    ]);

    const normalized = this.normalizeSearchText(input);
    const tokens = normalized
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2 && !stopWords.has(item));
    return Array.from(new Set(tokens));
  }

  private parseMessageDateHints(message: string) {
    const text = this.normalizeSearchText(message);
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    if (text.includes('hoje')) {
      return { start, end };
    }

    if (text.includes('ontem')) {
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
      return { start, end };
    }

    if (text.includes('semana')) {
      start.setDate(start.getDate() - 7);
      return { start, end };
    }

    if (text.includes('mes') || text.includes('mês')) {
      start.setMonth(start.getMonth() - 1);
      return { start, end };
    }

    const explicitDates = String(message || '').match(/\b\d{2}\/\d{2}\/\d{4}\b/g) || [];
    if (explicitDates.length > 0) {
      const parsed = explicitDates
        .map((raw) => {
          const [dd, mm, yyyy] = raw.split('/').map((item) => Number(item));
          const date = new Date(yyyy, mm - 1, dd);
          return Number.isFinite(date.getTime()) ? date : null;
        })
        .filter((item): item is Date => Boolean(item))
        .sort((a, b) => a.getTime() - b.getTime());
      if (parsed.length > 0) {
        const first = new Date(parsed[0]);
        first.setHours(0, 0, 0, 0);
        const last = new Date(parsed[parsed.length - 1]);
        last.setHours(23, 59, 59, 999);
        return { start: first, end: last };
      }
    }

    return null;
  }

  private findClientByChatJid(chatJid: string) {
    const phone = this.getPhoneFromJid(chatJid);
    const variants = this.buildPhoneVariants(phone);
    if (variants.size === 0) return null;

    const clients = db.getClients();
    for (const client of clients) {
      const candidateFields = [
        client?.phone,
        client?.parentWhatsapp,
        client?.guardianPhone,
      ];
      const hasMatch = candidateFields.some((candidate: any) => {
        const candidateVariants = this.buildPhoneVariants(String(candidate || ''));
        if (candidateVariants.size === 0) return false;
        for (const value of candidateVariants) {
          if (variants.has(value)) return true;
        }
        return false;
      });
      if (hasMatch) return client;
    }
    return null;
  }

  private listResponsibleRelatedClients(chatJid: string, client: any) {
    const clients = db.getClients();
    const chatPhoneVariants = this.buildPhoneVariants(this.getPhoneFromJid(chatJid));
    const responsibleName = this.normalizeSearchText(
      String(client?.parentName || client?.guardianName || client?.guardians?.[0] || '')
    );

    const byPhone = clients.filter((item: any) => {
      const phoneCandidates = [item?.phone, item?.parentWhatsapp, item?.guardianPhone];
      const hasPhoneMatch = phoneCandidates.some((candidate: any) => {
        const variants = this.buildPhoneVariants(String(candidate || ''));
        for (const value of variants) {
          if (chatPhoneVariants.has(value)) return true;
        }
        return false;
      });

      const itemResponsible = this.normalizeSearchText(
        String(item?.parentName || item?.guardianName || item?.guardians?.[0] || '')
      );
      const hasResponsibleMatch = Boolean(responsibleName && itemResponsible && responsibleName === itemResponsible);
      const hasClientMatch = String(item?.id || '') === String(client?.id || '');

      return hasPhoneMatch || hasResponsibleMatch || hasClientMatch;
    });

    if (byPhone.length > 0) return byPhone;

    if (!responsibleName) {
      return client ? [client] : [];
    }

    const byResponsibleName = clients.filter((item: any) => {
      const itemResponsible = this.normalizeSearchText(
        String(item?.parentName || item?.guardianName || item?.guardians?.[0] || '')
      );
      return Boolean(itemResponsible && itemResponsible === responsibleName);
    });

    if (byResponsibleName.length > 0) return byResponsibleName;

    return client ? [client] : [];
  }

  private tokenizeNormalizedText(value: string) {
    return this.normalizeSearchText(value)
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private tokenHasCommonRoot(a: string, b: string, minRootSize = 5) {
    const left = this.normalizeSearchText(a);
    const right = this.normalizeSearchText(b);
    if (!left || !right) return false;
    if (left.includes(right) || right.includes(left)) return true;

    const rootSize = Math.min(
      Math.max(4, minRootSize),
      Math.min(left.length, right.length)
    );
    if (rootSize < 4) return false;
    return left.slice(0, rootSize) === right.slice(0, rootSize);
  }

  private keywordMatchesMessage(text: string, terms: string[], keyword: string) {
    const normalizedKeyword = this.normalizeSearchText(keyword);
    if (!normalizedKeyword) return false;
    if (text.includes(normalizedKeyword)) return true;
    if (terms.some((term) => normalizedKeyword.includes(term) || term.includes(normalizedKeyword))) return true;

    const keywordTokens = this.tokenizeNormalizedText(normalizedKeyword);
    if (keywordTokens.length === 0) return false;
    return keywordTokens.some((keywordToken) => (
      terms.some((term) => this.tokenHasCommonRoot(term, keywordToken, 5))
      || this.tokenHasCommonRoot(text, keywordToken, 5)
    ));
  }

  private isFinancialIntentMessage(message: string) {
    const text = this.normalizeSearchText(message);
    if (!text) return false;

    const exactKeywords = [
      'saldo',
      'consumo',
      'gasto',
      'gastou',
      'extrato',
      'transacao',
      'transação',
      'devo',
      'carteira',
      'plano',
      'credito',
      'crédito',
      'debito',
      'débito',
      'movimentacao',
      'movimentação',
      'compra',
      'compras',
      'consumacao',
      'consumação',
    ];
    if (exactKeywords.some((token) => text.includes(this.normalizeSearchText(token)))) {
      return true;
    }

    const stems = ['saldo', 'consum', 'gast', 'transac', 'transa', 'extrat', 'carteir', 'plan', 'credit', 'debit', 'moviment', 'compr', 'dev'];
    const tokens = this.tokenizeNormalizedText(text);
    return tokens.some((token) => stems.some((stem) => token.startsWith(stem) || this.tokenHasCommonRoot(token, stem, 5)));
  }

  private hasRecentFinancialContext(chatJid: string) {
    const now = Date.now();
    const ttlMs = this.getConversationSessionTtlMs();
    const aliases = this.getChatAliasJids(chatJid);
    const normalized = this.toBaileysJid(chatJid);
    if (aliases.length === 0 && normalized) aliases.push(normalized);

    for (const jid of aliases) {
      const session = this.aiConversationSessions.get(jid);
      if (session) {
        const hasRecentClientIntent = session.history
          .filter((item) => item.from === 'client' && (now - Number(item.timestamp || 0)) <= ttlMs)
          .slice(-12)
          .some((item) => this.isFinancialIntentMessage(item.text) || this.shouldAutoSendClientReportPdf(item.text));
        if (hasRecentClientIntent) return true;
      }

      const persistedMessages = (this.messageMap.get(jid) || [])
        .filter((item) => {
          if (item.fromMe) return false;
          const text = String(item?.body || '').trim();
          if (!text) return false;
          const tsSeconds = Number(item?.timestamp || 0);
          if (!Number.isFinite(tsSeconds) || tsSeconds <= 0) return false;
          const ageMs = now - (tsSeconds * 1000);
          return ageMs >= 0 && ageMs <= ttlMs;
        })
        .slice(-20);

      if (persistedMessages.some((item) => {
        const text = String(item?.body || '').trim();
        return this.isFinancialIntentMessage(text) || this.shouldAutoSendClientReportPdf(text);
      })) {
        return true;
      }
    }

    return false;
  }

  private isGreetingOnlyMessage(message: string) {
    const text = this.normalizeSearchText(message);
    if (!text) return false;

    const greetings = [
      'oi',
      'ola',
      'olá',
      'bom dia',
      'boa tarde',
      'boa noite',
      'tudo bem',
      'e ai',
      'e aí',
      'hey',
    ];

    const isGreeting = greetings.some((item) => text.includes(item));
    if (!isGreeting) return false;

    // Considera "somente saudação" quando a mensagem é curta e sem intenção de consulta.
    const asksData = this.isFinancialIntentMessage(text) || this.shouldAutoSendClientReportPdf(text);
    const hasManyWords = text.split(/\s+/).filter(Boolean).length > 6;
    return !asksData && !hasManyWords;
  }

  private shouldAutoSendClientReportPdf(message: string) {
    const text = this.normalizeSearchText(message);
    if (!text) return false;
    return [
      'relatorio',
      'relatório',
      'pdf',
      'extrato',
      'relatorio pdf',
      'relatório pdf',
      'enviar relatorio',
      'enviar relatório',
      'gerar relatorio',
      'gerar relatório'
    ].some((token) => text.includes(token));
  }

  private getIntentClarificationPrompt() {
    return 'Para eu te responder com precisão, você quer consultar saldo, consumo, relatório em PDF, produto/valor ou outro assunto? Se for sobre aluno, me diga o nome dele.';
  }

  private isAffirmativeMessage(message: string) {
    const text = this.normalizeSearchText(message);
    if (!text) return false;
    return [
      'sim',
      'isso',
      'ok',
      'blz',
      'beleza',
      'confirmo',
      'pode',
      'pode sim',
      'manda',
      'envia',
      'pode mandar',
      'pode enviar'
    ].some((token) => text.includes(token));
  }

  private extractLearnableKeywords(input: string) {
    const stopWords = new Set([
      'oi', 'ola', 'olá', 'bom', 'boa', 'dia', 'tarde', 'noite',
      'de', 'da', 'do', 'das', 'dos', 'e', 'ou', 'em', 'no', 'na',
      'um', 'uma', 'uns', 'umas', 'por', 'para', 'com', 'sem',
      'meu', 'minha', 'meus', 'minhas', 'quero', 'preciso', 'gostaria',
      'saber', 'qual', 'quanto', 'favor', 'agora', 'aqui', 'isso', 'sim',
      'pode', 'mandar', 'manda', 'enviar', 'envia', 'cliente', 'aluno',
      'responsavel', 'responsável', 'pdf', 'relatorio', 'relatório',
      'saldo', 'consumo', 'consum', 'gasto', 'transacao', 'transações'
    ]);

    const tokens = this.tokenizeNormalizedText(input)
      .filter((token) => token.length >= 4 && token.length <= 24)
      .filter((token) => !stopWords.has(token));
    return Array.from(new Set(tokens)).slice(0, 10);
  }

  private resolveLearningTarget(message: string) {
    const enabledContexts = this.aiConfig.contexts.filter((ctx) => ctx.enabled);
    if (enabledContexts.length === 0) return { context: null as AiContextItem | null, subSwitch: null as AiSubSwitchItem | null };
    const context = this.pickContextByKeywords(message, enabledContexts);
    if (!context) return { context: null, subSwitch: null };
    const subSwitch = context.routingMode === 'INTENT_SWITCH'
      ? this.pickSubSwitchByKeywords(message, context.subSwitches || [])
      : null;
    return { context, subSwitch };
  }

  private async tryLearnIntentKeywordsFromConfirmation(chatJid: string, confirmationMessage: string) {
    const session = this.getOrCreateAiConversationSession(chatJid);
    const pending = session.pendingIntentLearning;
    if (!pending) return false;

    const now = Date.now();
    const ttlMs = this.getConversationSessionTtlMs();
    if ((now - Number(pending.askedAt || 0)) > ttlMs) {
      session.pendingIntentLearning = null;
      return false;
    }

    const confirmationHasIntent = this.isFinancialIntentMessage(confirmationMessage)
      || this.shouldAutoSendClientReportPdf(confirmationMessage)
      || this.isReportSendConfirmationMessage(confirmationMessage)
      || this.isAffirmativeMessage(confirmationMessage);
    if (!confirmationHasIntent) return false;

    const target = this.resolveLearningTarget(confirmationMessage);
    if (!target.context) return false;

    const learnedTerms = Array.from(new Set([
      ...this.extractLearnableKeywords(pending.sourceMessage),
      ...this.extractLearnableKeywords(confirmationMessage),
    ])).slice(0, 12);
    if (learnedTerms.length === 0) {
      session.pendingIntentLearning = null;
      return false;
    }

    let changed = false;
    if (target.subSwitch) {
      const existing = new Set((target.subSwitch.conditionKeywords || []).map((item) => this.normalizeSearchText(item)));
      for (const term of learnedTerms) {
        if (existing.has(term)) continue;
        target.subSwitch.conditionKeywords.push(term);
        existing.add(term);
        changed = true;
      }
      if (target.subSwitch.conditionKeywords.length > 80) {
        target.subSwitch.conditionKeywords = target.subSwitch.conditionKeywords.slice(0, 80);
      }
    } else {
      const existing = new Set((target.context.conditionKeywords || []).map((item) => this.normalizeSearchText(item)));
      for (const term of learnedTerms) {
        if (existing.has(term)) continue;
        target.context.conditionKeywords.push(term);
        existing.add(term);
        changed = true;
      }
      if (target.context.conditionKeywords.length > 80) {
        target.context.conditionKeywords = target.context.conditionKeywords.slice(0, 80);
      }
    }

    session.pendingIntentLearning = null;
    session.lastActivityAt = now;

    if (!changed) return false;
    await this.persistAiConfig();
    this.logInfo('Aprendizado de gatilhos concluído por confirmação do cliente.', {
      chatId: this.toExternalChatId(chatJid),
      context: target.context.name,
      subSwitch: target.subSwitch?.name || null,
      learnedTerms
    });
    return true;
  }

  private isReportSendConfirmationMessage(message: string) {
    const text = this.normalizeSearchText(message);
    if (!text) return false;
    if (this.shouldAutoSendClientReportPdf(text)) return true;

    const words = this.tokenizeNormalizedText(text);
    const shortMessage = words.length > 0 && words.length <= 10;
    const hasSendVerb = [
      'manda',
      'mandar',
      'mandem',
      'manda ai',
      'manda aí',
      'envia',
      'enviar',
      'enviem',
      'dispara',
      'pode mandar',
      'pode enviar'
    ].some((token) => text.includes(this.normalizeSearchText(token)));
    const hasAffirmative = ['sim', 'ok', 'blz', 'isso', 'pode', 'confirmo', 'pode sim'].some((token) => text.includes(token));

    return shortMessage && (hasSendVerb || hasAffirmative);
  }

  private hasRecentReportConversation(chatJid: string) {
    const now = Date.now();
    const ttlMs = this.getConversationSessionTtlMs();
    const aliases = this.getChatAliasJids(chatJid);
    const normalized = this.toBaileysJid(chatJid);
    if (aliases.length === 0 && normalized) aliases.push(normalized);

    const hasReportKeywords = (value: string) => {
      const text = this.normalizeSearchText(value);
      return Boolean(text) && (
        text.includes('relatorio')
        || text.includes('relatório')
        || text.includes('pdf')
        || text.includes('extrato')
      );
    };

    for (const jid of aliases) {
      const session = this.aiConversationSessions.get(jid);
      if (session) {
        const recent = session.history
          .filter((item) => (now - Number(item.timestamp || 0)) <= ttlMs)
          .slice(-16);
        if (recent.some((item) => hasReportKeywords(item.text))) {
          return true;
        }
      }

      const persistedMessages = (this.messageMap.get(jid) || [])
        .filter((item) => {
          const text = String(item?.body || '').trim();
          if (!text) return false;
          const tsSeconds = Number(item?.timestamp || 0);
          if (!Number.isFinite(tsSeconds) || tsSeconds <= 0) return false;
          const ageMs = now - (tsSeconds * 1000);
          return ageMs >= 0 && ageMs <= ttlMs;
        })
        .slice(-20);
      if (persistedMessages.some((item) => hasReportKeywords(String(item?.body || '')))) {
        return true;
      }
    }

    return false;
  }

  private sanitizeAiReplyByCapabilities(
    replyText: string,
    incomingText: string,
    options?: { autoReportSent?: boolean; allowFinancialContinuation?: boolean }
  ) {
    let output = String(replyText || '').trim();
    if (!output) return output;

    const requestedReportNow = this.shouldAutoSendClientReportPdf(incomingText);
    const requestedFinancialNow = this.isFinancialIntentMessage(incomingText);
    const autoReportSent = Boolean(options?.autoReportSent);
    const allowFinancialContinuation = Boolean(options?.allowFinancialContinuation);
    const mayTalkAboutReportDelivery = requestedReportNow || autoReportSent;

    if (!mayTalkAboutReportDelivery) {
      output = output
        .replace(/\[?\s*enviando\s+relat[óo]rio\s+em\s+pdf\s*\]?/gi, '')
        .replace(/o\s+relat[óo]rio\s+foi\s+enviado[^\n.]*(?:\.|$)/gi, '')
        .replace(/vou\s+enviar\s+o\s+relat[óo]rio[^\n.]*(?:\.|$)/gi, '')
        .replace(/\*\*relat[óo]rio[^*]*\*\*/gi, '')
        .replace(/se\s+n[aã]o\s+receber[^.]*spam[^.]*\./gi, '');
    }

    // O sistema não envia e-mail automaticamente pelo agente deste fluxo.
    output = output
      .replace(/foi\s+enviado\s+para\s+o\s+seu\s+e-?mail[^.]*\./gi, 'Se desejar, posso enviar o relatório diretamente por aqui no WhatsApp.')
      .replace(/verifique\s+sua\s+caixa\s+de\s+entrada[^.]*spam[^.]*\./gi, '');

    output = output
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const clarificationPrompt = this.getIntentClarificationPrompt();
    const leakagePattern = /(relat[óo]rio|pdf|extrato|saldo|consumo|transa[cç][aã]o|carteira|plano)/i;
    if (!requestedFinancialNow && !requestedReportNow && !autoReportSent && !allowFinancialContinuation && leakagePattern.test(output)) {
      return clarificationPrompt;
    }

    if (!output) {
      return clarificationPrompt;
    }
    return output;
  }

  private parseHourToMinutes(value: unknown) {
    const text = String(value || '').trim();
    const match = text.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return Number.NaN;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return Number.NaN;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return Number.NaN;
    return (hour * 60) + minute;
  }

  private isOutsideEnterpriseBusinessHours(chatJid: string, targetClient: any): {
    outside: boolean;
    reason: string;
    enterpriseId: string;
    open?: string;
    close?: string;
    dayIndex?: number;
  } {
    const fallbackClient = this.findClientByChatJid(chatJid);
    const enterpriseId = String(
      targetClient?.enterpriseId
      || fallbackClient?.enterpriseId
      || db.getEnterprises()?.[0]?.id
      || ''
    ).trim();
    const enterprise = enterpriseId ? db.getEnterprise(enterpriseId) : db.getEnterprises()?.[0];
    const openingHours = enterprise?.openingHours;

    if (!openingHours || typeof openingHours !== 'object') {
      return { outside: true, reason: 'opening_hours_not_configured', enterpriseId };
    }

    const weekdayKeys: Array<string[]> = [
      ['DOMINGO', 'SUNDAY'],
      ['SEGUNDA', 'MONDAY'],
      ['TERCA', 'TERÇA', 'TUESDAY'],
      ['QUARTA', 'WEDNESDAY'],
      ['QUINTA', 'THURSDAY'],
      ['SEXTA', 'FRIDAY'],
      ['SABADO', 'SÁBADO', 'SATURDAY'],
    ];
    const now = new Date();
    const dayIndex = now.getDay();
    const keys = weekdayKeys[dayIndex] || [];
    const todayConfig = keys
      .map((key) => (openingHours as Record<string, any>)[key])
      .find((item) => item && typeof item === 'object');

    if (!todayConfig) {
      return { outside: true, reason: 'day_not_configured', enterpriseId };
    }
    if (Boolean(todayConfig.closed)) {
      return { outside: true, reason: 'day_closed', enterpriseId };
    }

    const openMinutes = this.parseHourToMinutes(todayConfig.open);
    const closeMinutes = this.parseHourToMinutes(todayConfig.close);
    if (!Number.isFinite(openMinutes) || !Number.isFinite(closeMinutes)) {
      return { outside: true, reason: 'invalid_hours', enterpriseId };
    }

    const nowMinutes = (now.getHours() * 60) + now.getMinutes();
    const inBusinessHours = closeMinutes >= openMinutes
      ? (nowMinutes >= openMinutes && nowMinutes <= closeMinutes)
      : (nowMinutes >= openMinutes || nowMinutes <= closeMinutes);

    return {
      outside: !inBusinessHours,
      reason: inBusinessHours ? 'inside_business_hours' : 'outside_business_hours',
      enterpriseId,
      open: String(todayConfig.open || ''),
      close: String(todayConfig.close || ''),
      dayIndex,
    };
  }

  private getEditDistanceAtMost(leftRaw: string, rightRaw: string, maxDistance = 1) {
    const left = this.normalizeSearchText(leftRaw);
    const right = this.normalizeSearchText(rightRaw);
    if (!left || !right) return maxDistance + 1;
    if (left === right) return 0;

    const leftLen = left.length;
    const rightLen = right.length;
    if (Math.abs(leftLen - rightLen) > maxDistance) return maxDistance + 1;

    const previous = new Array<number>(rightLen + 1);
    const current = new Array<number>(rightLen + 1);
    for (let j = 0; j <= rightLen; j += 1) previous[j] = j;

    for (let i = 1; i <= leftLen; i += 1) {
      current[0] = i;
      let rowMin = current[0];
      for (let j = 1; j <= rightLen; j += 1) {
        const cost = left[i - 1] === right[j - 1] ? 0 : 1;
        current[j] = Math.min(
          previous[j] + 1,
          current[j - 1] + 1,
          previous[j - 1] + cost
        );
        if (current[j] < rowMin) rowMin = current[j];
      }
      if (rowMin > maxDistance) return maxDistance + 1;
      for (let j = 0; j <= rightLen; j += 1) previous[j] = current[j];
    }

    return previous[rightLen];
  }

  private isApproximateNameTokenMatch(left: string, right: string) {
    const leftToken = this.normalizeSearchText(left);
    const rightToken = this.normalizeSearchText(right);
    if (!leftToken || !rightToken) return false;
    if (leftToken === rightToken) return true;
    if (leftToken.length < 4 || rightToken.length < 4) return false;
    return this.getEditDistanceAtMost(leftToken, rightToken, 1) <= 1;
  }

  private findMentionedClientInMessage(message: string, clients: any[]) {
    const text = this.normalizeSearchText(message);
    if (!text || clients.length === 0) return null;
    const messageTokens = this.tokenizeNormalizedText(text).filter((item) => item.length >= 3);

    let best: { client: any; score: number } | null = null;
    for (const client of clients) {
      const fullName = this.normalizeSearchText(String(client?.name || ''));
      if (!fullName) continue;
      let score = 0;
      if (text.includes(fullName)) score += 10;

      const firstName = fullName.split(' ')[0] || '';
      if (firstName && text.includes(firstName)) score += 4;
      if (firstName && messageTokens.some((token) => this.isApproximateNameTokenMatch(token, firstName))) score += 3;

      const tokens = fullName.split(' ').filter((item) => item.length >= 3);
      for (const token of tokens) {
        if (text.includes(token)) score += 2;
        if (messageTokens.some((item) => this.isApproximateNameTokenMatch(item, token))) score += 1;
      }

      if (!best || score > best.score) {
        best = { client, score };
      }
    }

    if (!best || best.score < 2) return null;
    return best.client;
  }

  private resolveTargetClientForMessage(chatJid: string, baseClient: any, message: string) {
    const session = this.getOrCreateAiConversationSession(chatJid);
    const related = this.listResponsibleRelatedClients(chatJid, baseClient);

    const clientFromSessionId = session.targetClientId
      ? db.getClients().find((item: any) => String(item?.id || '') === String(session.targetClientId || '')) || null
      : null;

    if (!baseClient && related.length === 0) {
      return { client: clientFromSessionId, needsDisambiguation: false, relatedClients: clientFromSessionId ? [clientFromSessionId] : [] as any[] };
    }

    const normalizedRelated = related.length > 0
      ? related
      : (clientFromSessionId ? [clientFromSessionId] : (baseClient ? [baseClient] : []));
    const explicit = this.findMentionedClientInMessage(message, normalizedRelated);
    if (explicit) {
      session.targetClientId = String(explicit.id || '') || null;
      return { client: explicit, needsDisambiguation: false, relatedClients: normalizedRelated };
    }

    const bySession = normalizedRelated.find((item: any) => String(item?.id || '') === String(session.targetClientId || ''));
    if (bySession) {
      return { client: bySession, needsDisambiguation: false, relatedClients: normalizedRelated };
    }

    if (this.isFinancialIntentMessage(message) && normalizedRelated.length > 1) {
      return { client: null, needsDisambiguation: true, relatedClients: normalizedRelated };
    }

    const fallback = baseClient || normalizedRelated[0] || null;
    if (fallback?.id) {
      session.targetClientId = String(fallback.id);
    }
    return { client: fallback, needsDisambiguation: false, relatedClients: normalizedRelated };
  }

  private parseFlexibleDateTimeValue(raw: unknown): number {
    const text = String(raw || '').trim();
    if (!text) return Number.NaN;

    const direct = new Date(text).getTime();
    if (Number.isFinite(direct)) return direct;

    const compact = text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (compact) {
      const [, dd, mm, yyyy, hh = '00', min = '00', ss = '00'] = compact;
      const parsed = new Date(
        Number(yyyy),
        Number(mm) - 1,
        Number(dd),
        Number(hh),
        Number(min),
        Number(ss)
      ).getTime();
      if (Number.isFinite(parsed)) return parsed;
    }

    return Number.NaN;
  }

  private resolveTransactionTimeValue(tx: any): number {
    const ts = this.parseFlexibleDateTimeValue(tx?.timestamp);
    if (Number.isFinite(ts)) return ts;
    return this.parseFlexibleDateTimeValue(tx?.date);
  }

  private formatDateForTool(raw: unknown) {
    const ts = this.parseFlexibleDateTimeValue(raw);
    if (!Number.isFinite(ts)) return '-';
    return new Date(ts).toLocaleDateString('pt-BR');
  }

  private buildDatabaseSearchToolsContext(chatJid: string, message: string, targetClient: any): string {
    const toolsConfig = this.aiConfig.tools || getDefaultAiToolsConfig();
    const normalizedMessage = this.normalizeSearchText(message);
    const terms = this.extractSearchTerms(message).slice(0, 8);
    const fallbackTerms = normalizedMessage
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 3)
      .slice(0, 8);
    const searchTerms = Array.from(new Set([...terms, ...fallbackTerms])).slice(0, 10);

    const baseClient = this.findClientByChatJid(chatJid);
    const enterpriseId = String(targetClient?.enterpriseId || baseClient?.enterpriseId || '').trim() || undefined;
    const dateHint = this.parseMessageDateHints(message);

    const relatedClients = this.listResponsibleRelatedClients(chatJid, targetClient || baseClient || null);
    const scopedClients = relatedClients.length > 0
      ? relatedClients
      : [targetClient || baseClient].filter(Boolean);
    const scopedClientIds = new Set(
      scopedClients
        .map((item: any) => String(item?.id || '').trim())
        .filter(Boolean)
    );

    const matchTerms = (value: string) => {
      const bag = this.normalizeSearchText(value);
      if (!bag) return false;
      if (searchTerms.length === 0) return true;
      return searchTerms.some((term) => bag.includes(term));
    };

    const tools: AiDatabaseSearchToolResult[] = [];

    if (toolsConfig.dbStats) {
      tools.push({
        tool: 'tool_db_stats',
        total: 1,
        items: [],
        summary: JSON.stringify(db.getStats())
      });
    }

    const enterprise = enterpriseId
      ? db.getEnterprise(enterpriseId)
      : db.getEnterprises()?.[0];

    if (toolsConfig.companyInfo) {
      const companyItem = {
        enterpriseId: String(enterprise?.id || enterpriseId || ''),
        nomeEmpresa: String(enterprise?.name || this.aiConfig.companyName || ''),
        escola: String(enterprise?.attachedSchoolName || ''),
        cnpj: String(enterprise?.cnpj || ''),
        telefone: String(enterprise?.phone || ''),
        email: String(enterprise?.email || ''),
      };
      tools.push({
        tool: 'tool_company_info',
        total: companyItem.nomeEmpresa ? 1 : 0,
        items: companyItem.nomeEmpresa ? [companyItem] : [],
        summary: companyItem.nomeEmpresa
          ? `${companyItem.nomeEmpresa} | escola: ${companyItem.escola || '-'} | cnpj: ${companyItem.cnpj || '-'} | telefone: ${companyItem.telefone || '-'}`
          : 'Dados da empresa não encontrados.'
      });
    }

    if (toolsConfig.businessHours) {
      const openingHours = enterprise?.openingHours && typeof enterprise.openingHours === 'object'
        ? enterprise.openingHours
        : {};
      const weekdayOrder: Array<{ key: string; label: string }> = [
        { key: 'SEGUNDA', label: 'Segunda' },
        { key: 'TERCA', label: 'Terça' },
        { key: 'QUARTA', label: 'Quarta' },
        { key: 'QUINTA', label: 'Quinta' },
        { key: 'SEXTA', label: 'Sexta' },
        { key: 'SABADO', label: 'Sábado' },
        { key: 'DOMINGO', label: 'Domingo' },
      ];
      const scheduleItems = weekdayOrder.map(({ key, label }) => {
        const cfg = (openingHours as Record<string, any>)[key]
          || (openingHours as Record<string, any>)[key.normalize('NFD').replace(/[\u0300-\u036f]/g, '')]
          || (openingHours as Record<string, any>)[key === 'TERCA' ? 'TERÇA' : key === 'SABADO' ? 'SÁBADO' : key];
        const closed = Boolean(cfg?.closed);
        return {
          dia: label,
          fechado: closed,
          abre: closed ? null : String(cfg?.open || '').trim() || null,
          fecha: closed ? null : String(cfg?.close || '').trim() || null,
        };
      });
      const summary = scheduleItems
        .map((item) => item.fechado ? `${item.dia}: fechado` : `${item.dia}: ${item.abre || '--:--'}-${item.fecha || '--:--'}`)
        .join(' | ');
      tools.push({
        tool: 'tool_business_hours',
        total: scheduleItems.length,
        items: scheduleItems,
        summary: summary || 'Horários de atendimento não configurados.'
      });
    }

    const clients = db.getClients(enterpriseId)
      .filter((client: any) => {
        const clientId = String(client?.id || '').trim();
        if (scopedClientIds.size > 0 && !scopedClientIds.has(clientId)) return false;
        if (searchTerms.length === 0) return true;
        const bag = [
          client?.name,
          client?.parentName,
          client?.guardianName,
          client?.registrationId,
          client?.phone,
          client?.parentWhatsapp,
          client?.guardianPhone,
          client?.className,
          client?.grade,
          client?.type,
        ].filter(Boolean).join(' ');
        return matchTerms(bag);
      })
      .slice(0, 12)
      .map((client: any) => ({
        id: String(client?.id || ''),
        nome: String(client?.name || ''),
        tipo: String(client?.type || ''),
        responsavel: String(client?.parentName || client?.guardianName || client?.guardians?.[0] || ''),
        telefone: String(client?.phone || client?.parentWhatsapp || client?.guardianPhone || ''),
        turma: String(client?.className || client?.grade || client?.class || ''),
        saldo: Number(client?.balance || 0),
      }));

    if (toolsConfig.searchClients) {
      tools.push({
        tool: 'tool_search_clients',
        total: clients.length,
        items: clients,
        summary: clients.length > 0
          ? clients.map((item) => `${item.nome} (${item.tipo}) resp: ${item.responsavel} saldo: R$ ${Number(item.saldo || 0).toFixed(2)}`).join(' | ')
          : 'Nenhum cliente encontrado para os filtros.'
      });
    }

    const products = db.getProducts(enterpriseId)
      .filter((product: any) => {
        const shouldSearchProducts = (
          normalizedMessage.includes('produto')
          || normalizedMessage.includes('preco')
          || normalizedMessage.includes('preço')
          || normalizedMessage.includes('valor')
          || normalizedMessage.includes('cardapio')
          || normalizedMessage.includes('cardápio')
          || normalizedMessage.includes('item')
          || normalizedMessage.includes('lanche')
          || normalizedMessage.includes('marmita')
        );
        if (!shouldSearchProducts && searchTerms.length > 0) {
          const bag = [product?.name, product?.description, product?.category].filter(Boolean).join(' ');
          return matchTerms(bag);
        }
        return shouldSearchProducts || searchTerms.length === 0;
      })
      .slice(0, 15)
      .map((product: any) => ({
        id: String(product?.id || ''),
        nome: String(product?.name || ''),
        categoria: String(product?.category || ''),
        preco: Number(product?.price || 0),
        ativo: Boolean(product?.active ?? true),
      }));

    if (toolsConfig.searchProducts) {
      tools.push({
        tool: 'tool_search_products',
        total: products.length,
        items: products,
        summary: products.length > 0
          ? products.map((item) => `${item.nome} - R$ ${Number(item.preco || 0).toFixed(2)}`).join(' | ')
          : 'Nenhum produto encontrado para os filtros.'
      });
    }

    const plans = db.getPlans(enterpriseId)
      .filter((plan: any) => {
        if (searchTerms.length === 0) return true;
        const bag = [plan?.name, plan?.description].filter(Boolean).join(' ');
        return matchTerms(bag);
      })
      .slice(0, 10)
      .map((plan: any) => ({
        id: String(plan?.id || ''),
        nome: String(plan?.name || ''),
        descricao: String(plan?.description || ''),
        valor: Number(plan?.price || plan?.value || 0),
      }));

    if (toolsConfig.searchPlans) {
      tools.push({
        tool: 'tool_search_plans',
        total: plans.length,
        items: plans,
        summary: plans.length > 0
          ? plans.map((item) => `${item.nome} - R$ ${Number(item.valor || 0).toFixed(2)}`).join(' | ')
          : 'Nenhum plano encontrado para os filtros.'
      });
    }

    const planValues = db.getPlans(enterpriseId)
      .filter((plan: any) => {
        const shouldSearchPlans = (
          normalizedMessage.includes('plano')
          || normalizedMessage.includes('valor')
          || normalizedMessage.includes('preco')
          || normalizedMessage.includes('preço')
          || normalizedMessage.includes('mensal')
        );
        if (!shouldSearchPlans && searchTerms.length > 0) {
          const bag = [plan?.name, plan?.description].filter(Boolean).join(' ');
          return matchTerms(bag);
        }
        return shouldSearchPlans || searchTerms.length === 0;
      })
      .slice(0, 12)
      .map((plan: any) => ({
        id: String(plan?.id || ''),
        nome: String(plan?.name || ''),
        valor: Number(plan?.price || plan?.value || 0),
        ativo: plan?.isActive === undefined ? true : Boolean(plan?.isActive),
        itens: Array.isArray(plan?.items) ? plan.items.length : 0,
        descricao: String(plan?.description || ''),
      }));

    if (toolsConfig.searchPlanValues) {
      tools.push({
        tool: 'tool_search_plan_values',
        total: planValues.length,
        items: planValues,
        summary: planValues.length > 0
          ? planValues.map((item) => `${item.nome} (${item.ativo ? 'ativo' : 'inativo'}) - R$ ${Number(item.valor || 0).toFixed(2)}`).join(' | ')
          : 'Nenhum plano/valor encontrado para os filtros.'
      });
    }

    const menuCategories = new Set(['LANCHE', 'BEBIDA', 'ALMOCO', 'DOCE', 'REFEICAO_KG', 'PF', 'MARMITA']);
    const menuItems = db.getProducts(enterpriseId)
      .filter((product: any) => {
        const category = String(product?.category || '').toUpperCase();
        if (!menuCategories.has(category)) return false;
        const shouldSearchMenu = (
          normalizedMessage.includes('cardapio')
          || normalizedMessage.includes('cardápio')
          || normalizedMessage.includes('menu')
          || normalizedMessage.includes('refeicao')
          || normalizedMessage.includes('refeição')
          || normalizedMessage.includes('lanche')
          || normalizedMessage.includes('almoco')
          || normalizedMessage.includes('almoço')
        );
        if (!shouldSearchMenu && searchTerms.length > 0) {
          const bag = [product?.name, product?.description, product?.category].filter(Boolean).join(' ');
          return matchTerms(bag);
        }
        return shouldSearchMenu || searchTerms.length === 0;
      })
      .slice(0, 20)
      .map((product: any) => ({
        id: String(product?.id || ''),
        item: String(product?.name || ''),
        categoria: String(product?.category || ''),
        descricao: String(product?.description || ''),
        preco: Number(product?.price || 0),
      }));

    if (toolsConfig.searchMenu) {
      tools.push({
        tool: 'tool_search_menu',
        total: menuItems.length,
        items: menuItems,
        summary: menuItems.length > 0
          ? menuItems.map((item) => `${item.categoria}: ${item.item} - R$ ${Number(item.preco || 0).toFixed(2)}`).join(' | ')
          : 'Nenhum item de cardápio encontrado para os filtros.'
      });
    }

    const nutritionalBase = [
      ...db.getIngredients().map((ingredient: any) => ({
        tipo: 'INGREDIENTE',
        nome: String(ingredient?.name || ''),
        categoria: String(ingredient?.category || ''),
        calorias: Number(ingredient?.calories || 0),
        proteinas: Number(ingredient?.proteins || 0),
        carboidratos: Number(ingredient?.carbs || 0),
        gorduras: Number(ingredient?.fats || 0),
      })),
      ...db.getProducts(enterpriseId)
        .filter((product: any) => product?.nutritionalInfo && typeof product.nutritionalInfo === 'object')
        .map((product: any) => ({
          tipo: 'PRODUTO',
          nome: String(product?.name || ''),
          categoria: String(product?.category || ''),
          calorias: Number(product?.nutritionalInfo?.calories || 0),
          gluten: Boolean(product?.nutritionalInfo?.gluten),
          lactose: Boolean(product?.nutritionalInfo?.lactose),
          acucar: Boolean(product?.nutritionalInfo?.sugar),
        })),
    ].filter((entry: any) => {
      const shouldSearchNutritional = (
        normalizedMessage.includes('nutri')
        || normalizedMessage.includes('caloria')
        || normalizedMessage.includes('restricao')
        || normalizedMessage.includes('restrição')
        || normalizedMessage.includes('lactose')
        || normalizedMessage.includes('gluten')
        || normalizedMessage.includes('açucar')
        || normalizedMessage.includes('acucar')
      );
      if (!shouldSearchNutritional && searchTerms.length > 0) {
        const bag = [entry?.nome, entry?.categoria, entry?.tipo].filter(Boolean).join(' ');
        return matchTerms(bag);
      }
      return shouldSearchNutritional || searchTerms.length === 0;
    }).slice(0, 20);

    if (toolsConfig.searchNutritionalBase) {
      tools.push({
        tool: 'tool_search_nutritional_base',
        total: nutritionalBase.length,
        items: nutritionalBase,
        summary: nutritionalBase.length > 0
          ? nutritionalBase.map((item: any) => `${item.tipo} ${item.nome} ${Number(item.calorias || 0)} kcal`).join(' | ')
          : 'Nenhuma informação de base nutricional encontrada para os filtros.'
      });
    }

    const availableProducts = db.getProducts(enterpriseId)
      .filter((product: any) => {
        const isActive = product?.isActive === undefined
          ? Boolean(product?.active ?? true)
          : Boolean(product?.isActive);
        if (!isActive) return false;
        if (Boolean(product?.controlsStock) && Number(product?.stock || 0) <= 0) return false;
        const shouldSearchAvailable = (
          normalizedMessage.includes('disponivel')
          || normalizedMessage.includes('disponível')
          || normalizedMessage.includes('tem hoje')
          || normalizedMessage.includes('produto')
          || normalizedMessage.includes('item')
        );
        if (!shouldSearchAvailable && searchTerms.length > 0) {
          const bag = [product?.name, product?.description, product?.category].filter(Boolean).join(' ');
          return matchTerms(bag);
        }
        return shouldSearchAvailable || searchTerms.length === 0;
      })
      .slice(0, 20)
      .map((product: any) => ({
        id: String(product?.id || ''),
        nome: String(product?.name || ''),
        categoria: String(product?.category || ''),
        preco: Number(product?.price || 0),
        estoque: Number(product?.stock || 0),
      }));

    if (toolsConfig.searchAvailableProducts) {
      tools.push({
        tool: 'tool_search_available_products',
        total: availableProducts.length,
        items: availableProducts,
        summary: availableProducts.length > 0
          ? availableProducts.map((item) => `${item.nome} - R$ ${Number(item.preco || 0).toFixed(2)} (estoque ${Number(item.estoque || 0)})`).join(' | ')
          : 'Nenhum produto disponível encontrado para os filtros.'
      });
    }

    const wantsTransactions = (
      this.isFinancialIntentMessage(message)
      || this.shouldAutoSendClientReportPdf(message)
      || normalizedMessage.includes('pedido')
      || normalizedMessage.includes('entrega')
      || Boolean(dateHint)
    );

    const transactionTermIgnorePrefixes = [
      'saldo',
      'consum',
      'gast',
      'transac',
      'extrat',
      'moviment',
      'carteir',
      'plan',
      'debit',
      'credit',
      'compra',
      'pedido',
      'entrega',
      'hoje',
      'ontem',
      'amanh',
      'seman',
      'mes',
      'mês',
      'period',
      'data',
      'dia',
      'ultim',
      'recent',
      'quero',
      'mostrar',
      'qual',
      'quanto',
      'devo',
      'meu',
      'minha',
      'desta',
      'desse',
      'nesta',
      'nesse',
    ];
    const transactionSearchTerms = searchTerms.filter((term) => (
      !transactionTermIgnorePrefixes.some((prefix) => term.startsWith(prefix))
    ));

    const transactions = db.getTransactions({ enterpriseId })
      .filter((tx: any) => {
        if (scopedClientIds.size > 0) {
          const txClientId = String(tx?.clientId || '').trim();
          if (!txClientId || !scopedClientIds.has(txClientId)) return false;
        } else {
          return false;
        }

        const txTime = this.resolveTransactionTimeValue(tx);
        if (dateHint && Number.isFinite(txTime)) {
          if (txTime < dateHint.start.getTime() || txTime > dateHint.end.getTime()) {
            return false;
          }
        }

        if (transactionSearchTerms.length === 0) return wantsTransactions;
        const bag = [
          tx?.description,
          tx?.item,
          tx?.plan,
          tx?.clientName,
          tx?.type,
          tx?.method,
        ].filter(Boolean).join(' ');
        const normalizedBag = this.normalizeSearchText(bag);
        const bagTokens = this.tokenizeNormalizedText(normalizedBag);
        return transactionSearchTerms.some((term) => (
          normalizedBag.includes(term)
          || bagTokens.some((token) => this.tokenHasCommonRoot(token, term, 5))
        ));
      })
      .sort((a: any, b: any) => this.resolveTransactionTimeValue(b) - this.resolveTransactionTimeValue(a))
      .slice(0, 20)
      .map((tx: any) => ({
        id: String(tx?.id || ''),
        cliente: String(tx?.clientName || ''),
        tipo: String(tx?.type || ''),
        descricao: String(tx?.description || tx?.item || ''),
        valor: Number(tx?.amount || tx?.total || 0),
        data: this.formatDateForTool(tx?.timestamp || tx?.date),
      }));

    if (toolsConfig.searchTransactions) {
      tools.push({
        tool: 'tool_search_transactions',
        total: transactions.length,
        items: transactions,
        summary: transactions.length > 0
          ? transactions.map((item) => `${item.data} ${item.cliente} ${item.tipo} R$ ${Math.abs(Number(item.valor || 0)).toFixed(2)} ${item.descricao}`).join(' | ')
          : 'Nenhuma transação encontrada para os filtros.'
      });
    }

    const orders = db.getOrders(enterpriseId)
      .filter((order: any) => {
        if (scopedClientIds.size > 0) {
          const orderClientId = String(order?.clientId || '').trim();
          if (!orderClientId || !scopedClientIds.has(orderClientId)) return false;
        } else {
          return false;
        }
        if (searchTerms.length === 0) return normalizedMessage.includes('pedido') || normalizedMessage.includes('entrega');
        const bag = [order?.clientName, order?.status, order?.items?.map((i: any) => i?.name).join(' ')].filter(Boolean).join(' ');
        return matchTerms(bag);
      })
      .slice(0, 10)
      .map((order: any) => ({
        id: String(order?.id || ''),
        cliente: String(order?.clientName || ''),
        status: String(order?.status || ''),
        total: Number(order?.total || 0),
        data: this.formatDateForTool(order?.timestamp || order?.date),
      }));

    if (toolsConfig.searchOrders) {
      tools.push({
        tool: 'tool_search_orders',
        total: orders.length,
        items: orders,
        summary: orders.length > 0
          ? orders.map((item) => `${item.data} ${item.cliente} ${item.status} R$ ${Number(item.total || 0).toFixed(2)}`).join(' | ')
          : 'Nenhum pedido encontrado para os filtros.'
      });
    }

    const compactTools = tools
      .filter((tool) => tool.total > 0 || tool.tool === 'tool_db_stats' || (wantsTransactions && tool.tool === 'tool_search_transactions'))
      .map((tool) => {
        const sampleItems = tool.items.slice(0, 8);
        return `- ${tool.tool}: total=${tool.total}\n  resumo=${tool.summary}\n  amostra=${JSON.stringify(sampleItems)}`;
      });

    const privacyHeader = scopedClientIds.size > 0
      ? `- escopo_privacidade: somente contato atual e relacionados autorizados (${Array.from(scopedClientIds).join(', ')})`
      : '- escopo_privacidade: contato atual não identificado; não consultar dados pessoais de terceiros.';

    const rawContext = compactTools.length > 0
      ? compactTools.join('\n')
      : '- tools: sem resultados de busca no banco para a consulta.';
    return `${privacyHeader}\n${rawContext}`.slice(0, 7000);
  }

  private buildAiDataCacheKey(chatJid: string, clientId: string) {
    return `${chatJid}::${clientId}`;
  }

  private clearAiDataCacheForChat(chatJid: string) {
    const prefix = `${chatJid}::`;
    for (const key of Array.from(this.aiDataCache.keys())) {
      if (key.startsWith(prefix)) {
        this.aiDataCache.delete(key);
      }
    }
  }

  private buildStaticAiCacheData(chatJid: string, client: any) {
    const responsibleName = String(client?.parentName || client?.guardianName || client?.guardians?.[0] || client?.name || 'Cliente').trim();
    const className = String(client?.className || client?.grade || client?.class || client?.year || '-').trim();
    const restrictions = Array.isArray(client?.dietaryRestrictions)
      ? client.dietaryRestrictions.map((item: any) => String(item || '').trim()).filter(Boolean).join(', ')
      : String(client?.restrictions || client?.restriction || '').trim();
    const restrictionText = restrictions || 'Sem restrições cadastradas.';
    const relatedClientsText = this.buildRelatedClientsText(chatJid, client, '');
    const enterprise = db.getEnterprise(client?.enterpriseId || '');
    const enterpriseName = String(this.aiConfig.companyName || enterprise?.name || 'Cantina Smart');
    const schoolName = String(enterprise?.attachedSchoolName || '-');
    const phone = `+${this.getPhoneFromJid(chatJid)}`;

    return {
      responsibleName,
      className,
      restrictionText,
      relatedClientsText,
      enterpriseName,
      schoolName,
      phone,
    };
  }

  private buildDynamicAiCacheData(client: any) {
    const totalBalance = Number(client?.balance || 0);
    const balances = client?.planCreditBalances || {};
    const planEntries: AiCachedPlanEntry[] = [];
    for (const entry of Object.values(balances) as any[]) {
      const planName = String(entry?.planName || '').trim();
      if (!planName) continue;
      planEntries.push({
        planName,
        balance: Number(entry?.balance || 0),
      });
    }
    if ((client?.servicePlans || []).includes('PREPAGO')) {
      planEntries.push({
        planName: 'Carteira Pré-paga',
        balance: totalBalance,
      });
    }

    const transactions = db.getTransactions()
      .filter((tx: any) => String(tx?.clientId || '') === String(client?.id || ''))
      .map((tx: any) => ({
        amount: Number(tx?.amount || 0),
        date: String(tx?.date || ''),
        timestamp: String(tx?.timestamp || ''),
        description: String(tx?.description || ''),
        productName: String(tx?.productName || ''),
        type: String(tx?.type || ''),
      }));

    const products = db.getProducts(client?.enterpriseId)
      .map((product: any) => ({
        name: String(product?.name || 'Produto'),
        price: Number(product?.price || 0),
        description: String(product?.description || ''),
        category: String(product?.category || ''),
      }));

    const deliveryText = String(client?.dailyDeliveryNotes || client?.deliveryNotes || client?.deliveryPreference || 'Sem entrega do dia cadastrada.');

    return {
      totalBalance,
      planEntries,
      transactions,
      products,
      deliveryText,
    };
  }

  private getOrBuildAiDataCache(chatJid: string, client: any): AiDataCacheEntry | null {
    const clientId = String(client?.id || '').trim();
    if (!clientId) return null;

    const now = Date.now();
    const key = this.buildAiDataCacheKey(chatJid, clientId);
    const existing = this.aiDataCache.get(key);
    if (existing) {
      if (existing.staticExpiresAt <= now) {
        existing.staticData = this.buildStaticAiCacheData(chatJid, client);
        existing.staticExpiresAt = now + WhatsAppSessionManager.AI_STATIC_CACHE_TTL_MS;
      }
      if (existing.dynamicExpiresAt <= now) {
        existing.dynamicData = this.buildDynamicAiCacheData(client);
        existing.dynamicExpiresAt = now + WhatsAppSessionManager.AI_DYNAMIC_CACHE_TTL_MS;
      }
      return existing;
    }

    const next: AiDataCacheEntry = {
      chatJid,
      clientId,
      staticExpiresAt: now + WhatsAppSessionManager.AI_STATIC_CACHE_TTL_MS,
      dynamicExpiresAt: now + WhatsAppSessionManager.AI_DYNAMIC_CACHE_TTL_MS,
      staticData: this.buildStaticAiCacheData(chatJid, client),
      dynamicData: this.buildDynamicAiCacheData(client),
    };
    this.aiDataCache.set(key, next);
    return next;
  }

  private findRelatedClients(chatJid: string, client: any, message: string) {
    const clients = this.listResponsibleRelatedClients(chatJid, client);
    const terms = this.extractSearchTerms(message);

    if (terms.length === 0) {
      return clients.slice(0, 12);
    }

    return clients
      .filter((item: any) => {
        const bag = this.normalizeSearchText([
          item?.name,
          item?.type,
          item?.parentName,
          item?.guardianName,
          item?.className,
          item?.grade,
          item?.department,
        ].filter(Boolean).join(' '));
        return terms.some((term) => bag.includes(term));
      })
      .slice(0, 12);
  }

  private buildRelatedClientsText(chatJid: string, client: any, message: string) {
    const related = this.findRelatedClients(chatJid, client, message);
    if (related.length === 0) return 'Sem alunos/colaboradores relacionados encontrados.';

    return related.map((item: any) => {
      const contactType = String(item?.type || 'NÃO_IDENTIFICADO');
      const responsible = String(item?.parentName || item?.guardianName || item?.guardians?.[0] || '-');
      const phone = String(item?.parentWhatsapp || item?.guardianPhone || item?.phone || '').replace(/\D/g, '');
      const className = String(item?.className || item?.grade || item?.department || '-');
      return `${String(item?.name || 'Sem nome')} (${contactType}) | Responsável/Setor: ${responsible} | Turma/Setor: ${className} | Telefone: +${phone || '-'}`;
    }).join('\n');
  }

  private buildPlanBalanceText(client: any, message: string, cachedPlanEntries?: AiCachedPlanEntry[]) {
    const balances = client?.planCreditBalances || {};
    const lines: string[] = [];
    const terms = this.extractSearchTerms(message);

    const entries = Array.isArray(cachedPlanEntries) && cachedPlanEntries.length > 0
      ? cachedPlanEntries
      : (Object.values(balances) as any[]).map((entry: any) => ({
          planName: String(entry?.planName || '').trim(),
          balance: Number(entry?.balance || 0),
        }));

    for (const entry of entries) {
      const planName = String(entry?.planName || '').trim();
      const balance = Number(entry?.balance || 0);
      if (!planName) continue;
      if (terms.length > 0) {
        const bag = this.normalizeSearchText(planName);
        const hasTerm = terms.some((term) => bag.includes(term));
        if (!hasTerm && !this.normalizeSearchText(message).includes('plano') && !this.normalizeSearchText(message).includes('saldo')) {
          continue;
        }
      }
      lines.push(`${planName}: R$ ${balance.toFixed(2)}`);
    }

    return lines.length > 0 ? lines.join('\n') : 'Sem saldo de planos disponível.';
  }

  private buildProductsWithValuesText(client: any, message: string, cachedProducts?: AiCachedProductEntry[]) {
    const products = Array.isArray(cachedProducts) && cachedProducts.length > 0
      ? cachedProducts
      : db.getProducts(client?.enterpriseId).map((product: any) => ({
          name: String(product?.name || 'Produto'),
          price: Number(product?.price || 0),
          description: String(product?.description || ''),
          category: String(product?.category || ''),
        }));
    const terms = this.extractSearchTerms(message);
    const normalizedMessage = this.normalizeSearchText(message);

    const relevant = terms.length === 0
      ? products.slice(0, 20)
      : products.filter((product: any) => {
          const bag = this.normalizeSearchText([
            product?.name,
            product?.description,
            product?.category,
          ].filter(Boolean).join(' '));
          return terms.some((term) => bag.includes(term));
        }).slice(0, 20);

    if (relevant.length === 0) {
      if (normalizedMessage.includes('produto') || normalizedMessage.includes('preco') || normalizedMessage.includes('preço') || normalizedMessage.includes('valor')) {
        return 'Não encontrei produto correspondente na base.';
      }
      return products.slice(0, 10).map((product: any) => {
        const value = Number(product?.price || 0).toFixed(2);
        return `${String(product?.name || 'Produto')} - R$ ${value}`;
      }).join('\n') || 'Sem produtos cadastrados.';
    }

    return relevant.map((product: any) => {
      const value = Number(product?.price || 0).toFixed(2);
      return `${String(product?.name || 'Produto')} - R$ ${value}`;
    }).join('\n');
  }

  private buildTransactionsText(client: any, message: string, cachedTransactions?: AiCachedTransactionEntry[]) {
    const parseFlexibleDateTime = (raw: unknown): number => {
      const text = String(raw || '').trim();
      if (!text) return Number.NaN;

      const direct = new Date(text).getTime();
      if (Number.isFinite(direct)) return direct;

      const compact = text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
      if (compact) {
        const [, dd, mm, yyyy, hh = '00', min = '00', ss = '00'] = compact;
        const parsed = new Date(
          Number(yyyy),
          Number(mm) - 1,
          Number(dd),
          Number(hh),
          Number(min),
          Number(ss)
        ).getTime();
        if (Number.isFinite(parsed)) return parsed;
      }

      return Number.NaN;
    };

    const resolveTransactionTime = (tx: any): number => {
      const timestampTime = parseFlexibleDateTime(tx?.timestamp);
      if (Number.isFinite(timestampTime)) return timestampTime;
      return parseFlexibleDateTime(tx?.date);
    };

    const hints = this.parseMessageDateHints(message);
    const terms = this.extractSearchTerms(message);
    const messageNorm = this.normalizeSearchText(message);
    const wantsLatestConsumption = (
      (messageNorm.includes('ultimo') || messageNorm.includes('último'))
      && messageNorm.includes('consumo')
    ) || messageNorm.includes('ultimo gasto') || messageNorm.includes('último gasto');
    const wantsRecent = (
      messageNorm.includes('recente')
      || messageNorm.includes('recentes')
      || messageNorm.includes('ultimos')
      || messageNorm.includes('últimos')
      || messageNorm.includes('ultimas')
      || messageNorm.includes('últimas')
    );
    const wantsConsumption = (
      messageNorm.includes('consumo')
      || messageNorm.includes('gasto')
      || messageNorm.includes('compra')
      || messageNorm.includes('debito')
      || messageNorm.includes('débito')
      || messageNorm.includes('debit')
      || messageNorm.includes('entrega')
    );
    const wantsCredit = (
      messageNorm.includes('credito')
      || messageNorm.includes('crédito')
      || messageNorm.includes('recarga')
      || messageNorm.includes('credit')
    );

    const clientNameTokens = this.normalizeSearchText(String(client?.name || ''))
      .split(' ')
      .filter((item) => item.length >= 3);
    const responsibleTokens = this.normalizeSearchText(
      String(client?.parentName || client?.guardianName || client?.guardians?.[0] || '')
    )
      .split(' ')
      .filter((item) => item.length >= 3);
    const ignoreTerms = new Set<string>([
      ...clientNameTokens,
      ...responsibleTokens,
      'desta',
      'desse',
      'dessa',
      'deste',
      'esta',
      'esse',
      'essa',
      'este',
      'nesta',
      'neste',
      'nesse',
      'nessa',
      'semana',
      'semanal',
      'mes',
      'mês',
      'mensal',
      'hoje',
      'ontem',
      'amanha',
      'amanhã',
      'dia',
      'dias',
      'periodo',
      'período',
      'inicio',
      'início',
      'fim',
      'atual',
      'agora',
      'ultimo',
      'último',
      'consumo',
      'gasto',
      'saldo',
      'transacao',
      'transações',
      'transacao',
      'extrato',
      'recente',
      'recentes',
      'ultimos',
      'últimos',
      'ultimas',
      'últimas',
      'compra',
      'debito',
      'débito',
      'debit',
      'devo',
      'quanto',
      'qual',
      'meu',
      'minha'
    ]);
    const effectiveTerms = terms.filter((term) => !ignoreTerms.has(this.normalizeSearchText(term)));

    const isConsumptionTx = (tx: AiCachedTransactionEntry) => {
      const type = this.normalizeSearchText(String(tx?.type || ''));
      const bag = this.normalizeSearchText([
        tx?.description,
        tx?.productName,
      ].filter(Boolean).join(' '));
      return type === 'debit'
        || type === 'consumo'
        || bag.includes('compra')
        || bag.includes('consumo')
        || bag.includes('entrega');
    };

    const allTransactions = Array.isArray(cachedTransactions) && cachedTransactions.length > 0
      ? cachedTransactions
      : db.getTransactions()
          .filter((tx: any) => String(tx?.clientId || '') === String(client?.id || ''))
          .map((tx: any) => ({
            amount: Number(tx?.amount || 0),
            date: String(tx?.date || ''),
            timestamp: String(tx?.timestamp || ''),
            description: String(tx?.description || ''),
            productName: String(tx?.productName || ''),
            type: String(tx?.type || ''),
          }));

    const typedTransactions = allTransactions.filter((tx: AiCachedTransactionEntry) => {
      if (wantsConsumption) return isConsumptionTx(tx);
      if (wantsCredit) {
        const type = this.normalizeSearchText(String(tx?.type || ''));
        const bag = this.normalizeSearchText([tx?.description, tx?.productName].filter(Boolean).join(' '));
        return type === 'credit' || bag.includes('recarga') || bag.includes('credito') || bag.includes('crédito');
      }
      return true;
    });

    const filteredByDate = hints
      ? typedTransactions.filter((tx: any) => {
          const time = resolveTransactionTime(tx);
          if (!Number.isFinite(time)) return false;
          return time >= hints.start.getTime() && time <= hints.end.getTime();
        })
      : typedTransactions;

    const filteredByTerm = effectiveTerms.length === 0
      ? filteredByDate
      : filteredByDate.filter((tx: any) => {
          const bag = this.normalizeSearchText([
            tx?.description,
            tx?.productName,
            tx?.type,
          ].filter(Boolean).join(' '));
          return effectiveTerms.some((term) => bag.includes(term));
        });

    const sorted = [...filteredByTerm].sort((a: any, b: any) => {
      const aTime = resolveTransactionTime(a);
      const bTime = resolveTransactionTime(b);
      return bTime - aTime;
    });

    const sortedByDateOnly = [...filteredByDate].sort((a: any, b: any) => {
      const aTime = resolveTransactionTime(a);
      const bTime = resolveTransactionTime(b);
      return bTime - aTime;
    });

    const sortedWithFallback = (
      sorted.length === 0
      && (
        (hints && sortedByDateOnly.length > 0)
        || (
          !hints
          && (wantsConsumption || wantsCredit)
          && effectiveTerms.length > 0
        )
      )
    )
      ? (hints ? sortedByDateOnly : [...typedTransactions].sort((a: any, b: any) => {
          const aTime = resolveTransactionTime(a);
          const bTime = resolveTransactionTime(b);
          return bTime - aTime;
        }))
      : sorted;

    if (wantsLatestConsumption) {
      const latestConsumption = sortedWithFallback.find((tx: any) => isConsumptionTx(tx));
      if (!latestConsumption) {
        return 'Não encontrei registro de consumo para o aluno consultado.';
      }
      const amount = Number(latestConsumption?.amount || 0);
      const abs = Math.abs(amount).toFixed(2);
      const resolvedTime = resolveTransactionTime(latestConsumption);
      const date = Number.isFinite(resolvedTime)
        ? new Date(resolvedTime).toLocaleDateString('pt-BR')
        : '-';
      const description = String(latestConsumption?.description || latestConsumption?.productName || latestConsumption?.type || 'Consumo');
      return `Último consumo: ${date} | ${description} | R$ ${abs}`;
    }

    let topList = sortedWithFallback.slice(0, 20);
    if (wantsRecent && !hints) {
      topList = sortedWithFallback.slice(0, 10);
    }

    if (topList.length === 0) return 'Sem transações para o filtro solicitado.';

    return topList.map((tx: any) => {
      const amount = Number(tx?.amount || 0);
      const sign = amount >= 0 ? '+' : '-';
      const abs = Math.abs(amount).toFixed(2);
      const resolvedTime = resolveTransactionTime(tx);
      const date = Number.isFinite(resolvedTime)
        ? new Date(resolvedTime).toLocaleDateString('pt-BR')
        : '-';
      const description = String(tx?.description || tx?.productName || tx?.type || 'Movimentação');
      return `${date} | ${description} | ${sign}R$ ${abs}`;
    }).join('\n');
  }

  private buildAiVariables(chatJid: string, client: any, customerMessage: string) {
    const now = new Date();
    const startDate = this.sessionConfig.startDate || now.toISOString().slice(0, 10);
    const endDate = this.sessionConfig.endDate || now.toISOString().slice(0, 10);
    const cached = this.getOrBuildAiDataCache(chatJid, client);
    const responsibleName = String(cached?.staticData.responsibleName || client?.parentName || client?.guardianName || client?.guardians?.[0] || client?.name || 'Cliente').trim();
    const className = String(cached?.staticData.className || client?.className || client?.grade || client?.class || client?.year || '-').trim();
    const restrictionText = String(cached?.staticData.restrictionText || 'Sem restrições cadastradas.');
    const totalBalance = Number(cached?.dynamicData.totalBalance ?? client?.balance ?? 0);
    const planBalances = this.buildPlanBalanceText(client, customerMessage, cached?.dynamicData.planEntries);
    const transactionsText = this.buildTransactionsText(client, customerMessage, cached?.dynamicData.transactions);
    const productsWithValues = this.buildProductsWithValuesText(client, customerMessage, cached?.dynamicData.products);
    const deliveryText = String(cached?.dynamicData.deliveryText || client?.dailyDeliveryNotes || client?.deliveryNotes || client?.deliveryPreference || 'Sem entrega do dia cadastrada.');
    const relatedClientsText = String(cached?.staticData.relatedClientsText || this.buildRelatedClientsText(chatJid, client, customerMessage));
    const enterpriseName = String(cached?.staticData.enterpriseName || this.aiConfig.companyName || db.getEnterprise(client?.enterpriseId || '')?.name || 'Cantina Smart');
    const schoolName = String(cached?.staticData.schoolName || db.getEnterprise(client?.enterpriseId || '')?.attachedSchoolName || '-');
    const phone = String(cached?.staticData.phone || `+${this.getPhoneFromJid(chatJid)}`);
    const reportSummary = [
      `Cliente: ${String(client?.name || responsibleName)}`,
      `Responsável: ${responsibleName}`,
      `Telefone: ${phone}`,
      `Saldo total: R$ ${totalBalance.toFixed(2)}`,
      `Saldos dos planos:\n${planBalances}`
    ].join('\n');

    return {
      '{cliente_nome}': String(client?.name || responsibleName),
      '{alunos_colaboradores}': relatedClientsText,
      '{responsavel_nome}': responsibleName,
      '{responsavel_detalhe}': `${responsibleName} | Telefone: ${phone}`,
      '{telefone}': phone,
      '{turma}': className,
      '{restricao}': restrictionText,
      '{data_atual}': now.toLocaleDateString('pt-BR'),
      '{saldo_carteira}': `R$ ${totalBalance.toFixed(2)}`,
      '{saldo_planos}': planBalances,
      '{saldo_total}': `R$ ${totalBalance.toFixed(2)}`,
      '{transacoes}': transactionsText,
      '{entrega_dia}': deliveryText,
      '{produtos_valores}': productsWithValues,
      '{relatorio_resumo}': reportSummary,
      '{relatorio_pdf}': 'Solicite relatório completo em PDF no painel de conversas.',
      '{tipo_contato}': String(client?.type || 'NÃO_IDENTIFICADO'),
      '{empresa_nome}': enterpriseName,
      '{escola_nome}': schoolName,
      '{data_inicial}': startDate,
      '{data_final}': endDate,
    } as Record<string, string>;
  }

  private sanitizePdfText(input: unknown) {
    const normalized = String(input ?? '')
      .replace(/\r/g, ' ')
      .replace(/\n/g, ' ')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7E]/g, ' ')
      .trim();
    return normalized;
  }

  private escapePdfText(input: string) {
    return String(input || '')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  }

  private wrapPdfLines(input: string, maxChars = 92) {
    const clean = this.sanitizePdfText(input);
    if (!clean) return ['-'];
    const words = clean.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
      if (!current) {
        current = word;
        continue;
      }
      if ((current.length + 1 + word.length) <= maxChars) {
        current = `${current} ${word}`;
      } else {
        lines.push(current);
        current = word;
      }
    }

    if (current) lines.push(current);
    return lines.length > 0 ? lines : ['-'];
  }

  private buildSimplePdfBase64(lines: string[]) {
    const pageHeight = 842;
    const topMargin = 800;
    const lineHeight = 14;
    const maxLines = 52;
    const finalLines = lines.slice(0, maxLines);
    const textCommands: string[] = ['BT', '/F1 10 Tf', `40 ${topMargin} Td`];

    finalLines.forEach((line, index) => {
      const safeLine = this.escapePdfText(this.sanitizePdfText(line));
      if (index === 0) {
        textCommands.push(`(${safeLine}) Tj`);
      } else {
        textCommands.push(`0 -${lineHeight} Td`);
        textCommands.push(`(${safeLine}) Tj`);
      }
    });
    textCommands.push('ET');

    const contentStream = textCommands.join('\n');
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 ${pageHeight}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      `<< /Length ${Buffer.byteLength(contentStream, 'utf8')} >>\nstream\n${contentStream}\nendstream`
    ];

    const chunks: string[] = ['%PDF-1.4\n'];
    const offsets: number[] = [0];

    objects.forEach((object, index) => {
      const serialized = `${index + 1} 0 obj\n${object}\nendobj\n`;
      offsets.push(Buffer.byteLength(chunks.join(''), 'utf8'));
      chunks.push(serialized);
    });

    const xrefOffset = Buffer.byteLength(chunks.join(''), 'utf8');
    let xref = `xref\n0 ${objects.length + 1}\n`;
    xref += '0000000000 65535 f \n';
    for (let i = 1; i <= objects.length; i += 1) {
      xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }

    const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    const pdfBinary = `${chunks.join('')}${xref}${trailer}`;
    return Buffer.from(pdfBinary, 'utf8').toString('base64');
  }

  private getMonthlyReportDateRange() {
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 30);
    startDate.setHours(0, 0, 0, 0);
    return { startDate, endDate };
  }

  private doesTransactionMatchClientByName(tx: any, client: any) {
    const clientName = this.normalizeSearchText(String(client?.name || ''));
    const txClientName = this.normalizeSearchText(String(tx?.clientName || tx?.name || tx?.cliente || ''));
    if (!clientName || !txClientName) return false;
    if (clientName === txClientName) return true;
    if (clientName.includes(txClientName) || txClientName.includes(clientName)) return true;

    const left = this.tokenizeNormalizedText(clientName).filter((item) => item.length >= 3);
    const right = this.tokenizeNormalizedText(txClientName).filter((item) => item.length >= 3);
    if (left.length === 0 || right.length === 0) return false;

    return left.some((leftToken) => right.some((rightToken) => (
      leftToken === rightToken || this.isApproximateNameTokenMatch(leftToken, rightToken)
    )));
  }

  private buildAutoReportTransactions(client: any, _incomingText: string) {
    const enterpriseId = String(client?.enterpriseId || '').trim();
    const clientId = String(client?.id || '').trim();
    const all = db.getTransactions({ enterpriseId });
    const { startDate, endDate } = this.getMonthlyReportDateRange();

    const monthly = all.filter((tx: any) => {
      const ts = this.resolveTransactionTimeValue(tx);
      if (!Number.isFinite(ts)) return false;
      return ts >= startDate.getTime() && ts <= endDate.getTime();
    });

    const byName = monthly.filter((tx: any) => this.doesTransactionMatchClientByName(tx, client));
    const byId = clientId
      ? monthly.filter((tx: any) => String(tx?.clientId || '').trim() === clientId)
      : [];

    const merged = [...byName, ...byId];
    const uniqueByKey = new Map<string, any>();
    for (const tx of merged) {
      const key = String(tx?.id || '') || `${String(tx?.timestamp || tx?.date || '')}_${String(tx?.description || tx?.type || '')}_${String(tx?.total ?? tx?.amount ?? '')}`;
      if (!uniqueByKey.has(key)) {
        uniqueByKey.set(key, tx);
      }
    }

    return Array.from(uniqueByKey.values())
      .sort((a: any, b: any) => this.resolveTransactionTimeValue(b) - this.resolveTransactionTimeValue(a))
      .slice(0, 250);
  }

  private formatReportTransactionLine(tx: any) {
    const ts = this.resolveTransactionTimeValue(tx);
    const dateText = Number.isFinite(ts)
      ? new Date(ts).toLocaleDateString('pt-BR')
      : '-';
    const typeText = this.sanitizePdfText(String(tx?.type || 'MOV'));
    const description = this.sanitizePdfText(String(tx?.description || tx?.item || tx?.productName || 'Movimentacao'));
    const amount = Number(tx?.amount ?? tx?.total ?? 0);
    const abs = Math.abs(Number.isFinite(amount) ? amount : 0).toFixed(2);
    return `${dateText} | ${typeText} | ${description} | R$ ${abs}`;
  }

  private isConsumptionTransaction(tx: any) {
    const type = this.normalizeSearchText(String(tx?.type || ''));
    if (type.includes('debit') || type.includes('debito') || type.includes('consumo') || type.includes('saida')) {
      return true;
    }
    const amount = Number(tx?.amount ?? tx?.total ?? 0);
    return Number.isFinite(amount) && amount < 0;
  }

  private isCreditTransaction(tx: any) {
    const type = this.normalizeSearchText(String(tx?.type || ''));
    if (type.includes('credit') || type.includes('credito') || type.includes('entrada') || type.includes('recarga')) {
      return true;
    }
    const amount = Number(tx?.amount ?? tx?.total ?? 0);
    return Number.isFinite(amount) && amount > 0 && !this.isConsumptionTransaction(tx);
  }

  private buildClientAutoReportPdf(chatJid: string, client: any, incomingText: string) {
    const enterprise = db.getEnterprise(client?.enterpriseId || '');
    const contactType = String(client?.type || '').toUpperCase();
    const responsible = String(client?.parentName || client?.guardianName || client?.guardians?.[0] || client?.name || '-');
    const { startDate, endDate } = this.getMonthlyReportDateRange();
    const periodLabel = 'Mensal (últimos 30 dias)';

    const transactions = this.buildAutoReportTransactions(client, incomingText)
      .filter((tx: any) => {
        const ts = this.resolveTransactionTimeValue(tx);
        if (!Number.isFinite(ts)) return false;
        return ts >= startDate.getTime() && ts <= endDate.getTime();
      })
      .sort((a: any, b: any) => {
        const aTs = this.resolveTransactionTimeValue(a);
        const bTs = this.resolveTransactionTimeValue(b);
        return aTs - bTs;
      });

    const parseAmount = (tx: any) => Math.abs(Number(tx?.amount ?? tx?.total ?? tx?.value ?? 0) || 0);
    const isConsumption = (tx: any) => this.isConsumptionTransaction(tx);
    const isCredit = (tx: any) => this.isCreditTransaction(tx);
    const formatDatePt = (value: Date) => value.toLocaleDateString('pt-BR');

    const totalConsumption = transactions.filter(isConsumption).reduce((acc: number, tx: any) => acc + parseAmount(tx), 0);
    const totalCredits = transactions.filter(isCredit).reduce((acc: number, tx: any) => acc + parseAmount(tx), 0);
    const netPeriod = Number((totalCredits - totalConsumption).toFixed(2));

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const formatCurrency = (value: number) => `R$ ${Number(value || 0).toFixed(2)}`;
    const buildItemsDetail = (tx: any) => {
      const items = Array.isArray(tx?.items) ? tx.items : [];
      if (items.length > 0) {
        const mapped = items
          .map((item: any) => {
            const name = String(item?.name || item?.productName || 'Item').trim();
            const qty = Math.max(1, Number(item?.quantity || 1));
            const unit = Number(item?.price ?? item?.unitPrice ?? 0) || 0;
            const subtotal = Number(item?.total ?? (qty * unit)) || 0;
            return `${qty}x ${name} (${formatCurrency(subtotal)})`;
          })
          .slice(0, 3);
        const suffix = items.length > 3 ? ` +${items.length - 3} item(ns)` : '';
        return `${mapped.join(' | ')}${suffix}`;
      }
      return String(tx?.description || tx?.item || tx?.productName || tx?.plan || '-');
    };

    // Header faixa destaque
    doc.setFillColor(15, 23, 42);
    doc.rect(24, 20, pageWidth - 48, 62, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Extrato de Movimentações - WhatsApp', 40, 48);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Empresa: ${String(enterprise?.name || this.aiConfig.companyName || '-')}`, 40, 66);
    doc.text(`Escola: ${String(enterprise?.attachedSchoolName || '-')}`, 300, 66);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageWidth - 40, 66, { align: 'right' });

    doc.setTextColor(31, 41, 55);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`Contato: ${String(client?.name || '-')}`, 28, 100);
    doc.text(`Tipo: ${contactType || '-'}`, 28, 116);
    doc.text(`Período: ${formatDatePt(startDate)} até ${formatDatePt(endDate)} (${periodLabel})`, 28, 132);

    if (contactType === 'ALUNO') {
      const classYear = [String(client?.class || '').trim(), String(client?.classGrade || '').trim()]
        .filter(Boolean)
        .join(' / ');
      doc.text(`Responsável: ${responsible || '-'}`, 390, 100);
      doc.text(`Turma/Ano: ${classYear || '-'}`, 390, 116);
    } else {
      doc.text('Responsável: -', 390, 100);
    }

    const planBalances = client?.planCreditBalances || {};
    const prepaidBalance = Number(client?.balance || 0);
    const plansTotalBalance = Object.values(planBalances).reduce((acc: number, entry: any) => acc + Number(entry?.balance || 0), 0);
    const collaboratorDue = Number(client?.amountDue || 0);
    const collaboratorConsumption = Number(client?.monthlyConsumption || 0);

    // Cards de resumo destacados
    const cards = [
      { label: 'Créditos no período', value: formatCurrency(totalCredits), bg: [219, 234, 254], border: [147, 197, 253] },
      { label: 'Consumo no período', value: formatCurrency(totalConsumption), bg: [254, 226, 226], border: [252, 165, 165] },
      { label: 'Saldo líquido', value: formatCurrency(netPeriod), bg: [220, 252, 231], border: [134, 239, 172] },
      {
        label: contactType === 'ALUNO' ? 'Saldo atual (carteira + planos)' : 'Saldo/consumo colaborador',
        value: contactType === 'ALUNO'
          ? formatCurrency(prepaidBalance + plansTotalBalance)
          : `${formatCurrency(collaboratorDue)} / ${formatCurrency(collaboratorConsumption)}`,
        bg: [243, 232, 255],
        border: [216, 180, 254]
      },
    ];

    const cardWidth = (pageWidth - 64 - 18) / 4;
    cards.forEach((card, idx) => {
      const x = 28 + (idx * (cardWidth + 6));
      const y = 144;
      doc.setFillColor(card.bg[0], card.bg[1], card.bg[2]);
      doc.setDrawColor(card.border[0], card.border[1], card.border[2]);
      doc.roundedRect(x, y, cardWidth, 52, 8, 8, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(card.label, x + 10, y + 18);
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text(card.value, x + 10, y + 38);
    });

    const bodyRows = transactions.map((tx: any) => {
      const ts = this.resolveTransactionTimeValue(tx);
      const txDate = Number.isFinite(ts) ? new Date(ts) : null;
      const dateLabel = txDate ? txDate.toLocaleDateString('pt-BR') : '-';
      const timeLabel = txDate ? txDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-';
      const description = String(tx?.description || tx?.item || tx?.plan || tx?.category || tx?.productName || 'Movimentação');
      const txType = isConsumption(tx) ? 'CONSUMO' : isCredit(tx) ? 'CRÉDITO' : String(tx?.type || '-');
      const method = String(tx?.paymentMethod || tx?.method || '-');
      const amount = parseAmount(tx);
      return [
        `${dateLabel} ${timeLabel}`,
        description,
        buildItemsDetail(tx),
        txType,
        method,
        formatCurrency(amount)
      ];
    });

    autoTable(doc, {
      startY: 208,
      margin: { left: 28, right: 28 },
      head: [['Data/Hora', 'Lançamento', 'Itens detalhados', 'Natureza', 'Método', 'Valor']],
      body: bodyRows.length > 0 ? bodyRows : [['-', 'Sem movimentações no período selecionado', '-', '-', '-', 'R$ 0,00']],
      styles: { fontSize: 8, cellPadding: 5, textColor: [30, 41, 59] },
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 105 },
        1: { cellWidth: 155 },
        2: { cellWidth: 250 },
        3: { cellWidth: 70 },
        4: { cellWidth: 80 },
        5: { cellWidth: 80, halign: 'right' }
      }
    });

    const finalY = ((doc as any).lastAutoTable?.finalY || 240);
    const summaryTop = Math.min(pageHeight - 108, finalY + 16);
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(28, summaryTop, pageWidth - 56, 58, 8, 8, 'FD');
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(`Total de movimentações: ${transactions.length}`, 40, summaryTop + 20);
    doc.text(`Total créditos: ${formatCurrency(totalCredits)}`, 250, summaryTop + 20);
    doc.text(`Total consumo: ${formatCurrency(totalConsumption)}`, 450, summaryTop + 20);
    doc.text(`Saldo líquido: ${formatCurrency(netPeriod)}`, 650, summaryTop + 20);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    if (contactType === 'ALUNO') {
      doc.text(`Saldo PREPAGO atual: ${formatCurrency(prepaidBalance)}`, 40, summaryTop + 40);
      doc.text(`Saldo total dos planos: ${formatCurrency(plansTotalBalance)}`, 250, summaryTop + 40);
    } else {
      doc.text(`Consumo acumulado colaborador: ${formatCurrency(collaboratorConsumption)}`, 40, summaryTop + 40);
      doc.text(`Saldo/valor devido atual: ${formatCurrency(collaboratorDue)}`, 320, summaryTop + 40);
    }

    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i += 1) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Extrato gerado por ${String(enterprise?.name || this.aiConfig.companyName || 'Cantina Smart')} | Página ${i} de ${pageCount}`,
        pageWidth - 28,
        pageHeight - 16,
        { align: 'right' }
      );
    }

    const pdfDataUri = doc.output('datauristring');
    const base64Data = String(pdfDataUri || '').split(',').pop() || '';
    const safeName = String(client?.name || 'cliente')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase() || 'cliente';
    const fileName = `relatorio_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`;

    return {
      base64Data,
      fileName,
      caption: 'Segue o relatório em PDF com as movimentações do último mês.'
    };
  }

  private buildClientAutoReportPdfFallback(chatJid: string, client: any, incomingText: string) {
    const enterprise = db.getEnterprise(client?.enterpriseId || '');
    const responsible = String(client?.parentName || client?.guardianName || client?.guardians?.[0] || client?.name || '-');
    const transactions = this.buildAutoReportTransactions(client, incomingText);
    const totalConsumed = transactions
      .filter((tx: any) => this.isConsumptionTransaction(tx))
      .reduce((sum: number, tx: any) => sum + Math.abs(Number(tx?.amount ?? tx?.total ?? 0) || 0), 0);
    const totalCredits = transactions
      .filter((tx: any) => this.isCreditTransaction(tx))
      .reduce((sum: number, tx: any) => sum + Math.abs(Number(tx?.amount ?? tx?.total ?? 0) || 0), 0);
    const formatCurrency = (value: number) => `R$ ${Number(value || 0).toFixed(2)}`;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const rightMargin = pageWidth - 32;
    const tableLeft = 32;
    const tableTop = 164;
    const colWidths = [100, 380, 95, 95];
    const rowHeight = 20;

    // Cabeçalho premium (fallback visual)
    doc.setFillColor(17, 24, 39);
    doc.roundedRect(24, 18, pageWidth - 48, 80, 10, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.text('Extrato de Movimentações - WhatsApp', 36, 46);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Empresa: ${String(enterprise?.name || this.aiConfig.companyName || '-')}`, 36, 66);
    doc.text(`Escola: ${String(enterprise?.attachedSchoolName || '-')}`, 36, 80);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, rightMargin, 80, { align: 'right' });

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`Contato: ${String(client?.name || '-')}`, 30, 118);
    doc.text(`Responsável: ${responsible}`, 30, 134);
    doc.text(`Telefone: +${this.getPhoneFromJid(chatJid)}`, 300, 118);
    doc.text(`Saldo carteira atual: ${formatCurrency(Number(client?.balance || 0))}`, 300, 134);

    // Cards de resumo
    const summaryCards = [
      { label: 'Total movimentações', value: String(transactions.length), bg: [224, 242, 254], border: [125, 211, 252] },
      { label: 'Total créditos', value: formatCurrency(totalCredits), bg: [220, 252, 231], border: [134, 239, 172] },
      { label: 'Total consumo', value: formatCurrency(totalConsumed), bg: [254, 226, 226], border: [252, 165, 165] },
      { label: 'Saldo líquido', value: formatCurrency(totalCredits - totalConsumed), bg: [243, 232, 255], border: [196, 181, 253] },
    ];
    const cardWidth = (pageWidth - 64 - 18) / 4;
    summaryCards.forEach((card, idx) => {
      const x = 28 + (idx * (cardWidth + 6));
      const y = 140;
      doc.setFillColor(card.bg[0], card.bg[1], card.bg[2]);
      doc.setDrawColor(card.border[0], card.border[1], card.border[2]);
      doc.roundedRect(x, y, cardWidth, 46, 8, 8, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(card.label, x + 10, y + 16);
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text(card.value, x + 10, y + 34);
    });

    // Tabela manual para não depender de plugin no fallback
    let y = tableTop + 36;
    const maxRows = Math.max(1, Math.floor((pageHeight - y - 58) / rowHeight));
    const tableRows = transactions.length > 0
      ? transactions.slice(0, Math.max(1, maxRows - 1))
      : [];

    doc.setFillColor(30, 64, 175);
    doc.rect(tableLeft, tableTop, colWidths.reduce((a, b) => a + b, 0), 24, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    const headers = ['Data/Hora', 'Descrição', 'Natureza', 'Valor'];
    let cursorX = tableLeft + 8;
    headers.forEach((head, idx) => {
      doc.text(head, cursorX, tableTop + 16);
      cursorX += colWidths[idx];
    });

    if (tableRows.length === 0) {
      doc.setTextColor(51, 65, 85);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setFillColor(248, 250, 252);
      doc.rect(tableLeft, y - 14, colWidths.reduce((a, b) => a + b, 0), rowHeight, 'F');
      doc.text('Sem movimentações no período selecionado.', tableLeft + 8, y);
      y += rowHeight;
    } else {
      tableRows.forEach((tx: any, idx: number) => {
        const ts = this.resolveTransactionTimeValue(tx);
        const txDate = Number.isFinite(ts) ? new Date(ts) : null;
        const dateLabel = txDate
          ? `${txDate.toLocaleDateString('pt-BR')} ${txDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
          : '-';
        const description = String(tx?.description || tx?.item || tx?.productName || tx?.plan || 'Movimentação');
        const txType = this.isConsumptionTransaction(tx) ? 'CONSUMO' : this.isCreditTransaction(tx) ? 'CRÉDITO' : String(tx?.type || '-');
        const amount = Math.abs(Number(tx?.amount ?? tx?.total ?? tx?.value ?? 0) || 0);

        if (idx % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(tableLeft, y - 14, colWidths.reduce((a, b) => a + b, 0), rowHeight, 'F');
        }

        doc.setTextColor(30, 41, 59);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);

        let rowX = tableLeft + 8;
        doc.text(dateLabel, rowX, y);
        rowX += colWidths[0];

        const descriptionLines = doc.splitTextToSize(description, colWidths[1] - 10);
        doc.text(descriptionLines[0] || '-', rowX, y);
        rowX += colWidths[1];

        doc.text(txType, rowX, y);
        rowX += colWidths[2];
        doc.text(formatCurrency(amount), rowX + colWidths[3] - 16, y, { align: 'right' });

        y += rowHeight;
      });
    }

    // Bordas verticais da tabela
    doc.setDrawColor(203, 213, 225);
    let lineX = tableLeft;
    [0, ...colWidths].forEach((width) => {
      doc.line(lineX, tableTop, lineX, y + 6);
      lineX += width;
    });
    doc.line(tableLeft, tableTop, tableLeft + colWidths.reduce((a, b) => a + b, 0), tableTop);
    doc.line(tableLeft, y + 6, tableLeft + colWidths.reduce((a, b) => a + b, 0), y + 6);

    // Rodapé
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Relatório automático (fallback visual) | ${String(enterprise?.name || this.aiConfig.companyName || 'Cantina Smart')}`,
      rightMargin,
      pageHeight - 14,
      { align: 'right' }
    );

    const pdfDataUri = doc.output('datauristring');
    const base64Data = String(pdfDataUri || '').split(',').pop() || '';
    const safeName = String(client?.name || 'cliente')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase() || 'cliente';
    const fileName = `relatorio_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`;
    return {
      base64Data,
      fileName,
      caption: 'Segue o relatório em PDF com as movimentações do último mês.',
      fallback: true as const,
    };
  }

  private async maybeSendAutoClientReportPdf(
    chatJid: string,
    incomingText: string,
    targetClient: any,
    options?: { forceIntent?: boolean }
  ): Promise<AutoReportPdfResult> {
    const forceIntent = Boolean(options?.forceIntent);
    if (!Boolean(this.aiConfig.tools?.autoSendPdfReport ?? true) && !forceIntent) {
      return { sent: false, reason: 'tool_disabled' };
    }
    if (!forceIntent && !this.shouldAutoSendClientReportPdf(incomingText)) {
      return { sent: false, reason: 'intent_not_match' };
    }
    if (!targetClient?.id) {
      return { sent: false, reason: 'target_client_not_found' };
    }

    let pdfPayload: {
      base64Data: string;
      fileName: string;
      caption: string;
      fallback?: true;
    };
    try {
      pdfPayload = this.buildClientAutoReportPdf(chatJid, targetClient, incomingText);
    } catch (err) {
      this.logWarn('Falha ao gerar PDF no layout principal. Aplicando fallback.', err instanceof Error ? err.message : err);
      try {
        pdfPayload = this.buildClientAutoReportPdfFallback(chatJid, targetClient, incomingText);
      } catch (fallbackBuildErr) {
        this.logWarn('Falha ao gerar PDF também no fallback.', fallbackBuildErr instanceof Error ? fallbackBuildErr.message : fallbackBuildErr);
        return { sent: false, reason: 'pdf_build_failed' };
      }
    }
    if (!String(pdfPayload.base64Data || '').trim() || String(pdfPayload.base64Data || '').trim().length < 80) {
      this.logWarn('PDF gerado sem conteúdo válido. Aplicando fallback.', {
        clientId: String(targetClient?.id || ''),
        payloadSize: String(pdfPayload.base64Data || '').length,
      });
      try {
        pdfPayload = this.buildClientAutoReportPdfFallback(chatJid, targetClient, incomingText);
      } catch (fallbackBuildErr) {
        this.logWarn('Falha ao regenerar fallback após payload inválido.', fallbackBuildErr instanceof Error ? fallbackBuildErr.message : fallbackBuildErr);
        return { sent: false, reason: 'pdf_build_failed' };
      }
    }

    const chatId = this.toExternalChatId(chatJid);
    try {
      await this.sendMessageToChat(
        chatId,
        'Estou consultando os dados e montando seu relatório em PDF. Aguarde só um instante, por favor.'
      );
    } catch (queueInfoErr) {
      this.logWarn('Falha ao enviar aviso de fila do relatório automático.', queueInfoErr instanceof Error ? queueInfoErr.message : queueInfoErr);
    }

    try {
      await this.sendMediaToChat(chatId, {
        mediaType: 'document',
        base64Data: pdfPayload.base64Data,
        mimeType: 'application/pdf',
        fileName: pdfPayload.fileName,
      }, pdfPayload.caption);
      try {
        await this.sendMessageToChat(chatId, 'Relatório pronto. PDF enviado com sucesso.');
      } catch (doneMsgErr) {
        this.logWarn('Falha ao enviar confirmação de conclusão do relatório automático.', doneMsgErr instanceof Error ? doneMsgErr.message : doneMsgErr);
      }
      this.logInfo('Relatório PDF automático enviado para o cliente.', {
        chatId,
        clientId: String(targetClient?.id || ''),
        fileName: pdfPayload.fileName,
        fallback: Boolean(pdfPayload.fallback),
      });
      return { sent: true, fileName: pdfPayload.fileName };
    } catch (firstErr) {
      if (!pdfPayload.fallback) {
        try {
          const fallbackPayload = this.buildClientAutoReportPdfFallback(chatJid, targetClient, incomingText);
          await this.sendMediaToChat(chatId, {
            mediaType: 'document',
            base64Data: fallbackPayload.base64Data,
            mimeType: 'application/pdf',
            fileName: fallbackPayload.fileName,
          }, fallbackPayload.caption);
          try {
            await this.sendMessageToChat(chatId, 'Relatório pronto. PDF enviado com sucesso.');
          } catch (doneMsgErr) {
            this.logWarn('Falha ao enviar confirmação de conclusão do relatório automático (fallback).', doneMsgErr instanceof Error ? doneMsgErr.message : doneMsgErr);
          }
          this.logInfo('Relatório PDF automático enviado em fallback após falha do layout principal.', {
            chatId,
            clientId: String(targetClient?.id || ''),
            fileName: fallbackPayload.fileName,
          });
          return { sent: true, fileName: fallbackPayload.fileName };
        } catch (fallbackErr) {
          this.logWarn('Falha ao enviar relatório PDF automático no fallback.', fallbackErr instanceof Error ? fallbackErr.message : fallbackErr);
        }
      }
      this.logWarn('Falha ao enviar relatório PDF automático.', firstErr instanceof Error ? firstErr.message : firstErr);
      return { sent: false, reason: 'send_failed' };
    }
  }

  private applyVariables(template: string, variables: Record<string, string>) {
    let output = String(template || '');
    Object.entries(variables).forEach(([key, value]) => {
      output = output.split(key).join(String(value || ''));
    });
    return output;
  }

  private recordAiAudit(input: Omit<AiAuditEntry, 'id' | 'timestamp'> & { timestamp?: number }) {
    const entry: AiAuditEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Number(input?.timestamp || Date.now()),
      reason: input.reason,
      chatId: String(input.chatId || ''),
      contactName: String(input.contactName || '').trim() || 'Contato',
      excerpt: String(input.excerpt || '').trim().slice(0, 280),
      details: String(input.details || '').trim().slice(0, 500),
    };

    this.aiAuditLog.unshift(entry);
    if (this.aiAuditLog.length > WhatsAppSessionManager.AI_AUDIT_MAX_ITEMS) {
      this.aiAuditLog.splice(WhatsAppSessionManager.AI_AUDIT_MAX_ITEMS);
    }

    this.logWarn('Auditoria AI: resposta recusada por política.', {
      reason: entry.reason,
      chatId: entry.chatId,
      contactName: entry.contactName,
      details: entry.details,
    });
  }

  private detectDestructiveIntent(message: string) {
    const text = this.normalizeSearchText(message);
    if (!text) return null;

    const rules = [
      { key: 'rm -rf', detail: 'Tentativa de comando destrutivo (rm -rf).' },
      { key: 'drop table', detail: 'Tentativa de instrução SQL destrutiva (DROP TABLE).' },
      { key: 'truncate table', detail: 'Tentativa de instrução SQL destrutiva (TRUNCATE TABLE).' },
      { key: 'delete from', detail: 'Tentativa de DELETE potencialmente destrutivo.' },
      { key: 'deletar em massa', detail: 'Tentativa de exclusão em massa.' },
      { key: 'apagar banco', detail: 'Tentativa de apagar banco de dados.' },
      { key: 'apagar tabela', detail: 'Tentativa de apagar tabela.' },
      { key: 'apagar arquivo', detail: 'Tentativa de apagar arquivo/código.' },
      { key: 'rollback destrutivo', detail: 'Tentativa de rollback destrutivo.' },
      { key: 'drop', detail: 'Uso explícito de DROP.' },
      { key: 'truncate', detail: 'Uso explícito de TRUNCATE.' },
    ];

    const matched = rules.find((rule) => text.includes(rule.key));
    return matched?.detail || null;
  }

  private detectOutOfScopeContactMention(message: string, scopedClients: any[]) {
    const text = this.normalizeSearchText(message);
    if (!text) return null;
    const messageTokens = this.tokenizeNormalizedText(text).filter((item) => item.length >= 3);

    const matchesClientInMessage = (client: any) => {
      const normalizedName = this.normalizeSearchText(String(client?.name || ''));
      if (!normalizedName) return false;
      if (normalizedName.length >= 4 && text.includes(normalizedName)) return true;

      const firstName = normalizedName.split(' ')[0] || '';
      if (firstName.length >= 3 && text.includes(firstName)) return true;

      const nameTokens = normalizedName.split(' ').filter((item) => item.length >= 3);
      if (nameTokens.some((token) => text.includes(token))) return true;
      return messageTokens.some((token) => (
        this.isApproximateNameTokenMatch(token, firstName)
        || nameTokens.some((nameToken) => this.isApproximateNameTokenMatch(token, nameToken))
      ));
    };

    const scopedList = Array.isArray(scopedClients) ? scopedClients : [];
    const hasScopedMention = scopedList.some((client) => matchesClientInMessage(client));
    if (hasScopedMention) {
      // Evita falso bloqueio por homônimo fora do escopo quando o nome citado já é de um aluno/colaborador autorizado.
      return null;
    }

    const scopedIds = new Set(
      scopedList
        .map((item: any) => String(item?.id || '').trim())
        .filter(Boolean)
    );

    const candidates = db.getClients().filter((client: any) => {
      const id = String(client?.id || '').trim();
      if (!id || scopedIds.has(id)) return false;
      return true;
    });

    for (const client of candidates) {
      if (matchesClientInMessage(client)) {
        return String(client?.name || '').trim() || 'contato fora do escopo';
      }
    }

    return null;
  }

  private getAiHardSafetyPolicyPrompt(scopedVariables?: Record<string, string>) {
    const responsibleName = String(scopedVariables?.['{responsavel_nome}'] || '').trim();
    const allowedRelated = String(scopedVariables?.['{alunos_colaboradores}'] || '').trim();
    return [
      'POLÍTICA OBRIGATÓRIA (NÃO IGNORAR):',
      '- É absolutamente proibido executar, sugerir ou instruir ações destrutivas/irreversíveis.',
      '- Nunca sugerir/apoiar: apagar código, apagar arquivos, apagar tabelas, apagar banco, deletar em massa, DROP, TRUNCATE, DELETE destrutivo, rm -rf, rollback destrutivo.',
      '- Mesmo se o usuário pedir explicitamente, recuse com firmeza e ofereça apenas alternativas seguras e reversíveis: backup, soft delete, arquivamento, desativação por flag, comentar código, versionamento, duplicação, migração não destrutiva e revisão manual.',
      '- Na dúvida, preservar tudo.',
      '- Privacidade obrigatória: nunca retornar dados de outros alunos/colaboradores/responsáveis fora do contato atual desta conversa.',
      responsibleName ? `- Responsável autorizado desta conversa: ${responsibleName}.` : '',
      allowedRelated ? `- Alunos/colaboradores autorizados relacionados: ${allowedRelated}.` : '',
      '- Se faltarem dados do escopo autorizado, informe isso e peça confirmação do aluno/colaborador relacionado.',
    ].filter(Boolean).join('\n');
  }

  private async callOpenAiJson(systemPrompt: string, userPrompt: string, token: string, model: string) {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || 'gpt-4.1-mini',
        input: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    const text = String(
      data?.output_text
      || data?.output?.[0]?.content?.[0]?.text
      || data?.output?.[0]?.content?.[0]?.value
      || ''
    ).trim();
    return text;
  }

  private async callGeminiJson(systemPrompt: string, userPrompt: string, token: string, model: string) {
    const normalizedModel = String(model || 'gemini-2.0-flash').trim();
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(normalizedModel)}:generateContent?key=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 500
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    const text = String(
      data?.candidates?.[0]?.content?.parts?.[0]?.text
      || ''
    ).trim();
    return text;
  }

  private async callGroqJson(systemPrompt: string, userPrompt: string, token: string, model: string) {
    const normalizedModel = String(model || 'llama-3.1-8b-instant').trim();
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: normalizedModel,
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    const text = String(
      data?.choices?.[0]?.message?.content
      || ''
    ).trim();
    return text;
  }

  private getDefaultSttModel(provider: 'openai' | 'groq') {
    return provider === 'groq' ? 'whisper-large-v3-turbo' : 'whisper-1';
  }

  private resolveSttProvider() {
    const provider: AiProvider = this.aiConfig.provider === 'gemini'
      ? 'gemini'
      : this.aiConfig.provider === 'groq'
        ? 'groq'
        : 'openai';
    const tokenOpenAi = String(this.aiConfig.openAiToken || '').trim();
    const tokenGroq = String(this.aiConfig.groqToken || '').trim();

    if (provider === 'groq' && tokenGroq) return { provider: 'groq' as const, token: tokenGroq };
    if (provider === 'openai' && tokenOpenAi) return { provider: 'openai' as const, token: tokenOpenAi };
    if (tokenGroq) return { provider: 'groq' as const, token: tokenGroq };
    if (tokenOpenAi) return { provider: 'openai' as const, token: tokenOpenAi };
    return null;
  }

  private resolveSttMimeType(media: ExtractedMedia) {
    const fromNode = String(media.mimeType || '').trim().toLowerCase();
    if (fromNode) return fromNode;
    const dataUrl = String(media.mediaDataUrl || '').trim();
    const match = dataUrl.match(/^data:([^;,]+)[;,]/i);
    return String(match?.[1] || 'audio/ogg').trim().toLowerCase();
  }

  private resolveSttFileExtension(mimeType: string) {
    const normalized = String(mimeType || '').trim().toLowerCase();
    if (normalized.includes('mpeg')) return 'mp3';
    if (normalized.includes('mp4')) return 'm4a';
    if (normalized.includes('ogg')) return 'ogg';
    if (normalized.includes('wav') || normalized.includes('wave')) return 'wav';
    if (normalized.includes('webm')) return 'webm';
    if (normalized.includes('3gpp')) return '3gp';
    if (normalized.includes('amr')) return 'amr';
    return 'bin';
  }

  private buildSttAudioPayload(media: ExtractedMedia) {
    const dataUrl = this.ensureDataUrl(media.mediaDataUrl || '', media.mimeType);
    if (!dataUrl) return null;
    let buffer: Buffer;
    try {
      buffer = this.decodeBase64Attachment(dataUrl);
    } catch {
      return null;
    }
    if (!buffer || buffer.length === 0) return null;

    const mimeType = this.resolveSttMimeType(media);
    const sanitizedFileName = String(media.fileName || '').trim().replace(/[^\w.\-]/g, '_');
    const fileName = sanitizedFileName || `audio.${this.resolveSttFileExtension(mimeType)}`;
    return {
      buffer,
      mimeType,
      fileName,
    };
  }

  private async callOpenAiTranscription(
    token: string,
    model: string,
    payload: { buffer: Buffer; mimeType: string; fileName: string; }
  ) {
    const FormDataCtor = (globalThis as any).FormData;
    const BlobCtor = (globalThis as any).Blob;
    if (!FormDataCtor || !BlobCtor) {
      throw new Error('Ambiente Node sem suporte a FormData/Blob para STT.');
    }

    const form = new FormDataCtor();
    const blob = new BlobCtor([payload.buffer], { type: payload.mimeType || 'audio/ogg' });
    form.append('file', blob, payload.fileName);
    form.append('model', String(model || this.getDefaultSttModel('openai')).trim());
    form.append('response_format', 'json');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: form as any,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI STT error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    return String(data?.text || '').trim();
  }

  private async callGroqTranscription(
    token: string,
    model: string,
    payload: { buffer: Buffer; mimeType: string; fileName: string; }
  ) {
    const FormDataCtor = (globalThis as any).FormData;
    const BlobCtor = (globalThis as any).Blob;
    if (!FormDataCtor || !BlobCtor) {
      throw new Error('Ambiente Node sem suporte a FormData/Blob para STT.');
    }

    const form = new FormDataCtor();
    const blob = new BlobCtor([payload.buffer], { type: payload.mimeType || 'audio/ogg' });
    form.append('file', blob, payload.fileName);
    form.append('model', String(model || this.getDefaultSttModel('groq')).trim());
    form.append('response_format', 'json');

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: form as any,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq STT error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    return String(data?.text || '').trim();
  }

  private async transcribeAudioInternal(chatJid: string, msgId: string, media: ExtractedMedia) {
    const providerConfig = this.resolveSttProvider();
    if (!providerConfig) {
      this.logWarn('Sem token válido para transcrição de áudio.', {
        chatId: this.toExternalChatId(chatJid),
        msgId,
      });
      return null;
    }

    const payload = this.buildSttAudioPayload(media);
    if (!payload) {
      this.logWarn('Transcrição não executada: áudio inválido ou vazio.', {
        chatId: this.toExternalChatId(chatJid),
        msgId,
      });
      return null;
    }

    const model = String(this.aiConfig.sttModel || this.getDefaultSttModel(providerConfig.provider)).trim();
    try {
      const text = providerConfig.provider === 'groq'
        ? await this.callGroqTranscription(providerConfig.token, model, payload)
        : await this.callOpenAiTranscription(providerConfig.token, model, payload);
      const transcript = String(text || '').trim();
      if (!transcript) {
        this.logWarn('STT retornou transcrição vazia.', {
          chatId: this.toExternalChatId(chatJid),
          msgId,
          provider: providerConfig.provider,
          model,
        });
        return null;
      }

      this.logInfo('Áudio transcrito para resposta automática da IA.', {
        chatId: this.toExternalChatId(chatJid),
        msgId,
        provider: providerConfig.provider,
        model,
      });
      return {
        text: transcript,
        provider: providerConfig.provider,
        model,
      };
    } catch (err) {
      this.logWarn('Falha ao transcrever áudio para resposta automática da IA.', {
        chatId: this.toExternalChatId(chatJid),
        msgId,
        provider: providerConfig.provider,
        model,
        error: err instanceof Error ? err.message : err,
      });
      return null;
    }
  }

  private async transcribeAudioForAi(chatJid: string, msgId: string, media: ExtractedMedia) {
    if (!this.aiConfig.sttEnabled) return '';
    const result = await this.transcribeAudioInternal(chatJid, msgId, media);
    return String(result?.text || '').trim();
  }

  async transcribeAudioMessage(input: {
    chatId?: string;
    messageId?: string;
    mediaDataUrl: string;
    mimeType?: string | null;
    fileName?: string | null;
  }) {
    const mediaDataUrl = String(input?.mediaDataUrl || '').trim();
    if (!mediaDataUrl) {
      throw new Error('Áudio inválido para transcrição.');
    }

    const normalizedChatId = String(input?.chatId || '').trim();
    const jid = normalizedChatId ? (this.toBaileysJid(normalizedChatId) || normalizedChatId) : 'manual@transcribe';
    const msgId = String(input?.messageId || `manual_${Date.now()}`);
    const media: ExtractedMedia = {
      mediaType: 'audio',
      mediaDataUrl,
      mimeType: input?.mimeType ? String(input.mimeType).trim() : null,
      fileName: input?.fileName ? String(input.fileName).trim() : null,
    };

    const result = await this.transcribeAudioInternal(jid, msgId, media);
    if (!result?.text) {
      throw new Error('Não foi possível transcrever este áudio.');
    }

    return {
      success: true,
      transcript: result.text,
      provider: result.provider,
      model: result.model,
      messageId: msgId,
    };
  }

  private extractJsonObject(raw: string) {
    const value = String(raw || '').trim();
    const start = value.indexOf('{');
    const end = value.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(value.slice(start, end + 1));
    } catch {
      return null;
    }
  }

  private pickContextByKeywords(message: string, contexts: AiContextItem[]) {
    const text = this.normalizeSearchText(String(message || ''));
    const terms = this.extractSearchTerms(message);
    const financialIntent = this.isFinancialIntentMessage(message);
    const reportIntent = this.shouldAutoSendClientReportPdf(message);
    let best: { ctx: AiContextItem; score: number } | null = null;
    for (const ctx of contexts) {
      const bag = this.normalizeSearchText(`${ctx.name} ${ctx.description} ${ctx.prompt} ${ctx.responsePrompt} ${ctx.conditionKeywords.join(' ')} ${ctx.dataSelections.join(' ')} ${ctx.actionType}`);
      let score = 0;
      if (text.includes('saldo') && bag.includes('saldo')) score += 4;
      if (text.includes('plano') && bag.includes('plano')) score += 2;
      if (text.includes('relatorio') && (bag.includes('relatorio') || bag.includes('report'))) score += 2;
      if (text.includes('consumo') && bag.includes('consumo')) score += 2;
      if (financialIntent && /(saldo|consum|gasto|transac|extrat|carteir|plano|debit|credit)/.test(bag)) score += 4;
      if (reportIntent && /(relatorio|pdf|extrato)/.test(bag)) score += 3;
      for (const keyword of ctx.conditionKeywords) {
        if (this.keywordMatchesMessage(text, terms, keyword)) {
          score += 3;
        }
      }
      if (score > 0 && (!best || score > best.score)) {
        best = { ctx, score };
      }
    }
    return best?.ctx || contexts[0] || null;
  }

  private pickSubSwitchByKeywords(message: string, subSwitches: AiSubSwitchItem[]) {
    const enabled = subSwitches.filter((item) => item.enabled);
    if (enabled.length === 0) return null;

    const text = this.normalizeSearchText(message);
    const terms = this.extractSearchTerms(message);
    const financialIntent = this.isFinancialIntentMessage(message);
    const reportIntent = this.shouldAutoSendClientReportPdf(message);
    let best: { item: AiSubSwitchItem; score: number } | null = null;

    for (const item of enabled) {
      const bag = this.normalizeSearchText(`${item.name} ${item.description} ${item.responsePrompt} ${item.conditionKeywords.join(' ')} ${item.dataSelections.join(' ')}`);
      let score = 0;

      for (const keyword of item.conditionKeywords) {
        if (this.keywordMatchesMessage(text, terms, keyword)) {
          score += 4;
        }
      }

      if (text.includes('saldo') && bag.includes('saldo')) score += 2;
      if (text.includes('consumo') && bag.includes('consumo')) score += 2;
      if (text.includes('relatorio') && bag.includes('relatorio')) score += 2;
      if (financialIntent && /(saldo|consum|gasto|transac|extrat|carteir|plano|debit|credit)/.test(bag)) score += 3;
      if (reportIntent && /(relatorio|pdf|extrato)/.test(bag)) score += 3;

      if (score > 0 && (!best || score > best.score)) {
        best = { item, score };
      }
    }

    const fallback = enabled.find((item) => this.normalizeSearchText(item.name).includes('nao corresponde') || this.normalizeSearchText(item.name).includes('não corresponde'));
    return best?.item || fallback || enabled[0];
  }

  private async selectAiContext(message: string, contexts: AiContextItem[]) {
    const enabled = contexts.filter((ctx) => ctx.enabled);
    if (enabled.length === 0) return null;

    const provider: AiProvider = this.aiConfig.provider === 'gemini'
      ? 'gemini'
      : this.aiConfig.provider === 'groq'
        ? 'groq'
        : 'openai';
    const tokenOpenAi = String(this.aiConfig.openAiToken || '').trim();
    const tokenGemini = String(this.aiConfig.geminiToken || '').trim();
    const tokenGroq = String(this.aiConfig.groqToken || '').trim();
    const model = String(this.aiConfig.model || '').trim();

    const selectorSystem = [
      'Você é um classificador de contexto de atendimento WhatsApp.',
      'Retorne APENAS JSON válido no formato {"contextId":number,"confidence":number,"reason":"string"}.',
      'Use confidence de 0 a 1.'
    ].join(' ');

    const selectorUser = JSON.stringify({
      customerMessage: message,
      contexts: enabled.map((ctx) => ({
        id: ctx.id,
        name: ctx.name,
        description: ctx.description,
        conditionKeywords: ctx.conditionKeywords,
        prompt: ctx.prompt,
        responsePrompt: ctx.responsePrompt,
        dataSelections: ctx.dataSelections,
        actionType: ctx.actionType,
        routingMode: ctx.routingMode,
        subSwitches: ctx.subSwitches.map((sub) => ({
          id: sub.id,
          name: sub.name,
          description: sub.description,
          conditionKeywords: sub.conditionKeywords,
          dataSelections: sub.dataSelections,
        })),
      }))
    });

    try {
      if (provider === 'openai' && tokenOpenAi) {
        const raw = await this.callOpenAiJson(selectorSystem, selectorUser, tokenOpenAi, model || 'gpt-4.1-mini');
        const parsed = this.extractJsonObject(raw);
        const contextId = Number(parsed?.contextId || 0);
        const found = enabled.find((ctx) => ctx.id === contextId);
        if (found) return found;
      } else if (provider === 'gemini' && tokenGemini) {
        const raw = await this.callGeminiJson(selectorSystem, selectorUser, tokenGemini, model || 'gemini-2.0-flash');
        const parsed = this.extractJsonObject(raw);
        const contextId = Number(parsed?.contextId || 0);
        const found = enabled.find((ctx) => ctx.id === contextId);
        if (found) return found;
      } else if (provider === 'groq' && tokenGroq) {
        const raw = await this.callGroqJson(selectorSystem, selectorUser, tokenGroq, model || 'llama-3.1-8b-instant');
        const parsed = this.extractJsonObject(raw);
        const contextId = Number(parsed?.contextId || 0);
        const found = enabled.find((ctx) => ctx.id === contextId);
        if (found) return found;
      }
    } catch (err) {
      this.logWarn('Falha ao classificar contexto via IA. Aplicando fallback por palavra-chave.', err instanceof Error ? err.message : err);
    }

    return this.pickContextByKeywords(message, enabled);
  }

  private getVariablesBySelections(variables: Record<string, string>, selections: string[]) {
    if (!Array.isArray(selections) || selections.length === 0) return variables;

    const selectionToVariableMap: Record<string, string[]> = {
      NOME: ['{cliente_nome}', '{alunos_colaboradores}'],
      RESPONSAVEL_SETOR: ['{responsavel_nome}', '{responsavel_detalhe}'],
      TELEFONE_RESPONSAVEL: ['{telefone}'],
      TURMA: ['{turma}'],
      UNIDADE_ESCOLA: ['{escola_nome}'],
      RESTRICAO: ['{restricao}'],
      SALDO_CARTEIRA: ['{saldo_carteira}', '{saldo_total}'],
      SALDO_PLANOS: ['{saldo_planos}'],
      TRANSACOES: ['{transacoes}'],
      ENTREGA_DIA: ['{entrega_dia}'],
      PRODUTOS_VALORES: ['{produtos_valores}'],
      TIPO_CONTATO: ['{tipo_contato}'],
      EMPRESA: ['{empresa_nome}'],
      DATA_INICIAL: ['{data_inicial}'],
      DATA_FINAL: ['{data_final}'],
    };

    const allowedKeys = new Set<string>(['{data_atual}', '{relatorio_resumo}', '{relatorio_pdf}']);
    selections.forEach((selection) => {
      const mapped = selectionToVariableMap[String(selection || '').trim()];
      (mapped || []).forEach((item) => allowedKeys.add(item));
    });

    const filtered: Record<string, string> = {};
    Object.entries(variables).forEach(([key, value]) => {
      if (allowedKeys.has(key)) filtered[key] = value;
    });
    return filtered;
  }

  private getConversationSessionTtlMs() {
    const minutes = Math.max(1, Math.min(1440, Number(this.aiConfig.conversationSessionMinutes || 60)));
    return minutes * 60 * 1000;
  }

  private pruneExpiredAiConversationSessions() {
    const now = Date.now();
    const ttlMs = this.getConversationSessionTtlMs();
    let removed = 0;

    for (const [chatJid, session] of Array.from(this.aiConversationSessions.entries())) {
      const lastActivityAt = Number(session?.lastActivityAt || 0);
      if (!lastActivityAt || (now - lastActivityAt) > ttlMs) {
        this.aiConversationSessions.delete(chatJid);
        this.clearAiDataCacheForChat(chatJid);
        removed += 1;
      }
    }

    if (removed > 0) {
      this.logInfo('Sessões de contexto IA expiradas e removidas por TTL.', {
        removed,
        ttlMinutes: Math.round(ttlMs / 60000)
      });
    }
  }

  private getOrCreateAiConversationSession(chatJid: string) {
    const now = Date.now();
    const ttlMs = this.getConversationSessionTtlMs();
    const existing = this.aiConversationSessions.get(chatJid);
    if (existing && (now - existing.lastActivityAt) <= ttlMs) {
      return existing;
    }
    if (existing) {
      this.aiConversationSessions.delete(chatJid);
      this.clearAiDataCacheForChat(chatJid);
    }
    const next: AiConversationSession = {
      lastActivityAt: now,
      targetClientId: null,
      outsideHoursIntroSent: false,
      pendingIntentLearning: null,
      history: [],
    };
    this.aiConversationSessions.set(chatJid, next);
    return next;
  }

  private shouldSendOutsideHoursIntro(chatJid: string) {
    const session = this.getOrCreateAiConversationSession(chatJid);
    if (session.outsideHoursIntroSent) return false;
    return true;
  }

  private markOutsideHoursIntroSent(chatJid: string) {
    const session = this.getOrCreateAiConversationSession(chatJid);
    session.outsideHoursIntroSent = true;
    session.lastActivityAt = Date.now();
  }

  private appendAiConversationHistory(chatJid: string, from: 'client' | 'assistant', text: string) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return;
    const session = this.getOrCreateAiConversationSession(chatJid);
    session.history.push({
      from,
      text: trimmed,
      timestamp: Date.now(),
    });
    if (session.history.length > 24) {
      session.history.splice(0, session.history.length - 24);
    }
    session.lastActivityAt = Date.now();
  }

  private getAiConversationContextText(chatJid: string) {
    const nowMs = Date.now();
    const ttlMs = this.getConversationSessionTtlMs();
    const messageHistory = (this.messageMap.get(chatJid) || [])
      .filter((item) => {
        const text = String(item?.body || '').trim();
        if (!text) return false;
        const tsSeconds = Number(item?.timestamp || 0);
        if (!Number.isFinite(tsSeconds) || tsSeconds <= 0) return false;
        const ageMs = nowMs - (tsSeconds * 1000);
        return ageMs >= 0 && ageMs <= ttlMs;
      })
      .slice(-20)
      .map((item) => `${item.fromMe ? 'Assistente' : 'Cliente'}: ${String(item.body || '').trim()}`);

    if (messageHistory.length > 0) {
      return messageHistory.join('\n');
    }

    // Fallback para sessão transitória em memória (caso histórico persistido ainda não tenha sido atualizado).
    const session = this.getOrCreateAiConversationSession(chatJid);
    const lines = session.history
      .filter((item) => (nowMs - Number(item.timestamp || 0)) <= ttlMs)
      .slice(-12)
      .map((item) => `${item.from === 'client' ? 'Cliente' : 'Assistente'}: ${item.text}`);
    return lines.length > 0 ? lines.join('\n') : '';
  }

  private async generateAiReply(
    message: string,
    context: AiContextItem,
    variables: Record<string, string>,
    conversationContext: string,
    overrideSelections?: string[],
    flowInstruction?: string,
    toolSearchContext?: string
  ) {
    const scopedSelections = Array.isArray(overrideSelections) && overrideSelections.length > 0
      ? overrideSelections
      : context.dataSelections;
    const scopedVariables = this.getVariablesBySelections(variables, scopedSelections);
    const provider: AiProvider = this.aiConfig.provider === 'gemini'
      ? 'gemini'
      : this.aiConfig.provider === 'groq'
        ? 'groq'
        : 'openai';
    const tokenOpenAi = String(this.aiConfig.openAiToken || '').trim();
    const tokenGemini = String(this.aiConfig.geminiToken || '').trim();
    const tokenGroq = String(this.aiConfig.groqToken || '').trim();
    const model = String(this.aiConfig.model || '').trim();
    const assistantName = String(this.aiConfig.assistantName || 'Assistente').trim();
    const companyName = String(this.aiConfig.companyName || 'Cantina').trim();
    const systemPrompt = this.applyVariables(
      `Você é ${assistantName}, assistente da empresa ${companyName}.\n${this.getAiHardSafetyPolicyPrompt(scopedVariables)}\n${this.aiConfig.globalPrompt}\n\nContexto ativo: ${context.name}\n${context.description}\n${context.prompt}\n${context.responsePrompt}`,
      scopedVariables
    );
    const userPrompt = [
      conversationContext ? `Histórico recente da sessão:\n${conversationContext}` : '',
      `Mensagem do cliente: ${message}`,
      flowInstruction ? `Roteamento do fluxo:\n${flowInstruction}` : '',
      toolSearchContext ? `Resultado das tools de busca na database:\n${toolSearchContext}` : '',
      'Dados variáveis disponíveis:',
      JSON.stringify(scopedVariables, null, 2),
      `Ação do contexto: ${context.actionType}`,
      'Responda com base no pedido atual do cliente. Não assuma solicitação de relatório/PDF/e-mail se o cliente não pediu nesta mensagem.',
      'Use prioritariamente os dados reais vindos das tools de busca e das variáveis.',
      'Se não encontrar dado nas tools/variáveis, informe claramente que não encontrou.',
      'Responda em português brasileiro de forma objetiva.'
    ].filter(Boolean).join('\n');

    if (provider === 'openai' && tokenOpenAi) {
      return await this.callOpenAiJson(systemPrompt, userPrompt, tokenOpenAi, model || 'gpt-4.1-mini');
    }
    if (provider === 'gemini' && tokenGemini) {
      return await this.callGeminiJson(systemPrompt, userPrompt, tokenGemini, model || 'gemini-2.0-flash');
    }
    if (provider === 'groq' && tokenGroq) {
      return await this.callGroqJson(systemPrompt, userPrompt, tokenGroq, model || 'llama-3.1-8b-instant');
    }

    const fallback = this.applyVariables(
      `Olá {responsavel_nome}, recebi sua mensagem sobre "${message}". Seu saldo atual é {saldo_total}.`,
      scopedVariables
    );
    return fallback;
  }

  private async sendAiReplyAfterConfiguredDelay(chatJid: string, replyText: string) {
    const finalReply = String(replyText || '').trim();
    if (!finalReply) return;

    // O atraso sempre começa após a resposta já ter sido gerada.
    const generatedAt = Date.now();
    const delaySeconds = Math.max(0, Math.min(120, Number(this.aiConfig.responseDelaySeconds || 0)));
    if (delaySeconds > 0) {
      await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
    }

    await this.sendMessageToChat(
      this.toExternalChatId(chatJid),
      finalReply,
      { source: 'ai', disableAiAgentOnHumanSend: false }
    );
    this.appendAiConversationHistory(chatJid, 'assistant', finalReply);
    this.schedulePersistChatHistory();

    this.logInfo('Resposta de AI enviada após atraso configurado.', {
      chatId: this.toExternalChatId(chatJid),
      generatedAt,
      sentAt: Date.now(),
      configuredDelaySeconds: delaySeconds,
    });
  }

  private async maybeHandleIncomingAiReply(chatJid: string, msgId: string, incomingText: string) {
    if (!incomingText) return;
    if (this.processedIncomingAutoReplyIds.has(msgId)) return;
    this.processedIncomingAutoReplyIds.add(msgId);
    if (this.processedIncomingAutoReplyIds.size > 5000) {
      const first = this.processedIncomingAutoReplyIds.values().next().value;
      if (first) this.processedIncomingAutoReplyIds.delete(first);
    }

    try {
      this.appendAiConversationHistory(chatJid, 'client', incomingText);
      await this.tryLearnIntentKeywordsFromConfirmation(chatJid, incomingText);
      const chatId = this.toExternalChatId(chatJid);
      const baseClient = this.findClientByChatJid(chatJid);
      const contactName = String(
        this.chatMap.get(chatJid)?.name
        || baseClient?.name
        || this.getPhoneFromJid(chatJid)
      ).trim();

      const destructiveIntent = this.detectDestructiveIntent(incomingText);
      if (destructiveIntent) {
        this.recordAiAudit({
          reason: 'SECURITY_DESTRUCTIVE',
          chatId,
          contactName,
          excerpt: incomingText,
          details: destructiveIntent,
        });
        await this.sendAiReplyAfterConfiguredDelay(
          chatJid,
          'Por segurança, não posso executar nem orientar ações destrutivas ou irreversíveis. Posso ajudar com alternativas seguras e reversíveis, como backup, soft delete, arquivamento e revisão manual.'
        );
        return;
      }

      const enabledContexts = this.aiConfig.contexts.filter((ctx) => ctx.enabled);
      if (enabledContexts.length === 0) return;

      const context = await this.selectAiContext(incomingText, enabledContexts);
      if (!context) return;
      if (context.actionType === 'ATENDIMENTO_HUMANO') {
        this.logInfo('Contexto direcionado para atendimento humano. IA não responderá automaticamente.', {
          chatId: this.toExternalChatId(chatJid),
          context: context.name,
        });
        return;
      }

      const selectedSubSwitch = context.routingMode === 'INTENT_SWITCH'
        ? this.pickSubSwitchByKeywords(incomingText, context.subSwitches || [])
        : null;
      const effectiveSelections = selectedSubSwitch
        ? Array.from(new Set([...(context.dataSelections || []), ...(selectedSubSwitch.dataSelections || [])]))
        : context.dataSelections;
      const flowInstruction = selectedSubSwitch
        ? [
            `Sub-switch selecionado: ${selectedSubSwitch.name}`,
            selectedSubSwitch.description ? `Descrição: ${selectedSubSwitch.description}` : '',
            selectedSubSwitch.responsePrompt ? `Prompt final: ${selectedSubSwitch.responsePrompt}` : '',
          ].filter(Boolean).join('\n')
        : 'Sem sub-switch selecionado. Use o contexto principal.';

      const targetResolution = this.resolveTargetClientForMessage(chatJid, baseClient, incomingText);
      const outOfScopeMention = this.detectOutOfScopeContactMention(
        incomingText,
        targetResolution.relatedClients || []
      );
      if (outOfScopeMention) {
        this.recordAiAudit({
          reason: 'PRIVACY_OUT_OF_SCOPE',
          chatId,
          contactName,
          excerpt: incomingText,
          details: `Solicitação citou contato fora do escopo autorizado: ${outOfScopeMention}`,
        });
        await this.sendAiReplyAfterConfiguredDelay(
          chatJid,
          'Por privacidade, só posso consultar dados do responsável desta conversa e dos alunos/colaboradores vinculados a ele. Se quiser, me informe o aluno relacionado a este responsável para eu continuar.'
        );
        return;
      }

      const targetClient = targetResolution.client || baseClient;
      let outsideHoursModeActive = false;
      if (this.aiConfig.onlyOutsideBusinessHours) {
        const hoursCheck = this.isOutsideEnterpriseBusinessHours(chatJid, targetClient);
        if (!hoursCheck.outside) {
          this.logInfo('Resposta automática da IA suprimida: dentro do horário de atendimento.', {
            chatId: this.toExternalChatId(chatJid),
            enterpriseId: hoursCheck.enterpriseId,
            open: hoursCheck.open || null,
            close: hoursCheck.close || null,
            reason: hoursCheck.reason,
          });
          return;
        }
        outsideHoursModeActive = true;
      }

      if (this.isGreetingOnlyMessage(incomingText)) {
        const greetingReply = outsideHoursModeActive
          ? 'Olá! No momento estamos fora do horário de atendimento humano da unidade. Mesmo assim, sigo disponível para te ajudar automaticamente com saldo, consumo, relatórios e envio de PDF.\n\nMe diga o que você deseja consultar.'
          : 'Olá! Tudo bem? Me diga o que você deseja consultar e eu te ajudo.';
        if (outsideHoursModeActive && this.shouldSendOutsideHoursIntro(chatJid)) {
          this.markOutsideHoursIntroSent(chatJid);
        }
        await this.sendAiReplyAfterConfiguredDelay(chatJid, greetingReply);
        return;
      }

      if (targetResolution.needsDisambiguation) {
        const names = targetResolution.relatedClients
          .map((item: any) => String(item?.name || '').trim())
          .filter(Boolean);
        const listText = names.map((name, index) => `${index + 1}. ${name}`).join('\n');
        const disambiguationReply = [
          'Encontrei mais de um aluno vinculado ao responsável.',
          'Por favor, me diga de qual aluno você deseja consultar os dados:',
          listText
        ].filter(Boolean).join('\n');

        await this.sendAiReplyAfterConfiguredDelay(chatJid, disambiguationReply);
        this.logInfo('Resposta de desambiguação enviada para múltiplos alunos do responsável.', {
          chatId: this.toExternalChatId(chatJid),
          relatedCount: targetResolution.relatedClients.length
        });
        return;
      }

      const wantsAutoReportNow = this.shouldAutoSendClientReportPdf(incomingText)
        || (
          this.isReportSendConfirmationMessage(incomingText)
          && this.hasRecentReportConversation(chatJid)
        );
      const autoReport = await this.maybeSendAutoClientReportPdf(
        chatJid,
        incomingText,
        targetClient,
        { forceIntent: wantsAutoReportNow }
      );
      if (wantsAutoReportNow) {
        if (autoReport.sent) {
          this.logInfo('Fluxo de relatório concluído; resposta textual adicional da IA suprimida para evitar confirmação duplicada.', {
            chatId: this.toExternalChatId(chatJid),
            fileName: autoReport.fileName || null,
          });
          return;
        }
        const reportFailureMessage = (() => {
          if (autoReport.reason === 'target_client_not_found') {
            return 'Não consegui identificar o aluno/colaborador para gerar o relatório. Me informe o nome exato para eu enviar o PDF.';
          }
          if (autoReport.reason === 'tool_disabled') {
            return 'A ferramenta de relatório automático está desativada na configuração. Ative em WhatsApp > Configuração > Tools do Agent AI e tente novamente.';
          }
          if (autoReport.reason === 'pdf_build_failed') {
            return 'Tive uma instabilidade para gerar o PDF agora. Tente novamente em alguns segundos.';
          }
          return 'Não consegui enviar o PDF agora. Vou tentar novamente em seguida. Se preferir, me peça: "enviar relatório em PDF do [nome do aluno]".';
        })();
        await this.sendAiReplyAfterConfiguredDelay(
          chatJid,
          reportFailureMessage
        );
        this.logWarn('Solicitação de relatório detectada, mas PDF não foi enviado.', {
          chatId: this.toExternalChatId(chatJid),
          reason: autoReport.reason || 'unknown'
        });
        return;
      }
      const variables = this.buildAiVariables(chatJid, targetClient, incomingText);
      const conversationContext = this.getAiConversationContextText(chatJid);
      const toolSearchContext = this.buildDatabaseSearchToolsContext(chatJid, incomingText, targetClient);
      const allowFinancialContinuation = this.hasRecentFinancialContext(chatJid);
      const aiReply = await this.generateAiReply(
        incomingText,
        context,
        variables,
        conversationContext,
        effectiveSelections,
        [
          flowInstruction,
          autoReport.sent ? `Relatório PDF enviado automaticamente: ${autoReport.fileName}` : ''
        ].filter(Boolean).join('\n'),
        toolSearchContext
      );
      const finalReply = this.sanitizeAiReplyByCapabilities(
        String(aiReply || '').trim(),
        incomingText,
        {
          autoReportSent: autoReport.sent,
          allowFinancialContinuation
        }
      );
      if (!finalReply) return;
      const session = this.getOrCreateAiConversationSession(chatJid);
      if (this.normalizeSearchText(finalReply) === this.normalizeSearchText(this.getIntentClarificationPrompt())) {
        session.pendingIntentLearning = {
          askedAt: Date.now(),
          sourceMessage: String(incomingText || '').trim(),
        };
      } else if (session.pendingIntentLearning) {
        // Limpa pendência quando a conversa já seguiu com resposta objetiva/contextual.
        session.pendingIntentLearning = null;
      }
      let replyToSend = finalReply;
      if (outsideHoursModeActive && this.shouldSendOutsideHoursIntro(chatJid)) {
        const outsideIntro = [
          'Olá! No momento estamos fora do horário de atendimento humano da unidade.',
          'Mesmo assim, sigo disponível para te ajudar automaticamente com saldo, consumo, relatórios e envio de PDF.',
        ].join(' ');
        replyToSend = `${outsideIntro}\n\n${finalReply}`;
        this.markOutsideHoursIntroSent(chatJid);
      }
      await this.sendAiReplyAfterConfiguredDelay(chatJid, replyToSend);
      this.logInfo('Resposta automática de AI enviada.', {
        chatId: this.toExternalChatId(chatJid),
        context: context.name,
        subSwitch: selectedSubSwitch?.name || null,
      });
    } catch (err) {
      this.logWarn('Falha ao processar resposta automática de AI.', err instanceof Error ? err.message : err);
      try {
        await this.sendAiReplyAfterConfiguredDelay(
          chatJid,
          'Tive uma instabilidade ao processar sua solicitação agora. Pode repetir sua mensagem em seguida?'
        );
      } catch {
        // Evita propagação de erro adicional no fallback final da IA.
      }
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
          this.pruneSelfChatsFromCache();
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

      sock.ev.on('messages.upsert', async (payload: any) => {
        if (this.sock !== sock) return;
        const msgs = Array.isArray(payload?.messages) ? payload.messages : [];

        for (const msg of msgs) {
          const remoteJid = this.resolveIncomingChatJid(msg);
          if (!this.isClientJid(remoteJid) || this.isSelfJid(remoteJid)) continue;

          const fromMe = Boolean(msg?.key?.fromMe);
          const timestamp = Number(msg?.messageTimestamp || Math.floor(Date.now() / 1000));
          const body = this.extractBody(msg);
          const media = await this.extractMediaFromMessage(msg);
          const location = this.extractLocationFromMessage(msg);
          const msgId = String(msg?.key?.id || `${timestamp}_${Math.random()}`);
          const isAiCoolingDown = this.isAiAgentCoolingDown(remoteJid);
          const shouldProcessAiForChat = !isAiCoolingDown && (
            this.aiAgentEnabledChats.has(remoteJid)
            || Boolean(this.aiConfig.onlyOutsideBusinessHours)
          );
          let sttTranscript = '';
          if (!fromMe && !body && media?.mediaType === 'audio' && shouldProcessAiForChat) {
            sttTranscript = await this.transcribeAudioForAi(remoteJid, msgId, media);
          }
          const preview = body
            || (location ? '[Localização]' : '')
            || (media?.fileName ? `[Arquivo: ${media.fileName}]` : media ? '[Arquivo]' : '');

          this.pushMessage(remoteJid, {
            id: msgId,
            body: preview,
            fromMe,
            timestamp,
            mediaType: media?.mediaType || null,
            mimeType: media?.mimeType || null,
            fileName: media?.fileName || null,
            mediaDataUrl: media?.mediaDataUrl || null,
            location: location || null
          });

          const existing = this.chatMap.get(remoteJid);
          this.upsertChat(remoteJid, {
            name: String(msg?.pushName || existing?.name || this.getPhoneFromJid(remoteJid)),
            lastMessage: preview || existing?.lastMessage || '',
            lastTimestamp: timestamp,
            unreadCount: fromMe ? Number(existing?.unreadCount || 0) : Number(existing?.unreadCount || 0) + 1,
            initiatedByClient: fromMe ? Boolean(existing?.initiatedByClient) : true
          });
          this.refreshProfilePicture(remoteJid).catch(() => {});

          if (fromMe && !this.isBackendSentMessageId(msgId)) {
            await this.disableAiAgentTemporarily(remoteJid, 'human_device');
          }

          const aiInput = String(body || sttTranscript || '').trim();
          if (!fromMe && aiInput && shouldProcessAiForChat) {
            await this.maybeHandleIncomingAiReply(remoteJid, msgId, aiInput);
          }
        }
      });

      sock.ev.on('chats.upsert', (chats: any[]) => {
        if (this.sock !== sock) return;
        for (const chat of Array.isArray(chats) ? chats : []) {
          const jid = String(chat?.id || '');
          if (!this.isClientJid(jid) || this.isSelfJid(jid)) continue;
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
          if (!this.isClientJid(jid) || this.isSelfJid(jid)) continue;
          const existing = this.chatMap.get(jid);
          this.upsertChat(jid, {
            name: String(chat?.name || existing?.name || this.getPhoneFromJid(jid)),
            unreadCount: Number(chat?.unreadCount ?? existing?.unreadCount ?? 0),
            lastTimestamp: Number(chat?.conversationTimestamp ?? existing?.lastTimestamp ?? 0)
          });
          this.refreshProfilePicture(jid).catch(() => {});
        }
      });

      sock.ev.on('chats.phoneNumberShare', (payload: any) => {
        if (this.sock !== sock) return;
        const lid = String(payload?.lid || '').trim();
        const jid = String(payload?.jid || '').trim();
        if (!lid || !jid) return;
        const normalizedJid = this.toBaileysJid(jid);
        if (!normalizedJid || !this.isClientJid(normalizedJid) || this.isSelfJid(normalizedJid)) return;
        this.rememberLidMapping(lid, normalizedJid);
      });

      sock.ev.on('contacts.upsert', (contacts: any[]) => {
        if (this.sock !== sock) return;
        for (const contact of Array.isArray(contacts) ? contacts : []) {
          const lid = String(contact?.lid || '').trim();
          const directJid = this.toBaileysJid(String(contact?.jid || '').trim());
          if (lid && directJid && this.isClientJid(directJid) && !this.isSelfJid(directJid)) {
            this.rememberLidMapping(lid, directJid);
          }

          const jid = directJid || this.toBaileysJid(String(contact?.id || '').trim());
          if (!jid || !this.isClientJid(jid) || this.isSelfJid(jid)) continue;

          const existing = this.chatMap.get(jid);
          const nextName = String(
            contact?.name
            || contact?.notify
            || contact?.verifiedName
            || existing?.name
            || this.getPhoneFromJid(jid)
          ).trim();
          const patch: Partial<ChatSummary> = {};
          if (nextName) patch.name = nextName;
          this.upsertChat(jid, patch);

          const imgUrl = contact?.imgUrl;
          if (typeof imgUrl === 'string' && imgUrl.trim() && imgUrl !== 'changed') {
            this.profilePictureMap.set(jid, imgUrl.trim());
            this.upsertChat(jid, {});
          }
        }
      });

      sock.ev.on('contacts.update', (updates: any[]) => {
        if (this.sock !== sock) return;
        for (const update of Array.isArray(updates) ? updates : []) {
          const lid = String(update?.lid || '').trim();
          const directJid = this.toBaileysJid(String(update?.jid || '').trim());
          if (lid && directJid && this.isClientJid(directJid) && !this.isSelfJid(directJid)) {
            this.rememberLidMapping(lid, directJid);
          }

          const jid = directJid || this.toBaileysJid(String(update?.id || ''));
          if (!jid || !this.isClientJid(jid) || this.isSelfJid(jid)) continue;

          const existing = this.chatMap.get(jid);
          const nextName = String(
            update?.name
            || update?.notify
            || update?.verifiedName
            || existing?.name
            || this.getPhoneFromJid(jid)
          ).trim();

          const patch: Partial<ChatSummary> = {};
          if (nextName) patch.name = nextName;
          this.upsertChat(jid, patch);

          const imgUrl = update?.imgUrl;
          if (typeof imgUrl === 'string' && imgUrl.trim() && imgUrl !== 'changed') {
            this.profilePictureMap.set(jid, imgUrl.trim());
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
    this.pruneSelfChatsFromCache();
    return Array.from(this.chatMap.values())
      .filter((chat) => String(chat.chatId || '').endsWith('@c.us'))
      .sort((a, b) => Number(b.lastTimestamp || 0) - Number(a.lastTimestamp || 0))
      .slice(0, 120);
  }

  async getChatMessages(chatId: string, limit = 80): Promise<ChatMessage[]> {
    this.ensureConnected();
    const jid = this.toBaileysJid(chatId);
    if (!jid || !this.isClientJid(jid) || this.isSelfJid(jid)) throw new Error('Chat inválido.');

    const messages = this.messageMap.get(jid) || [];
    const safeLimit = Math.max(10, Math.min(200, Number(limit) || 80));
    return messages.slice(-safeLimit);
  }

  async clearChatMessages(chatId: string) {
    const aliasJids = this.getChatAliasJids(chatId);
    if (aliasJids.length === 0) {
      throw new Error('Chat inválido para limpeza de mensagens.');
    }

    let existedMessages = false;
    let endedSession = false;
    for (const jid of aliasJids) {
      if (this.messageMap.delete(jid)) {
        existedMessages = true;
      }
      this.aiAgentEnabledChats.delete(jid);
      this.aiAgentAutoResumeAtByChat.delete(jid);
      const chat = this.chatMap.get(jid);
      if (chat) {
        this.upsertChat(jid, {
          lastMessage: '',
          lastTimestamp: Number(chat.lastTimestamp || 0),
          unreadCount: 0,
        });
      }
      if (this.aiConversationSessions.delete(jid)) {
        endedSession = true;
      }
      this.clearAiDataCacheForChat(jid);
    }

    const chatIdExternal = this.toExternalChatId(aliasJids[0]);
    await this.persistChatHistory();

    return {
      success: true,
      chatId: chatIdExternal,
      cleared: existedMessages,
      endedSession
    };
  }

  async deleteChat(chatId: string) {
    const aliasJids = this.getChatAliasJids(chatId);
    if (aliasJids.length === 0) {
      throw new Error('Chat inválido para exclusão.');
    }

    const externalChatId = this.toExternalChatId(aliasJids[0]);
    const aliasSet = new Set(aliasJids);
    let existedChat = false;
    let existedMessages = false;
    let existedSession = false;

    for (const jid of aliasJids) {
      if (this.chatMap.delete(jid)) existedChat = true;
      if (this.messageMap.delete(jid)) existedMessages = true;
      if (this.aiConversationSessions.delete(jid)) existedSession = true;
      this.aiAgentEnabledChats.delete(jid);
      this.aiAgentAutoResumeAtByChat.delete(jid);
      this.chatLabelMap.delete(jid);
      this.profilePictureMap.delete(jid);
      this.clearAiDataCacheForChat(jid);
    }

    for (const [lid, mappedJid] of Array.from(this.lidToPhoneJidMap.entries())) {
      const normalizedMapped = this.toBaileysJid(mappedJid);
      if (normalizedMapped && (aliasSet.has(normalizedMapped) || this.toExternalChatId(normalizedMapped) === externalChatId)) {
        this.lidToPhoneJidMap.delete(lid);
      }
    }

    const beforeSchedules = this.scheduledMessages.length;
    this.scheduledMessages = this.scheduledMessages.filter((item) => String(item.chatId || '') !== externalChatId);
    const removedSchedules = beforeSchedules - this.scheduledMessages.length;
    if (removedSchedules > 0) {
      await this.persistScheduledMessages();
    }
    await this.persistChatHistory();

    return {
      success: true,
      chatId: externalChatId,
      deleted: Boolean(existedChat || existedMessages || existedSession || removedSchedules > 0),
      endedSession: existedSession,
      removedScheduledItems: removedSchedules
    };
  }

  async sendMessageToChat(chatId: string, message: string, options: SendChatOptions = {}) {
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
      this.rememberBackendSentMessageId(msgId);

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

      const shouldDisableAiAfterHumanSend = Boolean(
        options?.disableAiAgentOnHumanSend
        || (options?.source === 'human')
      );
      const canPauseAiForChat = this.aiAgentEnabledChats.has(jid)
        || this.isAiAgentCoolingDown(jid)
        || Boolean(this.aiConfig.onlyOutsideBusinessHours);
      if (shouldDisableAiAfterHumanSend && canPauseAiForChat) {
        const autoResumeAt = await this.disableAiAgentTemporarily(jid, 'human_send');
        Object.assign(result, {
          aiAgentAutoDisabled: true,
          aiAgentEnabled: false,
          aiAgentAutoResumeAt: new Date(autoResumeAt).toISOString()
        });
      }

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
      const shouldDisableAiAfterHumanSend = Boolean(
        options?.disableAiAgentOnHumanSend
        || (options?.source === 'human')
      );
      const canPauseAiForChat = this.aiAgentEnabledChats.has(jid)
        || this.isAiAgentCoolingDown(jid)
        || Boolean(this.aiConfig.onlyOutsideBusinessHours);
      if (shouldDisableAiAfterHumanSend && canPauseAiForChat) {
        await this.disableAiAgentTemporarily(jid, 'human_send');
      }
      this.logInfo('Mensagem enviada via fallback por telefone.', fallbackResult);
      return {
        ...fallbackResult,
        fallbackUsed: true
      };
    }
  }

  async sendMediaToChat(chatId: string, attachment: MediaAttachmentInput, caption = '', options: SendChatOptions = {}) {
    this.ensureConnected();
    const jid = await this.resolveRecipientJid(chatId);
    if (!jid || !this.isClientJid(jid)) throw new Error('Chat inválido.');
    if (!attachment?.base64Data || !attachment?.mediaType) {
      throw new Error('Anexo inválido.');
    }

    let sent: any;
    let sentJid = jid;
    try {
      sent = await this.sendMediaMessageWithTimeout(jid, attachment, caption);
    } catch (err) {
      const fallbackJid = this.toBaileysJid(chatId);
      if (!fallbackJid || fallbackJid === jid || !this.isClientJid(fallbackJid)) {
        throw err;
      }
      this.logWarn('Falha ao enviar anexo no JID principal. Tentando JID alternativo.', {
        chatId,
        primaryJid: jid,
        fallbackJid,
        error: err instanceof Error ? err.message : String(err),
      });
      sent = await this.sendMediaMessageWithTimeout(fallbackJid, attachment, caption);
      sentJid = fallbackJid;
    }
    const timestamp = Math.floor(Date.now() / 1000);
    const msgId = String(sent?.key?.id || `${timestamp}_${Math.random()}`);
    this.rememberBackendSentMessageId(msgId);
    const fileName = String(attachment.fileName || '').trim();
    const preview = caption?.trim()
      || (fileName ? `[Arquivo enviado: ${fileName}]` : '[Arquivo enviado]');
    const mimeType = String(attachment.mimeType || '').trim() || null;
    const mediaDataUrl = this.ensureDataUrl(String(attachment.base64Data || ''), mimeType);

    this.pushMessage(sentJid, {
      id: msgId,
      body: preview,
      fromMe: true,
      timestamp,
      mediaType: attachment.mediaType,
      mimeType,
      fileName: fileName || null,
      mediaDataUrl
    });

    const existing = this.chatMap.get(sentJid);
    this.upsertChat(sentJid, {
      lastMessage: preview,
      lastTimestamp: timestamp,
      unreadCount: Number(existing?.unreadCount || 0)
    });

    const result: any = {
      success: true,
      chatId: this.toExternalChatId(sentJid),
      messageId: msgId
    };

    const shouldDisableAiAfterHumanSend = Boolean(
      options?.disableAiAgentOnHumanSend
      || (options?.source === 'human')
    );
    const canPauseAiForChat = this.aiAgentEnabledChats.has(sentJid)
      || this.isAiAgentCoolingDown(sentJid)
      || Boolean(this.aiConfig.onlyOutsideBusinessHours);
    if (shouldDisableAiAfterHumanSend && canPauseAiForChat) {
      const autoResumeAt = await this.disableAiAgentTemporarily(sentJid, 'human_send');
      result.aiAgentAutoDisabled = true;
      result.aiAgentEnabled = false;
      result.aiAgentAutoResumeAt = new Date(autoResumeAt).toISOString();
    }

    return result;
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
