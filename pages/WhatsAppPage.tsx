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
  BarChart3
} from 'lucide-react';
import { Client, Enterprise, User } from '../types';
import ApiService from '../services/api';
import WhatsAppQrConnector from '../components/WhatsAppQrConnector';

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
};

type ChatAttachment = {
  mediaType: 'image' | 'document' | 'audio';
  base64Data: string;
  mimeType?: string;
  fileName?: string;
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

type WhatsTab = 'BROADCAST' | 'CHATS' | 'CONNECTION' | 'SETTINGS';
const WHATSAPP_SIGNATURE_ENABLED_KEY = 'whatsapp_signature_enabled';
const WHATSAPP_SIGNATURE_NAME_KEY = 'whatsapp_signature_name';
const NEW_CHAT_COUNTRY_CODE_KEY = 'whatsapp_new_chat_country_code';
const WHATSAPP_QUICK_REPLIES_KEY = 'whatsapp_quick_replies';

const normalizeSearchValue = (value?: string) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

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

const resolveConversationPrimaryName = (client?: Client | null) => {
  const responsible = resolveResponsibleName(client);
  return responsible || String(client?.name || '').trim();
};

const PT_WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
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

const WhatsAppPage: React.FC<WhatsAppPageProps> = ({ currentUser: _currentUser, activeEnterprise }) => {
  const [activeTab, setActiveTab] = useState<WhatsTab>('CHATS');
  const [status, setStatus] = useState<WhatsAppStatusSnapshot>({
    state: 'DISCONNECTED',
    connected: false,
    qrAvailable: false,
    qrDataUrl: null,
    phoneNumber: null,
    lastError: null,
  });
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [selectedPhones, setSelectedPhones] = useState<string[]>([]);
  const [message, setMessage] = useState('Olá! Este é um comunicado da cantina.');
  const [loading, setLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState('');

  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [chatSearchName, setChatSearchName] = useState('');
  const [chatContactType, setChatContactType] = useState<'ALL' | 'ALUNO' | 'COLABORADOR'>('ALL');
  const [chatLoading, setChatLoading] = useState(false);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [chatReply, setChatReply] = useState('');
  const [chatAttachment, setChatAttachment] = useState<ChatAttachment | null>(null);
  const [scheduleAt, setScheduleAt] = useState('');
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
  const isSendingChatRef = useRef(false);
  const pollingInFlightRef = useRef(false);

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
      const nextChats = Array.isArray(data?.chats) ? data.chats : [];
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
      setMessages(Array.isArray(data?.messages) ? data.messages : []);
    } catch (err) {
      console.error('Erro ao carregar mensagens:', err);
      setMessages([]);
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

  const loadData = async () => {
    if (!activeEnterprise) {
      setClients([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [clientsData] = await Promise.all([
        ApiService.getClients(activeEnterprise.id),
        refreshStatus()
      ]);
      setClients(Array.isArray(clientsData) ? clientsData : []);
    } catch (err) {
      console.error('Erro ao carregar página WhatsApp:', err);
      setClients([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!activeEnterprise) {
      setClients([]);
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
  }, []);

  useEffect(() => {
    localStorage.setItem(NEW_CHAT_COUNTRY_CODE_KEY, newChatCountryCode);
  }, [newChatCountryCode]);

  useEffect(() => {
    if (status.connected && activeTab === 'CHATS') {
      loadChats();
    }
  }, [status.connected, activeTab]);

  useEffect(() => {
    if (activeTab !== 'CHATS') return;
    if (!selectedChatId) {
      setScheduledItems([]);
      return;
    }
    loadSchedules(selectedChatId);
  }, [activeTab, selectedChatId]);

  useEffect(() => {
    if (activeTab !== 'CHATS') return undefined;

    const timer = window.setInterval(async () => {
      if (pollingInFlightRef.current) return;
      pollingInFlightRef.current = true;

      try {
        await refreshStatus();
        if (status.connected) {
          await loadChats(false);
          if (selectedChatId) {
            await loadMessages(selectedChatId, false);
            await loadSchedules(selectedChatId);
          }
        }
      } finally {
        pollingInFlightRef.current = false;
      }
    }, 6000);

    return () => window.clearInterval(timer);
  }, [activeTab, status.connected, selectedChatId]);

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
        return {
          ...chat,
          displayName,
          registrationId: mappedClient?.registrationId || '',
          contactType,
          responsibleName,
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

  const handleScheduleMessage = async () => {
    if (!selectedChatId) {
      setFeedback('Selecione uma conversa para agendar.');
      return;
    }
    if (!scheduleAt) {
      setFeedback('Informe data e hora do agendamento.');
      return;
    }

    const finalMessage = formatOutgoingMessage(chatReply);
    if (!finalMessage.trim() && !chatAttachment) {
      setFeedback('Informe uma mensagem ou anexo para agendar.');
      return;
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
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao agendar mensagem.');
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

    isSendingChatRef.current = true;
    setIsSendingChat(true);
    try {
      const finalMessage = formatOutgoingMessage(chatReply);
      const selectedDraft = draftChats.find((chat) => chat.chatId === selectedChatId);

      if (chatAttachment) {
        if (selectedDraft) {
          await ApiService.sendWhatsAppMediaToChat(
            `${selectedDraft.phone}@c.us`,
            finalMessage,
            chatAttachment
          );
        } else {
          await ApiService.sendWhatsAppMediaToChat(selectedChatId, finalMessage, chatAttachment);
        }
      } else {
        if (selectedDraft) {
          await ApiService.sendWhatsAppMessage(selectedDraft.phone, finalMessage);
        } else {
          await ApiService.sendWhatsAppMessageToChat(selectedChatId, finalMessage);
        }
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
  }) => {
    const existingChat = findExistingChatByPhone(params.phone);
    if (existingChat) {
      setSelectedChatId(existingChat.chatId);
      setIsNewChatModalOpen(false);
      setActiveTab('CHATS');
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
      isDraft: true,
    };

    setDraftChats((prev) => [nextDraft, ...prev.filter((chat) => chat.chatId !== chatId)]);
    setSelectedChatId(chatId);
    setMessages([]);
    setChatReply('');
    setIsNewChatModalOpen(false);
    setActiveTab('CHATS');
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
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full"></div>
          <p className="text-gray-600 font-medium">Carregando integração WhatsApp...</p>
        </div>
      </div>
    );
  }

  const signatureHasChanges = (
    signatureEnabled !== savedSignatureEnabled
    || signatureName !== savedSignatureName
  );

  return (
    <div className="space-y-6 p-6 rounded-[30px] bg-gradient-to-b from-cyan-50/60 via-white to-emerald-50/40 animate-in fade-in duration-500">
      <header className="rounded-[30px] border border-cyan-100 bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500 text-white p-6 shadow-lg">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight">WhatsApp Admin</h1>
            <p className="text-[11px] uppercase tracking-[2px] font-black text-emerald-50/90 mt-1">
              Central de disparos e atendimento dos clientes
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={refreshStatus}
              className="px-4 py-2.5 rounded-xl bg-white/90 text-cyan-700 text-xs font-black uppercase tracking-widest hover:bg-white flex items-center gap-2"
            >
              <RefreshCw size={14} />
              Atualizar
            </button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Sessão</p>
          <p className={`text-lg font-black mt-1 ${status.connected ? 'text-emerald-600' : 'text-gray-600'}`}>
            {status.connected ? 'Conectado' : status.state}
          </p>
        </div>
        <div className="rounded-2xl border-2 border-cyan-200 bg-gradient-to-br from-cyan-50 to-white p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Clientes com Telefone</p>
          <p className="text-lg font-black text-gray-800 mt-1">{recipients.length}</p>
        </div>
        <div className="rounded-2xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Conversas Ativas</p>
          <p className="text-lg font-black text-gray-800 mt-1">{visibleChats.length}</p>
        </div>
        <div className="rounded-2xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Não Lidas</p>
          <p className="text-lg font-black text-amber-600 mt-1">{unreadCount}</p>
        </div>
      </div>

      <div className="bg-white/95 rounded-[24px] border-2 border-cyan-200 p-2 grid grid-cols-1 md:grid-cols-4 gap-2 shadow-sm">
        <button
          onClick={() => setActiveTab('CHATS')}
          className={`px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest ${activeTab === 'CHATS' ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-white' : 'bg-slate-50 text-gray-500'}`}
        >
          Conversas
        </button>
        <button
          onClick={() => setActiveTab('BROADCAST')}
          className={`px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest ${activeTab === 'BROADCAST' ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-white' : 'bg-slate-50 text-gray-500'}`}
        >
          Disparos
        </button>
        <button
          onClick={() => setActiveTab('CONNECTION')}
          className={`px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest ${activeTab === 'CONNECTION' ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-white' : 'bg-slate-50 text-gray-500'}`}
        >
          Conexao WhatsApp
        </button>
        <button
          onClick={() => setActiveTab('SETTINGS')}
          className={`px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest ${activeTab === 'SETTINGS' ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-white' : 'bg-slate-50 text-gray-500'}`}
        >
          Configuração
        </button>
      </div>

      {activeTab === 'CHATS' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          <section className="xl:col-span-5 2xl:col-span-4 rounded-[26px] border-2 border-cyan-200 bg-white/95 p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Conversas de Clientes ({visibleChats.length})</p>
              <div className="flex items-center gap-2">
                {chatLoading && <RefreshCw size={14} className="animate-spin text-gray-400" />}
                <button
                  onClick={() => {
                    setNewChatMode('AGENDA');
                    setSelectedAgendaClientId(null);
                    setAgendaSearch('');
                    setIsNewChatModalOpen(true);
                  }}
                  className="px-3 py-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 text-white text-[10px] font-black uppercase tracking-widest hover:brightness-105 flex items-center gap-2"
                >
                  <Plus size={14} />
                  Nova Conversa
                </button>
              </div>
            </div>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={chatSearchName}
                onChange={(e) => setChatSearchName(e.target.value)}
                placeholder="Buscar contato por nome"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-medium bg-cyan-50/30"
              />
            </div>
            <select
              value={chatContactType}
              onChange={(e) => setChatContactType(e.target.value as 'ALL' | 'ALUNO' | 'COLABORADOR')}
              className="w-full px-4 py-2.5 rounded-xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-medium bg-cyan-50/30"
            >
              <option value="ALL">Tipo de contato: Todos</option>
              <option value="ALUNO">Aluno</option>
              <option value="COLABORADOR">Colaborador</option>
            </select>
            <div className="max-h-[620px] overflow-y-auto rounded-xl border-2 border-cyan-200 bg-white">
              {!status.connected ? (
                <div className="p-8 text-center text-gray-500 text-sm font-semibold">Conecte o WhatsApp para visualizar conversas.</div>
              ) : visibleChats.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm font-semibold">Sem conversas no momento.</div>
              ) : (
                visibleChats.map((chat) => (
                  <div
                    key={chat.chatId}
                    className={`flex items-start gap-2 px-3 py-3 border-b border-cyan-100 last:border-b-0 transition ${selectedChatId === chat.chatId ? 'bg-cyan-50/80' : 'bg-white hover:bg-cyan-50/40'}`}
                  >
                    <button
                      onClick={() => handleSelectChat(chat.chatId)}
                      className="flex-1 text-left min-w-0 flex items-start gap-3"
                    >
                      <div className="w-10 h-10 rounded-full overflow-hidden border border-cyan-100 bg-cyan-100 flex items-center justify-center shrink-0">
                        {chat.avatarUrl ? (
                          <img src={chat.avatarUrl} alt={chat.displayName} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[11px] font-black text-cyan-700">
                            {String(chat.displayName || '?').trim().slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-black text-gray-800 truncate">{chat.displayName}</p>
                        {chat.contactType && (
                          <p className="text-[10px] text-cyan-700 font-black uppercase tracking-widest mt-0.5">
                            {chat.contactType}{chat.responsibleName ? ` • Resp.: ${chat.responsibleName}` : ''}
                          </p>
                        )}
                        {chat.isDraft && (
                          <p className="text-[10px] text-emerald-600 font-black uppercase tracking-widest mt-0.5">
                            Nova conversa
                          </p>
                        )}
                        <p className="text-[11px] text-gray-500 font-bold truncate">{chat.lastMessage || 'Sem mensagem'}</p>
                      </div>
                    </button>
                    <div className="flex items-start gap-1 pt-0.5">
                      {chat.unreadCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black">
                          {chat.unreadCount}
                        </span>
                      )}
                      {Array.isArray(chat.labels) && chat.labels.length > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 text-[10px] font-black max-w-[130px] truncate" title={chat.labels.join(', ')}>
                          {chat.labels[0]}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(event) => handleDeleteChat(chat, event)}
                        disabled={isDeletingChatId === chat.chatId}
                        className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 disabled:opacity-60"
                        title={`Excluir conversa de ${chat.displayName}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="xl:col-span-7 2xl:col-span-8 rounded-[26px] border-2 border-cyan-200 bg-white/95 shadow-sm flex flex-col min-h-[720px] overflow-hidden">
            {!selectedChat ? (
              <div className="flex-1 flex items-center justify-center text-center text-gray-400 p-8">
                <div className="space-y-2">
                  <MessagesSquare size={36} className="mx-auto" />
                  <p className="text-sm font-bold">Selecione uma conversa para abrir o histórico.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="border-b-2 border-cyan-200 px-5 py-4 bg-cyan-50/70">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-gray-800">{selectedChat.displayName}</p>
                      <p className="text-[11px] text-gray-500 font-bold">{selectedChat.phone}</p>
                    </div>
                    <div className="w-full lg:w-auto lg:min-w-[340px] space-y-2">
                      {relatedStudents.length > 0 && (
                        <div className="flex items-center gap-2 justify-end">
                          <label className="text-[10px] font-black uppercase tracking-widest text-cyan-700">Aluno</label>
                          <select
                            value={selectedStudentId}
                            onChange={(e) => setSelectedStudentId(e.target.value)}
                            className="w-full lg:w-[240px] px-3 py-1.5 rounded-xl border border-cyan-200 bg-white text-xs font-black text-gray-700 outline-none focus:border-cyan-400"
                          >
                            {relatedStudents.length > 1 && <option value="">Selecione o aluno</option>}
                            {relatedStudents.map((student) => (
                              <option key={student.id} value={student.id}>
                                {student.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {selectedStudent ? (
                        selectedStudentPlanSummary.length > 0 ? (
                          <div className="flex flex-wrap gap-2 lg:justify-end">
                            {selectedStudentPlanSummary.map((item) => {
                              const tone = getPlanCardTone(item.key, item.numericBalance);
                              return (
                              <div key={item.key} className={`rounded-xl border px-3 py-1.5 min-w-[150px] ${tone.container}`}>
                                <p className={`text-[10px] font-black uppercase tracking-wide ${tone.title}`}>{item.label}</p>
                                <p className={`text-[11px] font-black ${tone.value}`}>{item.value}</p>
                              </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-[11px] font-bold text-gray-500 text-right">Aluno sem planos ativos.</p>
                        )
                      ) : (
                        relatedStudents.length > 1 && (
                          <p className="text-[11px] font-bold text-gray-500 text-right">Selecione um aluno para exibir os saldos dos planos.</p>
                        )
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gradient-to-b from-cyan-50/30 to-white">
                  {messagesLoading ? (
                    <div className="text-center text-gray-500 text-sm font-semibold py-10">Carregando mensagens...</div>
                  ) : messages.length === 0 ? (
                    <div className="text-center text-gray-500 text-sm font-semibold py-10">Sem mensagens neste chat.</div>
                  ) : (
                    messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`max-w-[82%] px-3 py-2 rounded-2xl text-sm font-medium shadow-sm ${
                          msg.fromMe
                            ? 'ml-auto bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-br-md'
                            : 'mr-auto bg-white border-2 border-cyan-200 text-gray-800 rounded-bl-md'
                        }`}
                      >
                        {msg.mediaType === 'image' && msg.mediaDataUrl && (
                          <a href={msg.mediaDataUrl} target="_blank" rel="noreferrer" className="block mb-2">
                            <img
                              src={msg.mediaDataUrl}
                              alt={msg.fileName || 'Imagem enviada'}
                              className="max-h-64 rounded-xl border border-white/30 object-contain bg-white/20"
                            />
                          </a>
                        )}

                        {msg.mediaType === 'audio' && msg.mediaDataUrl && (
                          <div className="mb-2">
                            <audio controls src={msg.mediaDataUrl} className="w-full min-w-[240px]" />
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
                                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest ${
                                  msg.fromMe
                                    ? 'bg-white/20 text-white border border-white/30'
                                    : 'bg-cyan-50 text-cyan-700 border border-cyan-200'
                                }`}
                              >
                                <FileText size={14} />
                                {msg.fileName || 'Baixar arquivo'}
                              </a>
                            ) : (
                              <p className="text-[11px] font-semibold opacity-80">
                                {msg.fileName || 'Arquivo recebido'} (sem preview disponível)
                              </p>
                            )}
                          </div>
                        )}

                        {msg.body && (
                          <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="p-4 border-t-2 border-cyan-200 bg-white space-y-3">
                  <div className="rounded-xl border-2 border-blue-200 bg-blue-50/60 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <BarChart3 size={14} className="text-blue-700" />
                      <p className="text-[11px] font-black uppercase tracking-widest text-blue-700">
                        Relatório do Contato
                      </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                      <select
                        value={reportPeriodMode}
                        onChange={(e) => setReportPeriodMode(e.target.value as ReportPeriodMode)}
                        className="px-3 py-2 rounded-xl border-2 border-blue-200 bg-white text-xs font-black text-gray-700 outline-none focus:border-blue-400"
                      >
                        <option value="WEEKLY">Semanal</option>
                        <option value="BIWEEKLY">Quinzenal</option>
                        <option value="CUSTOM">Período (inicial/final)</option>
                      </select>
                      {reportPeriodMode === 'CUSTOM' && (
                        <>
                          <input
                            type="date"
                            value={reportStartDate}
                            onChange={(e) => setReportStartDate(e.target.value)}
                            className="px-3 py-2 rounded-xl border-2 border-blue-200 bg-white text-xs font-bold text-gray-700 outline-none focus:border-blue-400"
                          />
                          <input
                            type="date"
                            value={reportEndDate}
                            onChange={(e) => setReportEndDate(e.target.value)}
                            className="px-3 py-2 rounded-xl border-2 border-blue-200 bg-white text-xs font-bold text-gray-700 outline-none focus:border-blue-400"
                          />
                        </>
                      )}
                      <button
                        type="button"
                        onClick={handleSendConsumptionReport}
                        disabled={isSendingReport || !selectedChatClient || !['ALUNO', 'COLABORADOR'].includes(String(selectedChatClient?.type || '').toUpperCase())}
                        className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-[11px] font-black uppercase tracking-widest"
                      >
                        {isSendingReport ? 'Enviando...' : 'Enviar Relatório'}
                      </button>
                    </div>
                    <p className="text-[11px] font-semibold text-blue-700/90">
                      {selectedChatClient
                        ? `Tipo: ${String(selectedChatClient.type || '').toUpperCase()}`
                        : 'Contato sem cadastro local. Para relatório, selecione um contato vinculado a cliente.'}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {quickReplies.map((quick) => (
                      <button
                        key={quick}
                        type="button"
                        onClick={() => setChatReply((prev) => (prev ? `${prev}\n${quick}` : quick))}
                        className="px-3 py-1.5 rounded-xl border-2 border-cyan-200 bg-cyan-50 text-cyan-800 text-[11px] font-black hover:bg-cyan-100"
                      >
                        {quick}
                      </button>
                    ))}
                    {quickReplies.length === 0 && (
                      <p className="text-[11px] font-semibold text-gray-500">
                        Cadastre respostas rápidas na aba Configuração.
                      </p>
                    )}
                  </div>

                  {chatAttachment && (
                    <div className="flex items-center justify-between rounded-xl border-2 border-emerald-200 bg-emerald-50 px-3 py-2">
                      <div className="min-w-0 flex items-center gap-2">
                        {chatAttachment.mediaType === 'image' && <FileImage size={15} className="text-emerald-700 shrink-0" />}
                        {chatAttachment.mediaType === 'document' && <FileText size={15} className="text-emerald-700 shrink-0" />}
                        {chatAttachment.mediaType === 'audio' && <Mic size={15} className="text-emerald-700 shrink-0" />}
                        <div className="min-w-0">
                        <p className="text-[11px] font-black text-emerald-700 truncate">{chatAttachment.fileName || 'Anexo selecionado'}</p>
                        <p className="text-[10px] font-semibold text-emerald-700/80 uppercase">{chatAttachment.mediaType}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setChatAttachment(null)}
                        className="p-1 rounded-lg text-rose-600 hover:bg-rose-50"
                        title="Remover anexo"
                      >
                        <XCircle size={15} />
                      </button>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <textarea
                      rows={2}
                      value={chatReply}
                      onChange={(e) => setChatReply(e.target.value)}
                      placeholder="Digite sua resposta..."
                      className="flex-1 px-3 py-2 rounded-xl border-2 border-cyan-200 focus:border-cyan-500 outline-none text-sm"
                    />
                    <div className="flex flex-col gap-2">
                      <label className="px-3 py-2 rounded-xl border-2 border-cyan-200 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 cursor-pointer">
                        <Paperclip size={14} />
                        <input type="file" className="hidden" onChange={handleAttachFile} />
                      </label>
                      <button
                        onClick={handleReply}
                        disabled={isSendingChat || (!chatReply.trim() && !chatAttachment)}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 text-white text-xs font-black uppercase tracking-widest hover:brightness-105 disabled:opacity-60 flex items-center gap-2"
                      >
                        <Send size={14} />
                        {isSendingChat ? 'Enviando' : 'Responder'}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border-2 border-violet-200 bg-violet-50/70 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <CalendarClock size={14} className="text-violet-700" />
                      <p className="text-[11px] font-black uppercase tracking-widest text-violet-700">Agendar Mensagem</p>
                    </div>
                    <div className="flex flex-col lg:flex-row gap-2">
                      <input
                        type="datetime-local"
                        value={scheduleAt}
                        onChange={(e) => setScheduleAt(e.target.value)}
                        className="px-3 py-2 rounded-xl border-2 border-violet-200 bg-white text-sm font-medium outline-none focus:border-violet-400"
                      />
                      <button
                        type="button"
                        onClick={handleScheduleMessage}
                        disabled={isScheduling || (!chatReply.trim() && !chatAttachment)}
                        className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 text-white text-xs font-black uppercase tracking-widest"
                      >
                        {isScheduling ? 'Agendando...' : 'Agendar'}
                      </button>
                    </div>
                    {scheduledItems.length > 0 && (
                      <div className="mt-3 space-y-1 max-h-28 overflow-y-auto">
                        {scheduledItems.slice(0, 8).map((item) => (
                          <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-violet-200 bg-white px-2 py-1.5">
                            <p className="text-[11px] font-semibold text-gray-700 truncate">
                              {new Date(item.scheduleAt).toLocaleString('pt-BR')} - {item.status.toUpperCase()}
                            </p>
                            {item.status === 'pending' ? (
                              <button
                                type="button"
                                onClick={() => handleCancelSchedule(item.id)}
                                className="text-[10px] font-black uppercase text-rose-600 hover:text-rose-700"
                              >
                                Cancelar
                              </button>
                            ) : (
                              <span className="text-[10px] font-black uppercase text-gray-400">{item.status}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {activeTab === 'BROADCAST' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          <section className="xl:col-span-7 rounded-[26px] border border-indigo-100 bg-white/95 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Campanha de Mensagem ({selectedPhones.length} selecionados)</p>
              <button
                onClick={handleSendBulk}
                disabled={isSending || !status.connected}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 text-white text-xs font-black uppercase tracking-widest hover:brightness-105 disabled:opacity-60 flex items-center gap-2"
              >
                <Send size={14} />
                {isSending ? 'Enviando...' : 'Enviar Mensagem'}
              </button>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Mensagem</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={10}
                className="w-full mt-1 px-4 py-4 rounded-2xl border-2 border-indigo-100 focus:border-cyan-400 outline-none text-sm font-medium min-h-[280px] bg-indigo-50/20"
                placeholder="Digite a mensagem que será enviada..."
              />
            </div>
          </section>

          <section className="xl:col-span-5 rounded-[26px] border border-indigo-100 bg-white/95 p-5 shadow-sm space-y-4">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, matrícula ou telefone"
                className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-indigo-100 focus:border-cyan-400 outline-none text-sm font-medium bg-indigo-50/20"
              />
            </div>

            <div className="border border-indigo-100 rounded-2xl overflow-hidden bg-white">
              <div className="max-h-[560px] overflow-y-auto">
                {recipients.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 text-sm font-semibold">
                    Nenhum cliente com telefone encontrado.
                  </div>
                ) : (
                  recipients.map(({ client, phone }) => {
                    const isChecked = selectedPhones.includes(phone);
                    return (
                      <label key={client.id} className="flex items-center justify-between px-4 py-3 border-b border-indigo-100 last:border-b-0 hover:bg-indigo-50/40 cursor-pointer">
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => toggleRecipient(phone, e.target.checked)}
                            className="w-4 h-4"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-black text-gray-800 truncate">
                              {renderHighlightedText(client.name, search)}
                            </p>
                            <p className="text-[11px] text-gray-500 font-bold truncate">
                              {renderHighlightedText(phone, search, true)}
                            </p>
                            {client.registrationId && (
                              <p className="text-[11px] text-gray-400 font-semibold truncate">
                                Matricula: {renderHighlightedText(String(client.registrationId), search)}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isChecked && <CheckCircle2 size={14} className="text-emerald-600" />}
                          <Users size={14} className="text-gray-300" />
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'SETTINGS' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          <section className="xl:col-span-8 xl:col-start-3 rounded-[26px] border-2 border-cyan-200 bg-white/95 p-5 shadow-sm space-y-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Configuração</p>
              <h3 className="text-lg font-black text-gray-900 mt-1">Cadastro de Resposta Rápida</h3>
              <p className="text-sm font-medium text-gray-600 mt-1">
                As respostas cadastradas aqui aparecem no painel de conversa.
              </p>
            </div>

            <div className="rounded-2xl border-2 border-cyan-200 bg-cyan-50/50 p-4 space-y-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-cyan-700">Nova resposta rápida</label>
              <div className="flex flex-col md:flex-row gap-2">
                <input
                  value={quickReplyInput}
                  onChange={(e) => setQuickReplyInput(e.target.value)}
                  placeholder="Ex: Recebido, já vou verificar."
                  className="flex-1 px-4 py-3 rounded-xl border-2 border-cyan-200 focus:border-cyan-500 outline-none text-sm font-medium bg-white"
                />
                <button
                  type="button"
                  onClick={handleAddQuickReply}
                  className="px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 text-white text-xs font-black uppercase tracking-widest hover:brightness-105"
                >
                  Cadastrar
                </button>
              </div>
            </div>

            <div className="rounded-2xl border-2 border-cyan-200 bg-white overflow-hidden">
              {quickReplies.length === 0 ? (
                <div className="p-6 text-sm font-semibold text-gray-500 text-center">
                  Nenhuma resposta rápida cadastrada.
                </div>
              ) : (
                quickReplies.map((item) => (
                  <div key={item} className="flex items-center justify-between gap-3 px-4 py-3 border-b border-cyan-100 last:border-b-0">
                    <p className="text-sm font-semibold text-gray-700">{item}</p>
                    <button
                      type="button"
                      onClick={() => handleRemoveQuickReply(item)}
                      className="p-2 rounded-lg text-rose-600 hover:bg-rose-50"
                      title="Excluir resposta rápida"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {activeTab === 'CONNECTION' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          <div className="xl:col-span-7 xl:col-start-3 space-y-5">
            <WhatsAppQrConnector />
            <section className="rounded-[26px] border border-cyan-100 bg-white/95 p-5 shadow-sm space-y-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Assinatura</p>
                <p className="text-sm font-medium text-gray-600 mt-1">
                  Quando ativada, todas as mensagens enviadas saem com o nome em destaque antes do texto.
                </p>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-cyan-100 bg-cyan-50/50 px-4 py-3">
                <div>
                  <p className="text-sm font-black text-gray-800">Ativar assinatura</p>
                  <p className="text-[11px] font-medium text-gray-500">Formato: <span className="font-black">{`*Nome:*`}</span> seguido de quebra de linha.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSignatureEnabled((prev) => !prev)}
                  className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${signatureEnabled ? 'bg-gradient-to-r from-teal-500 to-emerald-500' : 'bg-gray-300'}`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${signatureEnabled ? 'translate-x-8' : 'translate-x-1'}`}
                  />
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Nome da assinatura</label>
                <input
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                  placeholder="Ex: Atend.Cantina"
                  className="w-full px-4 py-3 rounded-2xl border-2 border-cyan-100 focus:border-cyan-400 outline-none text-sm font-medium bg-cyan-50/20"
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold text-gray-500">
                  {signatureHasChanges ? 'Alterações pendentes de salvamento.' : 'Configuração salva.'}
                </p>
                <button
                  type="button"
                  onClick={handleSaveSignature}
                  disabled={!signatureHasChanges}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-xs font-black uppercase tracking-widest transition-colors"
                >
                  Salvar configuração
                </button>
              </div>

              <div className="rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-cyan-600">Pré-visualização</p>
                <p className="mt-2 whitespace-pre-wrap text-sm font-medium text-gray-700">
                  {formatOutgoingMessage('Olá tudo bem.') || 'Digite um nome e ative a assinatura para visualizar.'}
                </p>
              </div>
            </section>
          </div>
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
                  <div className="max-h-[62vh] overflow-y-auto rounded-2xl border border-gray-100">
                    {agendaClients.length === 0 ? (
                      <div className="p-6 text-center text-sm font-semibold text-gray-500">Nenhum cliente encontrado na agenda.</div>
                    ) : (
                      agendaClients.map(({ client, phone, primaryName, relatedName, responsibleName }) => {
                        const studentName = String(client.name || '').trim();
                        const hasResponsible = Boolean(responsibleName);
                        const samePerson =
                          normalizeSearchValue(responsibleName) === normalizeSearchValue(studentName);

                        return (
                        <label key={client.id} className="flex items-start gap-3 px-4 py-3 border-b border-gray-100 last:border-b-0 cursor-pointer hover:bg-indigo-50/40">
                          <input
                            type="checkbox"
                            checked={selectedAgendaClientId === client.id}
                            onChange={() => setSelectedAgendaClientId(client.id)}
                            className="w-4 h-4 mt-0.5"
                          />
                          <div className="min-w-0">
                            <p className="text-base font-black text-gray-800 truncate">{primaryName || studentName}</p>
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
