import React, { useEffect, useMemo, useRef, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Send,
  Users,
  RefreshCw,
  Search,
  CheckCircle2,
  MessagesSquare,
  Plus,
  X,
  Trash2,
  Paperclip,
  CalendarClock,
  FileImage,
  FileText,
  Mic,
  XCircle,
  BarChart3,
  PhoneCall,
  Video,
  MoreVertical,
  LayoutDashboard,
  Settings2,
  Bot,
  GitBranch,
  Wallet,
  UtensilsCrossed,
  CalendarDays,
  CheckCheck
} from 'lucide-react';
import { Client, Enterprise, Plan, User } from '../types';
import ApiService from '../services/api';
import WhatsAppQrConnector from '../components/WhatsAppQrConnector';
import notificationService from '../services/notificationService';
import { formatPhoneWithCountryTag } from '../utils/phone';
import CentralDisparos from '../components/whatsapp-disparos/CentralDisparos';

interface WhatsAppPageProps {
  currentUser: User;
  activeEnterprise: Enterprise | null;
}

type WhatsAppStatusSnapshot = {
  state: 'DISCONNECTED' | 'INITIALIZING' | 'QR_READY' | 'CONNECTED' | 'ERROR';
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
  labels?: string[];
  avatarUrl?: string | null;
};

type VisibleChat = ChatSummary & {
  displayName: string;
  registrationId: string;
  contactType: string;
  responsibleName: string;
  contactTypeLabel?: string;
  relationshipLabel?: string;
  isDraft?: boolean;
};

type ChatMessage = {
  id: string;
  body: string;
  fromMe: boolean;
  timestamp: number;
  mediaType?: 'image' | 'document' | 'audio' | null;
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

type AiHandoffRequest = {
  id: string;
  chatId: string;
  contactName: string;
  messagePreview: string;
  createdAt: number;
  expiresAt: number;
};

type ChatAttachment = {
  mediaType: 'image' | 'document' | 'audio';
  base64Data: string;
  mimeType?: string;
  fileName?: string;
};

type AudioTranscriptionState = {
  loading: boolean;
  text: string;
  error: string | null;
};

type AiAuditLogEntry = {
  id: string;
  timestamp: number;
  reason: 'SECURITY_DESTRUCTIVE' | 'PRIVACY_OUT_OF_SCOPE' | string;
  chatId: string;
  contactName: string;
  excerpt: string;
  details: string;
};

type ScheduledItem = {
  id: string;
  chatId: string;
  message: string;
  scheduleAt: number;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  createdAt: number;
  sentAt?: number | null;
  error?: string | null;
  attachment?: {
    mediaType: 'image' | 'document' | 'audio';
    mimeType?: string | null;
    fileName?: string | null;
  } | null;
};

type ReportPeriodMode = 'WEEKLY' | 'BIWEEKLY' | 'CUSTOM';
type CrmView = 'DASHBOARD' | 'CONVERSAS' | 'CONTATOS' | 'CAMPANHAS' | 'AI_CONFIG' | 'AI_FLOW' | 'CONTA';
type CampaignMode = 'BROADCAST' | 'RECURRING' | 'FOLLOWUP';
type CampaignAudience = 'ALL' | 'ALUNO' | 'COLABORADOR' | `LABEL:${string}`;
type CampaignSubTab = 'NOVA_CAMPANHA' | 'GERENCIAR_CAMPANHA';
type PlanConsumptionDispatchFrequency = 'MONTHLY' | 'WEEKLY';
type PlanConsumptionDispatchRecipientKind = 'COLABORADOR_RELATORIO' | 'RESPONSAVEL_RELATORIO';

type PlanConsumptionPdfPlanRow = {
  studentName: string;
  classLabel: string;
  planName: string;
  unitValue: number;
  consumedQty: number;
  consumedSubtotal: number;
  currentBalance: number;
  currentBalanceUnits: number;
  prepaid: boolean;
};

type PlanConsumptionPdfTransactionRow = {
  studentName: string;
  dateLabel: string;
  timeLabel: string;
  timestamp: number;
  description: string;
  planName: string;
  movementType: 'CONSUMO' | 'CREDITO' | 'OUTRO';
  amount: number;
};

type PlanConsumptionRecipientStudentProfile = {
  id: string;
  name: string;
  classLabel: string;
  type: 'ALUNO' | 'COLABORADOR';
};

type PlanConsumptionRecipientReportProfile = {
  kind: 'RESPONSAVEL' | 'COLABORADOR';
  responsibleName: string;
  contactName: string;
  contactPhone: string;
  students: PlanConsumptionRecipientStudentProfile[];
  planRows: PlanConsumptionPdfPlanRow[];
  transactionRows: PlanConsumptionPdfTransactionRow[];
  totalConsumption: number;
  totalCredits: number;
};

type CampaignStep = {
  id: number;
  title: string;
  delayDays: number;
  message: string;
};

type CampaignReport = {
  id: string;
  name: string;
  mode: CampaignMode;
  audience: CampaignAudience;
  createdAt: number;
  startAt: number;
  targetCount: number;
  sentCount: number;
  scheduledCount: number;
  failedCount: number;
  intervalSeconds: number;
  withSignature: boolean;
  hasAttachment: boolean;
  status: 'ENVIADA' | 'AGENDADA' | 'PARCIAL' | 'ERRO';
  paused?: boolean;
};

type PlanConsumptionDispatchRecipient = {
  phone: string;
  chatId: string;
  contactName: string;
  message: string;
  detailLines: string[];
  targetCount: number;
  kindSet: PlanConsumptionDispatchRecipientKind[];
  variableValues: Record<string, string>;
  reportProfile: PlanConsumptionRecipientReportProfile;
};

type PlanConsumptionDispatchPreview = {
  generatedAt: number;
  periodStart: number;
  periodEnd: number;
  periodLabel: string;
  recipients: PlanConsumptionDispatchRecipient[];
  collaboratorCount: number;
  responsibleCount: number;
};

type PlanConsumptionDispatchReport = {
  id: string;
  createdAt: number;
  mode: 'NOW' | 'SCHEDULED';
  frequency: PlanConsumptionDispatchFrequency;
  recipients: number;
  sentCount: number;
  scheduledCount: number;
  failedCount: number;
  periodLabel: string;
};

type AiProvider = 'openai' | 'gemini' | 'groq';
type AiContextActionType = 'RESPONDER_CLIENTE' | 'ATENDIMENTO_HUMANO';
type AiContextRoutingMode = 'DIRECT' | 'INTENT_SWITCH';
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

type AiToolsConfigState = {
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

type AiConfigState = {
  provider: AiProvider;
  model: string;
  openAiToken: string;
  geminiToken: string;
  groqToken: string;
  sttEnabled: boolean;
  sttModel: string;
  companyName: string;
  assistantName: string;
  tools: AiToolsConfigState;
  onlyOutsideBusinessHours: boolean;
  responseDelaySeconds: number;
  conversationSessionMinutes: number;
  globalPrompt: string;
  contexts: AiContextItem[];
};

type AiFlowVisualNode = {
  id: string;
  label: string;
  kind: 'trigger' | 'classifier' | 'switch' | 'context' | 'subswitch' | 'final';
  x: number;
  y: number;
  width: number;
  height: number;
  contextId?: number;
  subSwitchId?: number;
};

type WhatsTab = 'CRM' | 'DISPAROS' | 'SESSION_QR';
const WHATSAPP_SIGNATURE_ENABLED_KEY = 'whatsapp_signature_enabled';
const WHATSAPP_SIGNATURE_NAME_KEY = 'whatsapp_signature_name';
const NEW_CHAT_COUNTRY_CODE_KEY = 'whatsapp_new_chat_country_code';
const WHATSAPP_QUICK_REPLIES_KEY = 'whatsapp_quick_replies';
const WHATSAPP_AI_CONFIG_KEY = 'whatsapp_ai_config';
const WHATSAPP_CAMPAIGN_REPORTS_KEY = 'whatsapp_campaign_reports';
const WHATSAPP_PLAN_CONSUMPTION_REPORTS_KEY = 'whatsapp_plan_consumption_reports';
const WHATSAPP_OPEN_CONTEXT_KEY = 'whatsapp_open_context';

const normalizeSearchValue = (value?: string) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const normalizeTimestampMs = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value <= 0) return null;
    return value < 1e11 ? Math.round(value * 1000) : Math.round(value);
  }

  const text = String(value).trim();
  if (!text) return null;

  if (/^\d+(\.\d+)?$/.test(text)) {
    const num = Number(text);
    if (!Number.isFinite(num) || num <= 0) return null;
    return num < 1e11 ? Math.round(num * 1000) : Math.round(num);
  }

  const parsed = new Date(text).getTime();
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const isSubsequenceMatch = (text: string, query: string) => {
  if (!query) return true;
  let queryIndex = 0;
  for (let i = 0; i < text.length && queryIndex < query.length; i += 1) {
    if (text[i] === query[queryIndex]) queryIndex += 1;
  }
  return queryIndex === query.length;
};

const formatClientPlanLabel = (planName: string) => {
  const normalized = String(planName || '').trim().toUpperCase();
  if (normalized === 'LANCHE_FIXO') return 'Lanche Fixo';
  if (normalized === 'PF_FIXO') return 'PF Fixo';
  if (normalized === 'PREPAGO') return 'Carteira Pré-paga';
  return String(planName || '').replace(/_/g, ' ');
};

const resolveResponsibleName = (client?: Client | null) =>
  String(client?.parentName || client?.guardianName || client?.guardians?.[0] || '').trim();

const resolveKinshipLabel = (value?: string) => {
  const normalized = normalizeSearchValue(value);
  if (!normalized) return 'Indefinido';
  if (normalized.includes('pai')) return 'Pai';
  if (normalized.includes('mae') || normalized.includes('mãe')) return 'Mãe';
  if (normalized.includes('avo') || normalized.includes('avó') || normalized.includes('avô')) return 'Avós';
  if (normalized.includes('tio') || normalized.includes('tia')) return 'Tios';
  return 'Indefinido';
};

const resolveContactLabels = (client?: Client | null): { contactTypeLabel: string; relationshipLabel: string } => {
  const type = String(client?.type || '').toUpperCase();
  if (type === 'COLABORADOR') {
    return {
      contactTypeLabel: 'Colaborador',
      relationshipLabel: String(client?.class || '').trim() || 'Indefinido',
    };
  }
  if (type === 'ALUNO' || type === 'RESPONSAVEL') {
    return {
      contactTypeLabel: 'Responsável',
      relationshipLabel: resolveKinshipLabel(`${client?.parentName || ''} ${client?.guardianName || ''}`),
    };
  }
  return {
    contactTypeLabel: type ? type[0] + type.slice(1).toLowerCase() : 'Contato',
    relationshipLabel: 'Indefinido',
  };
};

const resolveConversationPrimaryName = (client?: Client | null) => {
  const responsible = resolveResponsibleName(client);
  return responsible || String(client?.name || '').trim();
};

const extractFileNameFromPlaceholder = (value?: string) => {
  const text = String(value || '').trim();
  const match = text.match(/^\[Arquivo:\s*(.+)\]$/);
  return String(match?.[1] || '').trim();
};

const formatChatPreviewText = (value?: string) => {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text === '[Localização]') return '📍 Localização';
  if (text === '[Arquivo]') return '📎 Arquivo';
  const fileName = extractFileNameFromPlaceholder(text);
  if (fileName) return `📄 ${fileName}`;
  return text;
};

const formatMessageBodyForDisplay = (msg: ChatMessage) => {
  const text = String(msg.body || '').trim();
  if (!text && msg.location) return '📍 Localização';
  if (!text) return '';

  if (text === '[Localização]' || msg.location) return '📍 Localização';

  const fileName = extractFileNameFromPlaceholder(text) || String(msg.fileName || '').trim();
  const hasPlaceholder = text === '[Arquivo]' || Boolean(extractFileNameFromPlaceholder(text));

  if (hasPlaceholder || msg.mediaType) {
    if (msg.mediaType === 'audio') return fileName ? `🎤 Áudio (${fileName})` : '🎤 Áudio';
    if (msg.mediaType === 'image') return fileName ? `🖼️ Imagem (${fileName})` : '🖼️ Imagem';
    if (msg.mediaType === 'document') return fileName ? `📄 Documento (${fileName})` : '📄 Documento';
    if (hasPlaceholder) return fileName ? `📎 Arquivo (${fileName})` : '📎 Arquivo';
  }

  return text;
};

const PT_WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
const WEEKLY_DISPATCH_OPTIONS = [
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
  { value: 0, label: 'Domingo' },
];
const CAMPAIGN_RECURRING_VARIABLES = [
  { key: '{nome_completo_alunos}', label: 'Nome completo aluno(s)' },
  { key: '{turma_completa}', label: 'Turma completa' },
  { key: '{primeiro_nome_responsavel}', label: 'Primeiro nome responsável' },
  { key: '{nome_responsavel}', label: 'Nome responsável' },
  { key: '{data_inicial_consumo}', label: 'Data inicial do consumo' },
  { key: '{data_final_consumo}', label: 'Data final do consumo' },
  { key: '{data_consumos}', label: 'Data de consumos' },
  { key: '{saldo_und_atual}', label: 'Saldo und. atual' },
  { key: '{relatorio_consumo}', label: 'Relatório de consumo' },
  { key: '{nome_plano}', label: 'Nome plano' },
  { key: '{valor_unidade_plano}', label: 'Valor unidade plano' },
  { key: '{quantidade_plano}', label: 'Quantidade plano' },
  { key: '{subtotal_plano}', label: 'Subtotal plano' },
  { key: '{periodo_referencia}', label: 'Período de referência' },
] as const;
const CAMPAIGN_RECURRING_VARIABLE_EXAMPLES: Record<string, string> = {
  nome_completo_alunos: 'Eloah Vitória, Victor Grangeiro',
  turma_completa: '4º Ano A',
  primeiro_nome_responsavel: 'Fabiano',
  nome_responsavel: 'Fabiano Grangeiro',
  data_inicial_consumo: '01/03/2026',
  data_final_consumo: '31/03/2026',
  data_consumos: '02/03/2026, 05/03/2026, 09/03/2026',
  saldo_und_atual: '12',
  relatorio_consumo: '02/03 • Lanche • R$ 12,00 | 05/03 • Almoço • R$ 18,00 | 09/03 • Lanche • R$ 10,00',
  nome_plano: 'Lanche Fixo, Almoço Fixo',
  valor_unidade_plano: 'R$ 15,00',
  quantidade_plano: '20',
  subtotal_plano: 'R$ 300,00',
  periodo_referencia: '01/03/2026 a 31/03/2026',
};
const AI_AUDIT_REASON_LABEL: Record<string, string> = {
  SECURITY_DESTRUCTIVE: 'Segurança: ação destrutiva',
  PRIVACY_OUT_OF_SCOPE: 'Privacidade: fora do escopo',
};
const WEEKDAY_KEY_TO_JS: Record<string, number> = {
  DOMINGO: 0,
  SEGUNDA: 1,
  TERCA: 2,
  QUARTA: 3,
  QUINTA: 4,
  SEXTA: 5,
  SABADO: 6,
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

const getPlanCardTone = (planKey: string, balance: number) => {
  if (Number(balance) < 0) {
    return {
      container: 'border-red-200 bg-red-50',
      title: 'text-red-700',
      value: 'text-red-700',
    };
  }

  const normalized = String(planKey || '').trim().toUpperCase();
  if (normalized === 'PREPAGO' && Number(balance) < 10) {
    return {
      container: 'border-rose-200 bg-rose-50',
      title: 'text-rose-700',
      value: 'text-rose-700',
    };
  }
  if (normalized === 'PREPAGO') {
    return {
      container: 'border-indigo-200 bg-indigo-50',
      title: 'text-indigo-700',
      value: 'text-indigo-700',
    };
  }
  if (normalized === 'LANCHE_FIXO') {
    return {
      container: 'border-amber-200 bg-amber-50',
      title: 'text-amber-700',
      value: 'text-amber-700',
    };
  }
  if (normalized === 'PF_FIXO') {
    return {
      container: 'border-orange-200 bg-orange-50',
      title: 'text-orange-700',
      value: 'text-orange-700',
    };
  }

  return {
    container: 'border-cyan-200 bg-cyan-50',
    title: 'text-cyan-700',
    value: 'text-cyan-700',
  };
};

const getDefaultAiConfig = (): AiConfigState => ({
  provider: 'openai',
  model: 'gpt-4.1-mini',
  openAiToken: '',
  geminiToken: '',
  groqToken: '',
  sttEnabled: true,
  sttModel: 'whisper-1',
  companyName: '',
  assistantName: '',
  tools: {
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
  },
  onlyOutsideBusinessHours: false,
  responseDelaySeconds: 2,
  conversationSessionMinutes: 60,
  globalPrompt: 'Você é o assistente da cantina. Responda de forma clara, educada e objetiva, usando dados reais do sistema quando disponíveis. Nunca ofereça ações destrutivas e nunca exponha dados de contatos fora do responsável atual e seus relacionados.',
  contexts: [
    {
      id: Date.now(),
      name: 'Atendimento Geral',
      description: 'Fluxo padrão para dúvidas de saldo, consumo e mensagens rápidas.',
      enabled: true,
      conditionKeywords: ['saldo', 'consumo', 'relatorio', 'cantina'],
      prompt: 'Sempre chame o responsável pelo nome e priorize informar saldo atual e próximo passo.',
      responsePrompt: 'Responda com dados reais do sistema e seja objetivo.',
      dataSelections: ['NOME', 'RESPONSAVEL_SETOR', 'TELEFONE_RESPONSAVEL', 'SALDO_CARTEIRA', 'SALDO_PLANOS'],
      actionType: 'RESPONDER_CLIENTE',
      routingMode: 'INTENT_SWITCH',
      subSwitches: [
        {
          id: Date.now() + 1,
          name: 'Consultar Nome',
          description: 'Identifica nome de aluno/colaborador e responsável.',
          enabled: true,
          conditionKeywords: ['nome', 'quem'],
          dataSelections: ['NOME', 'RESPONSAVEL_SETOR', 'TELEFONE_RESPONSAVEL', 'TIPO_CONTATO'],
          responsePrompt: 'Confirme nome do aluno/colaborador e do responsável.',
        },
        {
          id: Date.now() + 2,
          name: 'Consultar Saldo Cantina',
          description: 'Retorna saldo de carteira e planos.',
          enabled: true,
          conditionKeywords: ['saldo', 'carteira', 'credito', 'crédito', 'plano'],
          dataSelections: ['NOME', 'RESPONSAVEL_SETOR', 'SALDO_CARTEIRA', 'SALDO_PLANOS', 'DATA_INICIAL', 'DATA_FINAL'],
          responsePrompt: 'Informe o saldo de carteira e de planos de forma clara.',
        },
        {
          id: Date.now() + 3,
          name: 'Consultar Relatório de Consumo',
          description: 'Consulta consumos e transações por período.',
          enabled: true,
          conditionKeywords: ['consumo', 'gasto', 'transacao', 'transações', 'extrato', 'relatorio', 'relatório'],
          dataSelections: ['NOME', 'RESPONSAVEL_SETOR', 'TRANSACOES', 'SALDO_CARTEIRA', 'SALDO_PLANOS', 'DATA_INICIAL', 'DATA_FINAL'],
          responsePrompt: 'Liste os consumos e transações no período solicitado.',
        },
        {
          id: Date.now() + 4,
          name: 'Não corresponde a nenhum',
          description: 'Fallback para pedir esclarecimento.',
          enabled: true,
          conditionKeywords: [],
          dataSelections: [],
          responsePrompt: 'Se não houver correspondência, faça pergunta de esclarecimento.',
        },
      ],
    },
  ],
});

const AI_PROVIDER_MODELS: Record<AiProvider, string[]> = {
  openai: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini'],
  gemini: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro'],
  groq: ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
};

const AI_STT_MODELS: Record<AiProvider, string[]> = {
  openai: ['whisper-1', 'gpt-4o-mini-transcribe'],
  gemini: ['whisper-large-v3-turbo'],
  groq: ['whisper-large-v3-turbo'],
};

const AI_CONTEXT_DATA_OPTIONS = [
  { key: 'NOME', label: 'Aluno/Colaborador - Nome', variable: '{cliente_nome}' },
  { key: 'RESPONSAVEL_SETOR', label: 'Responsável / Setor', variable: '{responsavel_nome}' },
  { key: 'TELEFONE_RESPONSAVEL', label: 'Telefone do responsável', variable: '{telefone}' },
  { key: 'TURMA', label: 'Turma / Ano', variable: '{turma}' },
  { key: 'UNIDADE_ESCOLA', label: 'Unidade / Escola', variable: '{escola_nome}' },
  { key: 'RESTRICAO', label: 'Restrição alimentar', variable: '{restricao}' },
  { key: 'SALDO_CARTEIRA', label: 'Saldo carteira', variable: '{saldo_carteira}' },
  { key: 'SALDO_PLANOS', label: 'Saldo planos', variable: '{saldo_planos}' },
  { key: 'TRANSACOES', label: 'Transações', variable: '{transacoes}' },
  { key: 'ENTREGA_DIA', label: 'Entrega do dia', variable: '{entrega_dia}' },
  { key: 'PRODUTOS_VALORES', label: 'Produtos com valores', variable: '{produtos_valores}' },
  { key: 'TIPO_CONTATO', label: 'Tipo de contato', variable: '{tipo_contato}' },
  { key: 'EMPRESA', label: 'Nome da empresa', variable: '{empresa_nome}' },
  { key: 'DATA_INICIAL', label: 'Data inicial', variable: '{data_inicial}' },
  { key: 'DATA_FINAL', label: 'Data final', variable: '{data_final}' },
] as const;

const normalizeAiConfigState = (raw: any): AiConfigState => {
  const fallback = getDefaultAiConfig();
  const providerRaw = String(raw?.provider || '').toLowerCase();
  const provider: AiProvider = providerRaw === 'gemini'
    ? 'gemini'
    : providerRaw === 'groq'
      ? 'groq'
      : 'openai';
  const providerModels = AI_PROVIDER_MODELS[provider] || AI_PROVIDER_MODELS.openai;
  const model = providerModels.includes(String(raw?.model || '').trim())
    ? String(raw?.model || '').trim()
    : providerModels[0];

  const contextsRaw = Array.isArray(raw?.contexts) ? raw.contexts : fallback.contexts;
  const contexts: AiContextItem[] = contextsRaw.map((ctx: any, index: number) => ({
    id: Number(ctx?.id || Date.now() + index),
    name: String(ctx?.name || `Contexto ${index + 1}`),
    description: String(ctx?.description || ''),
    enabled: Boolean(ctx?.enabled),
    conditionKeywords: Array.isArray(ctx?.conditionKeywords)
      ? ctx.conditionKeywords.map((item: any) => normalizeSearchValue(String(item || ''))).filter(Boolean)
      : [],
    prompt: String(ctx?.prompt || ''),
    responsePrompt: String(ctx?.responsePrompt || ''),
    dataSelections: Array.isArray(ctx?.dataSelections)
      ? ctx.dataSelections.map((item: any) => String(item || '').trim()).filter(Boolean)
      : [],
    actionType: String(ctx?.actionType || '') === 'ATENDIMENTO_HUMANO' ? 'ATENDIMENTO_HUMANO' : 'RESPONDER_CLIENTE',
    routingMode: String(ctx?.routingMode || '').toUpperCase() === 'DIRECT' ? 'DIRECT' : 'INTENT_SWITCH',
    subSwitches: Array.isArray(ctx?.subSwitches)
      ? ctx.subSwitches.map((sub: any, subIndex: number) => ({
          id: Number(sub?.id || Date.now() + index + subIndex + 1),
          name: String(sub?.name || `Sub Switch ${subIndex + 1}`),
          description: String(sub?.description || ''),
          enabled: Boolean(sub?.enabled),
          conditionKeywords: Array.isArray(sub?.conditionKeywords)
            ? sub.conditionKeywords.map((kw: any) => normalizeSearchValue(String(kw || ''))).filter(Boolean)
            : [],
          dataSelections: Array.isArray(sub?.dataSelections)
            ? sub.dataSelections.map((sel: any) => String(sel || '').trim()).filter(Boolean)
            : [],
          responsePrompt: String(sub?.responsePrompt || ''),
        }))
      : [],
  }));

  return {
    provider,
    model,
    openAiToken: String(raw?.openAiToken || ''),
    geminiToken: String(raw?.geminiToken || ''),
    groqToken: String(raw?.groqToken || ''),
    sttEnabled: raw?.sttEnabled === undefined ? fallback.sttEnabled : Boolean(raw?.sttEnabled),
    sttModel: AI_STT_MODELS[provider].includes(String(raw?.sttModel || '').trim())
      ? String(raw?.sttModel || '').trim()
      : AI_STT_MODELS[provider][0],
    companyName: String(raw?.companyName || ''),
    assistantName: String(raw?.assistantName || ''),
    tools: {
      ...fallback.tools,
      ...(raw?.tools && typeof raw.tools === 'object'
        ? {
            dbStats: raw.tools.dbStats === undefined ? fallback.tools.dbStats : Boolean(raw.tools.dbStats),
            companyInfo: raw.tools.companyInfo === undefined ? fallback.tools.companyInfo : Boolean(raw.tools.companyInfo),
            businessHours: raw.tools.businessHours === undefined ? fallback.tools.businessHours : Boolean(raw.tools.businessHours),
            searchClients: raw.tools.searchClients === undefined ? fallback.tools.searchClients : Boolean(raw.tools.searchClients),
            searchProducts: raw.tools.searchProducts === undefined ? fallback.tools.searchProducts : Boolean(raw.tools.searchProducts),
            searchPlans: raw.tools.searchPlans === undefined ? fallback.tools.searchPlans : Boolean(raw.tools.searchPlans),
            searchPlanValues: raw.tools.searchPlanValues === undefined ? fallback.tools.searchPlanValues : Boolean(raw.tools.searchPlanValues),
            searchMenu: raw.tools.searchMenu === undefined ? fallback.tools.searchMenu : Boolean(raw.tools.searchMenu),
            searchNutritionalBase: raw.tools.searchNutritionalBase === undefined ? fallback.tools.searchNutritionalBase : Boolean(raw.tools.searchNutritionalBase),
            searchAvailableProducts: raw.tools.searchAvailableProducts === undefined ? fallback.tools.searchAvailableProducts : Boolean(raw.tools.searchAvailableProducts),
            searchTransactions: raw.tools.searchTransactions === undefined ? fallback.tools.searchTransactions : Boolean(raw.tools.searchTransactions),
            searchOrders: raw.tools.searchOrders === undefined ? fallback.tools.searchOrders : Boolean(raw.tools.searchOrders),
            autoSendPdfReport: raw.tools.autoSendPdfReport === undefined ? fallback.tools.autoSendPdfReport : Boolean(raw.tools.autoSendPdfReport),
          }
        : {}),
    },
    onlyOutsideBusinessHours: Boolean(raw?.onlyOutsideBusinessHours),
    responseDelaySeconds: Math.max(0, Math.min(120, Number(raw?.responseDelaySeconds ?? 2) || 0)),
    conversationSessionMinutes: Math.max(1, Math.min(1440, Number(raw?.conversationSessionMinutes ?? 60) || 60)),
    globalPrompt: String(raw?.globalPrompt || fallback.globalPrompt),
    contexts: contexts.length > 0 ? contexts : fallback.contexts,
  };
};

const WhatsAppPage: React.FC<WhatsAppPageProps> = ({ currentUser, activeEnterprise }) => {
  const [activeTab, setActiveTab] = useState<WhatsTab>('CRM');
  const [crmView, setCrmView] = useState<CrmView>('CONVERSAS');
  const [crmFilter, setCrmFilter] = useState<'ALL' | 'UNREAD' | 'WAITING'>('ALL');
  const [status, setStatus] = useState<WhatsAppStatusSnapshot>({
    state: 'DISCONNECTED',
    connected: false,
    qrAvailable: false,
    qrDataUrl: null,
    phoneNumber: null,
    lastError: null,
  });
  const [clients, setClients] = useState<Client[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [search, setSearch] = useState('');
  const [selectedPhones, setSelectedPhones] = useState<string[]>([]);
  const [message, setMessage] = useState('Olá! Este é um comunicado da cantina.');
  const [loading, setLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [aiAuditLogs, setAiAuditLogs] = useState<AiAuditLogEntry[]>([]);
  const [aiHandoffRequests, setAiHandoffRequests] = useState<AiHandoffRequest[]>([]);

  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [chatSearchName, setChatSearchName] = useState('');
  const [chatContactType, setChatContactType] = useState<'ALL' | 'ALUNO' | 'COLABORADOR'>('ALL');
  const [chatLoading, setChatLoading] = useState(false);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [isContactDetailsVisible, setIsContactDetailsVisible] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [audioTranscriptions, setAudioTranscriptions] = useState<Record<string, AudioTranscriptionState>>({});
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [chatReply, setChatReply] = useState('');
  const [isImprovingChatReply, setIsImprovingChatReply] = useState(false);
  const [aiAgentEnabledForChat, setAiAgentEnabledForChat] = useState(false);
  const [isUpdatingAiAgentForChat, setIsUpdatingAiAgentForChat] = useState(false);
  const [chatAttachment, setChatAttachment] = useState<ChatAttachment | null>(null);
  const [selectedStudentConsumedToday, setSelectedStudentConsumedToday] = useState<boolean | null>(null);
  const [isLoadingStudentConsumedToday, setIsLoadingStudentConsumedToday] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduledItems, setScheduledItems] = useState<ScheduledItem[]>([]);
  const [isScheduling, setIsScheduling] = useState(false);
  const [reportPeriodMode, setReportPeriodMode] = useState<ReportPeriodMode>('WEEKLY');
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');
  const [isSendingReport, setIsSendingReport] = useState(false);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [isDeletingChatId, setIsDeletingChatId] = useState<string | null>(null);
  const [draftChats, setDraftChats] = useState<VisibleChat[]>([]);
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [newChatMode, setNewChatMode] = useState<'AGENDA' | 'NEW_CONTACT'>('AGENDA');
  const [agendaSearch, setAgendaSearch] = useState('');
  const [selectedAgendaClientId, setSelectedAgendaClientId] = useState<string | null>(null);
  const [newChatName, setNewChatName] = useState('');
  const [newChatCountryCode, setNewChatCountryCode] = useState('55');
  const [newChatPhone, setNewChatPhone] = useState('');
  const [isSavingNewContact, setIsSavingNewContact] = useState(false);
  const [signatureEnabled, setSignatureEnabled] = useState(false);
  const [signatureName, setSignatureName] = useState('');
  const [savedSignatureEnabled, setSavedSignatureEnabled] = useState(false);
  const [savedSignatureName, setSavedSignatureName] = useState('');
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [quickReplyInput, setQuickReplyInput] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [campaignSubTab, setCampaignSubTab] = useState<CampaignSubTab>('NOVA_CAMPANHA');
  const [campaignMode, setCampaignMode] = useState<CampaignMode>('BROADCAST');
  const [campaignAudience, setCampaignAudience] = useState<CampaignAudience>('ALL');
  const [campaignMessage, setCampaignMessage] = useState('Olá {primeiro_nome_responsavel}! 👋 Temos uma novidade especial para você.');
  const [campaignStartAt, setCampaignStartAt] = useState('');
  const [campaignSendNow, setCampaignSendNow] = useState(true);
  const [campaignRecurringFrequency, setCampaignRecurringFrequency] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY'>('WEEKLY');
  const [campaignOccurrences, setCampaignOccurrences] = useState(4);
  const [campaignIntervalSeconds, setCampaignIntervalSeconds] = useState(2);
  const [campaignIntervalMinSeconds, setCampaignIntervalMinSeconds] = useState(2);
  const [campaignIntervalMaxSeconds, setCampaignIntervalMaxSeconds] = useState(5);
  const [campaignUseSignature, setCampaignUseSignature] = useState(true);
  const [campaignAttachment, setCampaignAttachment] = useState<ChatAttachment | null>(null);
  const [campaignReports, setCampaignReports] = useState<CampaignReport[]>([]);
  const [campaignRecurringTargetResponsible, setCampaignRecurringTargetResponsible] = useState(true);
  const [campaignRecurringTargetCollaborator, setCampaignRecurringTargetCollaborator] = useState(true);
  const [planConsumptionMessage, setPlanConsumptionMessage] = useState(
    'Olá {primeiro_nome_responsavel}, segue o fechamento do período {periodo_referencia}.'
  );
  const [planConsumptionFrequency, setPlanConsumptionFrequency] = useState<PlanConsumptionDispatchFrequency>('MONTHLY');
  const [planConsumptionMonthlyDay, setPlanConsumptionMonthlyDay] = useState(7);
  const [planConsumptionMonthlyStartDay, setPlanConsumptionMonthlyStartDay] = useState(1);
  const [planConsumptionMonthlyEndDay, setPlanConsumptionMonthlyEndDay] = useState(7);
  const [planConsumptionWeeklyDay, setPlanConsumptionWeeklyDay] = useState(1);
  const [planConsumptionWeeklyStartDay, setPlanConsumptionWeeklyStartDay] = useState(1);
  const [planConsumptionWeeklyEndDay, setPlanConsumptionWeeklyEndDay] = useState(5);
  const [planConsumptionSendTime, setPlanConsumptionSendTime] = useState('09:00');
  const [planConsumptionIntervalSeconds, setPlanConsumptionIntervalSeconds] = useState(3);
  const [planConsumptionUseSignature, setPlanConsumptionUseSignature] = useState(true);
  const [planConsumptionPreview, setPlanConsumptionPreview] = useState<PlanConsumptionDispatchPreview | null>(null);
  const [planConsumptionReports, setPlanConsumptionReports] = useState<PlanConsumptionDispatchReport[]>([]);
  const [isLaunchingPlanConsumptionDispatch, setIsLaunchingPlanConsumptionDispatch] = useState(false);
  const [campaignSteps, setCampaignSteps] = useState<CampaignStep[]>([
    { id: 1, title: 'Boas-vindas', delayDays: 0, message: 'Olá {Nome}! 👋 Bem-vindo(a). Estamos felizes em ter você por aqui.' },
    { id: 2, title: 'Check-in', delayDays: 2, message: 'Oi {Nome}, passando para saber se conseguiu ver nossa última mensagem.' },
  ]);
  const [isCampaignLaunching, setIsCampaignLaunching] = useState(false);
  const [contactSearchTerm, setContactSearchTerm] = useState('');
  const [contactStatusFilter, setContactStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [contactTagFilter, setContactTagFilter] = useState<string>('ALL');
  const [contactSortBy, setContactSortBy] = useState<'LAST_CONTACT' | 'NAME'>('LAST_CONTACT');
  const [contactPage, setContactPage] = useState(1);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [activeContactMenuId, setActiveContactMenuId] = useState<string | null>(null);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [contactModalMode, setContactModalMode] = useState<'CREATE' | 'EDIT'>('CREATE');
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [isImportingContacts, setIsImportingContacts] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    type: 'ALUNO' as 'ALUNO' | 'COLABORADOR' | 'RESPONSAVEL',
    countryCode: '55',
    phone: '',
    responsibleName: '',
    isActive: true,
  });
  const [aiConfig, setAiConfig] = useState<AiConfigState>(getDefaultAiConfig);
  const [savedAiConfig, setSavedAiConfig] = useState<AiConfigState>(getDefaultAiConfig);
  const [selectedAiContextId, setSelectedAiContextId] = useState<number | null>(null);
  const [selectedAiFlowNodeId, setSelectedAiFlowNodeId] = useState<string | null>(null);
  const [aiFlowNodePositions, setAiFlowNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const isSendingChatRef = useRef(false);
  const pollingInFlightRef = useRef(false);
  const notifiedHandoffIdsRef = useRef<Set<string>>(new Set());
  const contactsImportInputRef = useRef<HTMLInputElement | null>(null);
  const messagesViewportRef = useRef<HTMLDivElement | null>(null);
  const messagesBottomRef = useRef<HTMLDivElement | null>(null);
  const chatReplyInputRef = useRef<HTMLTextAreaElement | null>(null);
  const campaignMessageTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const aiFlowDragRef = useRef<{
    nodeId: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const countryOptions = [
    { code: '55', label: 'Brasil (+55)' },
    { code: '54', label: 'Argentina (+54)' },
    { code: '591', label: 'Bolivia (+591)' },
    { code: '56', label: 'Chile (+56)' },
    { code: '57', label: 'Colombia (+57)' },
    { code: '595', label: 'Paraguai (+595)' },
    { code: '51', label: 'Peru (+51)' },
    { code: '598', label: 'Uruguai (+598)' },
    { code: '58', label: 'Venezuela (+58)' },
    { code: '1', label: 'Estados Unidos (+1)' },
  ];

  const normalizePhone = (raw?: string) => String(raw || '').replace(/\D/g, '');
  const hasPhoneVariantIntersection = (left?: string, right?: string) => {
    const leftVariants = buildPhoneVariants(left);
    const rightVariants = buildPhoneVariants(right);
    if (leftVariants.size === 0 || rightVariants.size === 0) return false;
    for (const value of leftVariants) {
      if (rightVariants.has(value)) return true;
    }
    return false;
  };

  const buildPhoneVariants = (raw?: string) => {
    const digits = normalizePhone(raw);
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
  };

  const renderHighlightedText = (value: string, query: string, normalize = false) => {
    const safeValue = String(value || '');
    const safeQuery = String(query || '').trim();

    if (!safeQuery) return safeValue;

    const source = normalize ? safeValue.replace(/\D/g, '') : safeValue;
    const target = normalize ? safeQuery.replace(/\D/g, '') : safeQuery;
    if (!target) return safeValue;

    const sourceLower = source.toLowerCase();
    const targetLower = target.toLowerCase();
    const matchIndex = sourceLower.indexOf(targetLower);

    if (matchIndex === -1) return safeValue;

    const start = safeValue.slice(0, matchIndex);
    const match = safeValue.slice(matchIndex, matchIndex + target.length);
    const end = safeValue.slice(matchIndex + target.length);

    return (
      <>
        {start}
        <mark className="bg-amber-200 text-gray-900 rounded px-0.5">{match}</mark>
        {end}
      </>
    );
  };

  const formatOutgoingMessage = (rawMessage: string) => {
    const trimmedMessage = String(rawMessage || '').trim();
    const trimmedSignature = String(signatureName || '').trim();

    if (!trimmedMessage) return '';
    if (!signatureEnabled || !trimmedSignature) return trimmedMessage;

    return `*${trimmedSignature}:*\n${trimmedMessage}`;
  };

  const formatCampaignOutgoingMessage = (rawMessage: string) => {
    const trimmedMessage = String(rawMessage || '').trim();
    const trimmedSignature = String(signatureName || '').trim();

    if (!trimmedMessage) return '';
    if (!campaignUseSignature || !signatureEnabled || !trimmedSignature) return trimmedMessage;

    return `*${trimmedSignature}:*\n${trimmedMessage}`;
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));

  const persistCampaignReports = (items: CampaignReport[]) => {
    setCampaignReports(items);
    localStorage.setItem(WHATSAPP_CAMPAIGN_REPORTS_KEY, JSON.stringify(items));
  };

  const persistPlanConsumptionReports = (items: PlanConsumptionDispatchReport[]) => {
    setPlanConsumptionReports(items);
    localStorage.setItem(WHATSAPP_PLAN_CONSUMPTION_REPORTS_KEY, JSON.stringify(items));
  };

  const resolveClientPhone = (client: Client) => {
    const candidates = [
      (client as any).parentWhatsapp,
      (client as any).guardianPhone,
      client.phone
    ];
    const picked = candidates.map(normalizePhone).find((phone) => phone.length >= 10);
    return picked || '';
  };

  const toDateOnly = (value: Date) => {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
  };

  const formatDatePt = (value: Date) => value.toLocaleDateString('pt-BR');

  const getEnterpriseWorkingWeekDays = () => {
    const opening = activeEnterprise?.openingHours || {};
    const set = new Set<number>();
    Object.entries(opening).forEach(([key, conf]: any) => {
      const normalizedKey = String(key || '')
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase();
      const jsDay = WEEKDAY_KEY_TO_JS[normalizedKey];
      if (typeof jsDay === 'number' && !Boolean(conf?.closed)) {
        set.add(jsDay);
      }
    });
    return set;
  };

  const normalizeTxDate = (tx: any) => {
    const raw = String(tx?.timestamp || tx?.date || '');
    const parsed = raw ? new Date(raw) : null;
    if (parsed && Number.isFinite(parsed.getTime())) return parsed;
    return null;
  };

  const clientByPhone = useMemo(() => {
    const map = new Map<string, Client>();
    clients.forEach((client) => {
      const phone = resolveClientPhone(client);
      buildPhoneVariants(phone).forEach((variant) => {
        if (!map.has(variant)) {
          map.set(variant, client);
        }
      });
    });
    return map;
  }, [clients]);

  const refreshStatus = async () => {
    try {
      const data = await ApiService.getWhatsAppStatus();
      setStatus({
        state: data?.state || 'DISCONNECTED',
        connected: Boolean(data?.connected),
        qrAvailable: Boolean(data?.qrAvailable),
        qrDataUrl: data?.qrDataUrl || null,
        phoneNumber: data?.phoneNumber || null,
        lastError: data?.lastError || null
      });
    } catch (err) {
      console.error('Erro ao buscar status do WhatsApp:', err);
      setStatus(prev => ({
        ...prev,
        state: 'ERROR',
        lastError: 'Não foi possível conectar ao backend do WhatsApp.'
      }));
    }
  };

  const loadChats = async (showSpinner = true) => {
    if (!status.connected) {
      setChats([]);
      return;
    }
    if (showSpinner) {
      setChatLoading(true);
    }
    try {
      const data = await ApiService.getWhatsAppChats();
      const nextChats = (Array.isArray(data?.chats) ? data.chats : []).map((chat: ChatSummary) => ({
        ...chat,
        lastTimestamp: normalizeTimestampMs((chat as any)?.lastTimestamp) || 0,
      }));
      setChats(nextChats);
      const backendChatIds = new Set(nextChats.map((chat: ChatSummary) => chat.chatId));
      setDraftChats((prev) => prev.filter((draft) => {
        if (backendChatIds.has(draft.chatId)) return false;
        const samePhoneInBackend = nextChats.some((chat: ChatSummary) => hasPhoneVariantIntersection(chat.phone, draft.phone));
        return !samePhoneInBackend;
      }));
    } catch (err) {
      console.error('Erro ao carregar conversas WhatsApp:', err);
      setChats([]);
    } finally {
      if (showSpinner) {
        setChatLoading(false);
      }
    }
  };

  const loadMessages = async (chatId: string, showSpinner = true) => {
    if (showSpinner) {
      setMessagesLoading(true);
    }
    try {
      const data = await ApiService.getWhatsAppChatMessages(chatId, 100);
      const nextMessages = (Array.isArray(data?.messages) ? data.messages : []).map((msg: ChatMessage) => ({
        ...msg,
        timestamp: normalizeTimestampMs((msg as any)?.timestamp) || 0,
      }));
      setMessages(nextMessages);
      setAudioTranscriptions((prev) => {
        const validIds = new Set(nextMessages.map((msg: ChatMessage) => String(msg.id || '')));
        const next: Record<string, AudioTranscriptionState> = {};
        Object.entries(prev).forEach(([key, value]) => {
          if (validIds.has(key)) next[key] = value;
        });
        return next;
      });
    } catch (err) {
      console.error('Erro ao carregar mensagens:', err);
      setMessages([]);
      setAudioTranscriptions({});
    } finally {
      if (showSpinner) {
        setMessagesLoading(false);
      }
    }
  };

  const loadSchedules = async (chatId?: string) => {
    if (!chatId) {
      setScheduledItems([]);
      return;
    }
    try {
      const data = await ApiService.getWhatsAppSchedules(chatId);
      const pendingOnly = Array.isArray(data?.schedules)
        ? data.schedules.filter((item: ScheduledItem) => String(item?.status || '').toLowerCase() === 'pending')
        : [];
      setScheduledItems(pendingOnly);
    } catch (err) {
      console.error('Erro ao carregar agendamentos:', err);
      setScheduledItems([]);
    }
  };

  const loadAiAudit = async (limit = 20) => {
    try {
      const data = await ApiService.getWhatsAppAiAudit(limit);
      const logs = Array.isArray(data?.logs) ? data.logs : [];
      setAiAuditLogs(logs);
    } catch (err) {
      console.error('Erro ao carregar auditoria da IA:', err);
      setAiAuditLogs([]);
    }
  };

  const loadAiHandoffRequests = async () => {
    try {
      const data = await ApiService.getWhatsAppAiHandoffRequests();
      const nextRequests = Array.isArray(data?.requests) ? data.requests : [];
      setAiHandoffRequests(nextRequests);

      nextRequests.forEach((request: AiHandoffRequest) => {
        const id = String(request?.id || '').trim();
        if (!id) return;
        if (notifiedHandoffIdsRef.current.has(id)) return;
        notifiedHandoffIdsRef.current.add(id);
        notificationService.alerta(
          'Aprovação de atendimento IA',
          `Contato ${request.contactName || request.chatId} aguardando decisão humana para iniciar atendimento automático.`,
          6000
        );
      });

      const activeIds = new Set(nextRequests.map((item: AiHandoffRequest) => String(item?.id || '').trim()).filter(Boolean));
      Array.from(notifiedHandoffIdsRef.current.values()).forEach((id) => {
        if (!activeIds.has(id)) {
          notifiedHandoffIdsRef.current.delete(id);
        }
      });
    } catch (err) {
      console.error('Erro ao carregar solicitações de handoff da IA:', err);
      setAiHandoffRequests([]);
    }
  };

  const handleAiHandoffDecision = async (request: AiHandoffRequest, accept: boolean) => {
    const requestId = String(request?.id || '').trim();
    if (!requestId) return;
    try {
      await ApiService.decideWhatsAppAiHandoffRequest(requestId, accept);
      notificationService.informativo(
        accept ? 'Atendimento IA aprovado' : 'Atendimento IA recusado',
        accept
          ? `A IA foi liberada para iniciar o atendimento de ${request.contactName || request.chatId}.`
          : `A IA não iniciará atendimento automático para ${request.contactName || request.chatId}.`,
        4500
      );
      await loadAiHandoffRequests();
      if (accept && request.chatId) {
        setSelectedChatId(request.chatId);
        await loadChats(false);
        await loadMessages(request.chatId, false);
      }
    } catch (err) {
      console.error('Erro ao decidir handoff de atendimento IA:', err);
      notificationService.critico(
        'Falha ao registrar decisão',
        'Não foi possível aplicar a decisão de atendimento automático. Tente novamente.'
      );
    }
  };

  const loadData = async () => {
    if (!activeEnterprise) {
      setClients([]);
      setPlans([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [clientsData, plansData] = await Promise.all([
        ApiService.getClients(activeEnterprise.id),
        ApiService.getPlans(activeEnterprise.id).catch(() => []),
        refreshStatus(),
        loadAiAudit(20),
        loadAiHandoffRequests(),
      ]);
      setClients(Array.isArray(clientsData) ? clientsData : []);
      setPlans(Array.isArray(plansData) ? plansData : []);
    } catch (err) {
      console.error('Erro ao carregar página WhatsApp:', err);
      setClients([]);
      setPlans([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!activeEnterprise) {
      setClients([]);
      setPlans([]);
      setLoading(false);
      return;
    }

    loadData();
  }, [activeEnterprise]);

  useEffect(() => {
    const storedEnabled = localStorage.getItem(WHATSAPP_SIGNATURE_ENABLED_KEY);
    const storedName = localStorage.getItem(WHATSAPP_SIGNATURE_NAME_KEY);
    const storedCountryCode = localStorage.getItem(NEW_CHAT_COUNTRY_CODE_KEY);
    const storedQuickRepliesRaw = localStorage.getItem(WHATSAPP_QUICK_REPLIES_KEY);
    const storedAiConfigRaw = localStorage.getItem(WHATSAPP_AI_CONFIG_KEY);
    const storedCampaignReportsRaw = localStorage.getItem(WHATSAPP_CAMPAIGN_REPORTS_KEY);
    const storedPlanConsumptionReportsRaw = localStorage.getItem(WHATSAPP_PLAN_CONSUMPTION_REPORTS_KEY);
    const normalizedStoredName = String(storedName || '');
    const normalizedStoredEnabled = storedEnabled === 'true';
    let parsedQuickReplies: string[] = [];
    try {
      const parsed = JSON.parse(String(storedQuickRepliesRaw || '[]'));
      parsedQuickReplies = Array.isArray(parsed)
        ? parsed.map((item) => String(item || '').trim()).filter(Boolean)
        : [];
    } catch {
      parsedQuickReplies = [];
    }

    setSignatureEnabled(normalizedStoredEnabled);
    setSignatureName(normalizedStoredName);
    setSavedSignatureEnabled(normalizedStoredEnabled);
    setSavedSignatureName(normalizedStoredName);
    setNewChatCountryCode(storedCountryCode || '55');
    setQuickReplies(parsedQuickReplies);

    try {
      const parsed = JSON.parse(String(storedCampaignReportsRaw || '[]'));
      const normalized = Array.isArray(parsed)
        ? parsed.map((item: any) => ({
            id: String(item?.id || ''),
            name: String(item?.name || ''),
            mode: String(item?.mode || 'BROADCAST') as CampaignMode,
            audience: String(item?.audience || 'ALL') as CampaignAudience,
            createdAt: Number(item?.createdAt || Date.now()),
            startAt: Number(item?.startAt || Date.now()),
            targetCount: Number(item?.targetCount || 0),
            sentCount: Number(item?.sentCount || 0),
            scheduledCount: Number(item?.scheduledCount || 0),
            failedCount: Number(item?.failedCount || 0),
            intervalSeconds: Number(item?.intervalSeconds || 0),
            withSignature: Boolean(item?.withSignature),
            hasAttachment: Boolean(item?.hasAttachment),
            status: ['ENVIADA', 'AGENDADA', 'PARCIAL', 'ERRO'].includes(String(item?.status || ''))
              ? String(item.status) as CampaignReport['status']
              : 'ERRO',
            paused: Boolean(item?.paused),
          }))
            .filter((item: CampaignReport) => Boolean(item.id))
            .slice(0, 100)
        : [];
      setCampaignReports(normalized);
    } catch {
      setCampaignReports([]);
    }

    try {
      const parsed = JSON.parse(String(storedPlanConsumptionReportsRaw || '[]'));
      const normalized = Array.isArray(parsed)
        ? parsed.map((item: any) => ({
            id: String(item?.id || ''),
            createdAt: Number(item?.createdAt || Date.now()),
            mode: String(item?.mode || 'NOW') === 'SCHEDULED' ? 'SCHEDULED' : 'NOW',
            frequency: String(item?.frequency || 'MONTHLY') === 'WEEKLY' ? 'WEEKLY' : 'MONTHLY',
            recipients: Number(item?.recipients || 0),
            sentCount: Number(item?.sentCount || 0),
            scheduledCount: Number(item?.scheduledCount || 0),
            failedCount: Number(item?.failedCount || 0),
            periodLabel: String(item?.periodLabel || '-'),
          }))
            .filter((item: PlanConsumptionDispatchReport) => Boolean(item.id))
            .slice(0, 100)
        : [];
      setPlanConsumptionReports(normalized);
    } catch {
      setPlanConsumptionReports([]);
    }

    let parsedAiConfig = getDefaultAiConfig();
    try {
      const parsed = JSON.parse(String(storedAiConfigRaw || ''));
      if (parsed && typeof parsed === 'object') {
        parsedAiConfig = normalizeAiConfigState(parsed);
      }
    } catch {
      parsedAiConfig = getDefaultAiConfig();
    }
    if (parsedAiConfig.contexts.length === 0) {
      parsedAiConfig.contexts = getDefaultAiConfig().contexts;
    }
    setAiConfig(parsedAiConfig);
    setSavedAiConfig(parsedAiConfig);
    setSelectedAiContextId(parsedAiConfig.contexts[0]?.id || null);
  }, []);

  useEffect(() => {
    const startDay = Math.min(28, Math.max(1, Number(activeEnterprise?.collaboratorPaymentStartDay || 1) || 1));
    const dueDay = Math.min(28, Math.max(1, Number(activeEnterprise?.collaboratorPaymentDueDay || 7) || 7));
    setPlanConsumptionMonthlyStartDay(startDay);
    setPlanConsumptionMonthlyEndDay(dueDay);
    setPlanConsumptionMonthlyDay(dueDay);
  }, [activeEnterprise?.collaboratorPaymentStartDay, activeEnterprise?.collaboratorPaymentDueDay]);

  useEffect(() => {
    let cancelled = false;

    const loadAiConfigFromBackend = async () => {
      try {
        const result = await ApiService.getWhatsAppAiConfig();
        if (cancelled) return;
        const backendConfig = result?.config;
        if (!backendConfig || typeof backendConfig !== 'object') return;
        const normalized = normalizeAiConfigState(backendConfig);
        setAiConfig(normalized);
        setSavedAiConfig(normalized);
        setSelectedAiContextId(Array.isArray(normalized.contexts) ? normalized.contexts[0]?.id || null : null);
        localStorage.setItem(WHATSAPP_AI_CONFIG_KEY, JSON.stringify(normalized));
      } catch (err) {
        if (!cancelled) {
          console.warn('Falha ao carregar AI Config do backend, usando configuração local.', err);
        }
      }
    };

    loadAiConfigFromBackend();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(NEW_CHAT_COUNTRY_CODE_KEY, newChatCountryCode);
  }, [newChatCountryCode]);

  useEffect(() => {
    if (status.connected && activeTab === 'CRM') {
      loadChats();
    }
  }, [status.connected, activeTab]);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      if (pollingInFlightRef.current) return;
      pollingInFlightRef.current = true;

      try {
        await refreshStatus();
        if (activeTab === 'CRM') {
          await loadAiAudit(20);
          await loadAiHandoffRequests();
          if (status.connected) {
            await loadChats(false);
            if (selectedChatId) {
              await loadMessages(selectedChatId, false);
              await loadSchedules(selectedChatId);
            }
          }
        }
      } finally {
        pollingInFlightRef.current = false;
      }
    }, 6000);

    return () => window.clearInterval(timer);
  }, [activeTab, status.connected, selectedChatId]);

  useEffect(() => {
    let cancelled = false;

    const loadAiAgentState = async () => {
      if (!selectedChatId) {
        setAiAgentEnabledForChat(false);
        return;
      }
      try {
        const result = await ApiService.getWhatsAppChatAiAgentState(selectedChatId);
        if (cancelled) return;
        setAiAgentEnabledForChat(Boolean(result?.enabled));
      } catch {
        if (!cancelled) {
          setAiAgentEnabledForChat(false);
        }
      }
    };

    loadAiAgentState();
    return () => {
      cancelled = true;
    };
  }, [selectedChatId]);

  const recipients = useMemo(() => {
    const term = search.trim().toLowerCase();
    return clients
      .map((client) => ({
        client,
        phone: resolveClientPhone(client)
      }))
      .filter((entry) => Boolean(entry.phone))
      .filter((entry) => {
        if (!term) return true;
        return (
          entry.client.name.toLowerCase().includes(term)
          || entry.phone.includes(term.replace(/\D/g, ''))
          || String(entry.client.registrationId || '').toLowerCase().includes(term)
        );
      })
      .sort((a, b) => a.client.name.localeCompare(b.client.name, 'pt-BR', { sensitivity: 'base' }));
  }, [clients, search]);

  const agendaClients = useMemo(() => {
    const term = normalizeSearchValue(agendaSearch);
    return clients
      .map((client) => {
        const phone = resolveClientPhone(client);
        const responsibleName = resolveResponsibleName(client);
        const primaryName = resolveConversationPrimaryName(client);
        const relatedName =
          responsibleName && normalizeSearchValue(responsibleName) !== normalizeSearchValue(client.name)
            ? String(client.name || '').trim()
            : '';
        const normalizedName = normalizeSearchValue(client.name);
        const normalizedResponsible = normalizeSearchValue(responsibleName);
        const normalizedPrimary = normalizeSearchValue(primaryName);
        const normalizedRegistration = normalizeSearchValue(String(client.registrationId || ''));
        return {
          client,
          phone,
          responsibleName,
          primaryName,
          relatedName,
          normalizedName,
          normalizedResponsible,
          normalizedPrimary,
          normalizedRegistration
        };
      })
      .filter((entry) => Boolean(entry.phone))
      .filter((entry) => {
        if (!term) return true;
        const digitsTerm = term.replace(/\D/g, '');
        const tokenMatches =
          entry.normalizedName.split(' ').some((token) => token.startsWith(term))
          || entry.normalizedResponsible.split(' ').some((token) => token.startsWith(term))
          || entry.normalizedPrimary.split(' ').some((token) => token.startsWith(term));
        return tokenMatches
          || entry.normalizedName.includes(term)
          || entry.normalizedResponsible.includes(term)
          || entry.normalizedPrimary.includes(term)
          || entry.normalizedRegistration.includes(term)
          || (digitsTerm.length > 0 && entry.phone.includes(digitsTerm))
          || isSubsequenceMatch(entry.normalizedName, term);
      })
      .sort((a, b) => {
        if (!term) {
          return a.client.name.localeCompare(b.client.name, 'pt-BR', { sensitivity: 'base' });
        }

        const digitsTerm = term.replace(/\D/g, '');
        const aNameStarts = a.normalizedName.startsWith(term);
        const bNameStarts = b.normalizedName.startsWith(term);
        if (aNameStarts !== bNameStarts) return aNameStarts ? -1 : 1;

        const aTokenStarts = a.normalizedName.split(' ').some((token) => token.startsWith(term));
        const bTokenStarts = b.normalizedName.split(' ').some((token) => token.startsWith(term));
        if (aTokenStarts !== bTokenStarts) return aTokenStarts ? -1 : 1;

        const aResponsibleStarts = a.normalizedResponsible.startsWith(term);
        const bResponsibleStarts = b.normalizedResponsible.startsWith(term);
        if (aResponsibleStarts !== bResponsibleStarts) return aResponsibleStarts ? -1 : 1;

        const aPrimaryStarts = a.normalizedPrimary.startsWith(term);
        const bPrimaryStarts = b.normalizedPrimary.startsWith(term);
        if (aPrimaryStarts !== bPrimaryStarts) return aPrimaryStarts ? -1 : 1;

        const aPhoneStarts = digitsTerm.length > 0 && a.phone.startsWith(digitsTerm);
        const bPhoneStarts = digitsTerm.length > 0 && b.phone.startsWith(digitsTerm);
        if (aPhoneStarts !== bPhoneStarts) return aPhoneStarts ? -1 : 1;

        return a.client.name.localeCompare(b.client.name, 'pt-BR', { sensitivity: 'base' });
      });
  }, [clients, agendaSearch]);

  const visibleChats = useMemo<VisibleChat[]>(() => {
    const contactNameTerm = chatSearchName.trim().toLowerCase();
    const backendChats = chats
      .map((chat) => {
        const mappedClient = Array.from(buildPhoneVariants(chat.phone))
          .map((variant) => clientByPhone.get(variant))
          .find(Boolean) || null;
        const responsibleName = resolveResponsibleName(mappedClient);
        const primaryName = resolveConversationPrimaryName(mappedClient);
        const displayName = primaryName || chat.name || chat.phone;
        const contactType = mappedClient?.type || '';
        const labels = resolveContactLabels(mappedClient);
        return {
          ...chat,
          displayName,
          registrationId: mappedClient?.registrationId || '',
          contactType,
          responsibleName,
          contactTypeLabel: labels.contactTypeLabel,
          relationshipLabel: labels.relationshipLabel,
          isDraft: false,
        };
      })
      .filter((chat) => {
        const matchesName =
          !contactNameTerm
          || chat.displayName.toLowerCase().includes(contactNameTerm)
          || chat.phone.includes(contactNameTerm.replace(/\D/g, ''))
          || String(chat.registrationId || '').toLowerCase().includes(contactNameTerm);

        const matchesType =
          chatContactType === 'ALL'
          || String(chat.contactType || '').toUpperCase() === chatContactType;

        return matchesName && matchesType;
      })
      .sort((a, b) => b.lastTimestamp - a.lastTimestamp);

    const filteredDrafts = draftChats
      .filter((draft) => !backendChats.some((backend) => hasPhoneVariantIntersection(backend.phone, draft.phone)))
      .filter((chat) => {
      const matchesName =
        !contactNameTerm
        || chat.displayName.toLowerCase().includes(contactNameTerm)
        || chat.phone.includes(contactNameTerm.replace(/\D/g, ''));

      const matchesType =
        chatContactType === 'ALL'
        || String(chat.contactType || '').toUpperCase() === chatContactType;

      return matchesName && matchesType;
      });

    const merged = [...backendChats];
    filteredDrafts.forEach((draft) => {
      if (!merged.some((chat) => chat.chatId === draft.chatId)) {
        merged.push(draft);
      }
    });

    return merged.sort((a, b) => Number(b.lastTimestamp || 0) - Number(a.lastTimestamp || 0));
  }, [chats, chatSearchName, chatContactType, clientByPhone, draftChats]);

  useEffect(() => {
    if (!selectedChatId) return;
    const selectedDraft = draftChats.find((draft) => draft.chatId === selectedChatId);
    if (!selectedDraft) return;
    const matchedBackend = chats.find((chat) => hasPhoneVariantIntersection(chat.phone, selectedDraft.phone));
    if (!matchedBackend) return;
    setSelectedChatId(matchedBackend.chatId);
    loadMessages(matchedBackend.chatId).catch(() => {});
  }, [selectedChatId, draftChats, chats]);

  const selectedChat = useMemo(
    () => visibleChats.find((chat) => chat.chatId === selectedChatId) || null,
    [visibleChats, selectedChatId]
  );

  useEffect(() => {
    const pendingPhoneRaw = localStorage.getItem('whatsapp_open_phone');
    if (!pendingPhoneRaw) return;
    const rawContext = localStorage.getItem(WHATSAPP_OPEN_CONTEXT_KEY);
    let context: { displayName?: string; contactTypeLabel?: string; relationshipLabel?: string } | null = null;
    if (rawContext) {
      try {
        context = JSON.parse(rawContext);
      } catch {
        context = null;
      }
    }
    const pendingPhone = normalizePhone(pendingPhoneRaw);
    if (!pendingPhone) {
      localStorage.removeItem('whatsapp_open_phone');
      localStorage.removeItem(WHATSAPP_OPEN_CONTEXT_KEY);
      return;
    }

    localStorage.removeItem('whatsapp_open_phone');
    localStorage.removeItem(WHATSAPP_OPEN_CONTEXT_KEY);

    const matchedClient = Array.from(buildPhoneVariants(pendingPhone))
      .map((variant) => clientByPhone.get(variant))
      .find(Boolean) || null;
    const matchedLabels = resolveContactLabels(matchedClient);

    openDraftConversation({
      phone: pendingPhone,
      displayName: String(
        context?.displayName
        || (matchedClient
          ? (resolveConversationPrimaryName(matchedClient) || matchedClient.name || pendingPhone)
          : pendingPhone)
      ),
      contactType: String(matchedClient?.type || ''),
      responsibleName: matchedClient ? resolveResponsibleName(matchedClient) : '',
      registrationId: String(matchedClient?.registrationId || ''),
      contactTypeLabel: String(context?.contactTypeLabel || matchedLabels.contactTypeLabel || '').trim(),
      relationshipLabel: String(context?.relationshipLabel || matchedLabels.relationshipLabel || '').trim(),
    });
  }, [visibleChats, clientByPhone]);

  useEffect(() => {
    setIsContactDetailsVisible(false);
  }, [selectedChatId]);

  useEffect(() => {
    if (!selectedChatId) return;
    const timer = window.setTimeout(() => {
      chatReplyInputRef.current?.focus();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [selectedChatId]);

  const selectedChatClient = useMemo(() => {
    if (!selectedChat) return null;
    return Array.from(buildPhoneVariants(selectedChat.phone))
      .map((variant) => clientByPhone.get(variant))
      .find(Boolean) || null;
  }, [selectedChat, clientByPhone]);
  const relatedStudents = useMemo(() => {
    if (!selectedChatClient) return [];
    const responsibleName = resolveResponsibleName(selectedChatClient);
    const normalizedResponsible = normalizeSearchValue(responsibleName);

    if (!normalizedResponsible) {
      return [selectedChatClient];
    }

    const students = clients.filter((client) => (
      normalizeSearchValue(resolveResponsibleName(client)) === normalizedResponsible
      && String(client.type || '').toUpperCase() !== 'COLABORADOR'
    ));

    return students.length > 0 ? students : [selectedChatClient];
  }, [selectedChatClient, clients]);
  const selectedStudent = useMemo(() => {
    if (relatedStudents.length === 0) return null;
    if (!selectedStudentId) return null;
    return relatedStudents.find((student) => student.id === selectedStudentId) || null;
  }, [relatedStudents, selectedStudentId]);
  const selectedStudentPlanSummary = useMemo(() => {
    if (!selectedStudent) return [];

    const planBalances = selectedStudent.planCreditBalances || {};
    const byName = new Map<string, number>();
    Object.values(planBalances).forEach((entry) => {
      const key = String(entry?.planName || '').trim().toUpperCase();
      if (!key) return;
      byName.set(key, Number(entry?.balance || 0));
    });

    return (selectedStudent.servicePlans || []).map((planName) => {
      const normalized = String(planName || '').trim().toUpperCase();
      if (normalized === 'PREPAGO') {
        const numericBalance = Number(selectedStudent.balance || 0);
        return {
          key: normalized,
          label: formatClientPlanLabel(planName),
          numericBalance,
          value: `R$ ${numericBalance.toFixed(2)}`,
        };
      }

      const balance = byName.get(normalized);
      const numericBalance = Number(balance ?? NaN);
      return {
        key: normalized,
        label: formatClientPlanLabel(planName),
        numericBalance,
        value: Number.isFinite(numericBalance) ? `R$ ${Number(balance || 0).toFixed(2)}` : 'Sem saldo informado',
      };
    });
  }, [selectedStudent]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!selectedStudent?.id) {
        setSelectedStudentConsumedToday(null);
        return;
      }
      try {
        setIsLoadingStudentConsumedToday(true);
        const txList = await ApiService.getTransactions({ clientId: selectedStudent.id });
        const list = Array.isArray(txList) ? txList : [];
        const today = new Date();
        const hasTodayConsumption = list.some((tx: any) => {
          const type = String(tx?.type || '').toUpperCase();
          if (type !== 'CONSUMO') return false;
          const raw = String(tx?.timestamp || tx?.date || '');
          if (!raw) return false;
          const parsed = new Date(raw);
          if (!Number.isFinite(parsed.getTime()) && String(tx?.date || '')) {
            const fromDate = new Date(`${String(tx.date)}T00:00:00`);
            if (!Number.isFinite(fromDate.getTime())) return false;
            return fromDate.toDateString() === today.toDateString();
          }
          return parsed.toDateString() === today.toDateString();
        });
        if (!cancelled) setSelectedStudentConsumedToday(hasTodayConsumption);
      } catch {
        if (!cancelled) setSelectedStudentConsumedToday(null);
      } finally {
        if (!cancelled) setIsLoadingStudentConsumedToday(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [selectedStudent?.id]);

  const handleQuickChargeLowBalance = () => {
    if (!selectedChat) return;
    const aluno = selectedStudent?.name || selectedChatClient?.name || 'aluno';
    const saldo = Number(selectedStudent?.balance || selectedChatClient?.balance || 0);
    const responsible = selectedChat.displayName || resolveResponsibleName(selectedChatClient || undefined) || 'responsável';
    const nextMessage = `Olá ${responsible}, o saldo do aluno ${aluno} é de R$ ${saldo.toFixed(2)}. Deseja recarregar?`;
    setChatReply(nextMessage);
    notificationService.informativo('Mensagem sugerida', 'Texto de cobrança preenchido no campo de resposta.');
  };

  const handleSendConsumptionReport = async () => {
    if (!selectedChatId) {
      setFeedback('Selecione uma conversa para enviar relatório.');
      return;
    }
    if (!selectedChatClient) {
      setFeedback('Contato sem cadastro de cliente para gerar relatório.');
      return;
    }
    if (!activeEnterprise?.id) {
      setFeedback('Empresa ativa não encontrada para gerar relatório.');
      return;
    }

    const now = new Date();
    const endDate = toDateOnly(now);
    let startDate = toDateOnly(now);
    if (reportPeriodMode === 'WEEKLY') {
      startDate.setDate(startDate.getDate() - 6);
    } else if (reportPeriodMode === 'BIWEEKLY') {
      startDate.setDate(startDate.getDate() - 14);
    } else {
      const customStart = reportStartDate ? new Date(`${reportStartDate}T00:00:00`) : null;
      const customEnd = reportEndDate ? new Date(`${reportEndDate}T23:59:59`) : null;
      if (!customStart || !customEnd || !Number.isFinite(customStart.getTime()) || !Number.isFinite(customEnd.getTime())) {
        setFeedback('Informe data inicial e final válidas para relatório.');
        return;
      }
      if (customEnd.getTime() < customStart.getTime()) {
        setFeedback('Data final deve ser maior ou igual à inicial.');
        return;
      }
      startDate = toDateOnly(customStart);
      endDate.setTime(customEnd.getTime());
      endDate.setHours(23, 59, 59, 999);
    }

    setIsSendingReport(true);
    try {
      const contactType = String(selectedChatClient.type || '').toUpperCase();
      if (!['ALUNO', 'COLABORADOR'].includes(contactType)) {
        setFeedback('Relatório disponível apenas para ALUNO e COLABORADOR.');
        return;
      }

      const reportClient = contactType === 'ALUNO'
        ? (selectedStudent || selectedChatClient)
        : selectedChatClient;

      const txList = await ApiService.getTransactions({
        clientId: reportClient.id,
        enterpriseId: activeEnterprise.id
      });
      const transactions = Array.isArray(txList) ? txList : [];
      const workingDays = getEnterpriseWorkingWeekDays();

      const filtered = transactions.filter((tx: any) => {
        const txDate = normalizeTxDate(tx);
        if (!txDate) return false;
        if (txDate.getTime() < startDate.getTime() || txDate.getTime() > endDate.getTime()) return false;
        if (reportPeriodMode === 'WEEKLY' && workingDays.size > 0) {
          return workingDays.has(txDate.getDay());
        }
        return true;
      });

      const sorted = [...filtered].sort((a, b) => {
        const aTs = normalizeTxDate(a)?.getTime() || 0;
        const bTs = normalizeTxDate(b)?.getTime() || 0;
        return aTs - bTs;
      });

      const parseAmount = (tx: any) => Math.abs(Number(tx?.amount ?? tx?.total ?? tx?.value ?? 0) || 0);
      const isConsumption = (tx: any) => {
        const txType = String(tx?.type || '').toUpperCase();
        const marker = String(tx?.category || tx?.plan || tx?.description || '').toUpperCase();
        return txType.includes('DEBIT') || txType.includes('CONSUMO') || marker.includes('CONSUMO');
      };
      const isCredit = (tx: any) => {
        const txType = String(tx?.type || '').toUpperCase();
        return txType.includes('CREDIT') || txType.includes('CREDITO');
      };

      const totalConsumption = sorted.filter(isConsumption).reduce((acc, tx) => acc + parseAmount(tx), 0);
      const totalCredits = sorted.filter(isCredit).reduce((acc, tx) => acc + parseAmount(tx), 0);
      const netPeriod = Number((totalCredits - totalConsumption).toFixed(2));

      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      const periodLabel = reportPeriodMode === 'WEEKLY'
        ? 'Semanal'
        : reportPeriodMode === 'BIWEEKLY'
          ? 'Quinzenal'
          : 'Período personalizado';

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.text('Relatório de Movimentações - WhatsApp', 40, 36);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Empresa: ${activeEnterprise.name || '-'}`, 40, 56);
      doc.text(`Escola: ${activeEnterprise.attachedSchoolName || '-'}`, 40, 72);
      doc.text(`Contato: ${reportClient.name || '-'}`, 40, 88);
      doc.text(`Tipo: ${contactType}`, 40, 104);
      doc.text(`Período: ${formatDatePt(startDate)} até ${formatDatePt(endDate)} (${periodLabel})`, 40, 120);

      if (contactType === 'ALUNO') {
        const classYear = [String(reportClient.class || '').trim(), String((reportClient as any).classGrade || '').trim()]
          .filter(Boolean)
          .join(' / ');
        doc.text(`Turma/Ano: ${classYear || '-'}`, 320, 88);
        doc.text(`Responsável: ${resolveResponsibleName(reportClient) || '-'}`, 320, 104);
      } else {
        doc.text(`Responsável: -`, 320, 104);
      }

      if (reportPeriodMode === 'WEEKLY' && workingDays.size > 0) {
        const days = Array.from(workingDays).sort((a, b) => a - b).map((d) => PT_WEEKDAY_LABELS[d]).join(', ');
        doc.text(`Dias funcionamento (semanal): ${days}`, 320, 120);
      }

      const bodyRows = sorted.map((tx: any) => {
        const txDate = normalizeTxDate(tx);
        const dateLabel = txDate ? txDate.toLocaleDateString('pt-BR') : '-';
        const timeLabel = txDate ? txDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-';
        const description = String(tx?.description || tx?.item || tx?.plan || tx?.category || 'Movimentação');
        const txType = isConsumption(tx) ? 'CONSUMO' : isCredit(tx) ? 'CRÉDITO' : String(tx?.type || '-');
        const method = String(tx?.paymentMethod || tx?.method || '-');
        const amount = parseAmount(tx);
        return [
          `${dateLabel} ${timeLabel}`,
          description,
          txType,
          method,
          `R$ ${amount.toFixed(2)}`
        ];
      });

      autoTable(doc, {
        startY: 146,
        head: [['Data/Hora', 'Descrição', 'Tipo', 'Método', 'Valor']],
        body: bodyRows.length > 0 ? bodyRows : [['-', 'Sem movimentações no período selecionado', '-', '-', 'R$ 0,00']],
        styles: { fontSize: 8.5, cellPadding: 5 },
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 110 },
          1: { cellWidth: 190 },
          2: { cellWidth: 80 },
          3: { cellWidth: 80 },
          4: { cellWidth: 85, halign: 'right' }
        }
      });

      const finalY = (doc as any).lastAutoTable?.finalY || 170;
      const planBalances = reportClient.planCreditBalances || {};
      const prepaidBalance = Number(reportClient.balance || 0);
      const plansTotalBalance = Object.values(planBalances).reduce((acc: number, entry: any) => acc + Number(entry?.balance || 0), 0);
      const collaboratorDue = Number(reportClient.amountDue || 0);
      const collaboratorConsumption = Number(reportClient.monthlyConsumption || 0);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Rodapé de Totais e Saldos', 40, finalY + 24);
      doc.setFont('helvetica', 'normal');

      const footerLines = [
        `Total de movimentações: ${sorted.length}`,
        `Total créditos: R$ ${totalCredits.toFixed(2)}`,
        `Total consumo: R$ ${totalConsumption.toFixed(2)}`,
        `Saldo líquido do período: R$ ${netPeriod.toFixed(2)}`
      ];

      if (contactType === 'ALUNO') {
        footerLines.push(`Saldo PREPAGO atual: R$ ${prepaidBalance.toFixed(2)}`);
        footerLines.push(`Saldo total dos planos: R$ ${plansTotalBalance.toFixed(2)}`);
      } else {
        footerLines.push(`Consumo acumulado colaborador: R$ ${collaboratorConsumption.toFixed(2)}`);
        footerLines.push(`Saldo/valor devido atual: R$ ${collaboratorDue.toFixed(2)}`);
      }

      footerLines.forEach((line, index) => {
        doc.text(`- ${line}`, 40, finalY + 42 + (index * 14));
      });

      const footerSignature = `Gerado em ${new Date().toLocaleString('pt-BR')} por ${activeEnterprise.name || 'Cantina Smart'}`;
      doc.setFontSize(8);
      doc.text(footerSignature, pageWidth - 40, doc.internal.pageSize.getHeight() - 18, { align: 'right' });

      const pdfDataUri = doc.output('datauristring');
      const fileBase = String(reportClient.name || 'relatorio').trim().toLowerCase().replace(/\s+/g, '_');
      const fileName = `relatorio_${fileBase}_${new Date().toISOString().slice(0, 10)}.pdf`;

      const queueResult = await ApiService.sendWhatsAppMessageToChat(
        selectedChatId,
        formatOutgoingMessage('Estou consultando os dados e montando o relatório em PDF. Aguarde um instante.')
      );
      if (Boolean(queueResult?.aiAgentAutoDisabled)) {
        setAiAgentEnabledForChat(false);
      }

      await ApiService.sendWhatsAppMediaToChat(
        selectedChatId,
        formatOutgoingMessage('Segue relatório em PDF.'),
        {
          mediaType: 'document',
          base64Data: pdfDataUri,
          mimeType: 'application/pdf',
          fileName
        }
      );
      await ApiService.sendWhatsAppMessageToChat(
        selectedChatId,
        formatOutgoingMessage('Relatório concluído e enviado em PDF.')
      );

      setFeedback('Relatório em PDF enviado com sucesso.');
      await loadMessages(selectedChatId);
      await loadChats(false);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao enviar relatório em PDF.');
    } finally {
      setIsSendingReport(false);
    }
  };

  useEffect(() => {
    if (!selectedChatId) {
      setSelectedStudentId('');
      return;
    }
    if (relatedStudents.length === 1) {
      setSelectedStudentId(relatedStudents[0].id);
      return;
    }
    if (relatedStudents.some((student) => student.id === selectedStudentId)) {
      return;
    }
    setSelectedStudentId('');
  }, [selectedChatId, relatedStudents, selectedStudentId]);
  const unreadCount = useMemo(
    () => visibleChats.reduce((sum, chat) => sum + Number(chat.unreadCount || 0), 0),
    [visibleChats]
  );
  const crmVisibleChats = useMemo(() => {
    if (crmFilter === 'UNREAD') {
      return visibleChats.filter((chat) => Number(chat.unreadCount || 0) > 0);
    }
    if (crmFilter === 'WAITING') {
      return visibleChats.filter((chat) => !chat.initiatedByClient);
    }
    return visibleChats;
  }, [visibleChats, crmFilter]);

  const crmTotalConversations = visibleChats.length;
  const crmNewLeads = useMemo(
    () => visibleChats.filter((chat) => Boolean(chat.initiatedByClient)).length,
    [visibleChats]
  );
  const crmResponseRate = useMemo(() => {
    if (crmTotalConversations === 0) return 0;
    const responded = Math.max(0, crmTotalConversations - unreadCount);
    return Number(((responded / crmTotalConversations) * 100).toFixed(1));
  }, [crmTotalConversations, unreadCount]);
  const crmActiveSessions = status.connected ? 1 : 0;

  const crmContactDistribution = useMemo(() => {
    const total = Math.max(1, visibleChats.length);
    const alunos = visibleChats.filter((chat) => String(chat.contactType || '').toUpperCase() === 'ALUNO').length;
    const colaboradores = visibleChats.filter((chat) => String(chat.contactType || '').toUpperCase() === 'COLABORADOR').length;
    const outros = Math.max(0, total - alunos - colaboradores);
    return {
      alunos,
      colaboradores,
      outros,
      alunosPct: Math.round((alunos / total) * 100),
      colaboradoresPct: Math.round((colaboradores / total) * 100),
      outrosPct: Math.round((outros / total) * 100),
    };
  }, [visibleChats]);

  const crmWeekTrend = useMemo(() => {
    const labels = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'];
    const counts = new Array(7).fill(0);
    visibleChats.forEach((chat) => {
      const ts = Number(chat.lastTimestamp || 0);
      if (!ts) return;
      const date = new Date(ts);
      if (!Number.isFinite(date.getTime())) return;
      const day = date.getDay();
      const idx = day === 0 ? 6 : day - 1;
      counts[idx] += 1;
    });
    const max = Math.max(1, ...counts);
    return labels.map((label, index) => ({
      label,
      count: counts[index],
      heightPct: Math.round((counts[index] / max) * 100),
    }));
  }, [visibleChats]);

  const crmRecentActivities = useMemo(
    () => visibleChats
      .filter((chat) => Number(chat.lastTimestamp || 0) > 0)
      .slice(0, 4)
      .map((chat) => ({
        id: chat.chatId,
        title: `Conversa com ${chat.displayName}`,
        subtitle: chat.lastMessage || 'Sem mensagem',
        when: (() => {
          const ts = normalizeTimestampMs(chat.lastTimestamp);
          if (!ts) return 'Sem data';
          return new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
        })(),
      })),
    [visibleChats]
  );

  const crmTopContacts = useMemo(
    () => [...visibleChats]
      .sort((a, b) => Number(b.unreadCount || 0) - Number(a.unreadCount || 0))
      .slice(0, 4)
      .map((chat) => ({
        id: chat.chatId,
        name: chat.displayName,
        metric: `${chat.unreadCount || 0} pendente(s)`,
      })),
    [visibleChats]
  );

  const contactsLastInteractionMap = useMemo(() => {
    const map = new Map<string, ChatSummary>();
    chats.forEach((chat) => {
      const variants = Array.from(buildPhoneVariants(chat.phone));
      variants.forEach((variant) => {
        const current = map.get(variant);
        if (!current || Number(chat.lastTimestamp || 0) > Number(current.lastTimestamp || 0)) {
          map.set(variant, chat);
        }
      });
    });
    return map;
  }, [chats]);

  const formatLastInteractionLabel = (timestamp?: number) => {
    const ts = normalizeTimestampMs(timestamp);
    if (!ts) return 'Sem interação';
    const date = new Date(ts);
    if (!Number.isFinite(date.getTime())) return 'Sem interação';
    const today = new Date();
    const isSameDay = date.toDateString() === today.toDateString();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    const hour = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (isSameDay) return `Hoje às ${hour}`;
    if (isYesterday) return `Ontem às ${hour}`;
    return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  };

  const crmContactRows = useMemo(() => {
    const term = normalizeSearchValue(contactSearchTerm);
    const rows = clients.map((client) => {
      const phone = resolveClientPhone(client);
      const chat =
        Array.from(buildPhoneVariants(phone))
          .map((variant) => contactsLastInteractionMap.get(variant))
          .find(Boolean) || null;
      const labels = Array.isArray(chat?.labels) ? chat?.labels : [];
      const tags = Array.from(new Set([
        String(client.type || '').toUpperCase() === 'ALUNO' ? 'Cliente' : '',
        String(client.type || '').toUpperCase() === 'COLABORADOR' ? 'Colaborador' : '',
        ...labels.map((item) => String(item || '').trim()),
      ].filter(Boolean)));
      const statusLabel = client.isBlocked ? 'INACTIVE' : 'ACTIVE';
      return {
        id: client.id,
        client,
        phone,
        tags,
        statusLabel,
        chat,
        lastTimestamp: Number(chat?.lastTimestamp || 0),
      };
    });

    const filtered = rows.filter((row) => {
      const normalizedName = normalizeSearchValue(row.client.name);
      const normalizedEmail = normalizeSearchValue(row.client.email || '');
      const normalizedPhone = normalizeSearchValue(row.phone);
      const digitsQuery = String(contactSearchTerm || '').replace(/\D/g, '');

      const matchesSearch = !term
        || normalizedName.includes(term)
        || normalizedEmail.includes(term)
        || normalizeSearchValue(String(row.client.registrationId || '')).includes(term)
        || (digitsQuery && normalizedPhone.includes(digitsQuery));

      const matchesStatus = contactStatusFilter === 'ALL'
        || (contactStatusFilter === 'ACTIVE' && row.statusLabel === 'ACTIVE')
        || (contactStatusFilter === 'INACTIVE' && row.statusLabel === 'INACTIVE');

      const matchesTag = contactTagFilter === 'ALL'
        || row.tags.some((tag) => normalizeSearchValue(tag) === normalizeSearchValue(contactTagFilter));

      return matchesSearch && matchesStatus && matchesTag;
    });

    filtered.sort((a, b) => {
      if (contactSortBy === 'NAME') {
        return String(a.client.name || '').localeCompare(String(b.client.name || ''), 'pt-BR', { sensitivity: 'base' });
      }
      return Number(b.lastTimestamp || 0) - Number(a.lastTimestamp || 0);
    });

    return filtered;
  }, [clients, contactsLastInteractionMap, contactSearchTerm, contactStatusFilter, contactTagFilter, contactSortBy]);

  const crmContactAvailableTags = useMemo(() => {
    const tags = new Set<string>();
    crmContactRows.forEach((row) => row.tags.forEach((tag) => tags.add(tag)));
    return Array.from(tags).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }, [crmContactRows]);

  const CONTACTS_PAGE_SIZE = 10;
  const crmContactTotalPages = Math.max(1, Math.ceil(crmContactRows.length / CONTACTS_PAGE_SIZE));
  const safeContactPage = Math.min(contactPage, crmContactTotalPages);
  const crmContactPageRows = useMemo(() => {
    const start = (safeContactPage - 1) * CONTACTS_PAGE_SIZE;
    return crmContactRows.slice(start, start + CONTACTS_PAGE_SIZE);
  }, [crmContactRows, safeContactPage]);

  const campaignAvailableLabels = useMemo(() => {
    const labels = new Set<string>();
    visibleChats.forEach((chat) => {
      (chat.labels || []).forEach((label) => {
        const normalized = String(label || '').trim();
        if (normalized) labels.add(normalized);
      });
    });
    return Array.from(labels).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }, [visibleChats]);

  const selectedAiContext = useMemo(
    () => aiConfig.contexts.find((item) => item.id === selectedAiContextId) || null,
    [aiConfig.contexts, selectedAiContextId]
  );

  const aiFlowVisualNodes = useMemo<AiFlowVisualNode[]>(() => {
    const nodes: AiFlowVisualNode[] = [];
    const pickPos = (id: string, fallbackX: number, fallbackY: number) => {
      const fromState = aiFlowNodePositions[id];
      return {
        x: Number(fromState?.x ?? fallbackX),
        y: Number(fromState?.y ?? fallbackY),
      };
    };

    const triggerPos = pickPos('flow-trigger', 80, 180);
    nodes.push({
      id: 'flow-trigger',
      label: 'Mensagem Recebida',
      kind: 'trigger',
      x: triggerPos.x,
      y: triggerPos.y,
      width: 220,
      height: 88,
    });

    const classifierPos = pickPos('flow-classifier', 360, 180);
    nodes.push({
      id: 'flow-classifier',
      label: 'Assistente AI',
      kind: 'classifier',
      x: classifierPos.x,
      y: classifierPos.y,
      width: 220,
      height: 88,
    });

    const switchPos = pickPos('flow-switch', 640, 180);
    nodes.push({
      id: 'flow-switch',
      label: 'Switch de Contexto',
      kind: 'switch',
      x: switchPos.x,
      y: switchPos.y,
      width: 230,
      height: 88,
    });

    aiConfig.contexts.forEach((ctx, contextIndex) => {
      const baseY = 80 + (contextIndex * 220);
      const ctxNodeId = `ctx-${ctx.id}`;
      const ctxPos = pickPos(ctxNodeId, 940, baseY);
      nodes.push({
        id: ctxNodeId,
        label: ctx.name || `Contexto ${contextIndex + 1}`,
        kind: 'context',
        x: ctxPos.x,
        y: ctxPos.y,
        width: 260,
        height: 96,
        contextId: ctx.id,
      });

      ctx.subSwitches.forEach((sub, subIndex) => {
        const subId = `sub-${ctx.id}-${sub.id}`;
        const subPos = pickPos(subId, 1260, baseY + (subIndex * 120));
        nodes.push({
          id: subId,
          label: sub.name || `Sub-switch ${subIndex + 1}`,
          kind: 'subswitch',
          x: subPos.x,
          y: subPos.y,
          width: 260,
          height: 86,
          contextId: ctx.id,
          subSwitchId: sub.id,
        });

        const finalId = `final-${ctx.id}-${sub.id}`;
        const finalPos = pickPos(finalId, 1570, baseY + (subIndex * 120));
        nodes.push({
          id: finalId,
          label: 'Prompt Final de Resposta',
          kind: 'final',
          x: finalPos.x,
          y: finalPos.y,
          width: 250,
          height: 86,
          contextId: ctx.id,
          subSwitchId: sub.id,
        });
      });
    });

    return nodes;
  }, [aiConfig.contexts, aiFlowNodePositions]);

  const aiFlowVisualNodeMap = useMemo(() => {
    const map = new Map<string, AiFlowVisualNode>();
    aiFlowVisualNodes.forEach((node) => map.set(node.id, node));
    return map;
  }, [aiFlowVisualNodes]);

  const aiFlowVisualEdges = useMemo(() => {
    const edges: Array<{ id: string; source: string; target: string; label?: string }> = [
      { id: 'edge-1', source: 'flow-trigger', target: 'flow-classifier' },
      { id: 'edge-2', source: 'flow-classifier', target: 'flow-switch' },
    ];

    aiConfig.contexts.forEach((ctx) => {
      edges.push({
        id: `edge-switch-ctx-${ctx.id}`,
        source: 'flow-switch',
        target: `ctx-${ctx.id}`,
        label: ctx.name,
      });

      ctx.subSwitches.forEach((sub) => {
        edges.push({
          id: `edge-ctx-sub-${ctx.id}-${sub.id}`,
          source: `ctx-${ctx.id}`,
          target: `sub-${ctx.id}-${sub.id}`,
          label: sub.name,
        });
        edges.push({
          id: `edge-sub-final-${ctx.id}-${sub.id}`,
          source: `sub-${ctx.id}-${sub.id}`,
          target: `final-${ctx.id}-${sub.id}`,
        });
      });
    });

    return edges;
  }, [aiConfig.contexts]);

  const aiSystemVariables = useMemo(() => {
    const base = AI_CONTEXT_DATA_OPTIONS.map((item) => ({
      key: item.variable,
      label: item.label,
    }));
    return [
      ...base,
      { key: '{alunos_colaboradores}', label: 'Lista de alunos/colaboradores relacionados' },
      { key: '{responsavel_detalhe}', label: 'Detalhes do responsável' },
      { key: '{data_atual}', label: 'Data Atual' },
      { key: '{saldo_total}', label: 'Saldo Total' },
      { key: '{relatorio_resumo}', label: 'Relatório resumido' },
      { key: '{relatorio_pdf}', label: 'Relatório em PDF' },
    ];
  }, []);

  const availableAiModels = useMemo(
    () => AI_PROVIDER_MODELS[aiConfig.provider] || AI_PROVIDER_MODELS.openai,
    [aiConfig.provider]
  );

  const availableSttModels = useMemo(
    () => AI_STT_MODELS[aiConfig.provider] || AI_STT_MODELS.openai,
    [aiConfig.provider]
  );

  const aiHasChanges = useMemo(
    () => JSON.stringify(aiConfig) !== JSON.stringify(savedAiConfig),
    [aiConfig, savedAiConfig]
  );

  const campaignPreviewName = useMemo(
    () => selectedChat?.displayName || recipients[0]?.client?.name || 'Cliente',
    [selectedChat, recipients]
  );

  const getFirstName = (value: string) => String(value || '').trim().split(/\s+/).filter(Boolean)[0] || '';

  const applyTemplateVariables = (
    template: string,
    values: Record<string, string | number | null | undefined>
  ) => {
    let output = String(template || '');
    Object.entries(values).forEach(([key, rawValue]) => {
      const safeKey = String(key || '').trim();
      if (!safeKey) return;
      const value = String(rawValue ?? '-');
      const normalizedKey = safeKey.replace(/^\{|\}$/g, '').trim();
      const escapedNormalized = normalizedKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      output = output.replace(new RegExp(`\\{${escapedNormalized}\\}`, 'gi'), value);
      if (safeKey.startsWith('{') && safeKey.endsWith('}')) {
        const escapedFull = safeKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        output = output.replace(new RegExp(escapedFull, 'gi'), value);
      }
    });
    return output;
  };

  const replaceCampaignVariables = (
    template: string,
    name: string,
    extraValues: Record<string, string | number | null | undefined> = {}
  ) => {
    const now = new Date();
    const fullName = String(name || 'Responsável');
    const firstName = getFirstName(fullName) || fullName;
    return applyTemplateVariables(template, {
      Nome: fullName,
      Sobrenome: fullName.split(' ').slice(1).join(' ') || '',
      Data: now.toLocaleDateString('pt-BR'),
      nome_responsavel: fullName,
      primeiro_nome_responsavel: firstName,
      data_inicial_consumo: '-',
      data_final_consumo: '-',
      periodo_referencia: '-',
      ...extraValues,
    });
  };

  const recurringPreviewExampleValues = useMemo(() => {
    const firstRecipientValues = planConsumptionPreview?.recipients?.[0]?.variableValues || {};
    return {
      ...CAMPAIGN_RECURRING_VARIABLE_EXAMPLES,
      ...firstRecipientValues,
      periodo_referencia: planConsumptionPreview?.periodLabel || CAMPAIGN_RECURRING_VARIABLE_EXAMPLES.periodo_referencia,
    };
  }, [planConsumptionPreview]);

  const getCampaignTargetPhones = () => {
    const toUnique = (values: string[]) => Array.from(new Set(values.map(normalizePhone).filter((phone) => phone.length >= 10)));
    if (campaignAudience === 'ALL') {
      return toUnique(recipients.map((entry) => entry.phone));
    }
    if (campaignAudience === 'ALUNO' || campaignAudience === 'COLABORADOR') {
      return toUnique(recipients
        .filter((entry) => String(entry.client.type || '').toUpperCase() === campaignAudience)
        .map((entry) => entry.phone));
    }
    if (String(campaignAudience).startsWith('LABEL:')) {
      const labelName = String(campaignAudience).slice('LABEL:'.length);
      const phones = new Set<string>();
      visibleChats.forEach((chat) => {
        const hasLabel = (chat.labels || []).some((label) => String(label || '').trim() === labelName);
        if (!hasLabel) return;
        phones.add(chat.phone);
      });
      return Array.from(phones);
    }
    return [];
  };

  const getRandomCampaignIntervalSeconds = () => {
    const min = Math.max(0, Number(campaignIntervalMinSeconds || 0));
    const max = Math.max(min, Number(campaignIntervalMaxSeconds || 0));
    if (max <= min) return min;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  };

  const insertCampaignTokenAtCursor = (token: string) => {
    const textarea = campaignMessageTextareaRef.current;
    const safeToken = String(token || '');
    const currentValue = campaignMode === 'RECURRING' ? planConsumptionMessage : campaignMessage;
    const applyNextValue = (value: string) => {
      if (campaignMode === 'RECURRING') {
        setPlanConsumptionMessage(value);
        return;
      }
      setCampaignMessage(value);
    };
    if (!safeToken) return;
    if (!textarea) {
      applyNextValue(`${currentValue}${currentValue ? ' ' : ''}${safeToken}`);
      return;
    }
    const start = textarea.selectionStart ?? currentValue.length;
    const end = textarea.selectionEnd ?? currentValue.length;
    const nextValue = `${currentValue.slice(0, start)}${safeToken}${currentValue.slice(end)}`;
    applyNextValue(nextValue);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + safeToken.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  const formatCurrencyBr = (value: number) =>
    Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const formatPlanConsumptionOutgoingMessage = (rawMessage: string) => {
    const trimmedMessage = String(rawMessage || '').trim();
    const trimmedSignature = String(signatureName || '').trim();
    if (!trimmedMessage) return '';
    if (!planConsumptionUseSignature || !signatureEnabled || !trimmedSignature) return trimmedMessage;
    return `*${trimmedSignature}:*\n${trimmedMessage}`;
  };

  const clampMonthDay = (value: number) => Math.min(28, Math.max(1, Number(value || 1) || 1));

  const buildPlanConsumptionPeriod = (referenceDate = new Date()) => {
    const reference = new Date(referenceDate);

    if (planConsumptionFrequency === 'WEEKLY') {
      const startWeekDay = Math.min(6, Math.max(0, Number(planConsumptionWeeklyStartDay || 1) || 1));
      const endWeekDay = Math.min(6, Math.max(0, Number(planConsumptionWeeklyEndDay || 5) || 5));

      const closedEnd = new Date(reference);
      closedEnd.setHours(23, 59, 59, 999);
      let backwardToEnd = (closedEnd.getDay() - endWeekDay + 7) % 7;
      if (backwardToEnd === 0) {
        backwardToEnd = 7;
      }
      closedEnd.setDate(closedEnd.getDate() - backwardToEnd);
      closedEnd.setHours(23, 59, 59, 999);

      const closedStart = new Date(closedEnd);
      let daysSpan = (endWeekDay - startWeekDay + 7) % 7;
      if (daysSpan === 0) {
        daysSpan = 6;
      }
      closedStart.setDate(closedStart.getDate() - daysSpan);
      closedStart.setHours(0, 0, 0, 0);

      const periodLabel = `${formatDatePt(closedStart)} a ${formatDatePt(closedEnd)}`;
      return { closedStart, closedEnd, periodLabel };
    }

    const startDay = clampMonthDay(planConsumptionMonthlyStartDay);
    const endDay = clampMonthDay(planConsumptionMonthlyEndDay);

    const buildMonthDate = (
      year: number,
      month: number,
      day: number,
      hour: number,
      minute: number,
      second: number,
      millisecond: number
    ) => {
      const monthLastDay = new Date(year, month + 1, 0).getDate();
      const safeDay = Math.min(day, monthLastDay);
      return new Date(year, month, safeDay, hour, minute, second, millisecond);
    };

    let closedEnd = buildMonthDate(reference.getFullYear(), reference.getMonth(), endDay, 23, 59, 59, 999);
    if (reference.getTime() <= closedEnd.getTime()) {
      closedEnd = buildMonthDate(reference.getFullYear(), reference.getMonth() - 1, endDay, 23, 59, 59, 999);
    }

    const closedStart = buildMonthDate(
      closedEnd.getFullYear(),
      closedEnd.getMonth() + (startDay > endDay ? -1 : 0),
      startDay,
      0,
      0,
      0,
      0
    );

    const periodLabel = `${formatDatePt(closedStart)} a ${formatDatePt(closedEnd)}`;
    return { closedStart, closedEnd, periodLabel };
  };

  const getNextPlanConsumptionRunAt = () => {
    const now = new Date();
    const [hourRaw, minuteRaw] = String(planConsumptionSendTime || '09:00').split(':');
    const hour = Math.min(23, Math.max(0, Number(hourRaw || 9) || 9));
    const minute = Math.min(59, Math.max(0, Number(minuteRaw || 0) || 0));

    if (planConsumptionFrequency === 'WEEKLY') {
      const weekday = Math.min(6, Math.max(0, Number(planConsumptionWeeklyDay || 1) || 1));
      const candidate = new Date(now);
      candidate.setHours(hour, minute, 0, 0);
      const currentWeekDay = candidate.getDay();
      let diff = (weekday - currentWeekDay + 7) % 7;
      if (diff === 0 && candidate.getTime() <= now.getTime()) {
        diff = 7;
      }
      candidate.setDate(candidate.getDate() + diff);
      return candidate;
    }

    const selectedDay = Math.min(31, Math.max(1, Number(planConsumptionMonthlyDay || 1) || 1));
    const buildMonthlyDate = (year: number, month: number) => {
      const monthLastDay = new Date(year, month + 1, 0).getDate();
      const finalDay = Math.min(selectedDay, monthLastDay);
      return new Date(year, month, finalDay, hour, minute, 0, 0);
    };

    let candidate = buildMonthlyDate(now.getFullYear(), now.getMonth());
    if (candidate.getTime() <= now.getTime()) {
      candidate = buildMonthlyDate(now.getFullYear(), now.getMonth() + 1);
    }
    return candidate;
  };

  const buildPlanConsumptionDispatchTargets = async (options?: {
    includeResponsible?: boolean;
    includeCollaborator?: boolean;
  }) => {
    if (!activeEnterprise?.id) {
      throw new Error('Empresa ativa não encontrada.');
    }

    const includeResponsible = options?.includeResponsible ?? campaignRecurringTargetResponsible;
    const includeCollaborator = options?.includeCollaborator ?? campaignRecurringTargetCollaborator;
    if (!includeResponsible && !includeCollaborator) {
      throw new Error('Selecione ao menos um público para campanha recorrente: Responsável ou Colaborador.');
    }

    const { closedStart, closedEnd, periodLabel } = buildPlanConsumptionPeriod(new Date());
    const txList = await ApiService.getTransactions({ enterpriseId: activeEnterprise.id });
    const transactions = Array.isArray(txList) ? txList : [];

    const normalizePlanKey = (value?: string) => normalizeSearchValue(value).replace(/[^a-z0-9]/g, '');
    const formatClassLabel = (client: Client) => [String(client.class || '').trim(), String((client as any).classGrade || '').trim()]
      .filter(Boolean)
      .join(' / ');
    const parseTxDate = (tx: any) => normalizeTxDate(tx);
    const parseTxAmount = (tx: any) => Math.abs(Number(tx?.amount ?? tx?.total ?? tx?.value ?? 0) || 0);
    const normalize = (value?: any) => normalizeSearchValue(String(value || '')).toLowerCase();
    const getMovementType = (tx: any): 'CONSUMO' | 'CREDITO' | 'OUTRO' => {
      const txType = String(tx?.type || '').toUpperCase();
      const marker = String(tx?.category || tx?.movement || tx?.plan || tx?.description || tx?.item || '').toUpperCase();
      if (
        txType.includes('DEBIT')
        || txType.includes('CONSUMO')
        || marker.includes('CONSUMO')
        || marker.includes('COMPRA')
        || marker.includes('SAIDA')
      ) {
        return 'CONSUMO';
      }
      if (
        txType.includes('CREDIT')
        || txType.includes('CREDITO')
        || marker.includes('CREDITO')
        || marker.includes('RECARGA')
        || marker.includes('ENTRADA')
      ) {
        return 'CREDITO';
      }
      return 'OUTRO';
    };
    const extractPlanNameFromTransaction = (tx: any) => {
      const byCatalog = resolveCatalogPlan(tx?.planName || tx?.plan, tx?.planId || tx?.originPlanId);
      if (byCatalog?.name) return byCatalog.name;
      const direct = String(tx?.planName || tx?.plan || '').trim();
      if (direct) return formatClientPlanLabel(direct);
      const source = `${String(tx?.description || '')} ${String(tx?.item || '')}`.trim();
      const match = source.match(/plano\s+([A-Za-zÀ-ÿ0-9\s\-_]+)/i);
      return String(match?.[1] || '').trim();
    };
    const isPlanTransaction = (tx: any) => {
      const method = normalize(tx?.paymentMethod || tx?.method || '');
      if (method === 'plano') return true;
      if (String(tx?.planId || tx?.originPlanId || '').trim()) return true;
      const bag = normalize(`${tx?.description || ''} ${tx?.item || ''} ${tx?.plan || ''}`);
      return bag.includes('consumo plano') || bag.includes('unidade do plano');
    };
    const resolvePrepaidDetail = (tx: any) => {
      const txItems = Array.isArray(tx?.items) ? tx.items : [];
      if (txItems.length > 0) {
        const labels = txItems
          .map((item: any) => {
            const name = String(item?.name || item?.productName || '').trim();
            const qtyRaw = Number(item?.quantity || 1);
            const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;
            return name ? `${qty}x ${name}` : '';
          })
          .filter(Boolean);
        if (labels.length > 0) return labels.join(' | ');
      }

      const rawItem = String(tx?.item || '').trim();
      if (rawItem && !/compra\s+pdv/i.test(rawItem)) return rawItem;
      const rawDescription = String(tx?.description || '').trim();
      if (rawDescription && !/compra\s+pdv/i.test(rawDescription)) return rawDescription;
      return 'Item avulso';
    };
    const getDetalhamentoConsumo = (tx: any) => {
      const movement = getMovementType(tx);
      const textBag = normalize(`${tx?.type || ''} ${tx?.description || ''} ${tx?.item || ''}`);
      const isEstorno = textBag.includes('estorno');
      if (movement === 'CREDITO' && !isEstorno) {
        return String(tx?.description || tx?.item || 'Crédito').trim() || 'Crédito';
      }

      const planName = extractPlanNameFromTransaction(tx);
      const byPlan = isPlanTransaction(tx) || Boolean(planName);
      if (byPlan) {
        const label = planName || 'Plano';
        return isEstorno ? `Estorno de ${label}` : label;
      }

      const prepaidDetail = resolvePrepaidDetail(tx);
      return isEstorno ? `Estorno de ${prepaidDetail} (Avulso)` : `${prepaidDetail} (Avulso)`;
    };

    const planCatalogByKey = new Map<string, { name: string; price: number }>();
    const planCatalogById = new Map<string, { name: string; price: number }>();
    plans.forEach((plan) => {
      const planName = String(plan?.name || '').trim();
      if (!planName) return;
      const normalized = normalizePlanKey(planName);
      const payload = { name: planName, price: Number(plan?.price || 0) || 0 };
      if (normalized) {
        planCatalogByKey.set(normalized, payload);
      }
      const id = String(plan?.id || '').trim();
      if (id) {
        planCatalogById.set(id, payload);
      }
    });

    const resolveCatalogPlan = (rawName?: string, rawPlanId?: string) => {
      const byId = String(rawPlanId || '').trim();
      if (byId && planCatalogById.has(byId)) {
        return planCatalogById.get(byId) || null;
      }
      const normalizedName = normalizePlanKey(rawName);
      if (normalizedName && planCatalogByKey.has(normalizedName)) {
        return planCatalogByKey.get(normalizedName) || null;
      }
      return null;
    };

    const resolveTxPlanName = (tx: any) => {
      const fromCatalog = resolveCatalogPlan(tx?.planName || tx?.plan, tx?.planId || tx?.originPlanId);
      if (fromCatalog?.name) return fromCatalog.name;

      const rawCandidates = [
        tx?.planName,
        tx?.plan,
        tx?.originPlanName,
        tx?.originPlan,
        tx?.category,
      ]
        .map((value) => String(value || '').trim())
        .filter(Boolean);

      for (const candidate of rawCandidates) {
        const normalized = normalizePlanKey(candidate);
        if (!normalized) continue;
        if (normalized.includes('prepago') || normalized.includes('carteiraprepaga')) return 'Carteira Pré-paga';
        if (normalized === 'consumo' || normalized === 'credito') continue;
        const fromNameCatalog = resolveCatalogPlan(candidate);
        if (fromNameCatalog?.name) return fromNameCatalog.name;
        return formatClientPlanLabel(candidate);
      }

      const marker = String(tx?.description || tx?.item || '').trim();
      if (normalizePlanKey(marker).includes('prepago')) return 'Carteira Pré-paga';
      return '';
    };

    const transactionsInPeriod = transactions.filter((tx: any) => {
      const txDate = parseTxDate(tx);
      if (!txDate) return false;
      return txDate.getTime() >= closedStart.getTime() && txDate.getTime() <= closedEnd.getTime();
    });

    const txByClientId = new Map<string, any[]>();
    transactionsInPeriod.forEach((tx: any) => {
      const clientId = String(tx?.clientId || tx?.studentId || tx?.contactId || '').trim();
      if (!clientId) return;
      const current = txByClientId.get(clientId) || [];
      current.push(tx);
      txByClientId.set(clientId, current);
    });
    txByClientId.forEach((list) => {
      list.sort((a, b) => {
        const aTs = parseTxDate(a)?.getTime() || 0;
        const bTs = parseTxDate(b)?.getTime() || 0;
        return aTs - bTs;
      });
    });

    type InternalPlanRow = {
      key: string;
      planName: string;
      unitValue: number;
      consumedQty: number;
      consumedSubtotal: number;
      currentBalance: number;
      currentBalanceUnits: number;
      prepaid: boolean;
    };

    type InternalClientDataset = {
      id: string;
      name: string;
      classLabel: string;
      type: 'ALUNO' | 'COLABORADOR';
      planRows: InternalPlanRow[];
      transactionRows: PlanConsumptionPdfTransactionRow[];
      totalConsumption: number;
      totalCredits: number;
    };

    const buildClientDataset = (client: Client, type: 'ALUNO' | 'COLABORADOR'): InternalClientDataset => {
      const classLabel = formatClassLabel(client);
      const planRowsMap = new Map<string, InternalPlanRow>();

      const ensurePlanRow = (
        rawPlanName: string,
        options?: Partial<InternalPlanRow> & { sourcePlanId?: string }
      ): InternalPlanRow | null => {
        const isPrepaid = normalizePlanKey(rawPlanName).includes('prepago') || normalizePlanKey(rawPlanName).includes('carteiraprepaga');
        const normalizedKey = isPrepaid ? 'prepago' : normalizePlanKey(rawPlanName);
        if (!normalizedKey) return null;

        const catalogPlan = resolveCatalogPlan(rawPlanName, options?.sourcePlanId);
        const defaultName = isPrepaid ? 'Carteira Pré-paga' : (catalogPlan?.name || formatClientPlanLabel(rawPlanName || 'PLANO'));
        const current = planRowsMap.get(normalizedKey) || {
          key: normalizedKey,
          planName: defaultName,
          unitValue: Number(catalogPlan?.price || 0) || 0,
          consumedQty: 0,
          consumedSubtotal: 0,
          currentBalance: isPrepaid ? Number(client.balance || 0) : 0,
          currentBalanceUnits: 0,
          prepaid: isPrepaid,
        };

        if (catalogPlan?.name) current.planName = catalogPlan.name;
        if (typeof options?.planName === 'string' && String(options.planName).trim()) current.planName = String(options.planName).trim();
        if (typeof options?.unitValue === 'number' && Number.isFinite(options.unitValue) && options.unitValue > 0) {
          current.unitValue = options.unitValue;
        }
        if (typeof options?.currentBalance === 'number' && Number.isFinite(options.currentBalance)) {
          current.currentBalance = options.currentBalance;
        }
        if (typeof options?.currentBalanceUnits === 'number' && Number.isFinite(options.currentBalanceUnits)) {
          current.currentBalanceUnits = Math.max(0, options.currentBalanceUnits);
        }
        if (typeof options?.consumedQty === 'number' && Number.isFinite(options.consumedQty)) {
          current.consumedQty = options.consumedQty;
        }
        if (typeof options?.consumedSubtotal === 'number' && Number.isFinite(options.consumedSubtotal)) {
          current.consumedSubtotal = options.consumedSubtotal;
        }
        if (typeof options?.prepaid === 'boolean') {
          current.prepaid = options.prepaid;
        }

        planRowsMap.set(normalizedKey, current);
        return current;
      };

      const servicePlans = Array.isArray(client.servicePlans) ? client.servicePlans : [];
      servicePlans.forEach((planName) => {
        if (String(planName || '').trim()) {
          const catalog = resolveCatalogPlan(planName);
          ensurePlanRow(String(planName), {
            unitValue: Number(catalog?.price || 0) || undefined,
            prepaid: normalizePlanKey(planName).includes('prepago'),
          });
        }
      });

      const selectedPlansConfig = Array.isArray((client as any)?.selectedPlansConfig)
        ? ((client as any).selectedPlansConfig as any[])
        : [];
      selectedPlansConfig.forEach((config) => {
        const rawPlanName = String(config?.planName || config?.name || config?.planId || '').trim();
        if (!rawPlanName) return;
        const catalog = resolveCatalogPlan(rawPlanName, String(config?.planId || '').trim());
        const unitValue = Number(config?.planPrice ?? config?.price ?? config?.value ?? catalog?.price ?? 0) || 0;
        ensurePlanRow(rawPlanName, {
          sourcePlanId: String(config?.planId || '').trim() || undefined,
          unitValue: unitValue > 0 ? unitValue : undefined,
        });
      });

      const planBalances = client.planCreditBalances || {};
      Object.values(planBalances).forEach((entry: any) => {
        const rawPlanName = String(entry?.planName || '').trim() || String(entry?.planId || '').trim();
        if (!rawPlanName) return;
        const catalog = resolveCatalogPlan(rawPlanName, String(entry?.planId || '').trim());
        const currentBalance = Number(entry?.balance || 0) || 0;
        const entryUnitValue = Number(entry?.unitValue ?? entry?.planPrice ?? catalog?.price ?? 0) || 0;
        const rawBalanceUnits = Number(entry?.balanceUnits);
        const currentBalanceUnits = Number.isFinite(rawBalanceUnits)
          ? Math.max(0, rawBalanceUnits)
          : (entryUnitValue > 0 ? Math.max(0, currentBalance / entryUnitValue) : 0);
        ensurePlanRow(rawPlanName, {
          sourcePlanId: String(entry?.planId || '').trim() || undefined,
          unitValue: entryUnitValue > 0 ? entryUnitValue : undefined,
          currentBalance,
          currentBalanceUnits,
        });
      });

      const prepaidBalance = Number(client.balance || 0) || 0;
      if (servicePlans.some((planName) => normalizePlanKey(planName).includes('prepago')) || Math.abs(prepaidBalance) > 0.0001) {
        ensurePlanRow('PREPAGO', {
          currentBalance: prepaidBalance,
          currentBalanceUnits: 0,
          prepaid: true,
        });
      }

      const clientTransactions = txByClientId.get(String(client.id || '').trim()) || [];
      const transactionRows: PlanConsumptionPdfTransactionRow[] = [];

      clientTransactions.forEach((tx: any) => {
        const txDate = parseTxDate(tx);
        if (!txDate) return;

        const amount = parseTxAmount(tx);
        const movementType = getMovementType(tx);
        const planName = resolveTxPlanName(tx);
        const description = getDetalhamentoConsumo(tx);
        const dateLabel = txDate.toLocaleDateString('pt-BR');
        const timeLabel = txDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        if (planName) {
          const row = ensurePlanRow(planName, {
            unitValue: Number(resolveCatalogPlan(planName, tx?.planId)?.price || 0) || undefined,
          });
          if (row && movementType === 'CONSUMO') {
            const qtyRaw = Number(tx?.quantity ?? tx?.qty ?? tx?.units ?? 1);
            const quantity = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;
            row.consumedQty += quantity;
            row.consumedSubtotal += amount;
          }
        } else if (movementType === 'CONSUMO') {
          const prepaidRow = ensurePlanRow('PREPAGO', { prepaid: true, currentBalance: prepaidBalance, currentBalanceUnits: 0 });
          if (prepaidRow) {
            const qtyRaw = Number(tx?.quantity ?? tx?.qty ?? tx?.units ?? 1);
            const quantity = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;
            prepaidRow.consumedQty += quantity;
            prepaidRow.consumedSubtotal += amount;
          }
        }

        transactionRows.push({
          studentName: String(client.name || '').trim() || 'Contato',
          dateLabel,
          timeLabel,
          timestamp: txDate.getTime(),
          description,
          planName: planName || (normalizePlanKey(description).includes('prepago') ? 'Carteira Pré-paga' : '-'),
          movementType,
          amount,
        });
      });

      const planRows = Array.from(planRowsMap.values()).sort((a, b) =>
        a.planName.localeCompare(b.planName, 'pt-BR', { sensitivity: 'base' })
      );
      const totalConsumption = transactionRows
        .filter((row) => row.movementType === 'CONSUMO')
        .reduce((acc, row) => acc + row.amount, 0);
      const totalCredits = transactionRows
        .filter((row) => row.movementType === 'CREDITO')
        .reduce((acc, row) => acc + row.amount, 0);

      return {
        id: String(client.id || ''),
        name: String(client.name || '').trim() || 'Contato',
        classLabel,
        type,
        planRows,
        transactionRows,
        totalConsumption,
        totalCredits,
      };
    };

    const buildRecipientVariableValues = (
      profile: PlanConsumptionRecipientReportProfile,
      fallbackResponsibleName: string
    ): Record<string, string> => {
      const studentNames = profile.students.map((student) => student.name).filter(Boolean);
      const classSummary = Array.from(new Set(profile.students.map((student) => student.classLabel).filter(Boolean))).join(' | ');
      const planNames = Array.from(new Set(profile.planRows.map((row) => row.planName).filter(Boolean)));
      const unitLabels = Array.from(
        new Set(
          profile.planRows
            .filter((row) => Number(row.unitValue || 0) > 0)
            .map((row) => `${row.planName}: ${formatCurrencyBr(Number(row.unitValue || 0))}`)
        )
      );
      const totalPlanQty = profile.planRows.reduce((acc, row) => acc + Number(row.consumedQty || 0), 0);
      const subtotalPlans = profile.planRows.reduce((acc, row) => acc + Number(row.consumedSubtotal || 0), 0);
      const fixedPlanBalanceMoney = profile.planRows
        .filter((row) => !row.prepaid)
        .reduce((acc, row) => acc + Number(row.currentBalance || 0), 0);
      const fixedPlanBalanceUnits = profile.planRows
        .filter((row) => !row.prepaid)
        .reduce((acc, row) => {
          const directUnits = Number(row.currentBalanceUnits);
          if (Number.isFinite(directUnits) && directUnits > 0) return acc + directUnits;
          const unitValue = Number(row.unitValue || 0);
          const moneyBalance = Number(row.currentBalance || 0);
          if (!Number.isFinite(unitValue) || unitValue <= 0) return acc;
          return acc + (moneyBalance / unitValue);
        }, 0);
      const prepaidBalance = profile.planRows
        .filter((row) => row.prepaid)
        .reduce((acc, row) => acc + Number(row.currentBalance || 0), 0);
      const consumptionDates = Array.from(new Set(profile.transactionRows.map((row) => row.dateLabel).filter(Boolean)));
      const summaryRows = profile.transactionRows
        .slice(0, 8)
        .map((row) => `${row.dateLabel} ${row.timeLabel} • ${row.studentName} • ${row.planName} • ${formatCurrencyBr(row.amount)}`);
      const responsibleName = String(profile.responsibleName || fallbackResponsibleName || '').trim() || 'Responsável';
      const formattedUnits = Number(fixedPlanBalanceUnits || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
      const hasFixedPlanBalance = Math.abs(fixedPlanBalanceMoney) > 0.0001;
      const hasPrepaidBalance = Math.abs(prepaidBalance) > 0.0001;
      const saldoAtualParts: string[] = [];
      if (hasFixedPlanBalance) {
        saldoAtualParts.push(`Planos: ${formattedUnits} un. (${formatCurrencyBr(fixedPlanBalanceMoney)})`);
      }
      if (hasPrepaidBalance) {
        saldoAtualParts.push(`Pré-paga: ${formatCurrencyBr(prepaidBalance)}`);
      }
      const saldoAtual = saldoAtualParts.join(' | ') || '-';

      return {
        nome_completo_alunos: studentNames.join(', ') || profile.contactName,
        turma_completa: classSummary || '-',
        primeiro_nome_responsavel: getFirstName(responsibleName) || responsibleName,
        nome_responsavel: responsibleName,
        data_inicial_consumo: formatDatePt(closedStart),
        data_final_consumo: formatDatePt(closedEnd),
        data_consumos: consumptionDates.join(', ') || periodLabel,
        saldo_und_atual: saldoAtual || '-',
        relatorio_consumo: summaryRows.join(' | ') || 'Sem movimentações no período selecionado.',
        nome_plano: planNames.join(', ') || 'Sem plano ativo',
        valor_unidade_plano: unitLabels.join(' | ') || '-',
        quantidade_plano: String(totalPlanQty || 0),
        subtotal_plano: formatCurrencyBr(subtotalPlans || 0),
        periodo_referencia: periodLabel,
      };
    };

    const mergeRecipientProfiles = (
      current: PlanConsumptionRecipientReportProfile | null,
      incoming: PlanConsumptionRecipientReportProfile | null
    ): PlanConsumptionRecipientReportProfile | null => {
      if (!current) return incoming;
      if (!incoming) return current;
      const studentMap = new Map<string, PlanConsumptionRecipientStudentProfile>();
      [...current.students, ...incoming.students].forEach((student) => {
        const key = String(student.id || student.name || '').trim();
        if (!key) return;
        if (!studentMap.has(key)) studentMap.set(key, student);
      });
      return {
        kind: current.kind === 'RESPONSAVEL' || incoming.kind === 'RESPONSAVEL' ? 'RESPONSAVEL' : 'COLABORADOR',
        responsibleName: current.kind === 'RESPONSAVEL' ? current.responsibleName : (incoming.responsibleName || current.responsibleName),
        contactName: current.contactName || incoming.contactName,
        contactPhone: current.contactPhone || incoming.contactPhone,
        students: Array.from(studentMap.values()),
        planRows: [...current.planRows, ...incoming.planRows],
        transactionRows: [...current.transactionRows, ...incoming.transactionRows].sort((a, b) => a.timestamp - b.timestamp),
        totalConsumption: Number(current.totalConsumption || 0) + Number(incoming.totalConsumption || 0),
        totalCredits: Number(current.totalCredits || 0) + Number(incoming.totalCredits || 0),
      };
    };

    const recipientMap = new Map<string, {
      phone: string;
      contactName: string;
      chunks: string[];
      targetCount: number;
      kindSet: Set<PlanConsumptionDispatchRecipientKind>;
      variableValues: Record<string, string>;
      reportProfile: PlanConsumptionRecipientReportProfile | null;
    }>();

    const mergeVariables = (base: Record<string, string>, patch: Record<string, string>) => {
      const next = { ...base };
      Object.entries(patch).forEach(([key, value]) => {
        const normalized = String(value || '').trim();
        if (!normalized) return;
        if (normalized === '-' && String(next[key] || '').trim()) return;
        next[key] = normalized;
      });
      return next;
    };

    const addRecipientChunk = (
      phone: string,
      contactName: string,
      kind: PlanConsumptionDispatchRecipientKind,
      chunkLines: string[],
      targetCount = 1,
      variableValues: Record<string, string> = {},
      reportProfile: PlanConsumptionRecipientReportProfile | null = null
    ) => {
      const normalizedPhone = normalizePhone(phone);
      if (!normalizedPhone) return;
      const current = recipientMap.get(normalizedPhone) || {
        phone: normalizedPhone,
        contactName: String(contactName || '').trim() || normalizedPhone,
        chunks: [],
        targetCount: 0,
        kindSet: new Set<PlanConsumptionDispatchRecipientKind>(),
        variableValues: {},
        reportProfile: null,
      };
      const validLines = chunkLines.map((line) => String(line || '').trim()).filter(Boolean);
      if (validLines.length > 0) {
        current.chunks.push(validLines.join('\n'));
      }
      current.kindSet.add(kind);
      current.targetCount += Math.max(0, Number(targetCount || 0));
      current.variableValues = mergeVariables(current.variableValues, variableValues);
      current.reportProfile = mergeRecipientProfiles(current.reportProfile, reportProfile);
      recipientMap.set(normalizedPhone, current);
    };

    if (includeCollaborator) {
      clients
        .filter((client) => String(client.type || '').toUpperCase() === 'COLABORADOR')
        .forEach((collaborator) => {
          const phone = resolveClientPhone(collaborator);
          if (!phone) return;
          const dataset = buildClientDataset(collaborator, 'COLABORADOR');
          const hasData = dataset.planRows.length > 0 || dataset.transactionRows.length > 0 || Math.abs(Number(collaborator.balance || 0)) > 0.0001;
          if (!hasData) return;

          const reportProfile: PlanConsumptionRecipientReportProfile = {
            kind: 'COLABORADOR',
            responsibleName: dataset.name,
            contactName: dataset.name,
            contactPhone: normalizePhone(phone),
            students: [{ id: dataset.id, name: dataset.name, classLabel: dataset.classLabel, type: 'COLABORADOR' }],
            planRows: dataset.planRows.map((row) => ({
              studentName: dataset.name,
              classLabel: dataset.classLabel || '-',
              planName: row.planName,
              unitValue: Number(row.unitValue || 0),
              consumedQty: Number(row.consumedQty || 0),
              consumedSubtotal: Number(row.consumedSubtotal || 0),
              currentBalance: Number(row.currentBalance || 0),
              currentBalanceUnits: Number(row.currentBalanceUnits || 0),
              prepaid: Boolean(row.prepaid),
            })),
            transactionRows: dataset.transactionRows,
            totalConsumption: Number(dataset.totalConsumption || 0),
            totalCredits: Number(dataset.totalCredits || 0),
          };

          const variableValues = buildRecipientVariableValues(reportProfile, dataset.name);
          const lines = [
            `👤 Colaborador: ${dataset.name}`,
            `Período: ${periodLabel}`,
            `Total consumido: ${formatCurrencyBr(reportProfile.totalConsumption)}`,
            '📄 Relatório completo em PDF anexado.',
          ];

          addRecipientChunk(
            phone,
            dataset.name,
            'COLABORADOR_RELATORIO',
            lines,
            1,
            variableValues,
            reportProfile
          );
        });
    }

    const responsibleGroups = new Map<string, {
      responsibleName: string;
      students: InternalClientDataset[];
    }>();

    if (includeResponsible) {
      clients
        .filter((client) => String(client.type || '').toUpperCase() === 'ALUNO')
        .forEach((student) => {
          const responsiblePhone = resolveClientPhone(student);
          if (!responsiblePhone) return;

          const dataset = buildClientDataset(student, 'ALUNO');
          const hasData = dataset.planRows.length > 0 || dataset.transactionRows.length > 0 || Math.abs(Number(student.balance || 0)) > 0.0001;
          if (!hasData) return;

          const normalizedPhone = normalizePhone(responsiblePhone);
          const existing = responsibleGroups.get(normalizedPhone) || {
            responsibleName: resolveResponsibleName(student) || dataset.name || normalizedPhone,
            students: [],
          };
          existing.students.push(dataset);
          responsibleGroups.set(normalizedPhone, existing);
        });

      responsibleGroups.forEach((group, phone) => {
        const planRows: PlanConsumptionPdfPlanRow[] = group.students.flatMap((student) =>
          student.planRows.map((row) => ({
            studentName: student.name,
            classLabel: student.classLabel || '-',
            planName: row.planName,
            unitValue: Number(row.unitValue || 0),
            consumedQty: Number(row.consumedQty || 0),
            consumedSubtotal: Number(row.consumedSubtotal || 0),
            currentBalance: Number(row.currentBalance || 0),
            currentBalanceUnits: Number(row.currentBalanceUnits || 0),
            prepaid: Boolean(row.prepaid),
          }))
        );
        const transactionRows = group.students
          .flatMap((student) => student.transactionRows.map((row) => ({ ...row, studentName: student.name })))
          .sort((a, b) => a.timestamp - b.timestamp);
        const totalConsumption = group.students.reduce((acc, student) => acc + Number(student.totalConsumption || 0), 0);
        const totalCredits = group.students.reduce((acc, student) => acc + Number(student.totalCredits || 0), 0);

        const reportProfile: PlanConsumptionRecipientReportProfile = {
          kind: 'RESPONSAVEL',
          responsibleName: group.responsibleName,
          contactName: group.responsibleName,
          contactPhone: normalizePhone(phone),
          students: group.students.map((student) => ({
            id: student.id,
            name: student.name,
            classLabel: student.classLabel,
            type: 'ALUNO',
          })),
          planRows,
          transactionRows,
          totalConsumption,
          totalCredits,
        };

        const variableValues = buildRecipientVariableValues(reportProfile, group.responsibleName);
        const lines = [
          `👨‍👩‍👧‍👦 Responsável: ${group.responsibleName}`,
          `Período: ${periodLabel}`,
          `Alunos no relatório: ${group.students.map((student) => student.name).join(', ')}`,
          `Total consumido: ${formatCurrencyBr(totalConsumption)}`,
          '📄 Relatório completo em PDF anexado.',
        ];

        addRecipientChunk(
          phone,
          group.responsibleName,
          'RESPONSAVEL_RELATORIO',
          lines,
          group.students.length,
          variableValues,
          reportProfile
        );
      });
    }

    const recipients: PlanConsumptionDispatchRecipient[] = Array.from(recipientMap.values())
      .map((entry) => {
        if (!entry.reportProfile) return null;
        const baseTemplate = String(planConsumptionMessage || '').trim()
          || 'Olá {primeiro_nome_responsavel}, segue o fechamento do período {periodo_referencia}.';
        const templateWithPdfHint = /pdf/i.test(baseTemplate)
          ? baseTemplate
          : `${baseTemplate}\n\n📄 O relatório completo está em PDF neste envio.`;
        const baseMessage = replaceCampaignVariables(templateWithPdfHint, entry.contactName, entry.variableValues);
        const finalMessage = formatPlanConsumptionOutgoingMessage(
          [baseMessage, ...entry.chunks].filter(Boolean).join('\n')
        );

        return {
          phone: entry.phone,
          chatId: `${entry.phone}@c.us`,
          contactName: entry.contactName,
          message: finalMessage,
          detailLines: entry.chunks,
          targetCount: entry.targetCount,
          kindSet: Array.from(entry.kindSet.values()),
          variableValues: entry.variableValues,
          reportProfile: entry.reportProfile,
        } as PlanConsumptionDispatchRecipient;
      })
      .filter(Boolean) as PlanConsumptionDispatchRecipient[];

    recipients.sort((a, b) => a.contactName.localeCompare(b.contactName, 'pt-BR', { sensitivity: 'base' }));

    return {
      generatedAt: Date.now(),
      periodStart: closedStart.getTime(),
      periodEnd: closedEnd.getTime(),
      periodLabel,
      recipients,
      collaboratorCount: recipients.filter((item) => item.kindSet.includes('COLABORADOR_RELATORIO')).length,
      responsibleCount: recipients.filter((item) => item.kindSet.includes('RESPONSAVEL_RELATORIO')).length,
    } as PlanConsumptionDispatchPreview;
  };

  const buildPlanConsumptionPdfAttachment = (
    recipient: PlanConsumptionDispatchRecipient,
    periodLabelOverride?: string
  ): ChatAttachment => {
    const profile = recipient.reportProfile;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const generatedAt = new Date();

    const formatNumber = (value: number) => Number(value || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: Number.isInteger(Number(value || 0)) ? 0 : 2,
      maximumFractionDigits: 2,
    });

    const safeFileName = String(profile.contactName || 'relatorio')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();

    const periodLabel = periodLabelOverride || recipient.variableValues?.periodo_referencia || '-';
    const leftX = 28;

    const classifyTxKind = (row: PlanConsumptionPdfTransactionRow): 'CREDITO' | 'CONSUMO' | 'ESTORNO' | 'CREDITO_ESTORNO' | 'OUTRO' => {
      const text = normalizeSearchValue(`${row.description} ${row.planName}`);
      const hasEstorno = text.includes('estorno');
      if (hasEstorno && row.movementType === 'CREDITO') return 'CREDITO_ESTORNO';
      if (hasEstorno) return 'ESTORNO';
      if (row.movementType === 'CREDITO') return 'CREDITO';
      if (row.movementType === 'CONSUMO') return 'CONSUMO';
      return 'OUTRO';
    };

    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, pageWidth, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.text('EXTRATO DE TRANSAÇÕES DA UNIDADE', leftX, 14);

    doc.setTextColor(31, 41, 55);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(activeEnterprise?.name || 'Cantina', leftX, 40);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const enterpriseInfo = [
      activeEnterprise?.attachedSchoolName ? `Escola: ${activeEnterprise.attachedSchoolName}` : null,
      activeEnterprise?.phone1 ? `Contato: ${formatPhoneWithCountryTag(activeEnterprise.phone1, '-')}` : null,
      activeEnterprise?.address ? activeEnterprise.address : null,
    ].filter(Boolean).join(' • ');
    const enterpriseLines = doc.splitTextToSize(enterpriseInfo || '-', pageWidth - (leftX * 2));
    doc.text(enterpriseLines, leftX, 54);

    const contactY = 54 + ((enterpriseLines.length - 1) * 10) + 12;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`Responsável/Contato: ${profile.contactName || '-'}`, leftX, contactY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const contactDetails = [
      `Telefone: ${formatPhoneWithCountryTag(profile.contactPhone, '-')}`,
      `Perfil: ${profile.kind === 'RESPONSAVEL' ? 'Responsável' : 'Colaborador'}`,
      `Período: ${periodLabel}`,
    ].join(' • ');
    doc.text(contactDetails, leftX, contactY + 12);
    const studentsLine = `Aluno(s) relacionado(s): ${profile.students.map((item) => item.name).join(', ') || '-'}`;
    doc.text(doc.splitTextToSize(studentsLine, pageWidth - (leftX * 2)), leftX, contactY + 24);
    doc.text(`Gerado em: ${generatedAt.toLocaleString('pt-BR')}`, pageWidth - leftX, contactY + 12, { align: 'right' });

    const totalCredits = profile.transactionRows
      .filter((row) => {
        const kind = classifyTxKind(row);
        return kind === 'CREDITO' || kind === 'CREDITO_ESTORNO';
      })
      .reduce((acc, row) => acc + Math.abs(Number(row.amount || 0)), 0);
    const totalConsumption = profile.transactionRows
      .filter((row) => {
        const kind = classifyTxKind(row);
        return kind === 'CONSUMO' || kind === 'ESTORNO';
      })
      .reduce((acc, row) => acc + Math.abs(Number(row.amount || 0)), 0);
    const finalBalance = totalCredits - totalConsumption;

    const cardsTopY = contactY + 34;

    const groupedByPlan = new Map<string, PlanConsumptionPdfTransactionRow[]>();
    profile.transactionRows.forEach((row) => {
      const planName = String(row.planName || '').trim() || 'PRÉ-PAGA';
      if (!groupedByPlan.has(planName)) groupedByPlan.set(planName, []);
      groupedByPlan.get(planName)!.push(row);
    });

    const tableColumn = ['Data/Hora', 'Descrição', 'Tipo', 'Valor', 'Status'];
    const tableRows: any[] = [];
    const orderedPlans = Array.from(groupedByPlan.keys()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const planSummaryCards: Array<{ planName: string; consumedText: string; balanceText: string; isPrepaid: boolean }> = [];

    const drawPlanSummaryCards = (y: number) => {
      if (planSummaryCards.length === 0) return y;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 64, 175);
      doc.text('Resumo por plano', leftX, y);

      const cardWidth = 170;
      const cardHeight = 52;
      const gapX = 8;
      const gapY = 8;
      const cols = 3;
      const startY = y + 6;

      planSummaryCards.forEach((summary, index) => {
        const row = Math.floor(index / cols);
        const col = index % cols;
        const cardX = leftX + col * (cardWidth + gapX);
        const cardY = startY + row * (cardHeight + gapY);

        if (summary.isPrepaid) {
          doc.setFillColor(255, 247, 237);
          doc.setDrawColor(251, 146, 60);
        } else {
          doc.setFillColor(239, 246, 255);
          doc.setDrawColor(96, 165, 250);
        }
        doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 6, 6, 'FD');

        doc.setTextColor(30, 41, 59);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.2);
        const titleLines = doc.splitTextToSize(summary.planName, cardWidth - 12);
        doc.text(titleLines[0] || '-', cardX + 6, cardY + 14);

        doc.setTextColor(51, 65, 85);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.6);
        const consumedLines = doc.splitTextToSize(summary.consumedText, cardWidth - 12);
        doc.text(consumedLines[0] || '-', cardX + 6, cardY + 29);
        const balanceLines = doc.splitTextToSize(summary.balanceText, cardWidth - 12);
        doc.text(balanceLines[0] || '-', cardX + 6, cardY + 42);
      });

      const rows = Math.ceil(planSummaryCards.length / cols);
      return startY + rows * cardHeight + (rows - 1) * gapY;
    };

    orderedPlans.forEach((planName) => {
      const planRows = groupedByPlan.get(planName) || [];
      const planRowsForCurrentPlan = profile.planRows.filter(
        (row) => normalizeSearchValue(row.planName) === normalizeSearchValue(planName)
      );
      const consumedQty = planRowsForCurrentPlan.reduce((acc, row) => acc + Number(row.consumedQty || 0), 0);
      const consumedSubtotal = planRowsForCurrentPlan.reduce((acc, row) => acc + Number(row.consumedSubtotal || 0), 0);
      const isPrepaidPlan = planRowsForCurrentPlan.some((row) => Boolean(row.prepaid))
        || planName.toUpperCase().includes('PRÉ-PAGA')
        || planName.toUpperCase().includes('PREPAGA');

      if (isPrepaidPlan) {
        const currentBalanceMoney = planRowsForCurrentPlan.reduce((acc, row) => acc + Number(row.currentBalance || 0), 0);
        planSummaryCards.push({
          planName,
          consumedText: `Consumo: ${formatCurrencyBr(consumedSubtotal)}`,
          balanceText: `Saldo atual: ${formatCurrencyBr(currentBalanceMoney)}`,
          isPrepaid: true,
        });
        tableRows.push([
          {
            content: `PLANO: ${planName}`,
            colSpan: 5,
            styles: { fillColor: [219, 234, 254], textColor: [30, 64, 175], fontStyle: 'bold', halign: 'left' },
          },
        ]);
      } else {
        const currentBalanceMoney = planRowsForCurrentPlan.reduce((acc, row) => acc + Number(row.currentBalance || 0), 0);
        const currentBalanceUnitsDirect = planRowsForCurrentPlan.reduce((acc, row) => acc + Number(row.currentBalanceUnits || 0), 0);
        const unitValues = planRowsForCurrentPlan
          .map((row) => Number(row.unitValue || 0))
          .filter((value) => Number.isFinite(value) && value > 0);
        const avgUnitValue = unitValues.length > 0
          ? unitValues.reduce((acc, value) => acc + value, 0) / unitValues.length
          : 0;
        const currentBalanceQty = currentBalanceUnitsDirect > 0
          ? currentBalanceUnitsDirect
          : (avgUnitValue > 0 ? (currentBalanceMoney / avgUnitValue) : 0);
        const totalQty = consumedQty + currentBalanceQty;
        planSummaryCards.push({
          planName,
          consumedText: `Consumido: ${formatNumber(consumedQty)}/${formatNumber(totalQty)} un. (${formatCurrencyBr(consumedSubtotal)})`,
          balanceText: `Restante: ${formatNumber(currentBalanceQty)} un. (${formatCurrencyBr(currentBalanceMoney)})`,
          isPrepaid: false,
        });
        const planLineSuffix = ` • ${formatNumber(consumedQty)}/${formatNumber(totalQty)} un.`;
        tableRows.push([
          {
            content: `PLANO: ${planName}${planLineSuffix}`,
            colSpan: 5,
            styles: { fillColor: [219, 234, 254], textColor: [30, 64, 175], fontStyle: 'bold', halign: 'left' },
          },
        ]);
      }

      planRows
        .slice()
        .sort((a, b) => b.timestamp - a.timestamp)
        .forEach((row) => {
          const txKind = classifyTxKind(row);
          const typeLabel = txKind === 'ESTORNO'
            ? 'ESTORNO'
            : txKind === 'CREDITO_ESTORNO'
              ? 'CRÉDITO/ESTORNO'
              : row.movementType;
          const isCredit = txKind === 'CREDITO' || txKind === 'CREDITO_ESTORNO';
          const amountLabel = `${isCredit ? '+' : '-'} ${formatCurrencyBr(Math.abs(Number(row.amount || 0)))}`;
          const referenceDateLabel = row.dateLabel || '-';
          const description = txKind === 'CREDITO_ESTORNO'
            ? `[CRÉDITO DE ESTORNO • Ref. ${referenceDateLabel}] ${row.description || '-'}`
            : txKind === 'ESTORNO'
              ? `[ESTORNO] ${row.description || '-'}`
              : row.description || '-';
          tableRows.push([
            `${row.dateLabel} ${row.timeLabel}`,
            description,
            typeLabel,
            amountLabel,
            'Concluída',
          ]);
        });
    });

    const tableStartY = drawPlanSummaryCards(cardsTopY) + 10;

    autoTable(doc, {
      startY: tableStartY,
      margin: { left: leftX, right: leftX },
      head: [tableColumn],
      body: tableRows.length > 0 ? tableRows : [['-', 'Sem movimentações no período', '-', 'R$ 0,00', '-']],
      styles: {
        fontSize: 8.2,
        cellPadding: 3,
        textColor: [30, 41, 59],
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 86 },
        1: { cellWidth: 302 },
        2: { cellWidth: 78, halign: 'center' },
        3: { cellWidth: 86, halign: 'right' },
        4: { cellWidth: 72, halign: 'center' },
      },
      didParseCell: (hook) => {
        if (hook.section !== 'body') return;
        const row = hook.row.raw as any[];
        if (Array.isArray(row) && row.length > 0 && row[0]?.colSpan) return;
        const rawType = normalizeSearchValue(String(row?.[2] || '')).toUpperCase();
        if (rawType.includes('ESTORNO') && !rawType.includes('CREDITO')) {
          if (hook.column.index === 2 || hook.column.index === 3) {
            hook.cell.styles.textColor = [180, 83, 9];
          }
        } else if (rawType.includes('CONSUMO') || rawType.includes('DEBIT')) {
          if (hook.column.index === 2 || hook.column.index === 3) {
            hook.cell.styles.textColor = [185, 28, 28];
          }
        } else if (rawType.includes('CREDITO')) {
          if (hook.column.index === 2 || hook.column.index === 3) {
            hook.cell.styles.textColor = [21, 128, 61];
          }
        }
      },
    });

    const tableFinalY = (doc as any).lastAutoTable?.finalY || tableStartY + 8;
    let totalsY = tableFinalY + 8;
    const totalCardHeight = 44;
    if (totalsY + totalCardHeight > doc.internal.pageSize.getHeight() - 24) {
      doc.addPage();
      totalsY = 28;
    }
    const totalCardWidth = 170;
    const totalGap = 8;
    const drawTotalCard = (x: number, y: number, title: string, value: string, tone: 'green' | 'red' | 'blue') => {
      if (tone === 'green') {
        doc.setFillColor(236, 253, 245);
        doc.setDrawColor(134, 239, 172);
        doc.setTextColor(21, 128, 61);
      } else if (tone === 'red') {
        doc.setFillColor(254, 242, 242);
        doc.setDrawColor(252, 165, 165);
        doc.setTextColor(185, 28, 28);
      } else {
        doc.setFillColor(239, 246, 255);
        doc.setDrawColor(147, 197, 253);
        doc.setTextColor(30, 64, 175);
      }
      doc.roundedRect(x, y, totalCardWidth, totalCardHeight, 6, 6, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.4);
      doc.text(title, x + 8, y + 14);
      doc.setFontSize(13.5);
      doc.text(value, x + 8, y + 31);
    };
    drawTotalCard(leftX, totalsY, 'Total Créditos', formatCurrencyBr(totalCredits), 'green');
    drawTotalCard(leftX + totalCardWidth + totalGap, totalsY, 'Total Consumo', formatCurrencyBr(totalConsumption), 'red');
    drawTotalCard(leftX + (totalCardWidth * 2) + (totalGap * 2), totalsY, 'Saldo Final', formatCurrencyBr(finalBalance), 'blue');

    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i += 1) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Página ${i} de ${pageCount} • Cantina Smart • Relatório automático recorrente`,
        pageWidth - leftX,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'right' }
      );
    }

    return {
      mediaType: 'document',
      base64Data: doc.output('datauristring'),
      mimeType: 'application/pdf',
      fileName: `relatorio_planos_${safeFileName || 'contato'}_${generatedAt.toISOString().slice(0, 10)}.pdf`,
    };
  };

  const handleLaunchPlanConsumptionDispatch = async (mode: 'NOW' | 'SCHEDULED') => {
    if (!status.connected) {
      setFeedback('Conecte o WhatsApp antes de disparar mensagens.');
      return;
    }
    if (!activeEnterprise?.id) {
      setFeedback('Empresa ativa não encontrada.');
      return;
    }

    setIsLaunchingPlanConsumptionDispatch(true);
    try {
      const preview = await buildPlanConsumptionDispatchTargets();
      setPlanConsumptionPreview(preview);

      if (preview.recipients.length === 0) {
        setFeedback('Nenhum destinatário elegível para envio neste momento.');
        return;
      }

      const baseScheduleAt = getNextPlanConsumptionRunAt();
      let sentCount = 0;
      let scheduledCount = 0;
      let failedCount = 0;

      if (mode === 'NOW') {
        for (let i = 0; i < preview.recipients.length; i += 1) {
          const recipient = preview.recipients[i];
          try {
            const reportAttachment = buildPlanConsumptionPdfAttachment(recipient, preview.periodLabel);
            await ApiService.sendWhatsAppMediaToChat(recipient.chatId, recipient.message, reportAttachment);
            sentCount += 1;
          } catch {
            failedCount += 1;
          }
          if (i < preview.recipients.length - 1) {
            const waitSeconds = getRandomCampaignIntervalSeconds();
            if (waitSeconds > 0) {
              await sleep(waitSeconds * 1000);
            }
          }
        }
      } else {
        let cumulativeSeconds = 0;
        for (let i = 0; i < preview.recipients.length; i += 1) {
          const recipient = preview.recipients[i];
          const scheduleAt = new Date(baseScheduleAt);
          if (i > 0) {
            cumulativeSeconds += getRandomCampaignIntervalSeconds();
          }
          scheduleAt.setSeconds(scheduleAt.getSeconds() + cumulativeSeconds);
          try {
            const reportAttachment = buildPlanConsumptionPdfAttachment(recipient, preview.periodLabel);
            await ApiService.scheduleWhatsAppMessage({
              chatId: recipient.chatId,
              message: recipient.message,
              scheduleAt: scheduleAt.toISOString(),
              attachment: reportAttachment,
            });
            scheduledCount += 1;
          } catch {
            failedCount += 1;
          }
        }
      }

      const report: PlanConsumptionDispatchReport = {
        id: `plan_consumo_${Date.now()}`,
        createdAt: Date.now(),
        mode,
        frequency: planConsumptionFrequency,
        recipients: preview.recipients.length,
        sentCount,
        scheduledCount,
        failedCount,
        periodLabel: preview.periodLabel,
      };
      persistPlanConsumptionReports([report, ...planConsumptionReports].slice(0, 100));

      if (mode === 'NOW') {
        setFeedback(`Relatórios em PDF enviados: ${sentCount}/${preview.recipients.length}.`);
      } else {
        const nextLabel = baseScheduleAt.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
        setFeedback(`Relatórios em PDF agendados para ${nextLabel} (${scheduledCount} envio(s)).`);
      }
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Falha ao disparar relatório recorrente.');
    } finally {
      setIsLaunchingPlanConsumptionDispatch(false);
    }
  };

  const planConsumptionNextRunAt = useMemo(
    () => getNextPlanConsumptionRunAt(),
    [planConsumptionFrequency, planConsumptionWeeklyDay, planConsumptionMonthlyDay, planConsumptionSendTime]
  );

  const formatChatTime = (timestamp?: number) => {
    const ts = normalizeTimestampMs(timestamp);
    if (!ts) return '';
    const date = new Date(ts);
    if (!Number.isFinite(date.getTime())) return '';
    return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date);
  };

  const isSameCalendarDay = (a?: number, b?: number) => {
    const aTs = normalizeTimestampMs(a);
    const bTs = normalizeTimestampMs(b);
    if (!aTs || !bTs) return false;
    const aDate = new Date(aTs);
    const bDate = new Date(bTs);
    if (!Number.isFinite(aDate.getTime()) || !Number.isFinite(bDate.getTime())) return false;
    return aDate.toDateString() === bDate.toDateString();
  };

  const formatChatDayDivider = (timestamp?: number) => {
    const ts = normalizeTimestampMs(timestamp);
    if (!ts) return '';
    const date = new Date(ts);
    if (!Number.isFinite(date.getTime())) return '';
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return 'Hoje';
    if (date.toDateString() === yesterday.toDateString()) return 'Ontem';
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(date);
  };

  const toggleRecipient = (phone: string, checked: boolean) => {
    setSelectedPhones((prev) => {
      if (checked) return Array.from(new Set([...prev, phone]));
      return prev.filter((p) => p !== phone);
    });
  };

  const handleSendBulk = async () => {
    if (!status.connected) {
      setFeedback('Conecte o WhatsApp antes de enviar mensagens.');
      return;
    }
    if (!message.trim()) {
      setFeedback('Digite uma mensagem.');
      return;
    }
    if (selectedPhones.length === 0) {
      setFeedback('Selecione ao menos um cliente.');
      return;
    }

    setIsSending(true);
    setFeedback('');
    try {
      const finalMessage = formatOutgoingMessage(message);
      const result = await ApiService.sendWhatsAppBulk(selectedPhones, finalMessage);
      setFeedback(`Mensagens enviadas: ${result?.successCount || 0}/${result?.total || selectedPhones.length}.`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao enviar mensagens.');
    } finally {
      setIsSending(false);
    }
  };

  const handleSelectChat = async (chatId: string) => {
    shouldAutoScrollRef.current = true;
    setSelectedChatId(chatId);
    await loadMessages(chatId);
    await loadSchedules(chatId);
  };

  const handleDeleteChat = async (chat: VisibleChat, event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    const label = chat.displayName || chat.phone;
    const confirmed = window.confirm(`Excluir a conversa com ${label}?`);
    if (!confirmed) return;

    setIsDeletingChatId(chat.chatId);
    try {
      if (!chat.isDraft) {
        await ApiService.deleteWhatsAppChat(chat.chatId);
      }

      setChats((prev) => prev.filter((item) => !hasPhoneVariantIntersection(item.phone, chat.phone)));
      setDraftChats((prev) => prev.filter((item) => !hasPhoneVariantIntersection(item.phone, chat.phone)));

      if (selectedChatId && hasPhoneVariantIntersection(chat.phone, selectedChat?.phone || '')) {
        setSelectedChatId(null);
        setMessages([]);
      }
      setFeedback('Conversa excluída com sucesso.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao excluir conversa.');
    } finally {
      setIsDeletingChatId(null);
    }
  };

  const handleClearChatMessages = async (chat: VisibleChat, event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (chat.isDraft) return;

    const label = chat.displayName || chat.phone;
    const confirmed = window.confirm(`Apagar todas as mensagens da conversa com ${label}?`);
    if (!confirmed) return;

    setIsDeletingChatId(chat.chatId);
    try {
      await ApiService.clearWhatsAppChatMessages(chat.chatId);
      if (selectedChatId === chat.chatId) {
        setMessages([]);
      }
      setChats((prev) => prev.map((item) => (
        item.chatId === chat.chatId
          ? { ...item, lastMessage: '' }
          : item
      )));
      setFeedback('Mensagens apagadas e sessão da conversa encerrada.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao apagar mensagens da conversa.');
    } finally {
      setIsDeletingChatId(null);
    }
  };

  const handleSaveSignature = () => {
    const normalizedName = String(signatureName || '').trim();
    if (signatureEnabled && !normalizedName) {
      setFeedback('Informe o nome da assinatura para salvar.');
      return;
    }

    localStorage.setItem(WHATSAPP_SIGNATURE_ENABLED_KEY, String(signatureEnabled));
    localStorage.setItem(WHATSAPP_SIGNATURE_NAME_KEY, normalizedName);
    setSignatureName(normalizedName);
    setSavedSignatureEnabled(signatureEnabled);
    setSavedSignatureName(normalizedName);
    setFeedback('Assinatura salva com sucesso.');
  };

  const handleAddQuickReply = () => {
    const normalized = String(quickReplyInput || '').trim();
    if (!normalized) {
      setFeedback('Digite o texto da resposta rápida.');
      return;
    }
    if (quickReplies.some((item) => item.toLowerCase() === normalized.toLowerCase())) {
      setFeedback('Essa resposta rápida já foi cadastrada.');
      return;
    }

    const next = [...quickReplies, normalized];
    setQuickReplies(next);
    setQuickReplyInput('');
    localStorage.setItem(WHATSAPP_QUICK_REPLIES_KEY, JSON.stringify(next));
    setFeedback('Resposta rápida cadastrada.');
  };

  const handleRemoveQuickReply = (value: string) => {
    const next = quickReplies.filter((item) => item !== value);
    setQuickReplies(next);
    localStorage.setItem(WHATSAPP_QUICK_REPLIES_KEY, JSON.stringify(next));
    setFeedback('Resposta rápida removida.');
  };

  const handleCampaignStepChange = (stepId: number, patch: Partial<CampaignStep>) => {
    setCampaignSteps((prev) => prev.map((step) => (step.id === stepId ? { ...step, ...patch } : step)));
  };

  const handleAddCampaignStep = () => {
    setCampaignSteps((prev) => [
      ...prev,
      {
        id: Date.now(),
        title: `Etapa ${prev.length + 1}`,
        delayDays: prev.length === 0 ? 0 : 2,
        message: '',
      },
    ]);
  };

  const handleRemoveCampaignStep = (stepId: number) => {
    setCampaignSteps((prev) => prev.filter((step) => step.id !== stepId));
  };

  const handleLaunchCampaign = async () => {
    if (!status.connected) {
      setFeedback('Conecte o WhatsApp antes de iniciar uma campanha.');
      return;
    }
    if (!campaignName.trim()) {
      setFeedback('Informe o nome da campanha.');
      return;
    }

    const phones = campaignMode === 'RECURRING' ? [] : getCampaignTargetPhones();
    if (campaignMode !== 'RECURRING' && phones.length === 0) {
      setFeedback('Nenhum contato encontrado para o público selecionado.');
      return;
    }
    if (campaignMode === 'RECURRING' && !String(planConsumptionMessage || '').trim()) {
      setFeedback('Digite a mensagem da campanha recorrente.');
      return;
    }
    if (campaignMode !== 'FOLLOWUP' && campaignMode !== 'RECURRING' && !String(campaignMessage || '').trim()) {
      setFeedback('Digite a mensagem da campanha antes de salvar e disparar.');
      return;
    }

    setIsCampaignLaunching(true);
    try {
      const baseDate = campaignSendNow
        ? new Date()
        : (campaignStartAt ? new Date(campaignStartAt) : null);

      if (!baseDate || !Number.isFinite(baseDate.getTime())) {
        setFeedback('Informe uma data/hora válida para agendamento.');
        return;
      }

      const attachmentPayload = campaignAttachment
        ? {
            mediaType: campaignAttachment.mediaType,
            base64Data: campaignAttachment.base64Data,
            mimeType: campaignAttachment.mimeType || undefined,
            fileName: campaignAttachment.fileName || undefined,
          }
        : null;

      let sentCount = 0;
      let scheduledCount = 0;
      let failedCount = 0;
      let reportTargetCount = phones.length;
      let reportAudience = campaignAudience;
      let reportPeriodLabel = '';

      const deliverNow = async (phone: string, finalMessage: string) => {
        const chatId = `${phone}@c.us`;
        if (attachmentPayload) {
          await ApiService.sendWhatsAppMediaToChat(chatId, finalMessage, attachmentPayload);
          return;
        }
        await ApiService.sendWhatsAppMessage(phone, finalMessage);
      };

      const scheduleDelivery = async (chatId: string, finalMessage: string, scheduleAt: Date) => {
        await ApiService.scheduleWhatsAppMessage({
          chatId,
          message: finalMessage,
          scheduleAt: scheduleAt.toISOString(),
          attachment: attachmentPayload,
        });
      };

      if (campaignMode === 'RECURRING') {
        const preview = await buildPlanConsumptionDispatchTargets({
          includeResponsible: campaignRecurringTargetResponsible,
          includeCollaborator: campaignRecurringTargetCollaborator,
        });
        setPlanConsumptionPreview(preview);
        if (preview.recipients.length === 0) {
          setFeedback('Nenhum responsável/colaborador encontrado para a campanha recorrente.');
          return;
        }

        reportTargetCount = preview.recipients.length;
        reportAudience = campaignRecurringTargetResponsible && campaignRecurringTargetCollaborator
          ? 'ALL'
          : campaignRecurringTargetResponsible
            ? 'ALUNO'
            : 'COLABORADOR';
        reportPeriodLabel = preview.periodLabel;

        if (campaignSendNow) {
          for (let i = 0; i < preview.recipients.length; i += 1) {
            const recipient = preview.recipients[i];
            try {
              const reportAttachment = buildPlanConsumptionPdfAttachment(recipient, preview.periodLabel);
              await ApiService.sendWhatsAppMediaToChat(recipient.chatId, recipient.message, reportAttachment);
              sentCount += 1;
            } catch {
              failedCount += 1;
            }
            if (i < preview.recipients.length - 1) {
              const waitSeconds = getRandomCampaignIntervalSeconds();
              if (waitSeconds > 0) {
                await sleep(waitSeconds * 1000);
              }
            }
          }
        } else {
          const startAt = getNextPlanConsumptionRunAt();
          let cumulativeSeconds = 0;
          for (let i = 0; i < preview.recipients.length; i += 1) {
            const recipient = preview.recipients[i];
            if (i > 0) {
              cumulativeSeconds += getRandomCampaignIntervalSeconds();
            }
            const scheduleDate = new Date(startAt);
            scheduleDate.setSeconds(scheduleDate.getSeconds() + cumulativeSeconds);
            try {
              const reportAttachment = buildPlanConsumptionPdfAttachment(recipient, preview.periodLabel);
              await ApiService.scheduleWhatsAppMessage({
                chatId: recipient.chatId,
                message: recipient.message,
                scheduleAt: scheduleDate.toISOString(),
                attachment: reportAttachment,
              });
              scheduledCount += 1;
            } catch {
              failedCount += 1;
            }
          }
        }

        const recurringReport: PlanConsumptionDispatchReport = {
          id: `plan_consumo_${Date.now()}`,
          createdAt: Date.now(),
          mode: campaignSendNow ? 'NOW' : 'SCHEDULED',
          frequency: planConsumptionFrequency,
          recipients: preview.recipients.length,
          sentCount,
          scheduledCount,
          failedCount,
          periodLabel: preview.periodLabel,
        };
        persistPlanConsumptionReports([recurringReport, ...planConsumptionReports].slice(0, 100));
      } else if (campaignMode === 'BROADCAST') {
        if (campaignSendNow) {
          for (let i = 0; i < phones.length; i += 1) {
            const phone = phones[i];
            const finalMessage = formatCampaignOutgoingMessage(
              replaceCampaignVariables(campaignMessage, campaignPreviewName)
            );
            try {
              await deliverNow(phone, finalMessage);
              sentCount += 1;
            } catch {
              failedCount += 1;
            }
            if (i < phones.length - 1) {
              const waitSeconds = getRandomCampaignIntervalSeconds();
              if (waitSeconds > 0) {
                await sleep(waitSeconds * 1000);
              }
            }
          }
        } else {
          let cumulativeSeconds = 0;
          for (let i = 0; i < phones.length; i += 1) {
            const phone = phones[i];
            const finalMessage = formatCampaignOutgoingMessage(
              replaceCampaignVariables(campaignMessage, campaignPreviewName)
            );
            const scheduleDate = new Date(baseDate);
            if (i > 0) {
              cumulativeSeconds += getRandomCampaignIntervalSeconds();
            }
            scheduleDate.setSeconds(scheduleDate.getSeconds() + cumulativeSeconds);
            try {
              await scheduleDelivery(`${phone}@c.us`, finalMessage, scheduleDate);
              scheduledCount += 1;
            } catch {
              failedCount += 1;
            }
          }
        }
      } else {
        const steps = campaignSteps.filter((step) => String(step.message || '').trim());
        if (steps.length === 0) {
          setFeedback('Adicione ao menos uma etapa com mensagem na sequência de follow-up.');
          return;
        }

        let followupCumulativeSeconds = 0;
        for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
          const step = steps[stepIndex];
          for (let phoneIndex = 0; phoneIndex < phones.length; phoneIndex += 1) {
            const phone = phones[phoneIndex];
            const scheduleDate = new Date(baseDate);
            scheduleDate.setDate(scheduleDate.getDate() + Math.max(0, Number(step.delayDays || 0)));
            if ((stepIndex * phones.length + phoneIndex) > 0) {
              followupCumulativeSeconds += getRandomCampaignIntervalSeconds();
            }
            scheduleDate.setSeconds(scheduleDate.getSeconds() + followupCumulativeSeconds);
            const finalMessage = formatCampaignOutgoingMessage(
              replaceCampaignVariables(step.message, campaignPreviewName)
            );
            try {
              await scheduleDelivery(`${phone}@c.us`, finalMessage, scheduleDate);
              scheduledCount += 1;
            } catch {
              failedCount += 1;
            }
          }
        }
      }

      const report: CampaignReport = {
        id: `cmp_${Date.now()}`,
        name: String(campaignName || '').trim(),
        mode: campaignMode,
        audience: reportAudience,
        createdAt: Date.now(),
        startAt: baseDate.getTime(),
        targetCount: reportTargetCount,
        sentCount,
        scheduledCount,
        failedCount,
        intervalSeconds: Math.max(0, Math.round((Number(campaignIntervalMinSeconds || 0) + Number(campaignIntervalMaxSeconds || 0)) / 2)),
        withSignature: Boolean(campaignUseSignature && signatureEnabled && String(signatureName || '').trim()),
        hasAttachment: campaignMode === 'RECURRING' ? true : Boolean(attachmentPayload),
        paused: false,
        status: (
          failedCount === 0
            ? (sentCount > 0 && scheduledCount === 0 ? 'ENVIADA' : 'AGENDADA')
            : ((sentCount + scheduledCount) > 0 ? 'PARCIAL' : 'ERRO')
        ),
      };

      persistCampaignReports([report, ...campaignReports].slice(0, 100));

      if (report.status === 'ENVIADA') {
        setFeedback(`Campanha "${campaignName}" enviada (${sentCount}/${reportTargetCount}).`);
      } else if (report.status === 'AGENDADA') {
        const suffix = reportPeriodLabel ? ` • período ${reportPeriodLabel}` : '';
        setFeedback(`Campanha "${campaignName}" agendada com sucesso (${scheduledCount} item(ns)).${suffix}`);
      } else {
        setFeedback(`Campanha "${campaignName}" concluída com falhas (${failedCount} falha(s)).`);
      }
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao salvar e disparar campanha.');
    } finally {
      setIsCampaignLaunching(false);
    }
  };

  const handleAiContextPatch = (contextId: number, patch: Partial<AiContextItem>) => {
    setAiConfig((prev) => ({
      ...prev,
      contexts: prev.contexts.map((ctx) => (ctx.id === contextId ? { ...ctx, ...patch } : ctx)),
    }));
  };

  const handleAddAiContext = () => {
    const nextContext: AiContextItem = {
      id: Date.now(),
      name: `Novo Contexto ${aiConfig.contexts.length + 1}`,
      description: '',
      enabled: true,
      conditionKeywords: [],
      prompt: '',
      responsePrompt: '',
      dataSelections: [],
      actionType: 'RESPONDER_CLIENTE',
      routingMode: 'INTENT_SWITCH',
      subSwitches: [],
    };
    setAiConfig((prev) => ({ ...prev, contexts: [...prev.contexts, nextContext] }));
    setSelectedAiContextId(nextContext.id);
  };

  const handleDeleteAiContext = (contextId: number) => {
    const target = aiConfig.contexts.find((ctx) => ctx.id === contextId);
    if (!target) return;
    const confirmed = window.confirm(`Excluir o contexto "${target.name}"?`);
    if (!confirmed) return;
    setAiConfig((prev) => {
      const nextContexts = prev.contexts.filter((ctx) => ctx.id !== contextId);
      return {
        ...prev,
        contexts: nextContexts.length > 0 ? nextContexts : getDefaultAiConfig().contexts,
      };
    });
    setSelectedAiContextId((prev) => {
      if (prev !== contextId) return prev;
      const next = aiConfig.contexts.find((ctx) => ctx.id !== contextId);
      return next?.id || null;
    });
  };

  const handleToggleAiDataSelection = (contextId: number, key: string) => {
    setAiConfig((prev) => ({
      ...prev,
      contexts: prev.contexts.map((ctx) => {
        if (ctx.id !== contextId) return ctx;
        const hasSelection = ctx.dataSelections.includes(key);
        return {
          ...ctx,
          dataSelections: hasSelection
            ? ctx.dataSelections.filter((item) => item !== key)
            : [...ctx.dataSelections, key],
        };
      }),
    }));
  };

  const handleAiContextKeywordsChange = (contextId: number, raw: string) => {
    const keywords = String(raw || '')
      .split(',')
      .map((item) => normalizeSearchValue(item))
      .filter(Boolean);
    handleAiContextPatch(contextId, { conditionKeywords: keywords });
  };

  const handleAddAiSubSwitch = (contextId: number) => {
    setAiConfig((prev) => ({
      ...prev,
      contexts: prev.contexts.map((ctx) => {
        if (ctx.id !== contextId) return ctx;
        const next: AiSubSwitchItem = {
          id: Date.now(),
          name: `Sub Switch ${ctx.subSwitches.length + 1}`,
          description: '',
          enabled: true,
          conditionKeywords: [],
          dataSelections: [],
          responsePrompt: '',
        };
        return { ...ctx, subSwitches: [...ctx.subSwitches, next] };
      }),
    }));
  };

  const handlePatchAiSubSwitch = (contextId: number, subId: number, patch: Partial<AiSubSwitchItem>) => {
    setAiConfig((prev) => ({
      ...prev,
      contexts: prev.contexts.map((ctx) => {
        if (ctx.id !== contextId) return ctx;
        return {
          ...ctx,
          subSwitches: ctx.subSwitches.map((sub) => (sub.id === subId ? { ...sub, ...patch } : sub)),
        };
      }),
    }));
  };

  const handleDeleteAiSubSwitch = (contextId: number, subId: number) => {
    setAiConfig((prev) => ({
      ...prev,
      contexts: prev.contexts.map((ctx) => {
        if (ctx.id !== contextId) return ctx;
        return { ...ctx, subSwitches: ctx.subSwitches.filter((sub) => sub.id !== subId) };
      }),
    }));
  };

  const handleSubSwitchKeywordsChange = (contextId: number, subId: number, raw: string) => {
    const keywords = String(raw || '')
      .split(',')
      .map((item) => normalizeSearchValue(item))
      .filter(Boolean);
    handlePatchAiSubSwitch(contextId, subId, { conditionKeywords: keywords });
  };

  const handleToggleAiSubSwitchSelection = (contextId: number, subId: number, key: string) => {
    setAiConfig((prev) => ({
      ...prev,
      contexts: prev.contexts.map((ctx) => {
        if (ctx.id !== contextId) return ctx;
        return {
          ...ctx,
          subSwitches: ctx.subSwitches.map((sub) => {
            if (sub.id !== subId) return sub;
            const hasSelection = sub.dataSelections.includes(key);
            return {
              ...sub,
              dataSelections: hasSelection
                ? sub.dataSelections.filter((item) => item !== key)
                : [...sub.dataSelections, key],
            };
          }),
        };
      }),
    }));
  };

  const handleAiFlowNodeMouseDown = (event: React.MouseEvent, nodeId: string) => {
    event.preventDefault();
    event.stopPropagation();
    const target = aiFlowVisualNodeMap.get(nodeId);
    if (!target) return;
    aiFlowDragRef.current = {
      nodeId,
      startX: event.clientX,
      startY: event.clientY,
      originX: target.x,
      originY: target.y,
    };
    setSelectedAiFlowNodeId(nodeId);
    if (target.contextId) {
      setSelectedAiContextId(target.contextId);
    }
  };

  const handleInsertAiVariable = (variableKey: string) => {
    if (!selectedAiContext) {
      setFeedback('Selecione um contexto para inserir variáveis.');
      return;
    }
    handleAiContextPatch(selectedAiContext.id, {
      prompt: `${String(selectedAiContext.prompt || '').trim()} ${variableKey}`.trim(),
    });
  };

  const handleAiProviderChange = (provider: AiProvider) => {
    const models = AI_PROVIDER_MODELS[provider];
    const sttModels = AI_STT_MODELS[provider];
    setAiConfig((prev) => ({
      ...prev,
      provider,
      model: models.includes(prev.model) ? prev.model : models[0],
      sttModel: sttModels.includes(prev.sttModel) ? prev.sttModel : sttModels[0],
    }));
  };

  const handleSaveAiConfig = () => {
    ApiService.updateWhatsAppAiConfig(aiConfig)
      .then((result) => {
        const nextConfig = normalizeAiConfigState(result?.config || aiConfig);
        setAiConfig(nextConfig);
        setSavedAiConfig(nextConfig);
        localStorage.setItem(WHATSAPP_AI_CONFIG_KEY, JSON.stringify(nextConfig));
        setFeedback('Configuração de AI salva com sucesso.');
      })
      .catch((err) => {
        setFeedback(err instanceof Error ? err.message : 'Falha ao salvar configuração de AI.');
      });
  };

  const handleDiscardAiConfig = () => {
    setAiConfig(savedAiConfig);
    setSelectedAiContextId(savedAiConfig.contexts[0]?.id || null);
    setFeedback('Alterações de AI descartadas.');
  };

  const handleAttachFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const toBase64 = (value: File) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Falha ao ler arquivo selecionado.'));
      reader.readAsDataURL(value);
    });

    try {
      const base64 = await toBase64(file);
      const mimeType = String(file.type || '').toLowerCase();
      const mediaType: 'image' | 'document' | 'audio' =
        mimeType.startsWith('image/')
          ? 'image'
          : mimeType.startsWith('audio/')
            ? 'audio'
            : 'document';

      setChatAttachment({
        mediaType,
        base64Data: base64,
        mimeType: mimeType || undefined,
        fileName: file.name
      });
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao preparar anexo.');
    }
  };

  const handleCampaignAttachFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const toBase64 = (value: File) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Falha ao ler arquivo da campanha.'));
      reader.readAsDataURL(value);
    });

    try {
      const base64 = await toBase64(file);
      const mimeType = String(file.type || '').toLowerCase();
      const mediaType: 'image' | 'document' | 'audio' =
        mimeType.startsWith('image/')
          ? 'image'
          : mimeType.startsWith('audio/')
            ? 'audio'
            : 'document';

      setCampaignAttachment({
        mediaType,
        base64Data: base64,
        mimeType: mimeType || undefined,
        fileName: file.name,
      });
      setFeedback(`Arquivo da campanha selecionado: ${file.name}`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao preparar anexo da campanha.');
    }
  };

  const handleTranscribeAudioMessage = async (msg: ChatMessage) => {
    const msgId = String(msg.id || '').trim();
    if (!msgId) return;
    if (!msg.mediaDataUrl) {
      setAudioTranscriptions((prev) => ({
        ...prev,
        [msgId]: {
          loading: false,
          text: '',
          error: 'Não foi possível transcrever: áudio sem dados para leitura.',
        },
      }));
      return;
    }

    setAudioTranscriptions((prev) => ({
      ...prev,
      [msgId]: {
        loading: true,
        text: String(prev[msgId]?.text || ''),
        error: null,
      },
    }));

    try {
      const result = await ApiService.transcribeWhatsAppAudio({
        chatId: selectedChatId || undefined,
        messageId: msgId,
        mediaDataUrl: msg.mediaDataUrl,
        mimeType: msg.mimeType || undefined,
        fileName: msg.fileName || undefined,
      });
      const transcript = String(result?.transcript || '').trim();
      setAudioTranscriptions((prev) => ({
        ...prev,
        [msgId]: {
          loading: false,
          text: transcript,
          error: transcript ? null : 'Transcrição vazia.',
        },
      }));
    } catch (err) {
      setAudioTranscriptions((prev) => ({
        ...prev,
        [msgId]: {
          loading: false,
          text: String(prev[msgId]?.text || ''),
          error: err instanceof Error ? err.message : 'Falha ao transcrever áudio.',
        },
      }));
    }
  };

  const handleScheduleMessage = async () => {
    if (!selectedChatId) {
      setFeedback('Selecione uma conversa para agendar.');
      return false;
    }
    if (!scheduleAt) {
      setFeedback('Informe data e hora do agendamento.');
      return false;
    }

    const finalMessage = formatOutgoingMessage(chatReply);
    if (!finalMessage.trim() && !chatAttachment) {
      setFeedback('Informe uma mensagem ou anexo para agendar.');
      return false;
    }

    setIsScheduling(true);
    try {
      await ApiService.scheduleWhatsAppMessage({
        chatId: selectedChatId,
        message: finalMessage,
        scheduleAt: new Date(scheduleAt).toISOString(),
        attachment: chatAttachment
      });
      setChatReply('');
      setChatAttachment(null);
      setScheduleAt('');
      await loadSchedules(selectedChatId);
      setFeedback('Mensagem agendada com sucesso.');
      return true;
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao agendar mensagem.');
      return false;
    } finally {
      setIsScheduling(false);
    }
  };

  const handleCancelSchedule = async (scheduleId: string) => {
    try {
      await ApiService.cancelWhatsAppSchedule(scheduleId);
      if (selectedChatId) {
        await loadSchedules(selectedChatId);
      }
      setFeedback('Agendamento cancelado.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao cancelar agendamento.');
    }
  };

  const handleReply = async () => {
    if (!selectedChatId) return;
    if (!chatReply.trim() && !chatAttachment) return;
    if (isSendingChatRef.current) return;

    shouldAutoScrollRef.current = true;
    isSendingChatRef.current = true;
    setIsSendingChat(true);
    try {
      const finalMessage = formatOutgoingMessage(chatReply);
      const selectedDraft = draftChats.find((chat) => chat.chatId === selectedChatId);
      let aiAutoDisabledByHumanSend = false;

      if (chatAttachment) {
        if (selectedDraft) {
          await ApiService.sendWhatsAppMediaToChat(
            `${selectedDraft.phone}@c.us`,
            finalMessage,
            chatAttachment
          );
        } else {
          const result = await ApiService.sendWhatsAppMediaToChat(selectedChatId, finalMessage, chatAttachment);
          aiAutoDisabledByHumanSend = Boolean(result?.aiAgentAutoDisabled);
        }
      } else {
        if (selectedDraft) {
          await ApiService.sendWhatsAppMessage(selectedDraft.phone, finalMessage);
        } else {
          const result = await ApiService.sendWhatsAppMessageToChat(selectedChatId, finalMessage);
          aiAutoDisabledByHumanSend = Boolean(result?.aiAgentAutoDisabled);
        }
      }

      if (!selectedDraft && aiAutoDisabledByHumanSend) {
        setAiAgentEnabledForChat(false);
        setFeedback('Agente IA desativado automaticamente após envio do atendente.');
      }

      setDraftChats((prev) => prev.map((chat) => (
        chat.chatId === selectedChatId
          ? {
              ...chat,
              lastMessage: finalMessage,
              lastTimestamp: Date.now(),
            }
          : chat
      )));

      setChatReply('');
      setChatAttachment(null);
      await loadMessages(selectedChatId);
      await loadChats();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao enviar resposta no chat.');
    } finally {
      isSendingChatRef.current = false;
      setIsSendingChat(false);
    }
  };

  const handleImproveChatReply = async () => {
    if (!selectedChatId) return;
    const draft = String(chatReply || '').trim();
    if (!draft) return;
    setIsImprovingChatReply(true);
    try {
      const result = await ApiService.improveWhatsAppTextWithAi(selectedChatId, draft);
      const improved = String(result?.text || '').trim();
      if (improved) {
        setChatReply(improved);
      }
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Falha ao melhorar texto com IA.');
    } finally {
      setIsImprovingChatReply(false);
    }
  };

  const handleToggleAiAgentForChat = async () => {
    if (!selectedChatId) return;
    setIsUpdatingAiAgentForChat(true);
    try {
      const result = await ApiService.setWhatsAppChatAiAgentState(selectedChatId, !aiAgentEnabledForChat);
      const enabled = Boolean(result?.enabled);
      setAiAgentEnabledForChat(enabled);
      setFeedback(enabled
        ? 'Agente IA ativado para esta conversa.'
        : 'Agente IA desativado para esta conversa.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Falha ao atualizar agente IA.');
    } finally {
      setIsUpdatingAiAgentForChat(false);
    }
  };

  const handleMessagesScroll = () => {
    const viewport = messagesViewportRef.current;
    if (!viewport) return;
    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 56;
  };

  const findExistingChatByPhone = (phone: string) => {
    const variants = Array.from(buildPhoneVariants(phone));
    return chats.find((chat) => variants.some((variant) => chat.phone === variant || chat.chatId === `${variant}@c.us`)) || null;
  };

  const openDraftConversation = (params: {
    phone: string;
    displayName: string;
    contactType?: string;
    responsibleName?: string;
    registrationId?: string;
    contactTypeLabel?: string;
    relationshipLabel?: string;
  }) => {
    const existingChat = findExistingChatByPhone(params.phone);
    if (existingChat) {
      setSelectedChatId(existingChat.chatId);
      setIsNewChatModalOpen(false);
      setActiveTab('CRM');
      loadMessages(existingChat.chatId).catch(() => {});
      return;
    }

    const chatId = `${params.phone}@c.us`;
    const nextDraft: VisibleChat = {
      chatId,
      phone: params.phone,
      name: params.displayName,
      displayName: params.displayName,
      unreadCount: 0,
      lastMessage: '',
      lastTimestamp: Date.now(),
      initiatedByClient: false,
      registrationId: params.registrationId || '',
      contactType: params.contactType || '',
      responsibleName: params.responsibleName || '',
      contactTypeLabel: params.contactTypeLabel || '',
      relationshipLabel: params.relationshipLabel || '',
      isDraft: true,
    };

    setDraftChats((prev) => [nextDraft, ...prev.filter((chat) => chat.chatId !== chatId)]);
    setSelectedChatId(chatId);
    setMessages([]);
    setChatReply('');
    setIsNewChatModalOpen(false);
    setActiveTab('CRM');
  };

  const handleCreateDraftChat = async () => {
    if (newChatMode === 'AGENDA') {
      const selected = agendaClients.find((entry) => entry.client.id === selectedAgendaClientId);
      if (!selected || !selected.phone) {
        setFeedback('Selecione um contato da agenda para iniciar a conversa.');
        return;
      }

      openDraftConversation({
        phone: selected.phone,
        displayName: selected.primaryName || selected.client.name,
        contactType: selected.client.type,
        responsibleName: selected.responsibleName,
        registrationId: String(selected.client.registrationId || ''),
      });
      return;
    }

    const normalizedCountry = normalizePhone(newChatCountryCode);
    const normalizedPhone = normalizePhone(newChatPhone);
    const fullPhone = `${normalizedCountry}${normalizedPhone}`;
    const contactName = newChatName.trim();

    if (!contactName) {
      setFeedback('Informe o nome completo do contato.');
      return;
    }
    if (!activeEnterprise?.id) {
      setFeedback('Empresa ativa não encontrada para salvar o novo contato.');
      return;
    }
    if (!normalizedCountry || !normalizedPhone || normalizedPhone.length < 8) {
      setFeedback('Informe codigo do pais e numero validos para iniciar a conversa.');
      return;
    }

    setIsSavingNewContact(true);
    try {
      const payload = {
        registrationId: `WA${Date.now()}`,
        name: contactName,
        type: 'ALUNO',
        enterpriseId: activeEnterprise.id,
        phone: fullPhone,
        parentWhatsappCountryCode: normalizedCountry,
        parentWhatsapp: fullPhone,
        parentName: contactName,
        servicePlans: [],
        balance: 0,
        spentToday: 0,
        isBlocked: false,
        restrictions: [],
        dietaryNotes: '',
      };

      const createdClient = await ApiService.createClient(payload);
      setClients((prev) => [createdClient, ...prev]);

      openDraftConversation({
        phone: resolveClientPhone(createdClient) || fullPhone,
        displayName: resolveConversationPrimaryName(createdClient) || createdClient.name || contactName,
        contactType: createdClient.type || 'ALUNO',
        responsibleName: resolveResponsibleName(createdClient),
        registrationId: String(createdClient.registrationId || ''),
      });

      setNewChatName('');
      setNewChatPhone('');
      setSelectedAgendaClientId(null);
      setAgendaSearch('');
      setFeedback('Novo contato criado e conversa iniciada.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao criar novo contato.');
    } finally {
      setIsSavingNewContact(false);
    }
  };

  useEffect(() => {
    setContactPage(1);
  }, [contactSearchTerm, contactStatusFilter, contactTagFilter, contactSortBy]);

  useEffect(() => {
    if (safeContactPage !== contactPage) {
      setContactPage(safeContactPage);
    }
  }, [safeContactPage, contactPage]);

  useEffect(() => {
    if (aiConfig.contexts.length === 0) {
      setSelectedAiContextId(null);
      return;
    }
    if (!selectedAiContextId || !aiConfig.contexts.some((ctx) => ctx.id === selectedAiContextId)) {
      setSelectedAiContextId(aiConfig.contexts[0].id);
    }
  }, [aiConfig.contexts, selectedAiContextId]);

  useEffect(() => {
    if (activeTab !== 'CRM') return;
    if (crmView === 'CAMPANHAS') {
      setCrmView('CONVERSAS');
      return;
    }
    if (
      crmView === 'DASHBOARD'
      || crmView === 'CONVERSAS'
      || crmView === 'CONTATOS'
      || crmView === 'AI_CONFIG'
      || crmView === 'AI_FLOW'
      || crmView === 'CONTA'
    ) return;
    setCrmView('CONVERSAS');
  }, [activeTab, crmView]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const drag = aiFlowDragRef.current;
      if (!drag) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      setAiFlowNodePositions((prev) => ({
        ...prev,
        [drag.nodeId]: {
          x: Math.max(20, drag.originX + dx),
          y: Math.max(20, drag.originY + dy),
        },
      }));
    };

    const handleMouseUp = () => {
      if (!aiFlowDragRef.current) return;
      aiFlowDragRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  useEffect(() => {
    if (!selectedAiFlowNodeId) return;
    if (aiFlowVisualNodeMap.has(selectedAiFlowNodeId)) return;
    setSelectedAiFlowNodeId(null);
  }, [selectedAiFlowNodeId, aiFlowVisualNodeMap]);

  useEffect(() => {
    if (!selectedChatId || messagesLoading || !shouldAutoScrollRef.current) return;
    const raf = window.requestAnimationFrame(() => {
      messagesBottomRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [selectedChatId, messagesLoading, messages.length]);

  const resetContactForm = () => {
    setContactForm({
      name: '',
      email: '',
      type: 'ALUNO',
      countryCode: '55',
      phone: '',
      responsibleName: '',
      isActive: true,
    });
  };

  const openCreateContactModal = () => {
    setContactModalMode('CREATE');
    setEditingContactId(null);
    resetContactForm();
    setIsContactModalOpen(true);
  };

  const openEditContactModal = (client: Client) => {
    const digits = normalizePhone(resolveClientPhone(client));
    const hasBrazilCode = digits.startsWith('55') && digits.length > 10;
    const countryCode = hasBrazilCode ? '55' : '55';
    const localPhone = hasBrazilCode ? digits.slice(2) : digits;
    setContactModalMode('EDIT');
    setEditingContactId(client.id);
    setContactForm({
      name: String(client.name || ''),
      email: String(client.email || ''),
      type: (['ALUNO', 'COLABORADOR', 'RESPONSAVEL'].includes(String(client.type || '').toUpperCase())
        ? String(client.type || '').toUpperCase()
        : 'ALUNO') as 'ALUNO' | 'COLABORADOR' | 'RESPONSAVEL',
      countryCode,
      phone: localPhone,
      responsibleName: String(resolveResponsibleName(client) || ''),
      isActive: !Boolean(client.isBlocked),
    });
    setIsContactModalOpen(true);
  };

  const handleSaveContact = async () => {
    if (!activeEnterprise?.id) {
      setFeedback('Empresa ativa não encontrada.');
      return;
    }

    const name = String(contactForm.name || '').trim();
    const email = String(contactForm.email || '').trim();
    const countryCode = normalizePhone(contactForm.countryCode || '55') || '55';
    const localPhone = normalizePhone(contactForm.phone || '');
    const fullPhone = `${countryCode}${localPhone}`;

    if (name.length < 2) {
      setFeedback('Informe um nome válido para o contato.');
      return;
    }
    if (localPhone.length < 8) {
      setFeedback('Informe um telefone válido.');
      return;
    }

    setIsSavingContact(true);
    try {
      if (contactModalMode === 'EDIT' && editingContactId) {
        const current = clients.find((item) => item.id === editingContactId);
        if (!current) {
          setFeedback('Contato não encontrado para edição.');
          return;
        }

        const updatedPayload = {
          ...current,
          name,
          email: email || undefined,
          type: contactForm.type,
          phone: fullPhone,
          parentWhatsappCountryCode: countryCode,
          parentWhatsapp: fullPhone,
          parentName: contactForm.responsibleName.trim() || current.parentName || undefined,
          isBlocked: !contactForm.isActive,
        };

        const updated = await ApiService.updateClient(editingContactId, updatedPayload);
        setClients((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
        setFeedback('Contato atualizado com sucesso.');
      } else {
        const payload = {
          registrationId: `CRM${Date.now()}`,
          name,
          type: contactForm.type,
          enterpriseId: activeEnterprise.id,
          phone: fullPhone,
          email: email || undefined,
          parentWhatsappCountryCode: countryCode,
          parentWhatsapp: fullPhone,
          parentName: contactForm.responsibleName.trim() || undefined,
          servicePlans: [],
          balance: 0,
          spentToday: 0,
          isBlocked: !contactForm.isActive,
          restrictions: [],
          guardians: [],
          dietaryNotes: '',
        };
        const created = await ApiService.createClient(payload);
        setClients((prev) => [created, ...prev]);
        setFeedback('Contato criado com sucesso.');
      }
      setIsContactModalOpen(false);
      setEditingContactId(null);
      resetContactForm();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao salvar contato.');
    } finally {
      setIsSavingContact(false);
    }
  };

  const handleDeleteContact = async (clientId: string) => {
    const client = clients.find((item) => item.id === clientId);
    if (!client) return;
    const confirmed = window.confirm(`Excluir contato ${client.name}?`);
    if (!confirmed) return;

    try {
      await ApiService.deleteClient(clientId);
      setClients((prev) => prev.filter((item) => item.id !== clientId));
      setSelectedContactIds((prev) => prev.filter((id) => id !== clientId));
      setFeedback('Contato excluído com sucesso.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao excluir contato.');
    }
  };

  const handleDeleteSelectedContacts = async () => {
    if (selectedContactIds.length === 0) {
      setFeedback('Selecione ao menos um contato para excluir.');
      return;
    }
    const confirmed = window.confirm(`Excluir ${selectedContactIds.length} contato(s) selecionado(s)?`);
    if (!confirmed) return;

    try {
      await Promise.all(selectedContactIds.map((id) => ApiService.deleteClient(id)));
      const selectedSet = new Set(selectedContactIds);
      setClients((prev) => prev.filter((item) => !selectedSet.has(item.id)));
      setSelectedContactIds([]);
      setFeedback('Contatos selecionados excluídos com sucesso.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao excluir contatos selecionados.');
    }
  };

  const parseCsvRow = (line: string, delimiter: string) => {
    const cells: string[] = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        quoted = !quoted;
      } else if (char === delimiter && !quoted) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    return cells.map((item) => item.replace(/^"|"$/g, '').trim());
  };

  const handleImportContactsFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!activeEnterprise?.id) {
      setFeedback('Empresa ativa não encontrada.');
      return;
    }

    setIsImportingContacts(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      if (lines.length < 2) {
        setFeedback('Arquivo sem registros para importar.');
        return;
      }

      const delimiter = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
      const headers = parseCsvRow(lines[0], delimiter).map((item) => normalizeSearchValue(item));
      const getIndex = (aliases: string[]) => aliases.map((alias) => headers.indexOf(normalizeSearchValue(alias))).find((idx) => idx >= 0) ?? -1;

      const nameIndex = getIndex(['nome', 'name']);
      const phoneIndex = getIndex(['telefone', 'phone', 'whatsapp', 'celular']);
      const emailIndex = getIndex(['email', 'e-mail']);
      const typeIndex = getIndex(['tipo', 'type']);
      const statusIndex = getIndex(['status', 'ativo']);
      const responsibleIndex = getIndex(['responsavel', 'responsável', 'parentname', 'guardian']);

      if (nameIndex < 0 || phoneIndex < 0) {
        setFeedback('CSV deve conter as colunas nome e telefone.');
        return;
      }

      let createdCount = 0;
      let skippedCount = 0;

      for (let index = 1; index < lines.length; index += 1) {
        const cells = parseCsvRow(lines[index], delimiter);
        const name = String(cells[nameIndex] || '').trim();
        const digits = normalizePhone(cells[phoneIndex] || '');
        const email = emailIndex >= 0 ? String(cells[emailIndex] || '').trim() : '';
        const rawType = typeIndex >= 0 ? String(cells[typeIndex] || '').trim().toUpperCase() : 'ALUNO';
        const rawStatus = statusIndex >= 0 ? normalizeSearchValue(cells[statusIndex] || '') : 'ativo';
        const responsibleName = responsibleIndex >= 0 ? String(cells[responsibleIndex] || '').trim() : '';

        if (!name || digits.length < 10) {
          skippedCount += 1;
          continue;
        }

        const normalizedType = ['ALUNO', 'COLABORADOR', 'RESPONSAVEL'].includes(rawType) ? rawType : 'ALUNO';
        const isActive = !['inativo', 'inactive', 'false', '0', 'nao', 'não'].includes(rawStatus);
        const withCountry = digits.startsWith('55') ? digits : `55${digits}`;

        const payload = {
          registrationId: `CRM${Date.now()}${index}`,
          name,
          type: normalizedType,
          enterpriseId: activeEnterprise.id,
          phone: withCountry,
          email: email || undefined,
          parentWhatsappCountryCode: '55',
          parentWhatsapp: withCountry,
          parentName: responsibleName || undefined,
          servicePlans: [],
          balance: 0,
          spentToday: 0,
          isBlocked: !isActive,
          restrictions: [],
          guardians: [],
          dietaryNotes: '',
        };

        try {
          await ApiService.createClient(payload);
          createdCount += 1;
        } catch {
          skippedCount += 1;
        }
      }

      const refreshed = await ApiService.getClients(activeEnterprise.id);
      setClients(Array.isArray(refreshed) ? refreshed : []);
      setFeedback(`Importação finalizada: ${createdCount} criado(s), ${skippedCount} ignorado(s).`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao importar contatos.');
    } finally {
      setIsImportingContacts(false);
    }
  };

  if (!activeEnterprise) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full"></div>
          <p className="text-gray-600 font-medium">Carregando WhatsApp...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 dark:bg-zinc-900/60 rounded-2xl">
        <div className="text-center space-y-4">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full"></div>
          <p className="text-gray-600 dark:text-zinc-300 font-medium">Carregando integração WhatsApp...</p>
        </div>
      </div>
    );
  }

  const signatureHasChanges = (
    signatureEnabled !== savedSignatureEnabled
    || signatureName !== savedSignatureName
  );
  const normalizedBackendError = String(status.lastError || '').toLowerCase();
  const isBackendOffline = (
    status.state === 'ERROR'
    && (
      normalizedBackendError.includes('backend')
      || normalizedBackendError.includes('failed to fetch')
      || normalizedBackendError.includes('connection refused')
      || normalizedBackendError.includes('err_connection_refused')
    )
  );

  return (
    <div className="whatsapp-shell space-y-3 p-3 rounded-[22px] bg-gradient-to-b from-cyan-50/60 via-white to-emerald-50/40 animate-in fade-in duration-500 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-900 dark:text-zinc-100">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white px-2.5 py-1.5 shadow-sm dark:border-emerald-500/30 dark:from-zinc-900 dark:to-zinc-900 dark:shadow-none">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[8px] font-black uppercase tracking-[0.12em] text-gray-400">Sessão</p>
            <p className={`text-xs font-black ${status.connected ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-600 dark:text-zinc-300'}`}>
              {status.connected ? 'Conectado' : status.state}
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-white px-2.5 py-1.5 shadow-sm dark:border-cyan-500/30 dark:from-zinc-900 dark:to-zinc-900 dark:shadow-none">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[8px] font-black uppercase tracking-[0.12em] text-gray-400">Clientes com Telefone</p>
            <p className="text-xs font-black text-gray-800 dark:text-zinc-100">{recipients.length}</p>
          </div>
        </div>
        <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white px-2.5 py-1.5 shadow-sm dark:border-indigo-500/30 dark:from-zinc-900 dark:to-zinc-900 dark:shadow-none">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[8px] font-black uppercase tracking-[0.12em] text-gray-400">Conversas Ativas</p>
            <p className="text-xs font-black text-gray-800 dark:text-zinc-100">{visibleChats.length}</p>
          </div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white px-2.5 py-1.5 shadow-sm dark:border-amber-500/30 dark:from-zinc-900 dark:to-zinc-900 dark:shadow-none">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[8px] font-black uppercase tracking-[0.12em] text-gray-400">Não Lidas</p>
            <p className="text-xs font-black text-amber-600 dark:text-amber-400">{unreadCount}</p>
          </div>
        </div>
      </div>

      <div className="bg-white/95 rounded-[18px] border border-cyan-200 p-1.5 grid grid-cols-2 md:grid-cols-5 gap-1.5 shadow-sm dark:bg-[#121214] dark:border-white/10 dark:ring-1 dark:ring-white/5">
        <button
          onClick={() => {
            setActiveTab('CRM');
            setCrmView('CONVERSAS');
          }}
          className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-[0.12em] ${
            activeTab === 'CRM' && crmView === 'CONVERSAS'
              ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-white dark:from-cyan-700 dark:to-emerald-700'
              : 'bg-slate-50 text-gray-500 dark:bg-zinc-900 dark:text-zinc-300'
          }`}
        >
          Conversas
        </button>
        <button
          onClick={() => {
            setActiveTab('CRM');
            setCrmView('DASHBOARD');
          }}
          className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-[0.12em] ${
            activeTab === 'CRM' && crmView === 'DASHBOARD'
              ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-white dark:from-cyan-700 dark:to-emerald-700'
              : 'bg-slate-50 text-gray-500 dark:bg-zinc-900 dark:text-zinc-300'
          }`}
        >
          Dashboard
        </button>
        <button
          onClick={() => setActiveTab('DISPAROS')}
          className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-[0.12em] ${
            activeTab === 'DISPAROS'
              ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-white dark:from-cyan-700 dark:to-emerald-700'
              : 'bg-slate-50 text-gray-500 dark:bg-zinc-900 dark:text-zinc-300'
          }`}
        >
          Disparos
        </button>
        <button
          onClick={() => setActiveTab('SESSION_QR')}
          className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-[0.12em] ${
            activeTab === 'SESSION_QR'
              ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-white dark:from-cyan-700 dark:to-emerald-700'
              : 'bg-slate-50 text-gray-500 dark:bg-zinc-900 dark:text-zinc-300'
          }`}
        >
          QR Code
        </button>
        <button
          onClick={() => {
            setActiveTab('CRM');
            setCrmView('AI_CONFIG');
          }}
          className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-[0.12em] ${
            activeTab === 'CRM' && crmView === 'AI_CONFIG'
              ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-white dark:from-cyan-700 dark:to-emerald-700'
              : 'bg-slate-50 text-gray-500 dark:bg-zinc-900 dark:text-zinc-300'
          }`}
        >
          Configurações
        </button>
      </div>

      {activeTab === 'CRM' && (
        <div className="rounded-[28px] border-2 border-cyan-200 bg-white/95 overflow-hidden shadow-md dark:bg-[#121214] dark:border-white/10 dark:ring-1 dark:ring-white/5">
          <div className="grid grid-cols-1 min-h-[76vh]">
            <aside className="hidden border-r-2 border-cyan-100 bg-gradient-to-b from-white to-cyan-50/20 p-4 flex-col">
              <div className="flex items-center gap-3 px-2 py-2">
                <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-white font-black">WA</div>
                <div>
                  <p className="text-lg font-black text-slate-900 leading-tight">CRM WhatsApp</p>
                  <p className="text-[11px] font-bold text-emerald-600">{status.connected ? 'Conectado' : status.state}</p>
                </div>
              </div>

              <nav className="mt-6 space-y-1">
                <button
                  type="button"
                  onClick={() => setCrmView('CONVERSAS')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-black ${crmView === 'CONVERSAS' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'text-slate-600 hover:bg-cyan-50'}`}
                >
                  <MessagesSquare size={16} />
                  Conversas
                </button>
                <button
                  type="button"
                  onClick={() => setCrmView('DASHBOARD')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-black ${crmView === 'DASHBOARD' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'text-slate-600 hover:bg-cyan-50'}`}
                >
                  <LayoutDashboard size={16} />
                  Dashboard
                </button>
                <button
                  type="button"
                  onClick={() => setCrmView('CONTATOS')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-black ${crmView === 'CONTATOS' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'text-slate-600 hover:bg-cyan-50'}`}
                >
                  <Users size={16} />
                  Contatos
                </button>
                <button
                  type="button"
                  onClick={() => setCrmView('AI_CONFIG')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-black ${crmView === 'AI_CONFIG' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'text-slate-600 hover:bg-cyan-50'}`}
                >
                  <Bot size={16} />
                  AI Config
                </button>
                <button
                  type="button"
                  onClick={() => setCrmView('AI_FLOW')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-black ${crmView === 'AI_FLOW' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'text-slate-600 hover:bg-cyan-50'}`}
                >
                  <GitBranch size={16} />
                  AI Fluxo
                </button>
              </nav>

              <div className="mt-auto pt-4 border-t border-cyan-100">
                <button
                  type="button"
                  onClick={() => setCrmView('CONTA')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-black ${crmView === 'CONTA' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'text-slate-600 hover:bg-cyan-50'}`}
                >
                  <Settings2 size={16} />
                  Conta
                </button>
                <div className="mt-4 rounded-xl border border-cyan-100 bg-cyan-50/50 px-3 py-2">
                  <p className="text-sm font-black text-slate-800 truncate">{currentUser?.name || 'Usuário'}</p>
                  <p className="text-[11px] font-semibold text-slate-500 truncate">{currentUser?.role || 'Acesso'}</p>
                </div>
              </div>
            </aside>

            <div className={`flex flex-col min-h-0 ${crmView === 'CONVERSAS' ? 'overflow-hidden' : ''}`}>
              <div className="px-5 py-4 border-b-2 border-cyan-100 bg-white flex items-center gap-3 dark:bg-zinc-900/80 dark:border-white/10">
                <div className="relative flex-1">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={chatSearchName}
                    onChange={(e) => setChatSearchName(e.target.value)}
                    placeholder="Pesquisar conversas, contatos ou leads..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-medium bg-slate-50 dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-100"
                  />
                </div>
                <span className="px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-black uppercase tracking-widest dark:bg-zinc-900 dark:text-zinc-300">
                  {crmView === 'DASHBOARD' ? 'Painel' : crmView === 'CONVERSAS' ? 'Atendimento' : 'Configuração'}
                </span>
                <span
                  className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest inline-flex items-center gap-2 ${
                    isBackendOffline
                      ? 'bg-rose-100 text-rose-700 border border-rose-200'
                      : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                  }`}
                  title={isBackendOffline ? (status.lastError || 'Backend offline') : 'Backend do WhatsApp conectado'}
                >
                  <span className={`w-2 h-2 rounded-full ${isBackendOffline ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                  {isBackendOffline ? 'Backend Offline' : 'Backend Online'}
                </span>
              </div>

              {crmView === 'DASHBOARD' && (
                <div className="p-3 bg-slate-50/60 space-y-3 overflow-y-auto dark:bg-zinc-900/70">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2.5">
                    <div className="rounded-xl border border-cyan-100 bg-white p-3 dark:bg-[#121214] dark:border-white/10">
                      <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Total de Conversas</p>
                      <p className="mt-1 text-xl font-black text-slate-900">{crmTotalConversations}</p>
                    </div>
                    <div className="rounded-xl border border-cyan-100 bg-white p-3 dark:bg-[#121214] dark:border-white/10">
                      <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Novos Leads</p>
                      <p className="mt-1 text-xl font-black text-slate-900">{crmNewLeads}</p>
                    </div>
                    <div className="rounded-xl border border-cyan-100 bg-white p-3 dark:bg-[#121214] dark:border-white/10">
                      <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Taxa de Resposta</p>
                      <p className="mt-1 text-xl font-black text-slate-900">{crmResponseRate}%</p>
                    </div>
                    <div className="rounded-xl border border-cyan-100 bg-white p-3 dark:bg-[#121214] dark:border-white/10">
                      <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Sessões Ativas</p>
                      <p className="mt-1 text-xl font-black text-slate-900">{crmActiveSessions}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-2.5">
                    <section className="xl:col-span-8 rounded-xl border border-cyan-100 bg-white p-3 dark:bg-[#121214] dark:border-white/10">
                      <p className="text-base font-black text-slate-900">Visão de Volume de Mensagens</p>
                      <p className="text-xs font-semibold text-slate-500">Tendência de atividade por dia da semana</p>
                      <div className="mt-3 grid grid-cols-7 gap-1.5 items-end h-32">
                        {crmWeekTrend.map((item) => (
                          <div key={item.label} className="flex flex-col items-center gap-1.5">
                            <div className="w-full rounded-t-lg bg-emerald-500/80" style={{ height: `${Math.max(10, item.heightPct)}%` }} />
                            <p className="text-[9px] font-black text-slate-500">{item.label}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                    <section className="xl:col-span-4 rounded-xl border border-cyan-100 bg-white p-3 dark:bg-[#121214] dark:border-white/10">
                      <p className="text-base font-black text-slate-900">Distribuição de Leads</p>
                      <div className="mt-3 space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                          <span>Alunos</span>
                          <span>{crmContactDistribution.alunos} ({crmContactDistribution.alunosPct}%)</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full bg-emerald-500" style={{ width: `${crmContactDistribution.alunosPct}%` }} />
                        </div>

                        <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                          <span>Colaboradores</span>
                          <span>{crmContactDistribution.colaboradores} ({crmContactDistribution.colaboradoresPct}%)</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full bg-blue-500" style={{ width: `${crmContactDistribution.colaboradoresPct}%` }} />
                        </div>

                        <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                          <span>Outros</span>
                          <span>{crmContactDistribution.outros} ({crmContactDistribution.outrosPct}%)</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full bg-amber-500" style={{ width: `${crmContactDistribution.outrosPct}%` }} />
                        </div>
                      </div>
                    </section>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-2.5">
                    <section className="rounded-xl border border-cyan-100 bg-white p-3 dark:bg-[#121214] dark:border-white/10">
                      <p className="text-base font-black text-slate-900">Atividade Recente</p>
                      <div className="mt-2.5 space-y-2">
                        {crmRecentActivities.length === 0 ? (
                          <p className="text-xs font-semibold text-slate-500">Sem atividades recentes.</p>
                        ) : crmRecentActivities.map((item) => (
                          <div key={item.id} className="rounded-lg border border-cyan-100 px-2.5 py-2">
                            <p className="text-xs font-black text-slate-800">{item.title}</p>
                            <p className="text-xs font-semibold text-slate-500 truncate">{item.subtitle}</p>
                            <p className="text-[10px] font-bold text-emerald-600 mt-1">{item.when}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                    <section className="rounded-xl border border-cyan-100 bg-white p-3 dark:bg-[#121214] dark:border-white/10">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-base font-black text-slate-900">Auditoria AI</p>
                        <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 text-[9px] font-black uppercase tracking-[0.12em]">
                          recusas
                        </span>
                      </div>
                      <div className="mt-2.5 space-y-2">
                        {aiAuditLogs.length === 0 ? (
                          <p className="text-xs font-semibold text-slate-500">Sem recusas recentes por política.</p>
                        ) : aiAuditLogs.slice(0, 6).map((item) => (
                          <div key={item.id} className="rounded-lg border border-rose-100 bg-rose-50/40 px-2.5 py-2">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-black text-rose-700">
                                {AI_AUDIT_REASON_LABEL[item.reason] || item.reason}
                              </p>
                              <p className="text-[10px] font-bold text-slate-500 whitespace-nowrap">
                                {Number.isFinite(Number(item.timestamp))
                                  ? new Date(Number(item.timestamp)).toLocaleString('pt-BR')
                                  : '-'}
                              </p>
                            </div>
                            <p className="mt-1 text-xs font-black text-slate-800 truncate">{item.contactName || item.chatId}</p>
                            {String(item.excerpt || '').trim() && (
                              <p className="mt-1 text-[11px] font-semibold text-slate-600 line-clamp-2">
                                "{item.excerpt}"
                              </p>
                            )}
                            {String(item.details || '').trim() && (
                              <p className="mt-1 text-[11px] font-semibold text-rose-700 line-clamp-2">{item.details}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                    <section className="rounded-xl border border-cyan-100 bg-white p-3 dark:bg-[#121214] dark:border-white/10">
                      <p className="text-base font-black text-slate-900">Contatos com Pendência</p>
                      <div className="mt-2.5 space-y-2">
                        {crmTopContacts.length === 0 ? (
                          <p className="text-xs font-semibold text-slate-500">Sem contatos pendentes.</p>
                        ) : crmTopContacts.map((item) => (
                          <div key={item.id} className="flex items-center justify-between rounded-lg border border-cyan-100 px-2.5 py-2">
                            <p className="text-xs font-black text-slate-800">{item.name}</p>
                            <p className="text-xs font-black text-amber-600">{item.metric}</p>
                          </div>
                        ))}
                      </div>
                    </section>

                  </div>
                </div>
              )}

              {crmView === 'CONVERSAS' && (
                <div className="flex-1 min-h-0 h-[calc(100vh-190px)] max-h-[calc(100vh-190px)] overflow-hidden">
                  <div className="h-full overflow-hidden grid grid-cols-1 xl:grid-cols-[360px_1fr_300px]">
                  <section className="border-r-2 border-cyan-100 flex flex-col min-h-0 h-full overflow-hidden dark:border-white/10">
                    <div className="p-4 border-b-2 border-cyan-100 space-y-3 bg-slate-50/70 dark:bg-zinc-900/70 dark:border-white/10">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Conversas ({crmVisibleChats.length})</p>
                        <button
                          onClick={() => {
                            setNewChatMode('AGENDA');
                            setSelectedAgendaClientId(null);
                            setAgendaSearch('');
                            setIsNewChatModalOpen(true);
                          }}
                          className="px-3 py-2 rounded-xl bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 flex items-center gap-1"
                        >
                          <Plus size={12} />
                          Nova
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCrmFilter('ALL')}
                          className={`px-3 py-1 rounded-full text-xs font-black ${crmFilter === 'ALL' ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300'}`}
                        >
                          Todas
                        </button>
                        <button
                          type="button"
                          onClick={() => setCrmFilter('UNREAD')}
                          className={`px-3 py-1 rounded-full text-xs font-black ${crmFilter === 'UNREAD' ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300'}`}
                        >
                          Não lidas
                        </button>
                        <button
                          type="button"
                          onClick={() => setCrmFilter('WAITING')}
                          className={`px-3 py-1 rounded-full text-xs font-black ${crmFilter === 'WAITING' ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300'}`}
                        >
                          Aguardando
                        </button>
                      </div>
                    </div>

                    {aiHandoffRequests.length > 0 && (
                      <div className="border-b border-amber-200 bg-amber-50/70 px-3 py-3 space-y-2 dark:bg-zinc-900/70 dark:border-amber-500/30">
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">
                          Aprovação de atendimento IA pendente
                        </p>
                        <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                          {aiHandoffRequests.map((request) => (
                            <div key={request.id} className="rounded-xl border border-amber-200 bg-white px-3 py-2 dark:bg-[#121214] dark:border-amber-500/30">
                              <p className="text-xs font-black text-slate-800 dark:text-zinc-100 truncate">{request.contactName || request.chatId}</p>
                              <p className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 truncate mt-0.5">
                                {formatChatPreviewText(request.messagePreview) || 'Mensagem recebida'}
                              </p>
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <span className="text-[10px] font-bold text-slate-500 dark:text-zinc-400">
                                  {Number.isFinite(Number(request.createdAt))
                                    ? new Date(Number(request.createdAt)).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                                    : ''}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleAiHandoffDecision(request, false)}
                                    className="px-2 py-1 rounded-lg border border-slate-300 bg-white text-[10px] font-black uppercase tracking-wide text-slate-600 hover:bg-slate-50 dark:bg-zinc-900 dark:text-zinc-300 dark:border-white/10 dark:hover:bg-zinc-800"
                                  >
                                    Recusar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleAiHandoffDecision(request, true)}
                                    className="px-2.5 py-1 rounded-lg border border-emerald-300 bg-emerald-500 text-[10px] font-black uppercase tracking-wide text-white hover:bg-emerald-600"
                                  >
                                    Atender IA
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex-1 min-h-0 overflow-y-auto">
                      {crmVisibleChats.length === 0 ? (
                        <div className="text-center text-sm font-semibold text-slate-500 dark:text-zinc-400 p-8">Nenhuma conversa encontrada.</div>
                      ) : (
                        crmVisibleChats.map((chat) => (
                          <div
                            key={chat.chatId}
                            className={`w-full px-4 py-3 border-b border-cyan-50 transition ${
                              selectedChatId === chat.chatId
                                ? 'bg-emerald-50 border-l-4 border-l-emerald-500 dark:bg-emerald-900/20'
                                : 'bg-white hover:bg-cyan-50/60 dark:bg-[#121214] dark:hover:bg-zinc-900'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => handleSelectChat(chat.chatId)}
                                className="min-w-0 text-left flex-1 flex items-start gap-3"
                              >
                                <div className="w-11 h-11 rounded-xl bg-cyan-100 text-cyan-700 flex items-center justify-center shrink-0 overflow-hidden">
                                  {chat.avatarUrl ? (
                                    <img src={chat.avatarUrl} alt={chat.displayName} className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="font-black text-base">{String(chat.displayName || '?').charAt(0).toUpperCase()}</span>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <p className="text-lg font-black text-slate-800 dark:text-zinc-100 truncate">{chat.displayName}</p>
                                    {chat.initiatedByClient && (
                                      <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[9px] font-black uppercase tracking-widest shrink-0">
                                        Cliente
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">
                                    <Users size={11} />
                                    <span>{String(chat.contactType || 'CONTATO').toUpperCase()}</span>
                                    {chat.responsibleName && (
                                      <>
                                        <span className="text-slate-300 dark:text-zinc-600">•</span>
                                        <span className="truncate max-w-[120px]" title={`Resp.: ${chat.responsibleName}`}>Resp. {chat.responsibleName}</span>
                                      </>
                                    )}
                                  </div>
                                  <p className="text-sm font-semibold text-slate-500 dark:text-zinc-400 truncate mt-1">{formatChatPreviewText(chat.lastMessage) || 'Sem mensagem'}</p>
                                </div>
                              </button>
                              <div className="shrink-0 text-right">
                                <p className="text-xs font-bold text-emerald-600">{formatChatTime(chat.lastTimestamp)}</p>
                                {chat.unreadCount > 0 && (
                                  <span className="inline-flex items-center justify-center mt-1 min-w-5 h-5 px-1 rounded-full bg-emerald-500 text-white text-[10px] font-black shadow-sm">
                                    {chat.unreadCount}
                                  </span>
                                )}
                                {chat.unreadCount === 0 && (
                                  <span className="inline-flex items-center justify-center mt-1 text-emerald-500">
                                    <CheckCircle2 size={14} />
                                  </span>
                                )}
                                <div className="mt-1 flex items-center justify-end gap-1">
                                  {!chat.isDraft && (
                                    <button
                                      type="button"
                                      onClick={(event) => handleClearChatMessages(chat, event)}
                                      disabled={isDeletingChatId === chat.chatId}
                                      className="p-1 rounded hover:bg-amber-100 text-amber-600 disabled:opacity-50"
                                      title="Apagar mensagens da conversa"
                                    >
                                      <XCircle size={14} />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={(event) => handleDeleteChat(chat, event)}
                                    disabled={isDeletingChatId === chat.chatId}
                                    className="p-1 rounded hover:bg-rose-100 text-rose-600 disabled:opacity-50"
                                    title="Excluir conversa"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </section>

                  <section className="flex flex-col min-h-0 h-full overflow-hidden bg-slate-50/70 dark:bg-zinc-950/60">
                    {!selectedChat ? (
                      <div className="flex-1 flex items-center justify-center text-slate-500 dark:text-zinc-400 font-semibold">
                        Selecione uma conversa para abrir o CRM.
                      </div>
                    ) : (
                      <>
                        <div className="px-5 py-4 bg-white border-b-2 border-cyan-100 flex items-center justify-between dark:bg-zinc-900/80 dark:border-white/10">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-2xl font-black text-slate-900 dark:text-zinc-100">{selectedChat.displayName}</p>
                              <button
                                type="button"
                                onClick={() => setIsContactDetailsVisible((prev) => !prev)}
                                className="px-2.5 py-1 rounded-lg border border-cyan-200 bg-cyan-50 text-cyan-700 text-[10px] font-black uppercase tracking-widest hover:bg-cyan-100 dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-800"
                              >
                                {isContactDetailsVisible ? 'Ocultar dados' : 'Ver dados'}
                              </button>
                            </div>
                            {(selectedChat.contactTypeLabel || selectedChat.relationshipLabel) && (
                              <div className="mt-1.5 flex items-center gap-2">
                                <span className="inline-flex items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-cyan-700 dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-200">
                                  {selectedChat.contactTypeLabel || 'Contato'}
                                  <span className="opacity-60">•</span>
                                  {selectedChat.relationshipLabel || 'Indefinido'}
                                </span>
                              </div>
                            )}
                            <div className="flex items-center gap-2 mt-1">
                              <p className="text-sm font-bold text-emerald-600">{status.connected ? 'Online' : 'Offline'}</p>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                aiAgentEnabledForChat
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-slate-100 text-slate-500 dark:bg-zinc-900 dark:text-zinc-400'
                              }`}>
                                IA {aiAgentEnabledForChat ? 'Auto ON' : 'Auto OFF'}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-slate-500 dark:text-zinc-400">
                            <button className="p-2 rounded-lg hover:bg-cyan-50 dark:hover:bg-zinc-800" type="button"><PhoneCall size={16} /></button>
                            <button className="p-2 rounded-lg hover:bg-cyan-50 dark:hover:bg-zinc-800" type="button"><Video size={16} /></button>
                            <button className="p-2 rounded-lg hover:bg-cyan-50 dark:hover:bg-zinc-800" type="button"><MoreVertical size={16} /></button>
                          </div>
                        </div>

                        <div
                          ref={messagesViewportRef}
                          onScroll={handleMessagesScroll}
                          className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2"
                        >
                          {messagesLoading ? (
                            <div className="text-center text-sm font-semibold text-slate-500 dark:text-zinc-400 py-8">Carregando mensagens...</div>
                          ) : messages.length === 0 ? (
                            <div className="text-center text-sm font-semibold text-slate-500 dark:text-zinc-400 py-8">Sem mensagens neste chat.</div>
                          ) : (
                            messages.map((msg, index) => {
                              const previous = index > 0 ? messages[index - 1] : null;
                              const hasValidTimestamp = Boolean(normalizeTimestampMs(msg.timestamp));
                              const showDateDivider = hasValidTimestamp && (index === 0 || !isSameCalendarDay(msg.timestamp, previous?.timestamp));
                              return (
                                <React.Fragment key={msg.id}>
                                  {showDateDivider && (
                                    <div className="flex justify-center py-2">
                                      <span className="px-3 py-1 rounded-full bg-slate-200 text-slate-600 text-[11px] font-bold shadow-sm dark:bg-zinc-800 dark:text-zinc-300">
                                        {formatChatDayDivider(msg.timestamp)}
                                      </span>
                                    </div>
                                  )}
                                  <div
                                    className={`relative max-w-[70%] px-4 py-3 rounded-2xl text-sm font-medium shadow-sm ${
                                      msg.fromMe
                                        ? 'ml-auto bg-emerald-500 text-white rounded-br-md'
                                        : 'mr-auto bg-white border border-cyan-100 text-slate-800 rounded-bl-md dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-100'
                                    }`}
                                  >
                                    <span
                                      className={`absolute top-3 w-0 h-0 ${
                                        msg.fromMe
                                          ? '-right-2 border-l-[10px] border-l-emerald-500 border-t-[7px] border-t-transparent border-b-[7px] border-b-transparent'
                                          : '-left-2 border-r-[10px] border-r-white border-t-[7px] border-t-transparent border-b-[7px] border-b-transparent dark:border-r-zinc-900'
                                      }`}
                                    />
                                    {msg.mediaType === 'image' && msg.mediaDataUrl && (
                                      <a href={msg.mediaDataUrl} target="_blank" rel="noreferrer" className="block mb-2">
                                        <img
                                          src={msg.mediaDataUrl}
                                          alt={msg.fileName || 'Imagem'}
                                          className="max-h-72 w-auto rounded-xl border border-white/20"
                                        />
                                      </a>
                                    )}

                                    {msg.mediaType === 'audio' && (
                                      <div className="mb-2">
                                        {msg.mediaDataUrl ? (
                                          <audio controls className="w-full" src={msg.mediaDataUrl}>
                                            Seu navegador não suporta áudio.
                                          </audio>
                                        ) : (
                                          <div className="text-xs font-semibold opacity-80 mb-2">
                                            Áudio recebido (pré-visualização indisponível).
                                          </div>
                                        )}
                                        <div className="mt-2">
                                          <button
                                            type="button"
                                            onClick={() => handleTranscribeAudioMessage(msg)}
                                            disabled={Boolean(audioTranscriptions[msg.id]?.loading)}
                                            className={`px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wide ${
                                              msg.fromMe
                                                ? 'bg-white/20 hover:bg-white/30 disabled:bg-white/10 text-white'
                                                : 'bg-cyan-50 hover:bg-cyan-100 disabled:bg-cyan-50/60 text-cyan-700 border border-cyan-200'
                                            }`}
                                          >
                                            {audioTranscriptions[msg.id]?.loading ? 'Transcrevendo...' : 'Transcrever'}
                                          </button>
                                        </div>
                                        {String(audioTranscriptions[msg.id]?.text || '').trim() && (
                                          <div className={`mt-2 p-2 rounded-lg text-xs whitespace-pre-wrap break-words ${
                                            msg.fromMe
                                              ? 'bg-white/15 border border-white/25 text-white'
                                              : 'bg-white border border-cyan-200 text-slate-700 dark:bg-zinc-800 dark:border-white/10 dark:text-zinc-200'
                                          }`}>
                                            <p className="font-black uppercase tracking-wide text-[10px] mb-1 opacity-80">Transcrição</p>
                                            <p>{audioTranscriptions[msg.id]?.text}</p>
                                          </div>
                                        )}
                                        {audioTranscriptions[msg.id]?.error && (
                                          <p className={`mt-2 text-[11px] font-semibold ${
                                            msg.fromMe ? 'text-rose-100' : 'text-rose-600'
                                          }`}>
                                            {audioTranscriptions[msg.id]?.error}
                                          </p>
                                        )}
                                      </div>
                                    )}
                                    {msg.mediaType === 'document' && (
                                      <div className="mb-2">
                                        {msg.mediaDataUrl ? (
                                          <a
                                            href={msg.mediaDataUrl}
                                            download={msg.fileName || 'arquivo'}
                                            target="_blank"
                                            rel="noreferrer"
                                            className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-black ${
                                              msg.fromMe
                                                ? 'bg-white/20 hover:bg-white/30 text-white'
                                                : 'bg-cyan-50 hover:bg-cyan-100 text-cyan-700 border border-cyan-200'
                                            }`}
                                          >
                                            <FileText size={14} />
                                            {msg.fileName || 'Abrir arquivo'}
                                          </a>
                                        ) : (
                                          <div className="text-xs font-semibold opacity-80">
                                            Arquivo recebido: {msg.fileName || 'documento'}
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {msg.location && (
                                      <div className={`mb-2 rounded-xl border p-2 ${msg.fromMe ? 'border-white/30 bg-white/15' : 'border-cyan-200 bg-cyan-50'}`}>
                                        {msg.location.mapThumbnailDataUrl && (
                                          <img
                                            src={msg.location.mapThumbnailDataUrl}
                                            alt="Mapa"
                                            className="w-full max-w-xs rounded-lg mb-2 border border-white/20"
                                          />
                                        )}
                                        <p className="text-xs font-black">
                                          {msg.location.name || 'Localização'}
                                        </p>
                                        {msg.location.address && (
                                          <p className="text-xs mt-1 opacity-80 break-words">{msg.location.address}</p>
                                        )}
                                        <a
                                          href={msg.location.url || `https://www.google.com/maps?q=${encodeURIComponent(`${msg.location.latitude},${msg.location.longitude}`)}`}
                                          target="_blank"
                                          rel="noreferrer"
                                          className={`inline-flex mt-2 px-2 py-1 rounded-lg text-[11px] font-black ${
                                            msg.fromMe
                                              ? 'bg-white/20 hover:bg-white/30 text-white'
                                              : 'bg-white border border-cyan-200 text-cyan-700 hover:bg-cyan-100'
                                          }`}
                                        >
                                          Abrir mapa
                                        </a>
                                      </div>
                                    )}

                                    {formatMessageBodyForDisplay(msg) && (
                                      <p className="whitespace-pre-wrap break-words">{formatMessageBodyForDisplay(msg)}</p>
                                    )}

                                    <div className={`mt-2 flex items-center justify-end gap-1 text-[10px] ${
                                      msg.fromMe ? 'text-white/75' : 'text-slate-400 dark:text-zinc-500'
                                    }`}>
                                      <span>{formatChatTime(msg.timestamp)}</span>
                                      {msg.fromMe && <CheckCheck size={12} className="text-sky-200" />}
                                    </div>
                                  </div>
                                </React.Fragment>
                              );
                            })
                          )}
                          <div ref={messagesBottomRef} />
                        </div>

                        <div className="shrink-0 p-4 border-t-2 border-cyan-100 bg-white dark:bg-zinc-900/85 dark:border-white/10">
                          {chatAttachment && (
                            <div className="mb-3 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 flex items-center justify-between gap-2 dark:bg-zinc-900 dark:border-cyan-500/30">
                              <div className="min-w-0">
                                <p className="text-[11px] font-black uppercase tracking-widest text-cyan-700">Anexo pronto para envio</p>
                                <p className="text-xs font-semibold text-slate-700 dark:text-zinc-300 truncate">
                                  {chatAttachment.fileName || 'arquivo'} • {chatAttachment.mediaType}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setChatAttachment(null)}
                                className="p-1.5 rounded-lg border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 dark:bg-zinc-900 dark:border-rose-500/30 dark:hover:bg-zinc-800"
                                title="Remover anexo"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          )}
                          <div className="flex items-end gap-2">
                          <label className="p-3 rounded-xl border-2 border-cyan-100 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 cursor-pointer dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-800">
                            <Paperclip size={15} />
                            <input type="file" className="hidden" onChange={handleAttachFile} />
                          </label>
                          <button
                            type="button"
                            onClick={() => setIsScheduleModalOpen(true)}
                            className="p-3 rounded-xl border-2 border-cyan-100 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-800"
                            title="Agendar mensagem"
                          >
                            <CalendarClock size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={handleImproveChatReply}
                            disabled={isImprovingChatReply || !chatReply.trim()}
                            className="p-3 rounded-xl border-2 border-cyan-100 bg-cyan-50 hover:bg-cyan-100 disabled:opacity-50 text-cyan-700 dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-800"
                            title="Melhorar texto com IA"
                          >
                            <RefreshCw size={15} className={isImprovingChatReply ? 'animate-spin' : ''} />
                          </button>
                          <button
                            type="button"
                            onClick={handleToggleAiAgentForChat}
                            disabled={isUpdatingAiAgentForChat || !selectedChatId}
                            className={`p-3 rounded-xl border-2 disabled:opacity-50 ${
                              aiAgentEnabledForChat
                                ? 'border-emerald-300 bg-emerald-100 text-emerald-700'
                                : 'border-cyan-100 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-800'
                            }`}
                            title={aiAgentEnabledForChat ? 'Desativar agente IA automático' : 'Ativar agente IA automático'}
                          >
                            <Bot size={15} />
                          </button>
                          <textarea
                            ref={chatReplyInputRef}
                            rows={2}
                            value={chatReply}
                            onChange={(e) => setChatReply(e.target.value)}
                            placeholder="Digite uma mensagem..."
                            className="flex-1 px-3 py-2 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-100"
                          />
                          <button
                            type="button"
                            onClick={handleReply}
                            disabled={isSendingChat || (!chatReply.trim() && !chatAttachment)}
                            className="px-4 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white font-black"
                          >
                            <Send size={15} />
                          </button>
                          </div>
                        </div>
                      </>
                    )}
                  </section>

                  <aside className="p-5 bg-white border-l-2 border-cyan-100 min-h-0 h-full overflow-y-auto dark:bg-zinc-900/75 dark:border-white/10">
                    {selectedChat ? (
                      <div className="space-y-5">
                        {!isContactDetailsVisible ? (
                          <div className="h-full min-h-[220px] rounded-2xl border-2 border-dashed border-cyan-200 bg-cyan-50/50 flex flex-col items-center justify-center text-center px-4 dark:bg-zinc-900 dark:border-white/10">
                            <p className="text-sm font-black uppercase tracking-widest text-cyan-700 dark:text-zinc-200">Dados ocultos</p>
                            <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-zinc-400">
                              Clique em <span className="font-black">VER DADOS</span> no topo da conversa para exibir as informações do responsável.
                            </p>
                          </div>
                        ) : (
                          <>
                            <div className="text-center">
                              <div className="w-20 h-20 mx-auto rounded-full bg-cyan-100 overflow-hidden flex items-center justify-center text-cyan-700 text-2xl font-black">
                                {selectedChat.avatarUrl ? (
                                  <img
                                    src={selectedChat.avatarUrl}
                                    alt={selectedChat.displayName}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  String(selectedChat.displayName || '?').charAt(0).toUpperCase()
                                )}
                              </div>
                              <p className="mt-3 text-2xl font-black text-slate-900 dark:text-zinc-100">{selectedChat.displayName}</p>
                              <p className="text-sm font-semibold text-slate-500 dark:text-zinc-400">+{selectedChat.phone}</p>
                            </div>

                            <div className="space-y-2">
                              <p className="text-[11px] uppercase tracking-widest font-black text-slate-500">Etiquetas</p>
                              <div className="flex flex-wrap gap-2">
                                {(selectedChat.labels || []).length > 0 ? (
                                  (selectedChat.labels || []).map((label) => (
                                    <span key={label} className="px-2 py-1 rounded-full bg-cyan-100 text-cyan-700 text-[11px] font-black">
                                      {label}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-xs font-semibold text-slate-400 dark:text-zinc-500">Sem etiquetas</span>
                                )}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <p className="text-[11px] uppercase tracking-widest font-black text-slate-500">Saldos de planos</p>
                              {selectedStudent && (
                                <div className="rounded-xl border border-cyan-100 bg-cyan-50/60 px-3 py-2 flex items-center justify-between">
                                  <div>
                                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-600">Status do aluno hoje</p>
                                    <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400">{selectedStudent.name}</p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`inline-flex w-2.5 h-2.5 rounded-full ${
                                        selectedStudentConsumedToday === null
                                          ? 'bg-slate-300'
                                          : selectedStudentConsumedToday
                                            ? 'bg-emerald-500'
                                            : 'bg-rose-500'
                                      }`}
                                    />
                                    <span className="text-xs font-black text-slate-700 dark:text-zinc-200">
                                      {isLoadingStudentConsumedToday
                                        ? 'Verificando...'
                                        : selectedStudentConsumedToday === null
                                          ? 'Sem dados'
                                          : selectedStudentConsumedToday
                                            ? 'Consumiu hoje'
                                            : 'Não consumiu hoje'}
                                    </span>
                                  </div>
                                </div>
                              )}
                              {relatedStudents.length > 1 && (
                                <select
                                  value={selectedStudentId}
                                  onChange={(e) => setSelectedStudentId(e.target.value)}
                                  className="w-full px-3 py-2 rounded-xl border-2 border-cyan-100 bg-white text-sm font-semibold text-slate-700 outline-none focus:border-cyan-400 dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-100"
                                >
                                  <option value="">Selecione o aluno</option>
                                  {relatedStudents.map((student) => (
                                    <option key={student.id} value={student.id}>
                                      {student.name}
                                    </option>
                                  ))}
                                </select>
                              )}
                              {selectedStudent && selectedStudentPlanSummary.length > 0 ? (
                                selectedStudentPlanSummary.map((item) => {
                                  const tone = getPlanCardTone(item.key, item.numericBalance);
                                  const normalizedKey = String(item.key || '').toUpperCase();
                                  const isPrepaid = normalizedKey === 'PREPAGO';
                                  const isLowPrepaid = isPrepaid && Number(item.numericBalance) < 10;
                                  return (
                                    <div key={item.key} className={`rounded-xl border px-3 py-2 ${tone.container}`}>
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                          <span className={`inline-flex w-7 h-7 rounded-lg items-center justify-center bg-white/80 ${tone.title}`}>
                                            {isPrepaid ? <Wallet size={14} /> : <UtensilsCrossed size={14} />}
                                          </span>
                                          <p className={`text-[11px] font-black uppercase tracking-widest truncate ${tone.title}`}>{item.label}</p>
                                        </div>
                                        {isLowPrepaid && (
                                          <button
                                            type="button"
                                            onClick={handleQuickChargeLowBalance}
                                            className="px-2 py-1 rounded-lg border border-emerald-300 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wide hover:bg-emerald-600"
                                          >
                                            Cobrar saldo
                                          </button>
                                        )}
                                      </div>
                                      <p className={`text-sm font-black mt-1 ${tone.value}`}>{item.value}</p>
                                    </div>
                                  );
                                })
                              ) : (
                                <p className="text-xs font-semibold text-slate-400 dark:text-zinc-500">Selecione um aluno para visualizar saldos.</p>
                              )}
                            </div>

                            <div className="space-y-2 pt-2 border-t border-cyan-100 dark:border-white/10">
                              <p className="text-[11px] uppercase tracking-widest font-black text-slate-500">Relatório do contato</p>
                              <select
                                value={reportPeriodMode}
                                onChange={(e) => setReportPeriodMode(e.target.value as ReportPeriodMode)}
                                className="w-full px-3 py-2 rounded-xl border-2 border-emerald-100 bg-emerald-50/40 text-xs font-black text-slate-700 outline-none focus:border-emerald-400 dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-100"
                              >
                                <option value="WEEKLY">Semanal</option>
                                <option value="BIWEEKLY">Quinzenal</option>
                                <option value="CUSTOM">Período (inicial/final)</option>
                              </select>
                              {reportPeriodMode === 'CUSTOM' && (
                                <div className="grid grid-cols-1 gap-2">
                                  <input
                                    type="date"
                                    value={reportStartDate}
                                    onChange={(e) => setReportStartDate(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border-2 border-emerald-100 bg-white text-xs font-bold text-slate-700 outline-none focus:border-emerald-400 dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-100"
                                  />
                                  <input
                                    type="date"
                                    value={reportEndDate}
                                    onChange={(e) => setReportEndDate(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border-2 border-emerald-100 bg-white text-xs font-bold text-slate-700 outline-none focus:border-emerald-400 dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-100"
                                  />
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={handleSendConsumptionReport}
                                disabled={isSendingReport || !selectedChatClient || !['ALUNO', 'COLABORADOR'].includes(String(selectedChatClient?.type || '').toUpperCase())}
                                className="w-full px-3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
                              >
                                <CalendarDays size={13} />
                                {isSendingReport ? 'Enviando...' : 'Enviar relatório'}
                              </button>
                              <p className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                                {selectedChatClient
                                  ? `Tipo: ${String(selectedChatClient.type || '').toUpperCase()}`
                                  : 'Contato sem cadastro local.'}
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm font-semibold text-slate-500 dark:text-zinc-400">Nenhum contato selecionado.</div>
                    )}
                  </aside>
                  </div>
                </div>
              )}

              {false && (
                <div className="flex-1 p-6 bg-slate-50/60 overflow-y-auto">
                  <div className="max-w-6xl mx-auto space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Campanhas</p>
                        <h3 className="text-2xl font-black text-slate-900">{campaignSubTab === 'NOVA_CAMPANHA' ? 'Nova Campanha' : 'Gerenciar Campanha'}</h3>
                      </div>
                      <div className="flex items-center gap-2 bg-white rounded-xl border border-cyan-100 p-1">
                        <button
                          type="button"
                          onClick={() => setCampaignSubTab('NOVA_CAMPANHA')}
                          className={`px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest ${
                            campaignSubTab === 'NOVA_CAMPANHA'
                              ? 'bg-emerald-500 text-white'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          Nova Campanha
                        </button>
                        <button
                          type="button"
                          onClick={() => setCampaignSubTab('GERENCIAR_CAMPANHA')}
                          className={`px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest ${
                            campaignSubTab === 'GERENCIAR_CAMPANHA'
                              ? 'bg-emerald-500 text-white'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          Gerenciar Campanha
                        </button>
                      </div>
                    </div>

                    {campaignSubTab === 'NOVA_CAMPANHA' && (
                      <>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setCampaignName('');
                          setCampaignMessage('Olá {primeiro_nome_responsavel}, segue o relatório de consumo do período {periodo_referencia}.');
                          setPlanConsumptionMessage('Olá {primeiro_nome_responsavel}, segue o relatório de consumo do período {periodo_referencia}.');
                          setCampaignMode('BROADCAST');
                          setCampaignAudience('ALL');
                          setCampaignSendNow(true);
                          setCampaignStartAt('');
                          setCampaignIntervalSeconds(2);
                          setCampaignIntervalMinSeconds(2);
                          setCampaignIntervalMaxSeconds(5);
                          setCampaignUseSignature(true);
                          setCampaignAttachment(null);
                          setCampaignRecurringTargetResponsible(true);
                          setCampaignRecurringTargetCollaborator(true);
                        }}
                        className="px-4 py-2 rounded-xl border border-slate-300 text-slate-600 text-xs font-black uppercase tracking-widest hover:bg-white"
                      >
                        Descartar
                      </button>
                      <button
                        type="button"
                        onClick={handleLaunchCampaign}
                        disabled={isCampaignLaunching}
                        className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 text-white text-xs font-black uppercase tracking-widest"
                      >
                        {isCampaignLaunching ? 'Salvando...' : 'Salvar e Disparar'}
                      </button>
                    </div>

                    <div className="space-y-4">
                      <section className="rounded-2xl border border-cyan-100 bg-white p-5 space-y-4">
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">Nome da Campanha</label>
                          <input
                            value={campaignName}
                            onChange={(e) => setCampaignName(e.target.value)}
                            placeholder="Ex: Lançamento Outono Cantina"
                            className="w-full px-4 py-3 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                          />
                        </div>

                        <div className="space-y-2">
                          <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Modalidade da Campanha</p>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={() => setCampaignMode('BROADCAST')}
                              className={`p-4 rounded-xl border-2 text-left ${campaignMode === 'BROADCAST' ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white'}`}
                            >
                              <p className="text-base font-black text-slate-900">Envio Único</p>
                              <p className="text-xs font-semibold text-slate-500 mt-1">Disparo único para o público selecionado.</p>
                            </button>
                            <button
                              type="button"
                              onClick={() => setCampaignMode('RECURRING')}
                              className={`p-4 rounded-xl border-2 text-left ${campaignMode === 'RECURRING' ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white'}`}
                            >
                              <p className="text-base font-black text-slate-900">Recorrente</p>
                              <p className="text-xs font-semibold text-slate-500 mt-1">Envios mensais ou semanais com período configurável.</p>
                            </button>
                            <button
                              type="button"
                              onClick={() => setCampaignMode('FOLLOWUP')}
                              className={`p-4 rounded-xl border-2 text-left ${campaignMode === 'FOLLOWUP' ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white'}`}
                            >
                              <p className="text-base font-black text-slate-900">Sequência Follow-up</p>
                              <p className="text-xs font-semibold text-slate-500 mt-1">Etapas imediatas e agendadas por dias.</p>
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                              {campaignMode === 'RECURRING' ? 'Público recorrente' : 'Segmentação do Público'}
                            </label>
                            {campaignMode === 'RECURRING' ? (
                              <div className="rounded-xl border border-cyan-100 bg-cyan-50/40 px-3 py-2.5 text-sm font-semibold text-slate-700">
                                Defina o público no bloco de recorrência (Responsável, Colaborador ou Todos).
                              </div>
                            ) : (
                              <>
                                <select
                                  value={campaignAudience}
                                  onChange={(e) => setCampaignAudience(e.target.value as CampaignAudience)}
                                  className="w-full px-3 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                                >
                                  <option value="ALL">Todos (responsáveis e colaboradores)</option>
                                  <option value="ALUNO">Somente responsáveis</option>
                                  <option value="COLABORADOR">Somente colaboradores</option>
                                  {campaignAvailableLabels.map((label) => (
                                    <option key={label} value={`LABEL:${label}`}>Etiqueta: {label}</option>
                                  ))}
                                </select>
                                <p className="text-xs font-semibold text-slate-500">
                                  {getCampaignTargetPhones().length} responsável(is)/colaborador(es) no público atual.
                                </p>
                              </>
                            )}
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">Agendamento</label>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setCampaignSendNow(true)}
                                className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest ${campaignSendNow ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'}`}
                              >
                                Enviar agora
                              </button>
                              <button
                                type="button"
                                onClick={() => setCampaignSendNow(false)}
                                className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest ${!campaignSendNow ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'}`}
                              >
                                Agendar
                              </button>
                            </div>
                            {!campaignSendNow && (
                              <input
                                type="datetime-local"
                                value={campaignStartAt}
                                onChange={(e) => setCampaignStartAt(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                              />
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">Intervalo inicial (segundos)</label>
                            <input
                              type="number"
                              min={0}
                              max={600}
                              value={campaignIntervalMinSeconds}
                              onChange={(e) => setCampaignIntervalMinSeconds(Math.max(0, Number(e.target.value) || 0))}
                              className="w-full px-3 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">Intervalo final (segundos)</label>
                            <input
                              type="number"
                              min={0}
                              max={600}
                              value={campaignIntervalMaxSeconds}
                              onChange={(e) => setCampaignIntervalMaxSeconds(Math.max(0, Number(e.target.value) || 0))}
                              className="w-full px-3 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                            />
                            <p className="text-[11px] font-semibold text-slate-500">
                              O sistema usará um intervalo aleatório entre início e fim para cada envio.
                            </p>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">Assinatura</label>
                            <button
                              type="button"
                              onClick={() => setCampaignUseSignature((prev) => !prev)}
                              className={`w-full px-3 py-2.5 rounded-xl border-2 text-sm font-black ${
                                campaignUseSignature
                                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                  : 'border-slate-200 bg-slate-50 text-slate-600'
                              }`}
                            >
                              {campaignUseSignature ? 'Com assinatura' : 'Sem assinatura'}
                            </button>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">Anexo da campanha</label>
                            <label className="w-full inline-flex items-center justify-center px-3 py-2.5 rounded-xl border-2 border-cyan-100 bg-cyan-50 text-cyan-700 text-sm font-black cursor-pointer hover:bg-cyan-100">
                              {campaignAttachment ? 'Trocar arquivo' : 'Selecionar arquivo'}
                              <input
                                type="file"
                                className="hidden"
                                onChange={handleCampaignAttachFile}
                                accept="image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,.rar,.7z,.mp4,.avi,.mkv,.mov"
                              />
                            </label>
                          </div>
                        </div>

                        {campaignAttachment && (
                          <div className="rounded-xl border border-cyan-100 bg-cyan-50/40 px-3 py-2 flex items-center justify-between gap-3">
                            <p className="text-xs font-semibold text-slate-700 truncate">
                              Anexo: <span className="font-black">{campaignAttachment.fileName || 'arquivo'}</span> ({campaignAttachment.mediaType})
                            </p>
                            <button
                              type="button"
                              onClick={() => setCampaignAttachment(null)}
                              className="px-2 py-1 rounded-lg text-[11px] font-black text-rose-600 hover:bg-rose-50"
                            >
                              Remover
                            </button>
                          </div>
                        )}

                        {campaignMode === 'RECURRING' && (
                          <div className="rounded-2xl border border-cyan-100 bg-cyan-50/20 p-3 space-y-3">
                            <div className="space-y-1.5">
                              <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Público recorrente</p>
                              <div className="flex flex-wrap items-center gap-2">
                                <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-cyan-200 bg-white text-xs font-black text-slate-700">
                                  <input
                                    type="checkbox"
                                    checked={campaignRecurringTargetResponsible}
                                    onChange={(e) => setCampaignRecurringTargetResponsible(e.target.checked)}
                                  />
                                  Responsável
                                </label>
                                <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-cyan-200 bg-white text-xs font-black text-slate-700">
                                  <input
                                    type="checkbox"
                                    checked={campaignRecurringTargetCollaborator}
                                    onChange={(e) => setCampaignRecurringTargetCollaborator(e.target.checked)}
                                  />
                                  Colaborador
                                </label>
                                <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-cyan-200 bg-white text-xs font-black text-slate-700">
                                  <input
                                    type="checkbox"
                                    checked={campaignRecurringTargetResponsible && campaignRecurringTargetCollaborator}
                                    onChange={(e) => {
                                      setCampaignRecurringTargetResponsible(e.target.checked);
                                      setCampaignRecurringTargetCollaborator(e.target.checked);
                                    }}
                                  />
                                  Todos
                                </label>
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Frequência do relatório</p>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setPlanConsumptionFrequency('MONTHLY')}
                                  className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest ${
                                    planConsumptionFrequency === 'MONTHLY' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  Mensal
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPlanConsumptionFrequency('WEEKLY')}
                                  className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest ${
                                    planConsumptionFrequency === 'WEEKLY' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  Semanal
                                </button>
                              </div>
                            </div>

                            {planConsumptionFrequency === 'MONTHLY' ? (
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <label className="space-y-1">
                                  <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Início do consumo (dia)</span>
                                  <input
                                    type="number"
                                    min={1}
                                    max={28}
                                    value={planConsumptionMonthlyStartDay}
                                    onChange={(e) => setPlanConsumptionMonthlyStartDay(clampMonthDay(Number(e.target.value)))}
                                    className="w-full px-3 py-2 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold bg-white"
                                  />
                                </label>
                                <label className="space-y-1">
                                  <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Final do consumo (dia)</span>
                                  <input
                                    type="number"
                                    min={1}
                                    max={28}
                                    value={planConsumptionMonthlyEndDay}
                                    onChange={(e) => setPlanConsumptionMonthlyEndDay(clampMonthDay(Number(e.target.value)))}
                                    className="w-full px-3 py-2 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold bg-white"
                                  />
                                </label>
                                <label className="space-y-1">
                                  <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Dia do envio (mês)</span>
                                  <input
                                    type="number"
                                    min={1}
                                    max={31}
                                    value={planConsumptionMonthlyDay}
                                    onChange={(e) => setPlanConsumptionMonthlyDay(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
                                    className="w-full px-3 py-2 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold bg-white"
                                  />
                                </label>
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                <label className="space-y-1">
                                  <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Início (dia da semana)</span>
                                  <select
                                    value={planConsumptionWeeklyStartDay}
                                    onChange={(e) => setPlanConsumptionWeeklyStartDay(Number(e.target.value))}
                                    className="w-full px-3 py-2 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold bg-white"
                                  >
                                    {WEEKLY_DISPATCH_OPTIONS.map((option) => (
                                      <option key={`start_${option.value}`} value={option.value}>{option.label}</option>
                                    ))}
                                  </select>
                                </label>
                                <label className="space-y-1">
                                  <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Final (dia da semana)</span>
                                  <select
                                    value={planConsumptionWeeklyEndDay}
                                    onChange={(e) => setPlanConsumptionWeeklyEndDay(Number(e.target.value))}
                                    className="w-full px-3 py-2 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold bg-white"
                                  >
                                    {WEEKLY_DISPATCH_OPTIONS.map((option) => (
                                      <option key={`end_${option.value}`} value={option.value}>{option.label}</option>
                                    ))}
                                  </select>
                                </label>
                                <label className="space-y-1">
                                  <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Dia do envio</span>
                                  <select
                                    value={planConsumptionWeeklyDay}
                                    onChange={(e) => setPlanConsumptionWeeklyDay(Number(e.target.value))}
                                    className="w-full px-3 py-2 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold bg-white"
                                  >
                                    {WEEKLY_DISPATCH_OPTIONS.map((option) => (
                                      <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                  </select>
                                </label>
                                <label className="space-y-1">
                                  <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Hora do envio</span>
                                  <input
                                    type="time"
                                    value={planConsumptionSendTime}
                                    onChange={(e) => setPlanConsumptionSendTime(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold bg-white"
                                  />
                                </label>
                              </div>
                            )}

                            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs font-semibold text-blue-900">
                              Fechamento base em <span className="font-black">Ajustes &gt; Pagamento</span>:
                              início <span className="font-black">{Math.min(28, Math.max(1, Number(activeEnterprise?.collaboratorPaymentStartDay || 1) || 1))}</span>
                              {' '}e vencimento <span className="font-black">{Math.min(28, Math.max(1, Number(activeEnterprise?.collaboratorPaymentDueDay || 7) || 7))}</span>.
                            </div>

                            <p className="text-xs font-semibold text-slate-500">
                              O envio recorrente usa automaticamente o período configurado e anexa o relatório em PDF no disparo.
                            </p>
                          </div>
                        )}

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                              {campaignMode === 'FOLLOWUP' ? 'Sequência da Campanha' : 'Mensagem da Campanha'}
                            </p>
                            {campaignMode === 'FOLLOWUP' && (
                              <button
                                type="button"
                                onClick={handleAddCampaignStep}
                                className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest"
                              >
                                + Etapa
                              </button>
                            )}
                          </div>

                          {campaignMode === 'FOLLOWUP' ? (
                            <div className="space-y-3">
                              {campaignSteps.map((step, index) => (
                                <div key={step.id} className="rounded-xl border border-cyan-100 bg-cyan-50/20 p-3 space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <input
                                      value={step.title}
                                      onChange={(e) => handleCampaignStepChange(step.id, { title: e.target.value })}
                                      className="flex-1 px-2 py-1 rounded-lg border border-cyan-100 bg-white text-sm font-black text-slate-700"
                                    />
                                    <input
                                      type="number"
                                      min={0}
                                      value={step.delayDays}
                                      onChange={(e) => handleCampaignStepChange(step.id, { delayDays: Math.max(0, Number(e.target.value) || 0) })}
                                      className="w-24 px-2 py-1 rounded-lg border border-cyan-100 bg-white text-xs font-black text-slate-700"
                                    />
                                    <span className="text-xs font-black text-slate-500">dias</span>
                                    {campaignSteps.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveCampaignStep(step.id)}
                                        className="p-1 rounded text-rose-600 hover:bg-rose-50"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    )}
                                  </div>
                                  <textarea
                                    rows={3}
                                    value={step.message}
                                    onChange={(e) => handleCampaignStepChange(step.id, { message: e.target.value })}
                                    placeholder={`Mensagem da etapa ${index + 1}`}
                                    className="w-full px-3 py-2 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-medium bg-white"
                                  />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <textarea
                                ref={campaignMessageTextareaRef}
                                rows={6}
                                value={campaignMode === 'RECURRING' ? planConsumptionMessage : campaignMessage}
                                onChange={(e) => {
                                  if (campaignMode === 'RECURRING') {
                                    setPlanConsumptionMessage(e.target.value);
                                    return;
                                  }
                                  setCampaignMessage(e.target.value);
                                }}
                                placeholder={
                                  campaignMode === 'RECURRING'
                                    ? 'Exemplo (demonstração): Olá {primeiro_nome_responsavel}, segue o resumo de {periodo_referencia} para {nome_completo_alunos}.'
                                    : 'Digite a mensagem da campanha...'
                                }
                                className="w-full px-3 py-2 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-medium bg-white placeholder:text-slate-400"
                              />
                              {campaignMode === 'RECURRING' && (
                                <p className="text-[11px] font-semibold text-slate-500">
                                  Dica: use as variáveis abaixo para montar a mensagem dinâmica do relatório.
                                </p>
                              )}
                            </div>
                          )}

                          <div className="flex flex-wrap gap-2">
                            {campaignMode === 'RECURRING' ? (
                              CAMPAIGN_RECURRING_VARIABLES.map((variable) => (
                                <button
                                  key={variable.key}
                                  type="button"
                                  onClick={() => insertCampaignTokenAtCursor(variable.key)}
                                  className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-black border border-emerald-200 hover:bg-emerald-100"
                                  title={variable.label}
                                >
                                  {variable.key}
                                </button>
                              ))
                            ) : (
                              ['{Nome}', '{Sobrenome}', '{Data}'].map((token) => (
                                <button
                                  key={token}
                                  type="button"
                                  onClick={() => {
                                    if (campaignMode === 'FOLLOWUP') {
                                      const first = campaignSteps[0];
                                      if (!first) return;
                                      handleCampaignStepChange(first.id, { message: `${first.message}${first.message ? ' ' : ''}${token}` });
                                      return;
                                    }
                                    setCampaignMessage((prev) => `${prev}${prev ? ' ' : ''}${token}`);
                                  }}
                                  className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-black"
                                >
                                  {token}
                                </button>
                              ))
                            )}
                          </div>
                          {campaignMode === 'RECURRING' && (
                            <div className="rounded-xl border border-cyan-100 bg-cyan-50/30 p-3 space-y-2">
                              <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                                Exemplo de cada variável
                              </p>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                                {CAMPAIGN_RECURRING_VARIABLES.map((variable) => {
                                  const keyName = variable.key.replace(/^\{|\}$/g, '');
                                  const exampleValue = recurringPreviewExampleValues[keyName] || '-';
                                  return (
                                    <p key={`example_${variable.key}`} className="text-xs font-semibold text-slate-700">
                                      <span className="font-black text-emerald-700">{variable.key}</span>
                                      {' '}= {exampleValue}
                                    </p>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </section>

                    </div>
                      </>
                    )}

                    {campaignSubTab === 'GERENCIAR_CAMPANHA' && (
                      <div className="space-y-4">
                        <section className="rounded-2xl border border-cyan-100 bg-white p-5 space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Gerenciar campanhas</p>
                              <h4 className="text-lg font-black text-slate-900">Campanhas criadas</h4>
                            </div>
                            <button
                              type="button"
                              onClick={() => persistCampaignReports([])}
                              disabled={campaignReports.length === 0}
                              className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-black uppercase tracking-widest hover:bg-slate-50 disabled:opacity-60"
                            >
                              Limpar campanhas
                            </button>
                          </div>

                          {campaignReports.length === 0 ? (
                            <p className="text-sm font-semibold text-slate-500">Nenhuma campanha criada ainda.</p>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-sm">
                                <thead>
                                  <tr className="text-left text-[11px] uppercase tracking-widest text-slate-500 border-b border-slate-100">
                                    <th className="py-2 pr-3 font-black">Campanha</th>
                                    <th className="py-2 pr-3 font-black">Público</th>
                                    <th className="py-2 pr-3 font-black">Início</th>
                                    <th className="py-2 pr-3 font-black">Status</th>
                                    <th className="py-2 pr-3 font-black">Resultado</th>
                                    <th className="py-2 pr-3 font-black">Ações</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {campaignReports.map((item) => (
                                    <tr key={item.id} className="border-b border-slate-100 last:border-b-0">
                                      <td className="py-2 pr-3">
                                        <p className="font-black text-slate-800">{item.name}</p>
                                        <p className="text-xs font-semibold text-slate-500">
                                          {item.mode === 'BROADCAST' ? 'Envio Único' : item.mode === 'RECURRING' ? 'Recorrente' : 'Follow-up'}
                                          {' • '}
                                          intervalo médio {item.intervalSeconds}s
                                          {item.hasAttachment ? ' • com anexo' : ''}
                                          {item.withSignature ? ' • com assinatura' : ''}
                                        </p>
                                      </td>
                                      <td className="py-2 pr-3 font-semibold text-slate-600">
                                        {item.audience === 'ALL'
                                          ? 'Todos'
                                          : item.audience === 'ALUNO'
                                            ? 'Responsáveis'
                                            : item.audience === 'COLABORADOR'
                                              ? 'Colaboradores'
                                              : `Etiqueta: ${String(item.audience).replace('LABEL:', '')}`}
                                      </td>
                                      <td className="py-2 pr-3 font-semibold text-slate-600">{new Date(item.startAt).toLocaleString('pt-BR')}</td>
                                      <td className="py-2 pr-3">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className={`px-2 py-1 rounded-full text-[11px] font-black ${
                                            item.status === 'ENVIADA'
                                              ? 'bg-emerald-100 text-emerald-700'
                                              : item.status === 'AGENDADA'
                                                ? 'bg-cyan-100 text-cyan-700'
                                                : item.status === 'PARCIAL'
                                                  ? 'bg-amber-100 text-amber-700'
                                                  : 'bg-rose-100 text-rose-700'
                                          }`}>
                                            {item.status}
                                          </span>
                                          {item.paused && (
                                            <span className="px-2 py-1 rounded-full text-[11px] font-black bg-amber-100 text-amber-700">
                                              PAUSADA
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                      <td className="py-2 pr-3">
                                        <p className="text-xs font-semibold text-slate-600">
                                          Alvo: <span className="font-black">{item.targetCount}</span>
                                        </p>
                                        <p className="text-xs font-semibold text-slate-600">
                                          Enviadas: <span className="font-black text-emerald-700">{item.sentCount}</span> •
                                          Agendadas: <span className="font-black text-cyan-700"> {item.scheduledCount}</span> •
                                          Falhas: <span className="font-black text-rose-700"> {item.failedCount}</span>
                                        </p>
                                      </td>
                                      <td className="py-2 pr-3">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setCampaignName(item.name);
                                              setCampaignMode(item.mode);
                                              setCampaignAudience(item.audience);
                                              setCampaignIntervalMinSeconds(item.intervalSeconds);
                                              setCampaignIntervalMaxSeconds(item.intervalSeconds);
                                              setCampaignUseSignature(item.withSignature);
                                              setCampaignSendNow(item.status === 'ENVIADA');
                                              setCampaignRecurringTargetResponsible(item.audience === 'ALL' || item.audience === 'ALUNO');
                                              setCampaignRecurringTargetCollaborator(item.audience === 'ALL' || item.audience === 'COLABORADOR');
                                              setCampaignSubTab('NOVA_CAMPANHA');
                                              setFeedback(`Campanha "${item.name}" carregada para edição.`);
                                            }}
                                            className="px-2 py-1 rounded-lg text-[11px] font-black text-cyan-700 hover:bg-cyan-50"
                                          >
                                            Editar
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              persistCampaignReports(
                                                campaignReports.map((report) => (
                                                  report.id === item.id
                                                    ? { ...report, paused: !report.paused }
                                                    : report
                                                ))
                                              )
                                            }
                                            className={`px-2 py-1 rounded-lg text-[11px] font-black ${
                                              item.paused
                                                ? 'text-emerald-700 hover:bg-emerald-50'
                                                : 'text-amber-700 hover:bg-amber-50'
                                            }`}
                                          >
                                            {item.paused ? 'Retomar' : 'Pausar'}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => persistCampaignReports(campaignReports.filter((report) => report.id !== item.id))}
                                            className="p-1 rounded text-rose-600 hover:bg-rose-50"
                                            title="Excluir campanha"
                                          >
                                            <Trash2 size={14} />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </section>

                        <section className="rounded-2xl border border-cyan-100 bg-white p-5 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Histórico recorrente</p>
                              <h4 className="text-lg font-black text-slate-900">Recorrente (relatório em PDF)</h4>
                            </div>
                            <button
                              type="button"
                              onClick={() => persistPlanConsumptionReports([])}
                              disabled={planConsumptionReports.length === 0}
                              className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-black uppercase tracking-widest hover:bg-slate-50 disabled:opacity-60"
                            >
                              Limpar histórico
                            </button>
                          </div>

                          {planConsumptionReports.length === 0 ? (
                            <p className="text-sm font-semibold text-slate-500">Nenhum envio recorrente registrado ainda.</p>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-sm">
                                <thead>
                                  <tr className="text-left text-[11px] uppercase tracking-widest text-slate-500 border-b border-slate-100">
                                    <th className="py-2 pr-3 font-black">Data</th>
                                    <th className="py-2 pr-3 font-black">Modo</th>
                                    <th className="py-2 pr-3 font-black">Período</th>
                                    <th className="py-2 pr-3 font-black">Resultado</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {planConsumptionReports.map((item) => (
                                    <tr key={item.id} className="border-b border-slate-100 last:border-b-0">
                                      <td className="py-2 pr-3 font-semibold text-slate-600">{new Date(item.createdAt).toLocaleString('pt-BR')}</td>
                                      <td className="py-2 pr-3 font-semibold text-slate-600">{item.mode === 'NOW' ? 'Enviado agora' : 'Agendado'}</td>
                                      <td className="py-2 pr-3 font-semibold text-slate-600">{item.periodLabel}</td>
                                      <td className="py-2 pr-3 text-xs font-semibold text-slate-600">
                                        {item.sentCount} enviadas • {item.scheduledCount} agendadas • {item.failedCount} falhas
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </section>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {crmView === 'AI_CONFIG' && (
                <div className="flex-1 p-6 bg-slate-50/60 overflow-y-auto">
                  <div className="max-w-6xl mx-auto space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">AI Assistant</p>
                        <h3 className="text-3xl font-black text-slate-900">AI Assistant Configuration</h3>
                        <p className="text-sm font-semibold text-slate-500">Configure API, modelo, identidade e prompt global do assistente.</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const data = await ApiService.getWhatsAppAiFlowNodes();
                              const blob = new Blob([JSON.stringify(data?.flow || data, null, 2)], { type: 'application/json' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = 'whatsapp-ai-flow-nodes.json';
                              a.click();
                              URL.revokeObjectURL(url);
                              setFeedback('Nodes JSON do fluxo gerado com sucesso.');
                            } catch (err) {
                              setFeedback(err instanceof Error ? err.message : 'Falha ao gerar nodes JSON do fluxo.');
                            }
                          }}
                          className="px-4 py-2 rounded-xl border border-cyan-200 text-cyan-700 text-xs font-black uppercase tracking-widest hover:bg-cyan-50"
                        >
                          Exportar Nodes JSON
                        </button>
                        <button
                          type="button"
                          onClick={handleDiscardAiConfig}
                          disabled={!aiHasChanges}
                          className="px-4 py-2 rounded-xl border border-slate-300 text-slate-600 text-xs font-black uppercase tracking-widest hover:bg-white disabled:opacity-60"
                        >
                          Descartar
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveAiConfig}
                          disabled={!aiHasChanges}
                          className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 text-white text-xs font-black uppercase tracking-widest"
                        >
                          Salvar Alterações
                        </button>
                      </div>
                    </div>

                    <section className="rounded-2xl border border-cyan-100 bg-white p-5 space-y-3">
                      <p className="text-sm font-black text-slate-800">1. API e Modelo</p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <label className="space-y-1">
                          <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Escolher API</span>
                          <select
                            value={aiConfig.provider}
                            onChange={(e) => handleAiProviderChange(e.target.value as AiProvider)}
                            className="w-full px-3 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                          >
                            <option value="openai">OpenAI</option>
                            <option value="gemini">Gemini</option>
                            <option value="groq">GROQ</option>
                          </select>
                        </label>
                        <label className="space-y-1 md:col-span-2">
                          <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Modelo do agente</span>
                          <select
                            value={aiConfig.model}
                            onChange={(e) => setAiConfig((prev) => ({ ...prev, model: e.target.value }))}
                            className="w-full px-3 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                          >
                            {availableAiModels.map((model) => (
                              <option key={model} value={model}>{model}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <label className="space-y-1">
                          <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">OpenAI API Token</span>
                          <input
                            type="password"
                            value={aiConfig.openAiToken}
                            onChange={(e) => setAiConfig((prev) => ({ ...prev, openAiToken: e.target.value }))}
                            className="w-full px-3 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                            placeholder="sk-..."
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Google Gemini Token</span>
                          <input
                            type="password"
                            value={aiConfig.geminiToken}
                            onChange={(e) => setAiConfig((prev) => ({ ...prev, geminiToken: e.target.value }))}
                            className="w-full px-3 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                            placeholder="Gemini API Key"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">GROQ API Token</span>
                          <input
                            type="password"
                            value={aiConfig.groqToken}
                            onChange={(e) => setAiConfig((prev) => ({ ...prev, groqToken: e.target.value }))}
                            className="w-full px-3 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                            placeholder="gsk_..."
                          />
                        </label>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="rounded-xl border-2 border-cyan-100 bg-cyan-50/40 px-3 py-2.5 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">STT (áudio para texto)</p>
                            <p className="text-sm font-semibold text-slate-700">Transcrever áudios recebidos para o Agent AI.</p>
                          </div>
                          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={Boolean(aiConfig.sttEnabled)}
                              onChange={(e) => setAiConfig((prev) => ({ ...prev, sttEnabled: e.target.checked }))}
                              className="sr-only peer"
                            />
                            <span className="h-6 w-11 rounded-full bg-slate-300 transition-colors peer-checked:bg-emerald-500 relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
                            <span className={`text-xs font-black uppercase tracking-widest ${aiConfig.sttEnabled ? 'text-emerald-700' : 'text-slate-500'}`}>
                              {aiConfig.sttEnabled ? 'Ativado' : 'Desativado'}
                            </span>
                          </label>
                        </div>
                        <label className="space-y-1 md:col-span-2">
                          <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Modelo STT</span>
                          <select
                            value={aiConfig.sttModel}
                            onChange={(e) => setAiConfig((prev) => ({ ...prev, sttModel: e.target.value }))}
                            className="w-full px-3 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                          >
                            {availableSttModels.map((model) => (
                              <option key={model} value={model}>{model}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <p className="text-[11px] font-semibold text-slate-500">
                        Se a API selecionada não suportar STT, o backend usa fallback automático para Groq/OpenAI quando houver token.
                      </p>
                    </section>

                    <section className="rounded-2xl border border-cyan-100 bg-white p-5 space-y-3">
                      <p className="text-sm font-black text-slate-800">3. Tools do Agent AI</p>
                      <p className="text-xs font-semibold text-slate-500">Escolha quais ferramentas o agente pode usar para consultar dados e executar ações automáticas.</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {([
                          { key: 'dbStats', label: 'Tool DB Stats', desc: 'Resumo estatístico do banco para contexto da IA.' },
                          { key: 'companyInfo', label: 'Dados da Empresa', desc: 'Consulta dados cadastrais da empresa/unidade ativa.' },
                          { key: 'businessHours', label: 'Horário Comercial', desc: 'Consulta dias e horários de atendimento da unidade.' },
                          { key: 'searchClients', label: 'Buscar Clientes', desc: 'Consulta clientes/responsáveis na base.' },
                          { key: 'searchProducts', label: 'Buscar Produtos', desc: 'Consulta produtos e preços.' },
                          { key: 'searchPlans', label: 'Buscar Planos', desc: 'Consulta planos e valores.' },
                          { key: 'searchPlanValues', label: 'Planos e Valores', desc: 'Consulta planos ativos/inativos e seus valores.' },
                          { key: 'searchMenu', label: 'Cardápio', desc: 'Consulta itens de cardápio (lanche, almoço, marmita, etc).' },
                          { key: 'searchNutritionalBase', label: 'Base Nutricional', desc: 'Consulta calorias e informações nutricionais.' },
                          { key: 'searchAvailableProducts', label: 'Produtos Disponíveis', desc: 'Consulta produtos ativos e disponíveis em estoque.' },
                          { key: 'searchTransactions', label: 'Buscar Transações', desc: 'Consulta consumos, créditos e extrato.' },
                          { key: 'searchOrders', label: 'Buscar Pedidos', desc: 'Consulta pedidos e status.' },
                          { key: 'autoSendPdfReport', label: 'Auto Enviar PDF de Relatório', desc: 'Ao pedir saldo/consumo/relatório, envia PDF automático.' },
                        ] as Array<{ key: keyof AiToolsConfigState; label: string; desc: string }>).map((tool) => {
                          const isOn = Boolean(aiConfig.tools?.[tool.key]);
                          return (
                            <label
                              key={tool.key}
                              className={`rounded-xl border-2 px-3 py-2.5 flex items-start justify-between gap-3 cursor-pointer ${isOn ? 'border-emerald-300 bg-emerald-50/50' : 'border-cyan-100 bg-slate-50/60'}`}
                            >
                              <div className="min-w-0">
                                <p className={`text-sm font-black ${isOn ? 'text-emerald-700' : 'text-slate-700'}`}>{tool.label}</p>
                                <p className="text-[11px] font-semibold text-slate-500">{tool.desc}</p>
                              </div>
                              <input
                                type="checkbox"
                                checked={isOn}
                                onChange={(e) => setAiConfig((prev) => ({
                                  ...prev,
                                  tools: {
                                    ...prev.tools,
                                    [tool.key]: e.target.checked
                                  }
                                }))}
                                className="mt-1 h-4 w-4 rounded border-cyan-300 text-emerald-600 focus:ring-emerald-400"
                              />
                            </label>
                          );
                        })}
                      </div>
                    </section>

                    <section className="rounded-2xl border border-cyan-100 bg-white p-5 space-y-3">
                      <p className="text-sm font-black text-slate-800">4. Identidade e Prompt</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className="space-y-1">
                          <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Nome da empresa</span>
                          <input
                            value={aiConfig.companyName}
                            onChange={(e) => setAiConfig((prev) => ({ ...prev, companyName: e.target.value }))}
                            className="w-full px-3 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                            placeholder="Cantina Smart"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Nome do assistente</span>
                          <input
                            value={aiConfig.assistantName}
                            onChange={(e) => setAiConfig((prev) => ({ ...prev, assistantName: e.target.value }))}
                            className="w-full px-3 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                            placeholder="Assistente Cantina"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Tempo de espera para responder (segundos)</span>
                          <input
                            type="number"
                            min={0}
                            max={120}
                            value={aiConfig.responseDelaySeconds}
                            onChange={(e) => setAiConfig((prev) => ({
                              ...prev,
                              responseDelaySeconds: Math.max(0, Math.min(120, Number(e.target.value || 0))),
                            }))}
                            className="w-full px-3 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Tempo para manter sessão de conversa (minutos)</span>
                          <input
                            type="number"
                            min={1}
                            max={1440}
                            value={aiConfig.conversationSessionMinutes}
                            onChange={(e) => setAiConfig((prev) => ({
                              ...prev,
                              conversationSessionMinutes: Math.max(1, Math.min(1440, Number(e.target.value || 60))),
                            }))}
                            className="w-full px-3 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                          />
                        </label>
                        <div className="md:col-span-2 rounded-xl border-2 border-cyan-100 bg-cyan-50/40 px-3 py-2.5 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Ajustes de atendimento</p>
                            <p className="text-sm font-semibold text-slate-700">Ativar agente IA apenas fora do horário comercial da unidade.</p>
                          </div>
                          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={Boolean(aiConfig.onlyOutsideBusinessHours)}
                              onChange={(e) => setAiConfig((prev) => ({ ...prev, onlyOutsideBusinessHours: e.target.checked }))}
                              className="sr-only peer"
                            />
                            <span className="h-6 w-11 rounded-full bg-slate-300 transition-colors peer-checked:bg-emerald-500 relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
                            <span className={`text-xs font-black uppercase tracking-widest ${aiConfig.onlyOutsideBusinessHours ? 'text-emerald-700' : 'text-slate-500'}`}>
                              {aiConfig.onlyOutsideBusinessHours ? 'Ativado' : 'Desativado'}
                            </span>
                          </label>
                        </div>
                      </div>
                      <label className="space-y-1 block">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">System Context / Prompt</span>
                          <span className="text-[11px] font-bold text-slate-400">{aiConfig.globalPrompt.length}/5000</span>
                        </div>
                        <textarea
                          value={aiConfig.globalPrompt}
                          onChange={(e) => setAiConfig((prev) => ({ ...prev, globalPrompt: e.target.value.slice(0, 5000) }))}
                          rows={5}
                          className="w-full px-3 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-medium"
                        />
                      </label>
                      <div className="space-y-1">
                        <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Variáveis dinâmicas</span>
                        <div className="flex flex-wrap gap-2">
                          {aiSystemVariables.map((item) => (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => handleInsertAiVariable(item.key)}
                              className="px-3 py-1 rounded-full text-[11px] font-black bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                              title={item.label}
                            >
                              {item.key}
                            </button>
                          ))}
                        </div>
                      </div>
                    </section>

                  </div>
                </div>
              )}

              {crmView === 'AI_FLOW' && (
                <div className="flex-1 p-6 bg-slate-50/60 overflow-y-auto">
                  <div className="max-w-7xl mx-auto space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">AI Fluxo</p>
                        <h3 className="text-3xl font-black text-slate-900">Builder Visual do Assistente</h3>
                        <p className="text-sm font-semibold text-slate-500">Fluxo: Mensagem recebida → Classificador IA → Switch de Contexto → Sub-switch de Ações → Prompt final de resposta.</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleDiscardAiConfig}
                          disabled={!aiHasChanges}
                          className="px-4 py-2 rounded-xl border border-slate-300 text-slate-600 text-xs font-black uppercase tracking-widest hover:bg-white disabled:opacity-60"
                        >
                          Descartar
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveAiConfig}
                          disabled={!aiHasChanges}
                          className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 text-white text-xs font-black uppercase tracking-widest"
                        >
                          Salvar Fluxo
                        </button>
                      </div>
                    </div>

                    <section className="rounded-2xl border border-cyan-100 bg-white p-4">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div>
                          <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Canvas do Fluxo</p>
                          <p className="text-sm font-semibold text-slate-600">Arraste os blocos para organizar o fluxo visual do assistente.</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleAddAiContext}
                            className="px-3 py-2 rounded-xl bg-emerald-500 text-white text-xs font-black uppercase tracking-widest hover:bg-emerald-600"
                          >
                            + Contexto
                          </button>
                          <button
                            type="button"
                            onClick={() => setAiFlowNodePositions({})}
                            className="px-3 py-2 rounded-xl border border-slate-300 text-slate-600 text-xs font-black uppercase tracking-widest hover:bg-slate-50"
                          >
                            Resetar Layout
                          </button>
                        </div>
                      </div>

                      <div className="relative h-[520px] overflow-auto rounded-xl border border-cyan-100 bg-[#0b1220]">
                        <div
                          className="relative min-w-[1920px] min-h-[1200px]"
                          style={{
                            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(148,163,184,0.25) 1px, transparent 0)',
                            backgroundSize: '22px 22px',
                          }}
                        >
                          <svg className="absolute inset-0 w-full h-full pointer-events-none">
                            {aiFlowVisualEdges.map((edge) => {
                              const source = aiFlowVisualNodeMap.get(edge.source);
                              const target = aiFlowVisualNodeMap.get(edge.target);
                              if (!source || !target) return null;
                              const sx = source.x + source.width;
                              const sy = source.y + (source.height / 2);
                              const tx = target.x;
                              const ty = target.y + (target.height / 2);
                              const cx1 = sx + Math.max(60, (tx - sx) * 0.35);
                              const cx2 = tx - Math.max(60, (tx - sx) * 0.35);
                              const path = `M ${sx} ${sy} C ${cx1} ${sy}, ${cx2} ${ty}, ${tx} ${ty}`;
                              const labelX = (sx + tx) / 2;
                              const labelY = (sy + ty) / 2 - 8;

                              return (
                                <g key={edge.id}>
                                  <path d={path} stroke="rgba(94,234,212,0.55)" strokeWidth="2.2" fill="none" />
                                  {edge.label && (
                                    <text x={labelX} y={labelY} fill="rgba(226,232,240,0.85)" fontSize="11" textAnchor="middle">
                                      {edge.label}
                                    </text>
                                  )}
                                </g>
                              );
                            })}
                          </svg>

                          {aiFlowVisualNodes.map((node) => {
                            const isSelected = selectedAiFlowNodeId === node.id;
                            const tone = node.kind === 'trigger'
                              ? 'from-emerald-600 to-teal-500'
                              : node.kind === 'classifier'
                                ? 'from-indigo-600 to-cyan-500'
                                : node.kind === 'switch'
                                  ? 'from-amber-600 to-orange-500'
                                  : node.kind === 'context'
                                    ? 'from-cyan-600 to-sky-500'
                                    : node.kind === 'subswitch'
                                      ? 'from-violet-600 to-fuchsia-500'
                                      : 'from-rose-600 to-pink-500';

                            return (
                              <button
                                key={node.id}
                                type="button"
                                onMouseDown={(event) => handleAiFlowNodeMouseDown(event, node.id)}
                                onClick={() => {
                                  setSelectedAiFlowNodeId(node.id);
                                  if (node.contextId) setSelectedAiContextId(node.contextId);
                                }}
                                className={`absolute text-left rounded-2xl border ${isSelected ? 'border-white/80 ring-2 ring-cyan-300/80' : 'border-white/20'} bg-slate-900/92 shadow-xl cursor-move`}
                                style={{
                                  left: node.x,
                                  top: node.y,
                                  width: node.width,
                                  height: node.height,
                                }}
                              >
                                <div className={`px-3 py-2 rounded-t-2xl bg-gradient-to-r ${tone}`}>
                                  <p className="text-[10px] font-black uppercase tracking-widest text-white/90">{node.kind}</p>
                                </div>
                                <div className="px-3 py-2">
                                  <p className="text-sm font-black text-slate-100 truncate">{node.label}</p>
                                  <p className="text-[11px] font-semibold text-slate-400 truncate">{node.id}</p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </section>

                    <section className="rounded-2xl border border-cyan-100 bg-white p-5 space-y-4">
                      {!selectedAiContext ? (
                        <p className="text-sm font-semibold text-slate-500">Selecione ou crie um contexto para editar o fluxo.</p>
                      ) : (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
                            <label className="space-y-1">
                              <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Nome do contexto</span>
                              <input
                                value={selectedAiContext.name}
                                onChange={(e) => handleAiContextPatch(selectedAiContext.id, { name: e.target.value })}
                                className="w-full px-3 py-2 rounded-xl border border-cyan-100 bg-white text-sm font-semibold"
                              />
                            </label>
                            <div className="flex items-center gap-2">
                              <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-600">
                                <input
                                  type="checkbox"
                                  checked={selectedAiContext.enabled}
                                  onChange={(e) => handleAiContextPatch(selectedAiContext.id, { enabled: e.target.checked })}
                                />
                                Ativo
                              </label>
                              <button
                                type="button"
                                onClick={() => handleDeleteAiContext(selectedAiContext.id)}
                                className="p-2 rounded-lg text-rose-600 hover:bg-rose-50"
                                title="Excluir contexto"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <label className="space-y-1 block">
                              <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Descrição</span>
                              <input
                                value={selectedAiContext.description}
                                onChange={(e) => handleAiContextPatch(selectedAiContext.id, { description: e.target.value })}
                                className="w-full px-3 py-2 rounded-xl border border-cyan-100 bg-white text-sm font-semibold"
                              />
                            </label>
                            <label className="space-y-1 block">
                              <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Palavras-chave de entrada (separadas por vírgula)</span>
                              <input
                                value={selectedAiContext.conditionKeywords.join(', ')}
                                onChange={(e) => handleAiContextKeywordsChange(selectedAiContext.id, e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-cyan-100 bg-white text-sm font-semibold"
                                placeholder="saldo, consumo, relatorio"
                              />
                            </label>
                          </div>

                          <label className="space-y-1 block">
                            <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Prompt do contexto</span>
                            <textarea
                              value={selectedAiContext.prompt}
                              onChange={(e) => handleAiContextPatch(selectedAiContext.id, { prompt: e.target.value })}
                              rows={3}
                              className="w-full px-3 py-2 rounded-xl border border-cyan-100 bg-white text-sm font-medium"
                            />
                          </label>

                          <label className="space-y-1 block">
                            <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Bloco final padrão: Prompt de resposta</span>
                            <textarea
                              value={selectedAiContext.responsePrompt}
                              onChange={(e) => handleAiContextPatch(selectedAiContext.id, { responsePrompt: e.target.value })}
                              rows={2}
                              className="w-full px-3 py-2 rounded-xl border border-cyan-100 bg-white text-sm font-medium"
                            />
                          </label>

                          <div className="rounded-xl border border-cyan-100 p-3 bg-slate-50/40">
                            <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Dados base para consulta no contexto</p>
                            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                              {AI_CONTEXT_DATA_OPTIONS.map((item) => {
                                const checked = selectedAiContext.dataSelections.includes(item.key);
                                return (
                                  <label
                                    key={`ctx-base-${item.key}`}
                                    className={`flex items-start gap-2 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer ${checked ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-cyan-100 bg-white text-slate-700'}`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => handleToggleAiDataSelection(selectedAiContext.id, item.key)}
                                      className="mt-0.5"
                                    />
                                    <div>
                                      <p>{item.label}</p>
                                      <p className="text-[10px] text-slate-500">{item.variable}</p>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          </div>

                          <div className="rounded-xl border border-cyan-100 p-3 bg-slate-50/40">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Sub-switches do contexto</p>
                              <button
                                type="button"
                                onClick={() => handleAddAiSubSwitch(selectedAiContext.id)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-[11px] font-black uppercase tracking-widest hover:bg-emerald-600"
                              >
                                + Sub-switch
                              </button>
                            </div>
                            <div className="mt-3 space-y-3">
                              {selectedAiContext.subSwitches.length === 0 ? (
                                <p className="text-sm font-semibold text-slate-500">Nenhum sub-switch cadastrado.</p>
                              ) : selectedAiContext.subSwitches.map((sub) => (
                                <div key={sub.id} className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-2">
                                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
                                    <label className="space-y-1">
                                      <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Nome do sub-switch</span>
                                      <input
                                        value={sub.name}
                                        onChange={(e) => handlePatchAiSubSwitch(selectedAiContext.id, sub.id, { name: e.target.value })}
                                        className="w-full px-3 py-2 rounded-xl border border-amber-200 bg-white text-sm font-semibold"
                                      />
                                    </label>
                                    <div className="flex items-center gap-2">
                                      <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700">
                                        <input
                                          type="checkbox"
                                          checked={sub.enabled}
                                          onChange={(e) => handlePatchAiSubSwitch(selectedAiContext.id, sub.id, { enabled: e.target.checked })}
                                        />
                                        Ativo
                                      </label>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteAiSubSwitch(selectedAiContext.id, sub.id)}
                                        className="p-2 rounded-lg text-rose-600 hover:bg-rose-50"
                                        title="Excluir sub-switch"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  </div>

                                  <label className="space-y-1 block">
                                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Descrição</span>
                                    <input
                                      value={sub.description}
                                      onChange={(e) => handlePatchAiSubSwitch(selectedAiContext.id, sub.id, { description: e.target.value })}
                                      className="w-full px-3 py-2 rounded-xl border border-amber-200 bg-white text-sm font-semibold"
                                    />
                                  </label>

                                  <label className="space-y-1 block">
                                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Condição (palavras-chave separadas por vírgula)</span>
                                    <input
                                      value={sub.conditionKeywords.join(', ')}
                                      onChange={(e) => handleSubSwitchKeywordsChange(selectedAiContext.id, sub.id, e.target.value)}
                                      className="w-full px-3 py-2 rounded-xl border border-amber-200 bg-white text-sm font-semibold"
                                      placeholder="ex: saldo, consumo"
                                    />
                                  </label>

                                  <div className="space-y-2">
                                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Dados para consulta no sistema</p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                      {AI_CONTEXT_DATA_OPTIONS.map((item) => {
                                        const checked = sub.dataSelections.includes(item.key);
                                        return (
                                          <label
                                            key={`${sub.id}-${item.key}`}
                                            className={`flex items-start gap-2 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer ${checked ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-white text-slate-700'}`}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={checked}
                                              onChange={() => handleToggleAiSubSwitchSelection(selectedAiContext.id, sub.id, item.key)}
                                              className="mt-0.5"
                                            />
                                            <div>
                                              <p>{item.label}</p>
                                              <p className="text-[10px] text-slate-500">{item.variable}</p>
                                            </div>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  <label className="space-y-1 block">
                                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Bloco final: Prompt de resposta ao cliente</span>
                                    <textarea
                                      value={sub.responsePrompt}
                                      onChange={(e) => handlePatchAiSubSwitch(selectedAiContext.id, sub.id, { responsePrompt: e.target.value })}
                                      rows={3}
                                      className="w-full px-3 py-2 rounded-xl border border-amber-200 bg-white text-sm font-medium"
                                    />
                                  </label>
                                </div>
                              ))}
                            </div>
                          </div>

                          <label className="space-y-1 block max-w-md">
                            <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Ação final do contexto</span>
                            <select
                              value={selectedAiContext.actionType}
                              onChange={(e) => handleAiContextPatch(selectedAiContext.id, { actionType: e.target.value as AiContextActionType })}
                              className="w-full px-3 py-2.5 rounded-xl border border-cyan-100 bg-white text-sm font-semibold"
                            >
                              <option value="RESPONDER_CLIENTE">Responder diretamente ao cliente</option>
                              <option value="ATENDIMENTO_HUMANO">Encaminhar para atendimento humano</option>
                            </select>
                          </label>
                        </>
                      )}
                    </section>
                  </div>
                </div>
              )}

              {crmView === 'CONTATOS' && (
                <div className="flex-1 p-5 bg-slate-50/60 space-y-4 overflow-y-auto">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h3 className="text-3xl font-black text-slate-900">Contatos</h3>
                      <p className="text-sm font-semibold text-slate-500">Gerencie sua lista de leads e clientes do WhatsApp.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        ref={contactsImportInputRef}
                        type="file"
                        accept=".csv,text/csv"
                        className="hidden"
                        onChange={handleImportContactsFile}
                      />
                      <button
                        type="button"
                        onClick={() => contactsImportInputRef.current?.click()}
                        disabled={isImportingContacts}
                        className="px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-100 text-slate-700 text-xs font-black uppercase tracking-widest hover:bg-slate-200 disabled:opacity-60"
                      >
                        {isImportingContacts ? 'Importando...' : 'Importar Contatos'}
                      </button>
                      <button
                        type="button"
                        onClick={openCreateContactModal}
                        className="px-4 py-2.5 rounded-xl bg-emerald-500 text-white text-xs font-black uppercase tracking-widest hover:bg-emerald-600 flex items-center gap-2"
                      >
                        <Plus size={14} />
                        Adicionar Contato
                      </button>
                    </div>
                  </div>

                  <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-2xl border border-cyan-100 bg-white px-4 py-3">
                      <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Total de contatos</p>
                      <p className="mt-1 text-2xl font-black text-slate-900">{crmContactRows.length}</p>
                    </div>
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 px-4 py-3">
                      <p className="text-[11px] font-black uppercase tracking-widest text-emerald-700">Ativos</p>
                      <p className="mt-1 text-2xl font-black text-emerald-700">
                        {crmContactRows.filter((row) => row.statusLabel === 'ACTIVE').length}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-100/70 px-4 py-3">
                      <p className="text-[11px] font-black uppercase tracking-widest text-slate-600">Inativos</p>
                      <p className="mt-1 text-2xl font-black text-slate-700">
                        {crmContactRows.filter((row) => row.statusLabel === 'INACTIVE').length}
                      </p>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-cyan-100 bg-white p-4 space-y-3">
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_170px_auto] gap-3 items-center">
                      <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          value={contactSearchTerm}
                          onChange={(e) => setContactSearchTerm(e.target.value)}
                          placeholder="Pesquisar por nome, telefone ou e-mail..."
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-medium bg-slate-50"
                        />
                      </div>
                      <select
                        value={contactStatusFilter}
                        onChange={(e) => setContactStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
                        className="w-full px-3 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold bg-slate-50"
                      >
                        <option value="ALL">Status: Todos</option>
                        <option value="ACTIVE">Ativo</option>
                        <option value="INACTIVE">Inativo</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => setContactSortBy((prev) => (prev === 'LAST_CONTACT' ? 'NAME' : 'LAST_CONTACT'))}
                        className="w-full lg:w-auto px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-100 text-slate-700 text-xs font-black uppercase tracking-widest hover:bg-slate-200"
                      >
                        {contactSortBy === 'LAST_CONTACT' ? 'Último Contato' : 'Nome A-Z'}
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setContactTagFilter('ALL')}
                        className={`px-3 py-1 rounded-full text-xs font-black ${contactTagFilter === 'ALL' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'}`}
                      >
                        Todas as tags
                      </button>
                      {crmContactAvailableTags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setContactTagFilter(tag)}
                          className={`px-3 py-1 rounded-full text-xs font-black ${contactTagFilter === tag ? 'bg-cyan-500 text-white' : 'bg-cyan-50 text-cyan-700 border border-cyan-100'}`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-cyan-100 bg-white overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[980px]">
                        <thead className="bg-slate-50 border-b border-cyan-100">
                          <tr>
                            <th className="px-4 py-3 text-left">
                              <input
                                type="checkbox"
                                checked={crmContactPageRows.length > 0 && crmContactPageRows.every((row) => selectedContactIds.includes(row.id))}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  const pageIds = crmContactPageRows.map((row) => row.id);
                                  setSelectedContactIds((prev) => {
                                    if (checked) return Array.from(new Set([...prev, ...pageIds]));
                                    return prev.filter((id) => !pageIds.includes(id));
                                  });
                                }}
                              />
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-slate-500">Contato</th>
                            <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-slate-500">Telefone</th>
                            <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-slate-500">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-slate-500">Tags</th>
                            <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-slate-500">Última interação</th>
                            <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-widest text-slate-500">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {crmContactPageRows.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                                Nenhum contato encontrado para os filtros selecionados.
                              </td>
                            </tr>
                          ) : crmContactPageRows.map((row) => {
                            const initials = String(row.client.name || '?')
                              .split(' ')
                              .filter(Boolean)
                              .slice(0, 2)
                              .map((part) => part[0]?.toUpperCase() || '')
                              .join('') || '?';

                            return (
                              <tr key={row.id} className="border-b border-cyan-50 hover:bg-cyan-50/40">
                                <td className="px-4 py-3 align-top">
                                  <input
                                    type="checkbox"
                                    checked={selectedContactIds.includes(row.id)}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      setSelectedContactIds((prev) => (
                                        checked
                                          ? Array.from(new Set([...prev, row.id]))
                                          : prev.filter((id) => id !== row.id)
                                      ));
                                    }}
                                  />
                                </td>
                                <td className="px-4 py-3 align-top">
                                  <div className="flex items-start gap-3">
                                    <div className="w-10 h-10 rounded-full overflow-hidden border border-cyan-100 bg-cyan-100 flex items-center justify-center text-xs font-black text-cyan-700 shrink-0">
                                      {row.client.photo ? (
                                        <img src={row.client.photo} alt={row.client.name} className="w-full h-full object-cover" />
                                      ) : initials}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <p className="text-base font-black text-slate-800 truncate">{row.client.name}</p>
                                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                          String(row.client.type || '').toUpperCase() === 'COLABORADOR'
                                            ? 'bg-violet-100 text-violet-700'
                                            : 'bg-indigo-100 text-indigo-700'
                                        }`}>
                                          {String(row.client.type || '').toUpperCase() === 'COLABORADOR' ? 'Colaborador' : 'Aluno'}
                                        </span>
                                      </div>
                                      <p className="text-xs font-semibold text-slate-500 truncate">{row.client.email || '-'}</p>
                                      {!!resolveResponsibleName(row.client) && (
                                        <p className="text-[11px] font-bold text-emerald-700 truncate">
                                          Responsável: {resolveResponsibleName(row.client)}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3 align-top text-sm font-bold text-slate-700">
                                  {row.phone ? formatPhoneWithCountryTag(row.phone, true) : '-'}
                                </td>
                                <td className="px-4 py-3 align-top">
                                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-black ${row.statusLabel === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                                    {row.statusLabel === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 align-top">
                                  <div className="flex flex-wrap gap-1.5">
                                    {row.tags.length > 0 ? row.tags.map((tag) => (
                                      <span key={tag} className="px-2 py-0.5 rounded-full bg-violet-50 border border-violet-100 text-violet-700 text-[10px] font-black uppercase tracking-wide">
                                        {tag}
                                      </span>
                                    )) : (
                                      <span className="text-xs font-semibold text-slate-400">Sem tags</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3 align-top">
                                  <p className="text-sm font-bold text-slate-700">{formatLastInteractionLabel(row.chat?.lastTimestamp)}</p>
                                  <p className="text-xs font-semibold text-slate-500 truncate max-w-[220px]">{row.chat?.lastMessage || 'Sem histórico'}</p>
                                </td>
                                <td className="px-4 py-3 align-top text-right relative">
                                  <button
                                    type="button"
                                    onClick={() => setActiveContactMenuId((prev) => (prev === row.id ? null : row.id))}
                                    className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
                                  >
                                    <MoreVertical size={16} />
                                  </button>
                                  {activeContactMenuId === row.id && (
                                    <div className="absolute right-4 mt-1 w-36 rounded-xl border border-slate-200 bg-white shadow-lg z-20 text-left overflow-hidden">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setActiveContactMenuId(null);
                                          openEditContactModal(row.client);
                                        }}
                                        className="w-full px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                      >
                                        Editar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setActiveContactMenuId(null);
                                          handleDeleteContact(row.id);
                                        }}
                                        className="w-full px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
                                      >
                                        Excluir
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="px-4 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-t border-cyan-100 bg-white">
                      <div className="text-sm font-semibold text-slate-600">
                        Exibindo {(safeContactPage - 1) * CONTACTS_PAGE_SIZE + (crmContactPageRows.length > 0 ? 1 : 0)}
                        {' '}- {(safeContactPage - 1) * CONTACTS_PAGE_SIZE + crmContactPageRows.length}
                        {' '}de {crmContactRows.length} contatos
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedContactIds.length > 0 && (
                          <button
                            type="button"
                            onClick={handleDeleteSelectedContacts}
                            className="px-3 py-2 rounded-lg bg-rose-600 text-white text-xs font-black uppercase tracking-widest hover:bg-rose-700"
                          >
                            Excluir selecionados ({selectedContactIds.length})
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setContactPage((prev) => Math.max(1, prev - 1))}
                          disabled={safeContactPage <= 1}
                          className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-black text-slate-600 disabled:opacity-50"
                        >
                          {'<'}
                        </button>
                        {Array.from({ length: Math.min(4, crmContactTotalPages) }).map((_, index) => {
                          const pageNumber = index + 1;
                          return (
                            <button
                              key={pageNumber}
                              type="button"
                              onClick={() => setContactPage(pageNumber)}
                              className={`w-8 h-8 rounded-lg text-xs font-black ${safeContactPage === pageNumber ? 'bg-emerald-500 text-white' : 'border border-slate-200 text-slate-600'}`}
                            >
                              {pageNumber}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => setContactPage((prev) => Math.min(crmContactTotalPages, prev + 1))}
                          disabled={safeContactPage >= crmContactTotalPages}
                          className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-black text-slate-600 disabled:opacity-50"
                        >
                          {'>'}
                        </button>
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {crmView === 'CONTA' && (
                <div className="flex-1 p-8 bg-slate-50/60">
                  <div className="rounded-2xl border border-cyan-100 bg-white p-6 max-w-2xl">
                    <p className="text-lg font-black text-slate-900">Conta</p>
                    <p className="mt-2 text-sm font-semibold text-slate-500">
                      Esta seção permanece para ajustes de conta e preferências da operação.
                    </p>
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCrmView('CONVERSAS')}
                        className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black uppercase tracking-widest"
                      >
                        Abrir Conversas
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('SESSION_QR')}
                        className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-black uppercase tracking-widest"
                      >
                        Abrir Sessão QR
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isContactModalOpen && (
        <div className="fixed inset-0 z-[90] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white border border-cyan-100 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-cyan-100 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-cyan-600">CRM WhatsApp</p>
                <h3 className="text-lg font-black text-slate-900">
                  {contactModalMode === 'CREATE' ? 'Adicionar contato' : 'Editar contato'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsContactModalOpen(false)}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="md:col-span-2 space-y-1">
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Nome</span>
                <input
                  value={contactForm.name}
                  onChange={(e) => setContactForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                  placeholder="Nome completo do contato"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Código País</span>
                <input
                  value={contactForm.countryCode}
                  onChange={(e) => setContactForm((prev) => ({ ...prev, countryCode: normalizePhone(e.target.value).slice(0, 4) }))}
                  className="w-full px-3 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                  placeholder="55"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Telefone</span>
                <input
                  value={contactForm.phone}
                  onChange={(e) => setContactForm((prev) => ({ ...prev, phone: normalizePhone(e.target.value).slice(0, 13) }))}
                  className="w-full px-3 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                  placeholder="DDD + número"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Tipo</span>
                <select
                  value={contactForm.type}
                  onChange={(e) => setContactForm((prev) => ({ ...prev, type: e.target.value as 'ALUNO' | 'COLABORADOR' | 'RESPONSAVEL' }))}
                  className="w-full px-3 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                >
                  <option value="ALUNO">Aluno</option>
                  <option value="COLABORADOR">Colaborador</option>
                  <option value="RESPONSAVEL">Responsável</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">E-mail</span>
                <input
                  value={contactForm.email}
                  onChange={(e) => setContactForm((prev) => ({ ...prev, email: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                  placeholder="email@dominio.com"
                />
              </label>
              <label className="md:col-span-2 space-y-1">
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Responsável (quando aplicável)</span>
                <input
                  value={contactForm.responsibleName}
                  onChange={(e) => setContactForm((prev) => ({ ...prev, responsibleName: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
                  placeholder="Nome do responsável"
                />
              </label>
              <label className="md:col-span-2 inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={contactForm.isActive}
                  onChange={(e) => setContactForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                />
                Contato ativo
              </label>
            </div>
            <div className="px-5 py-4 border-t border-cyan-100 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsContactModalOpen(false)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-black uppercase tracking-widest hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveContact}
                disabled={isSavingContact}
                className="px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 text-white text-xs font-black uppercase tracking-widest"
              >
                {isSavingContact ? 'Salvando...' : 'Salvar Contato'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isScheduleModalOpen && (
        <div className="fixed inset-0 z-[85] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-cyan-100 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-cyan-100 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-cyan-600">CRM Admin</p>
                <h3 className="text-lg font-black text-slate-900">Agendar mensagem</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsScheduleModalOpen(false)}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-semibold"
              />
              <p className="text-xs font-semibold text-slate-500">
                Use o campo de mensagem do chat e/ou anexo para definir o conteúdo antes de agendar.
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsScheduleModalOpen(false)}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-black uppercase tracking-widest hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const scheduled = await handleScheduleMessage();
                    if (scheduled) {
                      setIsScheduleModalOpen(false);
                    }
                  }}
                  disabled={isScheduling}
                  className="px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 text-white text-xs font-black uppercase tracking-widest"
                >
                  {isScheduling ? 'Agendando...' : 'Agendar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'DISPAROS' && (
        <div className="py-2">
          <CentralDisparos activeEnterprise={activeEnterprise} />
        </div>
      )}

      {activeTab === 'SESSION_QR' && (
        <div className="py-2">
          <WhatsAppQrConnector variant="session" />
        </div>
      )}

      {feedback && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-700">
          {feedback}
        </div>
      )}

      {isNewChatModalOpen && (
        <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-[760px] h-[90vh] rounded-[28px] bg-white shadow-2xl border border-gray-100 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Conversas</p>
                <h3 className="text-lg font-black text-gray-900">Nova Conversa</h3>
              </div>
              <button onClick={() => setIsNewChatModalOpen(false)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label
                  className={`relative flex items-start gap-3 rounded-2xl border-2 px-4 py-4 cursor-pointer transition-all ${
                    newChatMode === 'AGENDA'
                      ? 'border-emerald-500 bg-emerald-50 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]'
                      : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={newChatMode === 'AGENDA'}
                    onChange={() => {
                      setNewChatMode('AGENDA');
                      setSelectedAgendaClientId(null);
                    }}
                    className="w-4 h-4 mt-0.5 accent-emerald-600"
                  />
                  <div className="min-w-0">
                    <p className={`text-xs font-black uppercase tracking-widest ${newChatMode === 'AGENDA' ? 'text-emerald-700' : 'text-gray-700'}`}>
                      Buscar na agenda
                    </p>
                    <p className={`text-[11px] font-semibold mt-1 ${newChatMode === 'AGENDA' ? 'text-emerald-700/80' : 'text-gray-500'}`}>
                      Selecione um cliente ja cadastrado no sistema
                    </p>
                  </div>
                  {newChatMode === 'AGENDA' && (
                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest">
                      Ativo
                    </span>
                  )}
                </label>
                <label
                  className={`relative flex items-start gap-3 rounded-2xl border-2 px-4 py-4 cursor-pointer transition-all ${
                    newChatMode === 'NEW_CONTACT'
                      ? 'border-indigo-500 bg-indigo-50 shadow-[0_0_0_3px_rgba(99,102,241,0.15)]'
                      : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={newChatMode === 'NEW_CONTACT'}
                    onChange={() => setNewChatMode('NEW_CONTACT')}
                    className="w-4 h-4 mt-0.5 accent-indigo-600"
                  />
                  <div className="min-w-0">
                    <p className={`text-xs font-black uppercase tracking-widest ${newChatMode === 'NEW_CONTACT' ? 'text-indigo-700' : 'text-gray-700'}`}>
                      Criar novo contato
                    </p>
                    <p className={`text-[11px] font-semibold mt-1 ${newChatMode === 'NEW_CONTACT' ? 'text-indigo-700/80' : 'text-gray-500'}`}>
                      Cadastra nome e telefone, salva no banco e inicia chat
                    </p>
                  </div>
                  {newChatMode === 'NEW_CONTACT' && (
                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest">
                      Ativo
                    </span>
                  )}
                </label>
              </div>

              {newChatMode === 'AGENDA' ? (
                <div className="space-y-4">
                  <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      value={agendaSearch}
                      onChange={(e) => setAgendaSearch(e.target.value)}
                      placeholder="Buscar cliente por nome, telefone ou responsável"
                      className="w-full pl-10 pr-4 py-3 rounded-2xl border-2 border-gray-100 focus:border-indigo-500 outline-none text-sm font-medium"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-widest">
                      Resultados: {agendaClients.length}
                    </span>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      selectedAgendaClientId
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {selectedAgendaClientId ? '1 selecionado' : 'Nenhum selecionado'}
                    </span>
                  </div>
                  <div className="max-h-[62vh] overflow-y-auto rounded-2xl border border-gray-100">
                    {agendaClients.length === 0 ? (
                      <div className="p-6 text-center text-sm font-semibold text-gray-500">Nenhum cliente encontrado na agenda.</div>
                    ) : (
                      agendaClients.map(({ client, phone, primaryName, relatedName, responsibleName }) => {
                        const studentName = String(client.name || '').trim();
                        const hasResponsible = Boolean(responsibleName);
                        const samePerson =
                          normalizeSearchValue(responsibleName) === normalizeSearchValue(studentName);

                        const isSelected = selectedAgendaClientId === client.id;

                        return (
                        <label
                          key={client.id}
                          className={`flex items-start gap-3 px-4 py-3 border-b border-gray-100 last:border-b-0 cursor-pointer transition ${
                            isSelected
                              ? 'bg-emerald-50'
                              : 'hover:bg-indigo-50/40'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => setSelectedAgendaClientId(client.id)}
                            className="w-4 h-4 mt-0.5"
                          />
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isSelected ? 'bg-emerald-200 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                            <span className="font-black text-sm">{String(primaryName || studentName || '?').charAt(0).toUpperCase()}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <p className="text-base font-black text-gray-800 truncate">{primaryName || studentName}</p>
                              <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                String(client.type || '').toUpperCase() === 'COLABORADOR'
                                  ? 'bg-violet-100 text-violet-700'
                                  : 'bg-indigo-100 text-indigo-700'
                              }`}>
                                {String(client.type || '').toUpperCase() === 'COLABORADOR' ? 'Colaborador' : 'Aluno'}
                              </span>
                            </div>
                            {hasResponsible && !samePerson ? (
                              <>
                                <p className="text-sm text-emerald-700 font-black truncate">
                                  Responsável: {responsibleName}
                                </p>
                                <p className="text-sm text-indigo-700 font-bold truncate">
                                  Aluno: {relatedName || studentName}
                                </p>
                              </>
                            ) : (
                              <p className="text-sm text-indigo-700 font-bold truncate">
                                {String(client.type || '').toUpperCase() === 'COLABORADOR' ? 'Colaborador' : 'Aluno'}: {studentName}
                              </p>
                            )}
                            <p className="text-sm text-gray-500 font-bold truncate">{phone}</p>
                          </div>
                        </label>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Nome completo do contato</label>
                    <input
                      value={newChatName}
                      onChange={(e) => setNewChatName(e.target.value)}
                      placeholder="Ex: Maria Oliveira"
                      className="w-full px-4 py-3 rounded-2xl border-2 border-gray-100 focus:border-indigo-500 outline-none text-sm font-medium"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Telefone</label>
                    <div className="grid grid-cols-[180px_minmax(0,1fr)] gap-3">
                      <select
                        value={newChatCountryCode}
                        onChange={(e) => setNewChatCountryCode(e.target.value)}
                        className="w-full px-4 py-3 rounded-2xl border-2 border-gray-100 focus:border-indigo-500 outline-none text-sm font-medium bg-white"
                      >
                        {countryOptions.map((country) => (
                          <option key={`${country.code}-${country.label}`} value={country.code}>
                            {country.label}
                          </option>
                        ))}
                      </select>
                      <input
                        value={newChatPhone}
                        onChange={(e) => setNewChatPhone(e.target.value)}
                        placeholder="DDD + numero"
                        className="w-full px-4 py-3 rounded-2xl border-2 border-gray-100 focus:border-indigo-500 outline-none text-sm font-medium"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-5 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setIsNewChatModalOpen(false)}
                className="px-4 py-3 rounded-2xl border border-gray-200 text-gray-600 text-xs font-black uppercase tracking-widest hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateDraftChat}
                disabled={isSavingNewContact}
                className="px-4 py-3 rounded-2xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-60"
              >
                {isSavingNewContact ? 'Salvando contato...' : 'Iniciar conversa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WhatsAppPage;
