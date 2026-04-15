
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  Search, Plus, Wallet, X, User as UserIcon, History, 
  ShieldCheck, ArrowRight, CheckCircle2, DollarSign,
  Check, Copy, FileText, Building2,
  ChevronDown, UserPlus, ChevronLeft, Eye, ShieldAlert,
  Phone, GraduationCap, AlertTriangle, Trash2, Sparkles,
  Beef, HeartPulse, CreditCard, Landmark, Edit, ShoppingCart, Layers, Upload, Download, FileSpreadsheet, Printer
} from 'lucide-react';
import { Client, ClientPlanType, User, Enterprise, Role, Plan, TransactionRecord } from '../types';
import ApiService from '../services/api';
import { formatPhoneWithFlag } from '../utils/phone';
import { extractSchoolCalendarOperationalData } from '../utils/schoolCalendar';
import { buildEnterpriseLogoHtml, drawEnterpriseLogoOnPdf } from '../utils/enterpriseBranding';

interface ClientsPageProps {
  currentUser: User;
  activeEnterprise: Enterprise;
  viewMode?: 'ALUNOS' | 'CLIENTES_RESPONSAVEIS';
}

type ResponsibleOrCollaboratorRow = {
  id: string;
  registrationId: string;
  name: string;
  photo?: string;
  tipoConta: 'RESPONSAVEL' | 'COLABORADOR';
  cargoParentesco: string;
  phone: string;
  email?: string;
  sourceClient?: Client;
};

const WEEK_DAY_OPTIONS = [
  { key: 'DOMINGO', label: 'Dom' },
  { key: 'SEGUNDA', label: 'Seg' },
  { key: 'TERCA', label: 'Ter' },
  { key: 'QUARTA', label: 'Qua' },
  { key: 'QUINTA', label: 'Qui' },
  { key: 'SEXTA', label: 'Sex' },
  { key: 'SABADO', label: 'Sáb' },
];

const DELIVERY_SHIFT_OPTIONS = [
  { key: 'MORNING', label: 'Manhã' },
  { key: 'AFTERNOON', label: 'Tarde' },
  { key: 'NIGHT', label: 'Noite' },
];

const RESPONSIBLE_RELATION_OPTIONS = [
  { value: 'PAIS', label: 'Pais' },
  { value: 'AVOS', label: 'Avós' },
  { value: 'TIOS', label: 'Tios' },
  { value: 'TUTOR_LEGAL', label: 'Tutor legal' },
];

const weekDayToJsDay: Record<string, number> = {
  SEGUNDA: 1,
  TERCA: 2,
  QUARTA: 3,
  QUINTA: 4,
  SEXTA: 5,
  SABADO: 6,
  DOMINGO: 0,
};

const jsDayToWeekDay: Record<number, string> = {
  0: 'DOMINGO',
  1: 'SEGUNDA',
  2: 'TERCA',
  3: 'QUARTA',
  4: 'QUINTA',
  5: 'SEXTA',
  6: 'SABADO',
};

const DAY_KEY_ALIASES: Record<string, string[]> = {
  SEGUNDA: ['SEGUNDA', 'segunda', 'MONDAY', 'monday'],
  TERCA: ['TERCA', 'terça', 'terca', 'TUESDAY', 'tuesday'],
  QUARTA: ['QUARTA', 'quarta', 'WEDNESDAY', 'wednesday'],
  QUINTA: ['QUINTA', 'quinta', 'THURSDAY', 'thursday'],
  SEXTA: ['SEXTA', 'sexta', 'FRIDAY', 'friday'],
  SABADO: ['SABADO', 'sábado', 'sabado', 'SATURDAY', 'saturday'],
  DOMINGO: ['DOMINGO', 'domingo', 'SUNDAY', 'sunday'],
};

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateKeyBr = (dateKey?: string) => {
  const value = String(dateKey || '').trim();
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
};

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace(/\/api\/?$/, '');

const COUNTRY_OPTIONS = [
  { code: '55', label: 'Brasil', dial: '+55' },
  { code: '54', label: 'Argentina', dial: '+54' },
  { code: '591', label: 'Bolivia', dial: '+591' },
  { code: '56', label: 'Chile', dial: '+56' },
  { code: '57', label: 'Colombia', dial: '+57' },
  { code: '506', label: 'Costa Rica', dial: '+506' },
  { code: '53', label: 'Cuba', dial: '+53' },
  { code: '593', label: 'Equador', dial: '+593' },
  { code: '503', label: 'El Salvador', dial: '+503' },
  { code: '502', label: 'Guatemala', dial: '+502' },
  { code: '592', label: 'Guiana', dial: '+592' },
  { code: '509', label: 'Haiti', dial: '+509' },
  { code: '504', label: 'Honduras', dial: '+504' },
  { code: '1', label: 'Estados Unidos', dial: '+1' },
  { code: '52', label: 'Mexico', dial: '+52' },
  { code: '505', label: 'Nicaragua', dial: '+505' },
  { code: '507', label: 'Panama', dial: '+507' },
  { code: '595', label: 'Paraguai', dial: '+595' },
  { code: '51', label: 'Peru', dial: '+51' },
  { code: '1784', label: 'Sao Vicente e Granadinas', dial: '+1784' },
  { code: '1809', label: 'Republica Dominicana', dial: '+1809' },
  { code: '508', label: 'Sao Pedro e Miquelon', dial: '+508' },
  { code: '597', label: 'Suriname', dial: '+597' },
  { code: '598', label: 'Uruguai', dial: '+598' },
  { code: '58', label: 'Venezuela', dial: '+58' },
  { code: '33', label: 'Franca', dial: '+33' },
  { code: '49', label: 'Alemanha', dial: '+49' },
  { code: '39', label: 'Italia', dial: '+39' },
  { code: '351', label: 'Portugal', dial: '+351' },
  { code: '34', label: 'Espanha', dial: '+34' },
  { code: '44', label: 'Reino Unido', dial: '+44' },
  { code: '41', label: 'Suica', dial: '+41' },
];

const splitPhoneByCountryCode = (rawPhone?: string, fallbackCode = '55') => {
  const digits = String(rawPhone || '').replace(/\D/g, '');
  if (!digits) {
    return { countryCode: fallbackCode, localPhone: '' };
  }

  const matched = COUNTRY_OPTIONS
    .slice()
    .sort((a, b) => b.code.length - a.code.length)
    .find((option) => digits.startsWith(option.code));

  if (matched) {
    return {
      countryCode: matched.code,
      localPhone: digits.slice(matched.code.length),
    };
  }

  return { countryCode: fallbackCode, localPhone: digits };
};

const joinPhoneWithCountryCode = (countryCode?: string, localPhone?: string) => {
  const normalizedCode = String(countryCode || '55').replace(/\D/g, '') || '55';
  const normalizedPhone = String(localPhone || '').replace(/\D/g, '');
  if (!normalizedPhone) return '';
  if (normalizedPhone.startsWith(normalizedCode)) return normalizedPhone;
  return `${normalizedCode}${normalizedPhone}`;
};

const resolveClientPhotoUrl = (photoUrl?: string, clientName?: string) => {
  if (photoUrl && /^https?:\/\//i.test(photoUrl)) return photoUrl;
  if (photoUrl && photoUrl.startsWith('/clients_photos/')) return `${API_BASE_URL}${photoUrl}`;
  if (photoUrl) return photoUrl;
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(clientName || 'cliente')}`;
};

const formatPhoneNumber = (rawPhone?: string) => {
  return formatPhoneWithFlag(rawPhone, 'Não informado');
};

const formatCurrencyBRL = (value: number) => {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  return safeValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatClientCreatedAtShort = (client: Client) => {
  const explicitDate = String((client as any)?.createdAt || '').trim();
  const sourceDate = explicitDate
    ? new Date(explicitDate)
    : (() => {
        const id = String(client?.id || '').trim();
        const match = id.match(/^c_(\d{10,13})_/i);
        if (!match?.[1]) return null;
        const raw = match[1];
        const timestamp = raw.length === 10 ? Number(raw) * 1000 : Number(raw);
        return Number.isFinite(timestamp) ? new Date(timestamp) : null;
      })();

  if (!sourceDate || Number.isNaN(sourceDate.getTime())) return '--/--/--';

  const day = String(sourceDate.getDate()).padStart(2, '0');
  const month = String(sourceDate.getMonth() + 1).padStart(2, '0');
  const year = String(sourceDate.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
};

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const renderHighlightedText = (value: string, _query: string) => {
  const safeValue = String(value || '');
  return safeValue;
};

const normalizeSearchText = (value?: string) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const toPdfSafeText = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const ClientsPage: React.FC<ClientsPageProps> = ({ currentUser, activeEnterprise, viewMode = 'ALUNOS' }) => {
  const navigate = useNavigate();
  const restoreClientsInputRef = useRef<HTMLInputElement | null>(null);
  const [openingWhatsAppKey, setOpeningWhatsAppKey] = useState<string | null>(null);
  const activeEnterpriseId = String(activeEnterprise?.id || '').trim();

  const [clients, setClients] = useState<Client[]>([]);
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState<string>('ALL');
  
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [isRechargeModalOpen, setIsRechargeModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isStudentOnlyMode, setIsStudentOnlyMode] = useState(false);
  const [linkingStudentContextName, setLinkingStudentContextName] = useState('');
  
  const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'BOLETO' | 'CAIXA'>('PIX');

  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [rechargingClient, setRechargingClient] = useState<Client | null>(null);
  const [historyClient, setHistoryClient] = useState<Client | null>(null);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  const [consumptionPeriod, setConsumptionPeriod] = useState<'TODAY' | 'YESTERDAY' | 'WEEK' | '15D' | 'MONTH' | 'YEAR' | 'DATE'>('MONTH');
  const [consumptionSpecificDate, setConsumptionSpecificDate] = useState('');
  const [selectedPlanDays, setSelectedPlanDays] = useState<Record<string, string[]>>({});
  const [selectedPlanDates, setSelectedPlanDates] = useState<Record<string, string[]>>({});
  const [selectedPlanShifts, setSelectedPlanShifts] = useState<Record<string, string[]>>({});
  const [planRequiredUnitsById, setPlanRequiredUnitsById] = useState<Record<string, number>>({});
  const [planEditBaseDatesById, setPlanEditBaseDatesById] = useState<Record<string, string[]>>({});
  const [planOriginalDatesById, setPlanOriginalDatesById] = useState<Record<string, string[]>>({});
  const [openPlanCalendarId, setOpenPlanCalendarId] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [rechargeSelectedPlanId, setRechargeSelectedPlanId] = useState<string | null>(null);
  const [rechargePlanDays, setRechargePlanDays] = useState<Record<string, string[]>>({});
  const [rechargePlanDates, setRechargePlanDates] = useState<Record<string, string[]>>({});
  const [rechargeOpenCalendarId, setRechargeOpenCalendarId] = useState<string | null>(null);
  const [rechargeCalendarMonth, setRechargeCalendarMonth] = useState<Date>(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [schoolCalendarBlockedDatesByYear, setSchoolCalendarBlockedDatesByYear] = useState<Record<number, string[]>>({});
  const [schoolCalendarEventTitlesByDate, setSchoolCalendarEventTitlesByDate] = useState<Record<string, string>>({});
  const [clientPhotoFile, setClientPhotoFile] = useState<File | null>(null);
  const [clientPhotoPreview, setClientPhotoPreview] = useState('');
  const [isSavingPlanView, setIsSavingPlanView] = useState(false);
  const [isSubmittingClientForm, setIsSubmittingClientForm] = useState(false);
  const isSubmittingClientFormRef = useRef(false);
  const [isRestoringClientsBackup, setIsRestoringClientsBackup] = useState(false);
  const [planViewNotice, setPlanViewNotice] = useState<{ type: 'warning' | 'success' | 'error'; message: string } | null>(null);
  const [isGeneratingPortalLink, setIsGeneratingPortalLink] = useState(false);
  const [portalLinkModalOpen, setPortalLinkModalOpen] = useState(false);
  const [portalLinkValue, setPortalLinkValue] = useState('');
  const [portalLinkTargetName, setPortalLinkTargetName] = useState('');
  const [isGeneratingExistingPortalLinks, setIsGeneratingExistingPortalLinks] = useState(false);
  const [portalLinksByRowId, setPortalLinksByRowId] = useState<Record<string, string>>({});
  const [pendingResolveIntent, setPendingResolveIntent] = useState<any>(null);
  const [resolveNowHelper, setResolveNowHelper] = useState<{ message: string; focusFields?: string[]; studentName?: string } | null>(null);

  const isUnitAdmin = currentUser?.role === Role.ADMIN
    || currentUser?.role === Role.ADMIN_RESTAURANTE
    || currentUser?.role === Role.GERENTE
    || currentUser?.role === Role.FUNCIONARIO_BASICO;
  const isSystemWideAdmin = currentUser?.role === Role.SUPERADMIN || currentUser?.role === Role.ADMIN_SISTEMA;
  const isResponsibleView = viewMode === 'CLIENTES_RESPONSAVEIS';
  const isResponsibleDataLocked = isStudentOnlyMode && Boolean(linkingStudentContextName);

  // Carregar clientes, empresas, planos e transações da API
  const showPlanNotice = (message: string, type: 'warning' | 'success' | 'error' = 'warning') => {
    setPlanViewNotice({ type, message });
    window.setTimeout(() => {
      setPlanViewNotice((prev) => (prev?.message === message ? null : prev));
    }, 3500);
  };

  const isClientVersionConflictError = (error: unknown) => {
    const message = String((error as any)?.message || '').toLowerCase();
    return message.includes('conflito de atualiza') || message.includes('versao esperada');
  };

  const reloadClientSnapshot = async (clientId: string) => {
    const freshClient = await ApiService.getClient(clientId);
    setClients((prev) => prev.map((client) => (client.id === clientId ? freshClient : client)));
    if (String(viewingClient?.id || '') === clientId) setViewingClient(freshClient);
    if (String(rechargingClient?.id || '') === clientId) setRechargingClient(freshClient);
    if (String(editingClient?.id || '') === clientId) setEditingClient(freshClient);
    return freshClient;
  };

  useEffect(() => {
    if (!activeEnterpriseId && !isSystemWideAdmin) return;

    const loadData = async () => {
      try {
        const enterprisesData = await ApiService.getEnterprises();
        const scopedEnterpriseIds = isSystemWideAdmin
          ? enterprisesData.map((enterprise: Enterprise) => String(enterprise.id || '').trim()).filter(Boolean)
          : [activeEnterpriseId].filter(Boolean);

        const [clientsByEnterprise, plansByEnterprise, transactionsData] = await Promise.all([
          Promise.all(scopedEnterpriseIds.map((enterpriseId) => ApiService.getClients(enterpriseId))),
          Promise.all(scopedEnterpriseIds.map((enterpriseId) => ApiService.getPlans(enterpriseId))),
          ApiService.getTransactions()
        ]);

        const clientsData = clientsByEnterprise.flat();
        const plansData = plansByEnterprise.flat();
        const dedupById = <T extends { id?: string }>(items: T[]) => {
          const map = new Map<string, T>();
          items.forEach((item) => {
            const key = String(item?.id || '').trim();
            if (key) map.set(key, item);
          });
          return Array.from(map.values());
        };

        setClients(dedupById(clientsData));
        setEnterprises(enterprisesData);
        setPlans(dedupById(plansData));
        setTransactions(transactionsData);
      } catch (err) {
        console.error('Erro ao carregar dados:', err);
        setClients([]);
        setEnterprises([]);
        setPlans([]);
        setTransactions([]);
      }
    };
    loadData();
  }, [activeEnterpriseId, isSystemWideAdmin]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('canteen_resolve_now_intent');
      if (raw) {
        const parsed = JSON.parse(raw);
        setPendingResolveIntent(parsed);
        sessionStorage.removeItem('canteen_resolve_now_intent');
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!isClientModalOpen) {
      setResolveNowHelper(null);
    }
  }, [isClientModalOpen]);

  const schoolCalendarYearsToLoad = useMemo(() => {
    return Array.from(new Set([
      calendarMonth.getFullYear(),
      rechargeCalendarMonth.getFullYear(),
      new Date().getFullYear(),
    ]));
  }, [calendarMonth, rechargeCalendarMonth]);

  const schoolCalendarEnterpriseId = useMemo(() => {
    const fromViewing = String(viewingClient?.enterpriseId || '').trim();
    if (fromViewing) return fromViewing;

    const fromRecharge = String(rechargingClient?.enterpriseId || '').trim();
    if (fromRecharge) return fromRecharge;

    if (isUnitAdmin) return String(activeEnterprise?.id || '').trim();

    const fromSelection = String(selectedUnitId || '').trim();
    if (fromSelection && fromSelection !== 'ALL') return fromSelection;

    return String(activeEnterprise?.id || '').trim();
  }, [viewingClient?.enterpriseId, rechargingClient?.enterpriseId, isUnitAdmin, selectedUnitId, activeEnterprise?.id]);

  useEffect(() => {
    setSchoolCalendarBlockedDatesByYear({});
    setSchoolCalendarEventTitlesByDate({});
  }, [schoolCalendarEnterpriseId]);

  useEffect(() => {
    const enterpriseId = schoolCalendarEnterpriseId;
    if (!enterpriseId) return;

    const missingYears = schoolCalendarYearsToLoad.filter((year) => schoolCalendarBlockedDatesByYear[year] === undefined);
    if (missingYears.length === 0) return;

    let cancelled = false;

    const loadSchoolCalendarYears = async () => {
      const results = await Promise.all(
        missingYears.map(async (year) => {
          try {
            const payload = await ApiService.getSchoolCalendar(enterpriseId, year);
            const extracted = extractSchoolCalendarOperationalData(payload, year);
            const blockedDates = extracted.blockedDates;
            const eventTitles = extracted.eventTitlesByDate;

            return [year, blockedDates, eventTitles] as const;
          } catch (error) {
            console.error(`Erro ao carregar calendário escolar (${year}):`, error);
            return [year, [], {}] as const;
          }
        })
      );

      if (cancelled) return;

      setSchoolCalendarBlockedDatesByYear((prev) => {
        const next = { ...prev };
        results.forEach(([year, dates]) => {
          next[year] = dates;
        });
        return next;
      });

      setSchoolCalendarEventTitlesByDate((prev) => {
        const merged = { ...prev };
        results.forEach(([, , titles]) => {
          Object.assign(merged, titles);
        });
        return merged;
      });
    };

    void loadSchoolCalendarYears();

    return () => {
      cancelled = true;
    };
  }, [schoolCalendarEnterpriseId, schoolCalendarYearsToLoad, schoolCalendarBlockedDatesByYear]);

  useEffect(() => {
    if (consumptionPeriod !== 'DATE') return;
    if (consumptionSpecificDate) return;
    setConsumptionSpecificDate(new Date().toISOString().slice(0, 10));
  }, [consumptionPeriod, consumptionSpecificDate]);

  const [formData, setFormData] = useState({
    name: '',
    type: 'ALUNO' as 'ALUNO' | 'RESPONSAVEL' | 'COLABORADOR',
    servicePlans: [] as ClientPlanType[],
    class: '',
    classType: '' as '' | 'INFANTIL' | 'FUNDAMENTAL' | 'MEDIO' | 'INTEGRAL',
    classGrade: '',
    balance: 0,
    dailyLimit: 30,
    initialCredit: 0,
    isDailyLimitActive: false,
    isBlocked: false,
    restrictions: [] as string[],
    dietaryNotes: '',
    parentName: '',
    parentRelationship: 'PAIS',
    parentWhatsappCountryCode: '55',
    parentWhatsapp: '',
    parentCpf: '',
    parentEmail: '',
    photo: ''
  });
  const [responsibleSourceMode, setResponsibleSourceMode] = useState<'NEW' | 'RESPONSAVEL' | 'COLABORADOR'>('NEW');
  const [responsibleClientSearch, setResponsibleClientSearch] = useState('');
  const [responsibleClientId, setResponsibleClientId] = useState<string | null>(null);
  const [responsibleCollaboratorSearch, setResponsibleCollaboratorSearch] = useState('');
  const [responsibleCollaboratorId, setResponsibleCollaboratorId] = useState<string | null>(null);
  const [newCollaboratorRole, setNewCollaboratorRole] = useState('');
  const [addDependentStudent, setAddDependentStudent] = useState(false);
  const [dependentStudentForm, setDependentStudentForm] = useState({
    name: '',
    classType: '' as '' | 'INFANTIL' | 'FUNDAMENTAL' | 'MEDIO' | 'INTEGRAL',
    classGrade: '',
    dailyLimit: 30,
    restrictions: '',
  });

  const gradeOptions = {
    INFANTIL: ['1', '2', '3', '4', '5'],
    FUNDAMENTAL: ['1? ano', '2? ano', '3? ano', '4? ano', '5? ano', '6? ano', '7? ano', '8? ano', '9? ano'],
    MEDIO: ['1? ano', '2? ano', '3? ano'],
    INTEGRAL: []
  };
  const collaboratorCandidates = useMemo(() => {
    return clients
      .filter((client) => String(client.type || '').toUpperCase() === 'COLABORADOR')
      .filter((client) => !isUnitAdmin || client.enterpriseId === activeEnterpriseId)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR', { sensitivity: 'base' }));
  }, [clients, isUnitAdmin, activeEnterpriseId]);
  const responsibleCandidates = useMemo(() => {
    return clients
      .filter((client) => String(client.type || '').toUpperCase() === 'RESPONSAVEL')
      .filter((client) => !isUnitAdmin || client.enterpriseId === activeEnterpriseId)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR', { sensitivity: 'base' }));
  }, [clients, isUnitAdmin, activeEnterpriseId]);
  const selectedResponsibleClient = useMemo(
    () => responsibleCandidates.find((client) => client.id === responsibleClientId) || null,
    [responsibleCandidates, responsibleClientId]
  );
  const filteredResponsibleClients = useMemo(() => {
    const query = normalizeSearchText(responsibleClientSearch);
    const base = responsibleCandidates;
    if (!query) return base.slice(0, 8);
    return base
      .filter((client) =>
        normalizeSearchText(client.name).includes(query)
        || normalizeSearchText(client.registrationId).includes(query)
        || normalizeSearchText(client.parentRelationship).includes(query)
      )
      .slice(0, 8);
  }, [responsibleCandidates, responsibleClientSearch]);
  const selectedResponsibleCollaborator = useMemo(
    () => collaboratorCandidates.find((client) => client.id === responsibleCollaboratorId) || null,
    [collaboratorCandidates, responsibleCollaboratorId]
  );
  const filteredResponsibleCollaborators = useMemo(() => {
    const query = normalizeSearchText(responsibleCollaboratorSearch);
    const base = collaboratorCandidates;
    if (!query) return base.slice(0, 8);
    return base
      .filter((client) =>
        normalizeSearchText(client.name).includes(query)
        || normalizeSearchText(client.registrationId).includes(query)
        || normalizeSearchText(client.class).includes(query)
      )
      .slice(0, 8);
  }, [collaboratorCandidates, responsibleCollaboratorSearch]);

  const filteredClients = useMemo(() => {
    const normalizedSearch = normalizeSearchText(searchTerm);

    return clients.filter(c => {
      const normalizedType = String(c.type || '').toUpperCase();
      const isStudent = normalizedType === 'ALUNO';
      const isCollaborator = normalizedType === 'COLABORADOR';
      const matchesViewMode = viewMode === 'ALUNOS' ? isStudent : isCollaborator;
      if (!matchesViewMode) return false;

      const matchesSearch =
        !normalizedSearch
        || normalizeSearchText(c.name).includes(normalizedSearch)
        || normalizeSearchText(c.registrationId).includes(normalizedSearch)
        || normalizeSearchText(c.class).includes(normalizedSearch);
      
      let matchesUnit = true;
      if (isUnitAdmin) {
        matchesUnit = c.enterpriseId === activeEnterpriseId;
      } else {
        matchesUnit = selectedUnitId === 'ALL' || c.enterpriseId === selectedUnitId;
      }
      
      return matchesViewMode && matchesSearch && matchesUnit;
    }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
  }, [clients, searchTerm, selectedUnitId, isUnitAdmin, activeEnterpriseId, viewMode]);

  const resolveKinshipOrRole = (value?: string) => {
    const text = String(value || '').trim();
    if (!text) return 'Indefinido';
    const normalized = normalizeSearchText(text);
    if (normalized.includes('pai')) return 'Pai';
    if (normalized.includes('mae') || normalized.includes('mãe')) return 'Mãe';
    if (normalized.includes('avo') || normalized.includes('avô') || normalized.includes('avó')) return 'Avós';
    if (normalized.includes('tio') || normalized.includes('tia')) return 'Tios';
    if (normalized.includes('tutor')) return 'Tutor legal';
    return 'Indefinido';
  };

  const formatParentRelationship = (value?: string) => {
    const normalized = String(value || '').trim().toUpperCase();
    if (normalized === 'PAIS') return 'Pais';
    if (normalized === 'AVOS') return 'Avós';
    if (normalized === 'TIOS') return 'Tios';
    if (normalized === 'TUTOR_LEGAL') return 'Tutor legal';
    return '';
  };

  const responsibleOrCollaboratorRows = useMemo<ResponsibleOrCollaboratorRow[]>(() => {
    if (viewMode !== 'CLIENTES_RESPONSAVEIS') return [];

    const normalizedSearch = normalizeSearchText(searchTerm);
    const matchesUnit = (client: Client) => {
      if (isUnitAdmin) return client.enterpriseId === activeEnterpriseId;
      return selectedUnitId === 'ALL' || client.enterpriseId === selectedUnitId;
    };

    const rows: ResponsibleOrCollaboratorRow[] = [];
    const responsibleMap = new Map<string, ResponsibleOrCollaboratorRow>();

    clients.forEach((client) => {
      if (!matchesUnit(client)) return;
      const type = String(client.type || '').toUpperCase();

      if (type === 'COLABORADOR' || type === 'RESPONSAVEL') {
        const row: ResponsibleOrCollaboratorRow = {
          id: `direct:${client.id}`,
          registrationId: client.registrationId || '-',
          name: client.name || 'Não informado',
          photo: client.photo,
          tipoConta: type === 'COLABORADOR' ? 'COLABORADOR' : 'RESPONSAVEL',
          cargoParentesco: String(client.class || client.parentName || '').trim() || 'Indefinido',
          phone: String(client.phone || client.parentWhatsapp || client.guardianPhone || '').trim(),
          email: client.email || client.parentEmail || client.guardianEmail || '',
          sourceClient: client,
        };
        rows.push(row);
        return;
      }

      if (type !== 'ALUNO') return;

      const responsibleName = String(client.parentName || client.guardianName || client.guardians?.[0] || '').trim();
      const responsiblePhone = String(client.parentWhatsapp || client.guardianPhone || '').trim();
      if (!responsibleName && !responsiblePhone) return;

      const key = `${normalizeSearchText(responsibleName)}|${String(responsiblePhone).replace(/\D/g, '')}`;
      if (!responsibleMap.has(key)) {
        responsibleMap.set(key, {
          id: `responsavel:${key || client.id}`,
          registrationId: client.registrationId || '-',
          name: responsibleName || 'Não informado',
          photo: client.photo,
          tipoConta: 'RESPONSAVEL',
          cargoParentesco: formatParentRelationship((client as any)?.parentRelationship) || resolveKinshipOrRole(`${client.parentName || ''} ${client.guardianName || ''}`),
          phone: responsiblePhone,
          email: client.parentEmail || client.guardianEmail || '',
        });
      }
    });

    const merged = [...rows, ...Array.from(responsibleMap.values())];

    const filtered = merged
      .filter((row) => {
        if (!normalizedSearch) return true;
        return (
          normalizeSearchText(row.name).includes(normalizedSearch)
          || normalizeSearchText(row.registrationId).includes(normalizedSearch)
          || normalizeSearchText(row.cargoParentesco).includes(normalizedSearch)
          || normalizeSearchText(row.phone).includes(normalizedSearch)
        );
      });

    const dedupedMap = new Map<string, ResponsibleOrCollaboratorRow>();
    filtered.forEach((row) => {
      const personKey = `${normalizeSearchText(row.name)}|${String(row.phone || '').replace(/\D/g, '')}` || String(row.id || '');
      const existing = dedupedMap.get(personKey);
      if (!existing) {
        dedupedMap.set(personKey, row);
        return;
      }
      if (!existing.sourceClient && row.sourceClient) {
        dedupedMap.set(personKey, row);
      }
    });

    return Array.from(dedupedMap.values())
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
  }, [viewMode, clients, searchTerm, isUnitAdmin, activeEnterpriseId, selectedUnitId]);

  const normalizePhoneDigits = (phone?: string) => String(phone || '').replace(/\D/g, '');

  const resolveResponsibleRelationshipLabel = (client: Client) => {
    const direct = formatParentRelationship((client as any)?.parentRelationship);
    if (direct) return direct;
    const raw = `${client.parentName || ''} ${client.guardianName || ''}`.trim();
    const kinship = resolveKinshipOrRole(raw);
    return kinship || 'Indefinido';
  };

  const handleOpenWhatsAppConversation = (
    phone?: string,
    key?: string,
    context?: {
      displayName?: string;
      contactTypeLabel?: string;
      relationshipLabel?: string;
    }
  ) => {
    const normalizedPhone = String(phone || '').replace(/\D/g, '');
    if (!normalizedPhone) {
      alert('Telefone não informado para este contato.');
      return;
    }
    const statusKey = key || normalizedPhone;
    setOpeningWhatsAppKey(statusKey);
    localStorage.setItem('whatsapp_open_phone', normalizedPhone);
    if (context) {
      localStorage.setItem('whatsapp_open_context', JSON.stringify({
        displayName: String(context.displayName || '').trim(),
        contactTypeLabel: String(context.contactTypeLabel || '').trim(),
        relationshipLabel: String(context.relationshipLabel || '').trim(),
      }));
    }
    navigate('/whatsapp');
    window.setTimeout(() => {
      setOpeningWhatsAppKey((prev) => (prev === statusKey ? null : prev));
    }, 2500);
  };

  const handleGeneratePortalLink = async (row: ResponsibleOrCollaboratorRow) => {
    const userId = String(row?.sourceClient?.id || '').trim();
    if (!userId) {
      alert('Este contato não possui cadastro próprio de responsável/colaborador. Cadastre-o como cliente para gerar o link do painel.');
      return;
    }

    try {
      setIsGeneratingPortalLink(true);
      const result = await ApiService.generatePortalAccessLink(userId);
      const link = String(result?.accessLink || '').trim();
      if (!link) {
        throw new Error('Link não retornado pelo servidor.');
      }
      const clientId = String(row?.sourceClient?.id || '').trim();
      const directKey = clientId ? `direct:${clientId}` : '';
      setPortalLinksByRowId((prev) => ({
        ...prev,
        [String(row.id || '').trim()]: link,
        ...(directKey ? { [directKey]: link } : {}),
      }));
      setPortalLinkTargetName(String(row?.name || 'Cliente'));
      setPortalLinkValue(link);
      setPortalLinkModalOpen(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao gerar link do portal.');
    } finally {
      setIsGeneratingPortalLink(false);
    }
  };

  const handleGenerateExistingPortalLinks = async () => {
    try {
      setIsGeneratingExistingPortalLinks(true);
      const result = await ApiService.generatePortalLinksForExistingClients(activeEnterpriseId);
      const generated = Array.isArray(result?.generated) ? result.generated : [];
      if (generated.length === 0) {
        alert('Nenhum link foi gerado para os cadastros existentes desta unidade.');
        return;
      }

      setPortalLinksByRowId((prev) => {
        const next = { ...prev };
        generated.forEach((item: any) => {
          const clientId = String(item?.clientId || '').trim();
          const link = String(item?.accessLink || '').trim();
          if (!clientId || !link) return;
          next[`direct:${clientId}`] = link;
        });
        return next;
      });

      const lines = generated.map((item: any) => {
        const name = String(item?.name || 'Cliente');
        const link = String(item?.accessLink || '').trim();
        return `${name}: ${link}`;
      });

      const payload = lines.join('\n');
      await navigator.clipboard.writeText(payload);
      alert(`Links gerados: ${generated.length}. Lista copiada para a área de transferência.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao gerar links dos clientes existentes.');
    } finally {
      setIsGeneratingExistingPortalLinks(false);
    }
  };

  const resolvePortalLinkForRow = (row: ResponsibleOrCollaboratorRow) => {
    const rowKey = String(row?.id || '').trim();
    const rowLink = String(portalLinksByRowId[rowKey] || '').trim();
    if (rowLink) return rowLink;

    const clientId = String(row?.sourceClient?.id || '').trim();
    if (!clientId) return '';
    return String(portalLinksByRowId[`direct:${clientId}`] || '').trim();
  };

  const handleCopyPortalLink = async (row: ResponsibleOrCollaboratorRow) => {
    const link = resolvePortalLinkForRow(row);
    if (!link) {
      alert('Gere o link primeiro para poder copiar.');
      return;
    }
    await navigator.clipboard.writeText(link);
    alert('Link copiado!');
  };

  const handleOpenPortalLink = (row: ResponsibleOrCollaboratorRow) => {
    const link = resolvePortalLinkForRow(row);
    if (!link) {
      alert('Gere o link primeiro para poder abrir.');
      return;
    }
    window.open(link, '_blank', 'noopener,noreferrer');
  };

  const availablePlans = useMemo(() => {
    const targetUnit = !isUnitAdmin && selectedUnitId !== 'ALL'
      ? selectedUnitId
      : activeEnterpriseId;
    return plans.filter((p) => {
      const matchesUnit = targetUnit ? p.enterpriseId === targetUnit : isSystemWideAdmin;
      if (!matchesUnit) return false;
      if (isSystemWideAdmin) return true;
      return p.isActive !== false;
    });
  }, [plans, activeEnterpriseId, isUnitAdmin, selectedUnitId, isSystemWideAdmin]);

  const currentEnterpriseConfig = useMemo(() => {
    return enterprises.find(ent => ent.id === activeEnterpriseId) || activeEnterprise;
  }, [enterprises, activeEnterprise]);

  const allowedServiceDayKeys = useMemo(() => {
    const openingHours = currentEnterpriseConfig?.openingHours || {};
    const hasConfiguredDays = Object.keys(openingHours).length > 0;
    if (!hasConfiguredDays) return WEEK_DAY_OPTIONS.map(day => day.key);

    return WEEK_DAY_OPTIONS
      .filter((day) => {
        const alias = DAY_KEY_ALIASES[day.key].find((k) => openingHours[k as keyof typeof openingHours] !== undefined);
        const dayConfig: any = alias ? openingHours[alias as keyof typeof openingHours] : undefined;
        if (!dayConfig) return false;
        return !Boolean(dayConfig.closed);
      })
      .map(day => day.key);
  }, [currentEnterpriseConfig?.openingHours]);

  const allowedServiceDayKeySet = useMemo(() => new Set(allowedServiceDayKeys), [allowedServiceDayKeys]);
  const schoolCalendarBlockedDateSetByYear = useMemo(() => {
    return Object.entries(schoolCalendarBlockedDatesByYear).reduce((acc, [yearKey, dates]) => {
      acc[Number(yearKey)] = new Set(Array.isArray(dates) ? dates : []);
      return acc;
    }, {} as Record<number, Set<string>>);
  }, [schoolCalendarBlockedDatesByYear]);

  const isServiceDateAllowed = (date: Date) => {
    const dayKey = jsDayToWeekDay[date.getDay()];
    if (!allowedServiceDayKeySet.has(dayKey)) return false;

    const dateKey = toDateKey(date);
    const blockedSet = schoolCalendarBlockedDateSetByYear[date.getFullYear()];
    if (blockedSet?.has(dateKey)) return false;

    return true;
  };
  const isSchoolCalendarBlockedDate = (date: Date) => {
    const blockedSet = schoolCalendarBlockedDateSetByYear[date.getFullYear()];
    return Boolean(blockedSet?.has(toDateKey(date)));
  };
  const isSchoolCalendarYearLoaded = (year: number) => schoolCalendarBlockedDatesByYear[year] !== undefined;
  const isSchoolCalendarReadyForDate = (date: Date) => isSchoolCalendarYearLoaded(date.getFullYear());
  const getSchoolEventTitle = (date: Date): string | null => {
    return schoolCalendarEventTitlesByDate[toDateKey(date)] || null;
  };
  const isPastDate = (date: Date) => toDateKey(date) < toDateKey(new Date());

  useEffect(() => {
    const filterDateKeysByAllowedWeekdays = (dateKeys: string[]) => {
      return dateKeys.filter((dateKey) => {
        const parsed = new Date(`${dateKey}T00:00:00`);
        if (Number.isNaN(parsed.getTime())) return false;
        return isServiceDateAllowed(parsed);
      });
    };

    setSelectedPlanDays((prev) => {
      const next = Object.entries(prev as Record<string, string[]>).reduce((acc, [planId, days]) => {
        acc[planId] = (days || []).filter(day => allowedServiceDayKeySet.has(day));
        return acc;
      }, {} as Record<string, string[]>);
      return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
    });

    setRechargePlanDays((prev) => {
      const next = Object.entries(prev as Record<string, string[]>).reduce((acc, [planId, days]) => {
        acc[planId] = (days || []).filter(day => allowedServiceDayKeySet.has(day));
        return acc;
      }, {} as Record<string, string[]>);
      return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
    });

    setSelectedPlanDates((prev) => {
      const next = Object.entries(prev as Record<string, string[]>).reduce((acc, [planId, dates]) => {
        acc[planId] = filterDateKeysByAllowedWeekdays(dates || []);
        return acc;
      }, {} as Record<string, string[]>);
      return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
    });

    setRechargePlanDates((prev) => {
      const next = Object.entries(prev as Record<string, string[]>).reduce((acc, [planId, dates]) => {
        acc[planId] = filterDateKeysByAllowedWeekdays(dates || []);
        return acc;
      }, {} as Record<string, string[]>);
      return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
    });
  }, [allowedServiceDayKeySet]);

  // When school calendar data loads, remove any already-selected dates that fall on holidays/recess (race condition fix)
  useEffect(() => {
    if (Object.keys(schoolCalendarBlockedDateSetByYear).length === 0) return;

    const filterBlockedDates = (dateKeys: string[]) =>
      dateKeys.filter((dateKey) => {
        const year = Number(dateKey.slice(0, 4));
        const blockedSet = schoolCalendarBlockedDateSetByYear[year];
        return !blockedSet?.has(dateKey);
      });

    setSelectedPlanDates((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const planId of Object.keys(next)) {
        const filtered = filterBlockedDates(next[planId] || []);
        if (filtered.length !== (next[planId] || []).length) { next[planId] = filtered; changed = true; }
      }
      return changed ? next : prev;
    });

    setRechargePlanDates((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const planId of Object.keys(next)) {
        const filtered = filterBlockedDates(next[planId] || []);
        if (filtered.length !== (next[planId] || []).length) { next[planId] = filtered; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [schoolCalendarBlockedDateSetByYear]);

  const calendarMonthLabel = useMemo(() => {
    return calendarMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }, [calendarMonth]);

  const calendarGrid = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const totalDays = new Date(year, month + 1, 0).getDate();
    const startOffset = firstDay.getDay(); // Sunday-based
    const cells: Array<Date | null> = [];

    for (let i = 0; i < startOffset; i += 1) cells.push(null);
    for (let day = 1; day <= totalDays; day += 1) cells.push(new Date(year, month, day));

    return cells;
  }, [calendarMonth]);

  const rechargeCalendarMonthLabel = useMemo(() => {
    return rechargeCalendarMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }, [rechargeCalendarMonth]);

  const rechargeCalendarGrid = useMemo(() => {
    const year = rechargeCalendarMonth.getFullYear();
    const month = rechargeCalendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const totalDays = new Date(year, month + 1, 0).getDate();
    const startOffset = firstDay.getDay(); // Sunday-based
    const cells: Array<Date | null> = [];

    for (let i = 0; i < startOffset; i += 1) cells.push(null);
    for (let day = 1; day <= totalDays; day += 1) cells.push(new Date(year, month, day));

    return cells;
  }, [rechargeCalendarMonth]);

  const getDateKeysForWeekdayInCurrentMonth = (weekDayKey: string) => {
    const targetJsDay = weekDayToJsDay[weekDayKey];
    if (targetJsDay === undefined) return [];

    const result: string[] = [];
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const totalDays = new Date(year, month + 1, 0).getDate();

    for (let day = 1; day <= totalDays; day += 1) {
      const date = new Date(year, month, day);
      if (date.getDay() === targetJsDay && isServiceDateAllowed(date)) result.push(toDateKey(date));
    }

    return result;
  };

  const getDateKeysForWeekdayInRechargeMonth = (weekDayKey: string) => {
    const targetJsDay = weekDayToJsDay[weekDayKey];
    if (targetJsDay === undefined) return [];

    const result: string[] = [];
    const year = rechargeCalendarMonth.getFullYear();
    const month = rechargeCalendarMonth.getMonth();
    const totalDays = new Date(year, month + 1, 0).getDate();

    for (let day = 1; day <= totalDays; day += 1) {
      const date = new Date(year, month, day);
      if (date.getDay() === targetJsDay && isServiceDateAllowed(date)) result.push(toDateKey(date));
    }

    return result;
  };

  const sanitizeDateMapBySchoolCalendar = (datesByPlan: Record<string, string[]>) => {
    const next = Object.entries(datesByPlan || {}).reduce((acc, [planId, dates]) => {
      acc[planId] = (Array.isArray(dates) ? dates : []).filter((dateKey) => {
        const year = Number(String(dateKey || '').slice(0, 4));
        if (!Number.isFinite(year)) return false;
        const blockedSet = schoolCalendarBlockedDateSetByYear[year];
        return !blockedSet?.has(String(dateKey));
      });
      return acc;
    }, {} as Record<string, string[]>);

    return next;
  };

  const handleOpenCreateModal = () => {
    setEditingClient(null);
    setIsStudentOnlyMode(false);
    setLinkingStudentContextName('');
    setSelectedPlanDays({});
    setSelectedPlanDates({});
    setSelectedPlanShifts({});
    setPlanRequiredUnitsById({});
    setOpenPlanCalendarId(null);
    setCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    setFormData({
      name: '', type: isResponsibleView ? 'COLABORADOR' : 'ALUNO', servicePlans: ['PREPAGO'], class: '', classType: '', classGrade: '', balance: 0,
      dailyLimit: 30, initialCredit: 0, isDailyLimitActive: false, isBlocked: false,
      restrictions: [], dietaryNotes: '', parentName: '', parentRelationship: 'PAIS', parentWhatsappCountryCode: '55', parentWhatsapp: '', parentCpf: '', parentEmail: '', photo: ''
    });
    setResponsibleSourceMode('NEW');
    setResponsibleClientSearch('');
    setResponsibleClientId(null);
    setResponsibleCollaboratorSearch('');
    setResponsibleCollaboratorId(null);
    setNewCollaboratorRole('');
    setAddDependentStudent(false);
    setDependentStudentForm({ name: '', classType: '', classGrade: '', dailyLimit: 30, restrictions: '' });
    setClientPhotoFile(null);
    setClientPhotoPreview('');
    setIsClientModalOpen(true);
  };

  const handleOpenCreateStudentFromDetail = () => {
    const phoneParts = splitPhoneByCountryCode(viewingClient?.phone || viewingClient?.parentWhatsapp || '');
    const viewingType = String(viewingClient?.type || '').toUpperCase();
    const linkingFromStudent = viewingType === 'ALUNO';
    const viewingClientName = String(viewingClient?.name || '').trim();
    const linkedResponsibleClientId = String((viewingClient as any)?.responsibleClientId || '').trim();
    const linkedResponsibleCollaboratorId = String((viewingClient as any)?.responsibleCollaboratorId || '').trim();
    const linkedResponsibleClient = linkedResponsibleClientId
      ? clients.find((candidate) => String(candidate?.id || '').trim() === linkedResponsibleClientId)
      : null;
    const linkedResponsibleCollaborator = linkedResponsibleCollaboratorId
      ? clients.find((candidate) => String(candidate?.id || '').trim() === linkedResponsibleCollaboratorId)
      : null;
    setEditingClient(null);
    setIsStudentOnlyMode(true);
    setLinkingStudentContextName(linkingFromStudent ? viewingClientName : '');
    setSelectedPlanDays({});
    setSelectedPlanDates({});
    setSelectedPlanShifts({});
    setOpenPlanCalendarId(null);
    setCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    setFormData({
      name: '',
      type: 'ALUNO',
      servicePlans: ['PREPAGO'],
      class: '',
      classType: '',
      classGrade: '',
      balance: 0,
      dailyLimit: 30,
      initialCredit: 0,
      isDailyLimitActive: false,
      isBlocked: false,
      restrictions: [],
      dietaryNotes: '',
      parentName: viewingType === 'RESPONSAVEL' || viewingType === 'COLABORADOR' ? String(viewingClient?.name || '') : String(viewingClient?.parentName || ''),
      parentRelationship: String((viewingClient as any)?.parentRelationship || 'PAIS'),
      parentWhatsappCountryCode: phoneParts.countryCode,
      parentWhatsapp: phoneParts.localPhone,
      parentCpf: viewingType === 'RESPONSAVEL' || viewingType === 'COLABORADOR' ? String(viewingClient?.cpf || '') : String(viewingClient?.parentCpf || ''),
      parentEmail: viewingType === 'RESPONSAVEL' || viewingType === 'COLABORADOR' ? String(viewingClient?.email || '') : String(viewingClient?.parentEmail || ''),
      photo: ''
    });
    if (linkingFromStudent && linkedResponsibleCollaborator?.id) {
      setResponsibleSourceMode('COLABORADOR');
      setResponsibleCollaboratorId(linkedResponsibleCollaborator.id);
      setResponsibleCollaboratorSearch(String(linkedResponsibleCollaborator.name || ''));
      setNewCollaboratorRole(String(linkedResponsibleCollaborator.class || (viewingClient as any)?.parentRelationship || ''));
      setResponsibleClientSearch('');
      setResponsibleClientId(null);
    } else if (linkingFromStudent && linkedResponsibleClient?.id) {
      setResponsibleSourceMode('RESPONSAVEL');
      setResponsibleClientId(linkedResponsibleClient.id);
      setResponsibleClientSearch(String(linkedResponsibleClient.name || ''));
      setResponsibleCollaboratorSearch('');
      setResponsibleCollaboratorId(null);
      setNewCollaboratorRole('');
    } else if (String(viewingClient?.type || '').toUpperCase() === 'COLABORADOR' && viewingClient?.id) {
      setResponsibleSourceMode('COLABORADOR');
      setResponsibleCollaboratorId(viewingClient.id);
      setResponsibleCollaboratorSearch(String(viewingClient.name || ''));
      setNewCollaboratorRole(String(viewingClient.class || ''));
      setResponsibleClientSearch('');
      setResponsibleClientId(null);
    } else if (String(viewingClient?.type || '').toUpperCase() === 'RESPONSAVEL' && viewingClient?.id) {
      setResponsibleSourceMode('RESPONSAVEL');
      setResponsibleClientId(viewingClient.id);
      setResponsibleClientSearch(String(viewingClient.name || ''));
      setResponsibleCollaboratorSearch('');
      setResponsibleCollaboratorId(null);
    } else {
      setResponsibleSourceMode('NEW');
      setResponsibleClientSearch('');
      setResponsibleClientId(null);
      setResponsibleCollaboratorSearch('');
      setResponsibleCollaboratorId(null);
      setNewCollaboratorRole('');
    }
    setAddDependentStudent(false);
    setDependentStudentForm({ name: '', classType: '', classGrade: '', dailyLimit: 30, restrictions: '' });
    setClientPhotoFile(null);
    setClientPhotoPreview('');
    setIsDetailModalOpen(false);
    setIsClientModalOpen(true);
  };

  const handleOpenEditModal = (client: Client) => {
    const phoneParts = splitPhoneByCountryCode(client.parentWhatsapp || '', client.parentWhatsappCountryCode || '55');
    const classParts = (client.class || '').split(' - ').map(part => part.trim());
    const maybeClassType = classParts.length > 1 ? classParts[0] : '';
    const maybeClassGrade = classParts.length > 1 ? classParts.slice(1).join(' - ') : '';

    const parsedClassType = ['INFANTIL', 'FUNDAMENTAL', 'MEDIO', 'INTEGRAL'].includes(maybeClassType)
      ? (maybeClassType as '' | 'INFANTIL' | 'FUNDAMENTAL' | 'MEDIO' | 'INTEGRAL')
      : ((client.class || '').trim().toUpperCase() === 'INTEGRAL' ? 'INTEGRAL' : '');

    const existingSelectedPlansRaw = (client as any).selectedPlansConfig;
    const existingSelectedPlans = (Array.isArray(existingSelectedPlansRaw) ? existingSelectedPlansRaw : []) as Array<{ planId?: string; planName?: string; daysOfWeek?: string[]; selectedDates?: string[]; deliveryShifts?: string[] }>;
    const normalizedPlanDays = existingSelectedPlans.reduce((acc, config) => {
      if (!config?.planId || !Array.isArray(config.daysOfWeek)) return acc;
      acc[config.planId] = config.daysOfWeek;
      return acc;
    }, {} as Record<string, string[]>);
    const normalizedPlanDates = existingSelectedPlans.reduce((acc, config) => {
      if (!config?.planId || !Array.isArray(config.selectedDates)) return acc;
      acc[config.planId] = config.selectedDates;
      return acc;
    }, {} as Record<string, string[]>);
    const normalizedPlanShifts = existingSelectedPlans.reduce((acc, config) => {
      if (!config?.planId || !Array.isArray(config.deliveryShifts)) return acc;
      acc[config.planId] = config.deliveryShifts;
      return acc;
    }, {} as Record<string, string[]>);

    if (!Object.keys(normalizedPlanDays).length) {
      const fallbackPlanDays = (Array.isArray(client.servicePlans) ? client.servicePlans : [])
        .filter(planName => !['PREPAGO', 'PF_FIXO', 'LANCHE_FIXO'].includes(planName))
        .reduce((acc, planName) => {
          const plan = availablePlans.find(p => p.name === planName);
          if (plan) acc[plan.id] = [...allowedServiceDayKeys];
          return acc;
        }, {} as Record<string, string[]>);
      setSelectedPlanDays(fallbackPlanDays);
    } else {
      setSelectedPlanDays(normalizedPlanDays);
    }
    setSelectedPlanDates(normalizedPlanDates);
    setSelectedPlanShifts(normalizedPlanShifts);
    setPlanRequiredUnitsById({});

    setEditingClient(client);
    setIsStudentOnlyMode(false);
    setLinkingStudentContextName('');
    setOpenPlanCalendarId(null);
    setCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    setFormData({
      name: client.name || '',
      type: (isResponsibleView ? 'COLABORADOR' : (client.type === 'COLABORADOR' ? 'COLABORADOR' : client.type === 'RESPONSAVEL' ? 'RESPONSAVEL' : 'ALUNO')) as 'ALUNO' | 'RESPONSAVEL' | 'COLABORADOR',
      servicePlans: (Array.isArray(client.servicePlans) ? client.servicePlans : ['PREPAGO']) as ClientPlanType[],
      class: client.type === 'COLABORADOR' ? (client.class || '') : '',
      classType: client.type === 'ALUNO' ? parsedClassType : '',
      classGrade: client.type === 'ALUNO' ? maybeClassGrade : '',
      balance: client.balance || 0,
      dailyLimit: client.dailyLimit || 30,
      initialCredit: client.balance || 0,
      isDailyLimitActive: Boolean(client.dailyLimit && client.dailyLimit > 0),
      isBlocked: client.isBlocked || false,
      restrictions: client.restrictions || [],
      dietaryNotes: client.dietaryNotes || '',
      parentName: client.parentName || '',
      parentRelationship: String((client as any)?.parentRelationship || 'PAIS'),
      parentWhatsappCountryCode: phoneParts.countryCode,
      parentWhatsapp: phoneParts.localPhone,
      parentCpf: client.parentCpf || '',
      parentEmail: client.parentEmail || '',
      photo: client.photo || ''
    });
    const matchedCollaborator = clients.find((candidate) => {
      if (String(candidate.type || '').toUpperCase() !== 'COLABORADOR') return false;
      const sameEnterprise = !isUnitAdmin || candidate.enterpriseId === activeEnterpriseId;
      if (!sameEnterprise) return false;
      const sameName = normalizeSearchText(candidate.name) === normalizeSearchText(client.parentName || '');
      const samePhone = normalizePhoneDigits(candidate.phone || '') && normalizePhoneDigits(candidate.phone || '') === normalizePhoneDigits(client.parentWhatsapp || '');
      return sameName || samePhone;
    });
    const matchedResponsible = clients.find((candidate) => {
      if (String(candidate.type || '').toUpperCase() !== 'RESPONSAVEL') return false;
      const sameEnterprise = !isUnitAdmin || candidate.enterpriseId === activeEnterpriseId;
      if (!sameEnterprise) return false;
      if (String((client as any)?.responsibleClientId || '').trim() && String(candidate.id || '').trim() === String((client as any)?.responsibleClientId || '').trim()) {
        return true;
      }
      const sameName = normalizeSearchText(candidate.name) === normalizeSearchText(client.parentName || '');
      const samePhone = normalizePhoneDigits(candidate.phone || candidate.parentWhatsapp || '')
        && normalizePhoneDigits(candidate.phone || candidate.parentWhatsapp || '') === normalizePhoneDigits(client.parentWhatsapp || '');
      const sameEmail = normalizeSearchText(candidate.email || candidate.parentEmail || '')
        && normalizeSearchText(candidate.email || candidate.parentEmail || '') === normalizeSearchText(client.parentEmail || '');
      return sameName || samePhone || sameEmail;
    });
    if (client.type === 'ALUNO' && matchedCollaborator?.id) {
      setResponsibleSourceMode('COLABORADOR');
      setResponsibleCollaboratorId(matchedCollaborator.id);
      setResponsibleCollaboratorSearch(String(matchedCollaborator.name || ''));
      setNewCollaboratorRole(String(client.parentRelationship || matchedCollaborator.class || ''));
      setResponsibleClientSearch('');
      setResponsibleClientId(null);
    } else if (!isUnitAdmin && client.type === 'ALUNO' && matchedResponsible?.id) {
      setResponsibleSourceMode('RESPONSAVEL');
      setResponsibleClientId(matchedResponsible.id);
      setResponsibleClientSearch(String(matchedResponsible.name || ''));
      setResponsibleCollaboratorSearch('');
      setResponsibleCollaboratorId(null);
      setNewCollaboratorRole('');
    } else {
      setResponsibleSourceMode('NEW');
      setResponsibleClientSearch('');
      setResponsibleClientId(null);
      setResponsibleCollaboratorSearch('');
      setResponsibleCollaboratorId(null);
      setNewCollaboratorRole('');
    }
    const existingRelatedStudent = (client as any)?.relatedStudent;
    const relatedClass = String(existingRelatedStudent?.class || '').trim();
    const relatedClassParts = relatedClass.split(' - ').map((part: string) => part.trim()).filter(Boolean);
    const relatedClassType = ['INFANTIL', 'FUNDAMENTAL', 'MEDIO', 'INTEGRAL'].includes(relatedClassParts[0] || '')
      ? (relatedClassParts[0] as '' | 'INFANTIL' | 'FUNDAMENTAL' | 'MEDIO' | 'INTEGRAL')
      : '';
    const relatedClassGrade = relatedClassType && relatedClassParts.length > 1 ? relatedClassParts.slice(1).join(' - ') : '';
    setAddDependentStudent(Boolean(client.type === 'COLABORADOR' && existingRelatedStudent?.name));
    setDependentStudentForm({
      name: String(existingRelatedStudent?.name || ''),
      classType: relatedClassType,
      classGrade: relatedClassGrade,
      dailyLimit: Number(existingRelatedStudent?.dailyLimit || 30),
      restrictions: Array.isArray(existingRelatedStudent?.restrictions) ? existingRelatedStudent.restrictions.join(', ') : '',
    });
    setClientPhotoFile(null);
    setClientPhotoPreview(resolveClientPhotoUrl(client.photo, client.name));
    setIsClientModalOpen(true);
  };

  useEffect(() => {
    if (!pendingResolveIntent || clients.length === 0) return;
    const targetClient = clients.find(c => String(c.id || '') === String(pendingResolveIntent.clientId || ''));
    if (targetClient) {
      setResolveNowHelper({
        message: pendingResolveIntent.message || 'Complete o cadastro para liberar a venda no PDV.',
        focusFields: pendingResolveIntent.focusFields || [],
        studentName: targetClient.name,
      });
      handleOpenEditModal(targetClient);
      window.setTimeout(() => {
        const focusOrder = pendingResolveIntent.focusFields || [];
        const selectorMap: Record<string, string> = {
          classType: '[data-resolve-target=\"classType\"]',
          classGrade: '[data-resolve-target=\"classGrade\"]',
        };
        const selector = focusOrder.map((key: string) => selectorMap[key]).find(Boolean) || selectorMap.classType;
        const el = selector ? (document.querySelector(selector) as HTMLElement | null) : null;
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          (el as HTMLInputElement).focus?.();
        }
      }, 350);
    }
    setPendingResolveIntent(null);
  }, [pendingResolveIntent, clients]);

  const handleOpenDetail = (client: Client) => {
    setViewingClient(client);
    setPlanViewNotice(null);
    const existingSelectedPlansRaw = (client as any).selectedPlansConfig;
    const existingSelectedPlans = (Array.isArray(existingSelectedPlansRaw) ? existingSelectedPlansRaw : []) as Array<{ planId?: string; daysOfWeek?: string[]; selectedDates?: string[]; deliveryShifts?: string[] }>;
    const activePlanIdSet = new Set(availablePlans.map(plan => plan.id));

    const normalizedPlanDays = existingSelectedPlans.reduce((acc, config) => {
      const planId = String(config?.planId || '');
      if (!planId || !activePlanIdSet.has(planId)) return acc;
      if (!Array.isArray(config.daysOfWeek)) return acc;
      acc[planId] = config.daysOfWeek;
      return acc;
    }, {} as Record<string, string[]>);

    const normalizedPlanDates = existingSelectedPlans.reduce((acc, config) => {
      const planId = String(config?.planId || '');
      if (!planId || !activePlanIdSet.has(planId)) return acc;
      if (!Array.isArray(config.selectedDates)) return acc;
      acc[planId] = config.selectedDates;
      return acc;
    }, {} as Record<string, string[]>);

    const normalizedPlanShifts = existingSelectedPlans.reduce((acc, config) => {
      const planId = String(config?.planId || '');
      if (!planId || !activePlanIdSet.has(planId)) return acc;
      if (!Array.isArray(config.deliveryShifts)) return acc;
      acc[planId] = config.deliveryShifts;
      return acc;
    }, {} as Record<string, string[]>);

    if (Object.keys(normalizedPlanDays).length === 0) {
      (Array.isArray(client.servicePlans) ? client.servicePlans : []).forEach((planName) => {
        const matchedPlan = availablePlans.find((p) => String(p.name || '').trim().toUpperCase() === String(planName || '').trim().toUpperCase());
        if (!matchedPlan) return;
        normalizedPlanDays[matchedPlan.id] = [];
        normalizedPlanDates[matchedPlan.id] = normalizedPlanDates[matchedPlan.id] || [];
        normalizedPlanShifts[matchedPlan.id] = normalizedPlanShifts[matchedPlan.id] || [];
      });
    }

    const planBalances = clientPlanBalances.get(client.id) || [];
    const balanceByPlanId = new Map(
      planBalances
        .filter((entry: any) => String(entry?.planId || '').trim())
        .map((entry: any) => [String(entry.planId), Math.max(0, Number(entry.remaining || 0))])
    );
    const balanceByPlanName = new Map(
      planBalances.map((entry) => [normalizeSearchText(entry.planName), Math.max(0, Number(entry.remaining || 0))])
    );
    const requiredByPlan: Record<string, number> = {};
    const allPlanIds = new Set<string>([
      ...Object.keys(normalizedPlanDays),
      ...Object.keys(normalizedPlanDates),
    ]);

    allPlanIds.forEach((planId) => {
      const planData = availablePlans.find((plan) => plan.id === planId);
      const byId = balanceByPlanId.get(planId);
      const byName = planData ? balanceByPlanName.get(normalizeSearchText(planData.name)) : undefined;
      const fallback = (normalizedPlanDates[planId] || []).length;
      const resolvedRaw = Number.isFinite(Number(byId))
        ? Number(byId)
        : (Number.isFinite(Number(byName)) ? Number(byName) : fallback);
      requiredByPlan[planId] = Math.max(0, Number(resolvedRaw || 0));
    });

    const sanitizedPlanDates = sanitizeDateMapBySchoolCalendar(normalizedPlanDates);
    const removedBlockedDatesCount = Object.keys(normalizedPlanDates).reduce((acc, planId) => {
      const original = (normalizedPlanDates[planId] || []).length;
      const sanitized = (sanitizedPlanDates[planId] || []).length;
      return acc + Math.max(0, original - sanitized);
    }, 0);

    setPlanRequiredUnitsById(requiredByPlan);

    setSelectedPlanDays(normalizedPlanDays);
    setSelectedPlanDates(sanitizedPlanDates);
    setSelectedPlanShifts(normalizedPlanShifts);
    setPlanEditBaseDatesById(
      Object.entries(sanitizedPlanDates).reduce((acc, [planId, dates]) => {
        acc[planId] = Array.from(new Set(dates || [])).sort();
        return acc;
      }, {} as Record<string, string[]>)
    );
    setPlanOriginalDatesById(
      Object.entries(sanitizedPlanDates).reduce((acc, [planId, dates]) => {
        acc[planId] = Array.from(new Set(dates || [])).sort();
        return acc;
      }, {} as Record<string, string[]>)
    );
    setOpenPlanCalendarId(null);
    setCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    setIsDetailModalOpen(true);

    if (removedBlockedDatesCount > 0) {
      showPlanNotice(
        `${removedBlockedDatesCount} data(s) em feriado/recesso foram removidas automaticamente do plano.`,
        'warning'
      );
    }
  };

  const togglePlan = (plan: ClientPlanType) => {
    setFormData(prev => ({
      ...prev,
      servicePlans: prev.servicePlans.includes(plan)
        ? prev.servicePlans.filter(p => p !== plan)
        : [...prev.servicePlans, plan]
    }));
  };

  const toggleCreatedPlan = (planId: string) => {
    setSelectedPlanDays(prev => {
      if (prev[planId]) {
        const next = { ...prev };
        delete next[planId];
        if (openPlanCalendarId === planId) setOpenPlanCalendarId(null);
        setSelectedPlanDates(prevDates => {
          const nextDates = { ...prevDates };
          delete nextDates[planId];
          return nextDates;
        });
        setSelectedPlanShifts(prevShifts => {
          const nextShifts = { ...prevShifts };
          delete nextShifts[planId];
          return nextShifts;
        });
        return next;
      }
      setOpenPlanCalendarId(planId);
      setSelectedPlanDates(prevDates => ({ ...prevDates, [planId]: prevDates[planId] || [] }));
      setSelectedPlanShifts(prevShifts => ({ ...prevShifts, [planId]: prevShifts[planId] || [] }));
      return { ...prev, [planId]: [] };
    });
  };

  const togglePlanShift = (planId: string, shiftKey: string) => {
    setSelectedPlanShifts(prev => {
      const current = prev[planId] || [];
      const has = current.includes(shiftKey);
      return {
        ...prev,
        [planId]: has ? current.filter(s => s !== shiftKey) : [...current, shiftKey],
      };
    });
  };

  const togglePlanDay = (planId: string, dayKey: string) => {
    if (!allowedServiceDayKeySet.has(dayKey)) return;

    setSelectedPlanDays(prev => {
      const currentDays = prev[planId] || [];
      const hasDay = currentDays.includes(dayKey);
      const nextDays = hasDay ? currentDays.filter(day => day !== dayKey) : [...currentDays, dayKey];

      setSelectedPlanDates(prevDates => {
        const currentDates = new Set(prevDates[planId] || []);
        const weekdayDates = getDateKeysForWeekdayInCurrentMonth(dayKey);
        const editableWeekdayDates = isDetailModalOpen
          ? weekdayDates.filter((dateKey) => dateKey >= toDateKey(new Date()))
          : weekdayDates;

        if (hasDay) {
          editableWeekdayDates.forEach(dateKey => currentDates.delete(dateKey));
        } else {
          editableWeekdayDates.forEach(dateKey => currentDates.add(dateKey));
        }

        return {
          ...prevDates,
          [planId]: Array.from(currentDates).sort(),
        };
      });

      return {
        ...prev,
        [planId]: nextDays,
      };
    });
  };

  const togglePlanDate = (planId: string, date: Date) => {
    if (!isSchoolCalendarReadyForDate(date)) return;
    if (!isServiceDateAllowed(date)) return;
    if (isSchoolCalendarBlockedDate(date)) return;
    if (isDetailModalOpen && isPastDate(date)) return;

    const dateKey = toDateKey(date);
    setSelectedPlanDates(prev => {
      const current = prev[planId] || [];
      const exists = current.includes(dateKey);
      const requiredCountRaw = Number(planRequiredUnitsById[planId] || 0);
      const requiredCount = Number.isFinite(requiredCountRaw) ? requiredCountRaw : 0;
      const baseDates = planEditBaseDatesById[planId] || [];
      const removedCount = baseDates.filter((baseDateKey) => !current.includes(baseDateKey)).length;
      const addedCount = current.filter((currentDateKey) => !baseDates.includes(currentDateKey)).length;
      const temporaryCreditUnits = Math.max(0, removedCount - addedCount);

      if (!exists && isDetailModalOpen && current.length >= requiredCount && temporaryCreditUnits <= 0) return prev;

      const nextDates = exists ? current.filter(d => d !== dateKey) : [...current, dateKey].sort();

      return {
        ...prev,
        [planId]: nextDates,
      };
    });
  };

  const getPlanTemporaryCreditUnits = (planId: string) => {
    const baseDates = planEditBaseDatesById[planId] || [];
    const currentDates = selectedPlanDates[planId] || [];
    const removedCount = baseDates.filter((dateKey) => !currentDates.includes(dateKey)).length;
    const addedCount = currentDates.filter((dateKey) => !baseDates.includes(dateKey)).length;
    return Math.max(0, removedCount - addedCount);
  };

  const hasPendingPlanDateChanges = (planId: string) => {
    const baseDates = (planEditBaseDatesById[planId] || []).slice().sort();
    const currentDates = (selectedPlanDates[planId] || []).slice().sort();
    if (baseDates.length !== currentDates.length) return true;
    for (let index = 0; index < baseDates.length; index += 1) {
      if (baseDates[index] !== currentDates[index]) return true;
    }
    return false;
  };

  const handleConfirmPlanDateChanges = async (planId: string) => {
    if (!hasPendingPlanDateChanges(planId)) {
      showPlanNotice('Nenhuma alteração pendente para confirmar neste plano.', 'warning');
      return;
    }
    if (isSavingPlanView) return;
    if (!viewingClient) return;

    const targetPlan = activePlansInView.find((plan) => String(plan.planId) === String(planId));
    if (!targetPlan) {
      showPlanNotice('Plano não encontrado para confirmação.', 'error');
      return;
    }

    const currentConfigsRaw = (viewingClient as any).selectedPlansConfig;
    const currentConfigs = (Array.isArray(currentConfigsRaw) ? currentConfigsRaw : []) as Array<any>;
    const nextTargetConfig = {
      planId: targetPlan.planId,
      planName: targetPlan.planName,
      planPrice: targetPlan.planPrice,
      daysOfWeek: Array.isArray(targetPlan.daysOfWeek) ? targetPlan.daysOfWeek : [],
      selectedDates: Array.from(new Set(targetPlan.selectedDates || [])).sort(),
      deliveryShifts: Array.isArray(targetPlan.deliveryShifts) ? targetPlan.deliveryShifts : [],
      subtotal: targetPlan.subtotal,
    };

    let replaced = false;
    const nextSelectedPlans = currentConfigs.map((cfg: any) => {
      const samePlan = String(cfg?.planId || '') === String(planId)
        || normalizeSearchText(cfg?.planName) === normalizeSearchText(targetPlan.planName);
      if (!samePlan) return cfg;
      replaced = true;
      return {
        ...cfg,
        ...nextTargetConfig,
      };
    });
    if (!replaced) nextSelectedPlans.push(nextTargetConfig);

    const baseServicePlans = (Array.isArray(viewingClient.servicePlans) ? viewingClient.servicePlans : [])
      .filter((plan) => String(plan || '').toUpperCase() === 'PREPAGO');
    const nextServicePlans = [...baseServicePlans, ...nextSelectedPlans.map((cfg) => cfg.planName as ClientPlanType)];

    const originalDates = Array.from(new Set(planOriginalDatesById[planId] || [])).sort() as string[];
    const updatedDates = Array.from(new Set(nextTargetConfig.selectedDates || [])).sort() as string[];
    const removedDates = originalDates.filter((dateKey) => !updatedDates.includes(dateKey)) as string[];
    const addedDates = updatedDates.filter((dateKey) => !originalDates.includes(dateKey)) as string[];

    setIsSavingPlanView(true);
    try {
      const updated = await ApiService.updateClient(viewingClient.id, {
        selectedPlansConfig: nextSelectedPlans,
        servicePlans: nextServicePlans,
      }, {
        expectedUpdatedAt: String((viewingClient as any)?.updatedAt || '').trim() || undefined,
      });

      if (removedDates.length > 0 || addedDates.length > 0) {
        const now = new Date();
        const removedLabel = removedDates.length > 0
          ? `Removidos: ${removedDates.map((dateKey) => formatDateKeyBr(dateKey)).join(', ')}`
          : '';
        const addedLabel = addedDates.length > 0
          ? `Remarcados: ${addedDates.map((dateKey) => formatDateKeyBr(dateKey)).join(', ')}`
          : '';
        const details = [removedLabel, addedLabel].filter(Boolean).join(' | ');

        const createdTx = await ApiService.createTransaction({
          clientId: viewingClient.id,
          clientName: viewingClient.name,
          enterpriseId: activeEnterpriseId,
          type: 'CREDIT',
          amount: 0,
          total: 0,
          plan: targetPlan.planName,
          planId: targetPlan.planId,
          paymentMethod: 'SISTEMA',
          method: 'SISTEMA',
          executionSource: 'SISTEMA',
          status: 'SISTEMA',
          date: toDateKey(now),
          time: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          timestamp: now.toISOString(),
          description: `Ajuste de calendário do plano ${targetPlan.planName}`,
          item: details || `Ajuste de datas do plano ${targetPlan.planName}`,
        });
        setTransactions((prev) => [createdTx, ...prev]);
      }

      setClients((prev) => prev.map((client) => (client.id === viewingClient.id ? updated : client)));
      setViewingClient(updated);
      setPlanEditBaseDatesById((prev) => ({
        ...prev,
        [planId]: updatedDates,
      }));
      setPlanOriginalDatesById((prev) => ({
        ...prev,
        [planId]: updatedDates,
      }));
      showPlanNotice(`Plano ${targetPlan.planName} confirmado e salvo.`, 'success');
    } catch (error) {
      console.error('Erro ao confirmar datas do plano:', error);
      if (isClientVersionConflictError(error)) {
        try {
          await reloadClientSnapshot(viewingClient.id);
        } catch (refreshError) {
          console.error('Erro ao recarregar cliente após conflito de versão:', refreshError);
        }
        showPlanNotice('Cadastro atualizado em outro ponto. Recarregamos os dados deste cliente.', 'warning');
        return;
      }
      showPlanNotice('Não foi possível confirmar as datas deste plano.', 'error');
    } finally {
      setIsSavingPlanView(false);
    }
  };

  const handleCancelPlanDateChanges = (planId: string) => {
    const baseDates = Array.from(new Set(planEditBaseDatesById[planId] || [])).sort();
    setSelectedPlanDates((prev) => ({
      ...prev,
      [planId]: baseDates,
    }));
    showPlanNotice('Alterações temporárias das datas foram canceladas.', 'warning');
  };

  const resetRechargePlanSelection = () => {
    setRechargeSelectedPlanId(null);
    setRechargePlanDays({});
    setRechargePlanDates({});
    setRechargeOpenCalendarId(null);
    setRechargeCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  };

  const toggleRechargePlan = (planId: string) => {
    if (rechargeSelectedPlanId === planId) {
      resetRechargePlanSelection();
      return;
    }

    setRechargeSelectedPlanId(planId);
    setRechargePlanDays({ [planId]: rechargePlanDays[planId] || [] });
    setRechargePlanDates(sanitizeDateMapBySchoolCalendar({ [planId]: rechargePlanDates[planId] || [] }));
    setRechargeOpenCalendarId(planId);
  };

  const toggleRechargePlanDay = (planId: string, dayKey: string) => {
    if (!allowedServiceDayKeySet.has(dayKey)) return;

    setRechargePlanDays(prev => {
      const currentDays = prev[planId] || [];
      const hasDay = currentDays.includes(dayKey);
      const nextDays = hasDay ? currentDays.filter(day => day !== dayKey) : [...currentDays, dayKey];

      setRechargePlanDates(prevDates => {
        const currentDates = new Set(prevDates[planId] || []);
        const weekdayDates = getDateKeysForWeekdayInRechargeMonth(dayKey);

        if (hasDay) {
          weekdayDates.forEach(dateKey => currentDates.delete(dateKey));
        } else {
          weekdayDates.forEach(dateKey => currentDates.add(dateKey));
        }

        return {
          ...prevDates,
          [planId]: Array.from(currentDates).sort(),
        };
      });

      return {
        ...prev,
        [planId]: nextDays,
      };
    });
  };

  const toggleRechargePlanDate = (planId: string, date: Date) => {
    if (!isSchoolCalendarReadyForDate(date)) return;
    if (!isServiceDateAllowed(date)) return;
    if (isSchoolCalendarBlockedDate(date)) return;

    const dateKey = toDateKey(date);
    setRechargePlanDates(prev => {
      const current = prev[planId] || [];
      const exists = current.includes(dateKey);
      return {
        ...prev,
        [planId]: exists ? current.filter(d => d !== dateKey) : [...current, dateKey].sort(),
      };
    });
  };

  const selectedPlanConfigs = useMemo(() => {
    return Object.entries(selectedPlanDays)
      .map(([planId, daysOfWeek]) => {
        const plan = availablePlans.find(p => p.id === planId);
        if (!plan) return null;
        const selectedDates = (selectedPlanDates[planId] || []) as string[];
        const selectedDayList = (daysOfWeek || []) as string[];
        const selectedCount = selectedDates.length > 0 ? selectedDates.length : selectedDayList.length;
        return {
          planId,
          planName: plan.name,
          planPrice: plan.price,
          daysOfWeek: selectedDayList,
          selectedDates,
          deliveryShifts: selectedPlanShifts[planId] || [],
          subtotal: plan.price * selectedCount,
        };
      })
      .filter(Boolean) as Array<{
      planId: string;
      planName: string;
      planPrice: number;
      daysOfWeek: string[];
      selectedDates: string[];
      deliveryShifts: string[];
      subtotal: number;
    }>;
  }, [selectedPlanDays, selectedPlanDates, selectedPlanShifts, availablePlans]);

  const selectedPlansTotal = useMemo(() => {
    return selectedPlanConfigs.reduce((acc, plan) => acc + plan.subtotal, 0);
  }, [selectedPlanConfigs]);

  const activePlansInView = useMemo(() => {
    return selectedPlanConfigs.filter(plan => availablePlans.some(p => p.id === plan.planId && p.isActive !== false));
  }, [selectedPlanConfigs, availablePlans]);

  const deliveredDateKeysByPlanId = useMemo(() => {
    const result = new Map<string, Set<string>>();
    if (!viewingClient) return result;

    const activePlanIdSet = new Set(
      activePlansInView.map((plan) => String(plan.planId || '').trim()).filter(Boolean)
    );
    const activePlanIdsByName = new Map<string, string[]>();
    activePlansInView.forEach((plan) => {
      const planId = String(plan.planId || '').trim();
      const normalizedName = normalizeSearchText(plan.planName);
      if (!planId || !normalizedName) return;
      const existing = activePlanIdsByName.get(normalizedName) || [];
      if (!existing.includes(planId)) existing.push(planId);
      activePlanIdsByName.set(normalizedName, existing);
      if (!result.has(planId)) result.set(planId, new Set<string>());
    });

    transactions.forEach((tx: any) => {
      if (!isTransactionFromClient(tx, viewingClient)) return;

      const txType = String(tx?.type || '').toUpperCase();
      if (txType !== 'CONSUMO' && txType !== 'DEBIT') return;

      const txDescription = normalizeSearchText(tx?.description || tx?.item || '');
      const txMethod = normalizeSearchText(tx?.paymentMethod || tx?.method || '');
      const isDeliveredDay = txDescription.includes('entrega do dia') || txMethod === 'plano';
      if (!isDeliveredDay) return;

      const dateKey = resolveTransactionDateKey(tx);
      if (!dateKey) return;

      const planId = String(tx?.planId || tx?.originPlanId || '').trim();
      const normalizedPlanName = normalizeSearchText(tx?.plan || tx?.planName || tx?.item || '');

      let targetPlanIds: string[] = [];
      if (planId && activePlanIdSet.has(planId)) {
        targetPlanIds = [planId];
      } else if (normalizedPlanName) {
        targetPlanIds = activePlanIdsByName.get(normalizedPlanName) || [];
      }

      targetPlanIds.forEach((targetPlanId) => {
        const current = result.get(targetPlanId) || new Set<string>();
        current.add(dateKey);
        result.set(targetPlanId, current);
      });
    });

    return result;
  }, [viewingClient, activePlansInView, transactions]);

  const reversedRechargeDateKeysByPlanId = useMemo(() => {
    const result = new Map<string, Set<string>>();
    if (!viewingClient) return result;

    const normalizeTxDateKey = (raw: any) => {
      const value = String(raw || '').trim();
      if (!value) return '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
      const br4 = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (br4) return `${br4[3]}-${br4[2]}-${br4[1]}`;
      const br2 = value.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
      if (br2) return `20${br2[3]}-${br2[2]}-${br2[1]}`;
      const parsed = new Date(value);
      if (Number.isFinite(parsed.getTime())) return toDateKey(parsed);
      return '';
    };

    transactions.forEach((tx: any) => {
      if (!isTransactionFromClient(tx, viewingClient)) return;
      if (String(tx?.type || '').toUpperCase() !== 'CREDITO') return;

      const originRef = String(tx?.originTransactionId || '').trim();
      if (!originRef) return;

      const text = `${String(tx?.description || '')} ${String(tx?.item || '')}`.toUpperCase();
      if (!text.includes('ESTORNO')) return;

      const dateKey = normalizeTxDateKey(tx?.deliveryDate || tx?.scheduledDate || tx?.mealDate || tx?.date || tx?.timestamp);
      if (!dateKey) return;

      const txPlanId = String(tx?.planId || tx?.originPlanId || '').trim();
      const txPlanName = String(tx?.plan || tx?.planName || '').trim().toUpperCase();
      const matchById = availablePlans.find((plan) => String(plan.id) === txPlanId);
      const matchByName = availablePlans.find((plan) => String(plan.name || '').trim().toUpperCase() === txPlanName);
      const matchedPlanId = String(matchById?.id || matchByName?.id || '').trim();
      if (!matchedPlanId) return;

      const current = result.get(matchedPlanId) || new Set<string>();
      current.add(dateKey);
      result.set(matchedPlanId, current);
    });

    return result;
  }, [viewingClient, transactions, availablePlans]);

  const getAvailableRechargePlanCreditBalance = (client: Client | null, plan: Plan | null) => {
    if (!client || !plan) return 0;
    const balancesRaw = ((client as any).planCreditBalances || {}) as Record<string, any>;
    if (!balancesRaw || typeof balancesRaw !== 'object') return 0;

    const byId = balancesRaw[plan.id];
    if (byId) return Math.max(0, Number(byId.balance || 0));

    const byNameKey = Object.keys(balancesRaw).find((key) =>
      String(balancesRaw[key]?.planName || '').trim().toUpperCase() === String(plan.name || '').trim().toUpperCase()
    );
    if (!byNameKey) return 0;
    return Math.max(0, Number(balancesRaw[byNameKey]?.balance || 0));
  };

  const rechargeSelectedPlanSummary = useMemo(() => {
    if (!rechargeSelectedPlanId) return null;

    const plan = plans.find(p => p.id === rechargeSelectedPlanId && p.enterpriseId === activeEnterpriseId);
    if (!plan) return null;

    const daysOfWeek = rechargePlanDays[rechargeSelectedPlanId] || [];
    const selectedDates = rechargePlanDates[rechargeSelectedPlanId] || [];
    const selectedCount = selectedDates.length > 0 ? selectedDates.length : daysOfWeek.length;
    const subtotal = plan.price * selectedCount;

    return {
      planName: plan.name,
      unitPrice: plan.price,
      daysOfWeekCount: daysOfWeek.length,
      selectedDatesCount: selectedDates.length,
      selectedCount,
      subtotal,
    };
  }, [rechargeSelectedPlanId, rechargePlanDays, rechargePlanDates, plans, activeEnterpriseId]);

  const handleFinishRegistration = async () => {
    if (isSubmittingClientForm || isSubmittingClientFormRef.current) return;

    const classValue = formData.type === 'ALUNO'
      ? (
        formData.classType === 'INTEGRAL'
          ? 'INTEGRAL'
          : (formData.classType && formData.classGrade ? `${formData.classType} - ${formData.classGrade}` : '')
      )
      : formData.class;
    const normalizedClientName = String(formData.name || '').trim();
    if (normalizedClientName.length < 2) {
      alert('Informe o nome completo.');
      return;
    }
    if (formData.type === 'ALUNO' && !String(classValue || '').trim()) {
      alert('Para aluno, a turma/série é obrigatória.');
      return;
    }
    const normalizedParentPhoneDigits = normalizePhoneDigits(joinPhoneWithCountryCode(formData.parentWhatsappCountryCode, formData.parentWhatsapp));
    if (formData.type === 'ALUNO' && responsibleSourceMode === 'NEW' && String(formData.parentName || '').trim().length < 2) {
      alert('Nome do responsável é obrigatório.');
      return;
    }
    if (formData.type === 'ALUNO' && normalizedParentPhoneDigits.length < 10 && responsibleSourceMode === 'NEW') {
      alert('Telefone do responsável é obrigatório.');
      return;
    }
    if ((formData.type === 'RESPONSAVEL' || formData.type === 'COLABORADOR') && normalizedParentPhoneDigits.length < 10) {
      alert('Telefone é obrigatório para responsável e colaborador.');
      return;
    }
    if (formData.type === 'COLABORADOR' && addDependentStudent && String(dependentStudentForm.name || '').trim().length < 2) {
      alert('Informe o nome do aluno dependente.');
      return;
    }

    const parsedFormBalance = Number(formData.initialCredit || 0);
    const normalizedStudentName = String(formData.name || '').trim();
    const normalizedParentName = String(formData.parentName || '').trim();
    const normalizedParentRelationship = String(formData.parentRelationship || 'PAIS').trim().toUpperCase();
    const normalizedCollaboratorRole = String(newCollaboratorRole || '').trim();
    const collaboratorPhoneParts = splitPhoneByCountryCode(selectedResponsibleCollaborator?.phone || '');
    const collaboratorPhone = collaboratorPhoneParts.localPhone || normalizePhoneDigits(selectedResponsibleCollaborator?.phone || '');
    const collaboratorCountryCode = collaboratorPhoneParts.countryCode || '55';
    const collaboratorParentEmail = String(selectedResponsibleCollaborator?.email || '').trim();
    const collaboratorParentCpf = String((selectedResponsibleCollaborator as any)?.cpf || '').trim();
    const responsibleClientPhoneParts = splitPhoneByCountryCode(selectedResponsibleClient?.phone || selectedResponsibleClient?.parentWhatsapp || '');
    const responsibleClientPhone = responsibleClientPhoneParts.localPhone || normalizePhoneDigits(selectedResponsibleClient?.phone || selectedResponsibleClient?.parentWhatsapp || '');
    const responsibleClientCountryCode = responsibleClientPhoneParts.countryCode || String((selectedResponsibleClient as any)?.parentWhatsappCountryCode || '55');
    const responsibleClientEmail = String(selectedResponsibleClient?.email || selectedResponsibleClient?.parentEmail || '').trim();
    const responsibleClientCpf = String((selectedResponsibleClient?.cpf || selectedResponsibleClient?.parentCpf || '')).trim();
    const isStudentUsingCollaborator = formData.type === 'ALUNO' && responsibleSourceMode === 'COLABORADOR';
    const isStudentUsingResponsible = formData.type === 'ALUNO' && responsibleSourceMode === 'RESPONSAVEL' && Boolean(selectedResponsibleClient);
    if (formData.type === 'ALUNO' && responsibleSourceMode === 'COLABORADOR' && String(formData.parentName || '').trim().length < 2) {
      alert('Nome do colaborador é obrigatório.');
      return;
    }
    if (formData.type === 'ALUNO' && responsibleSourceMode === 'COLABORADOR' && normalizedParentPhoneDigits.length < 10) {
      alert('Telefone do colaborador é obrigatório.');
      return;
    }
    if (formData.type === 'ALUNO' && responsibleSourceMode === 'COLABORADOR' && normalizedCollaboratorRole.length < 2) {
      alert('Cargo do colaborador é obrigatório.');
      return;
    }
    if (formData.type === 'ALUNO' && responsibleSourceMode === 'RESPONSAVEL' && !selectedResponsibleClient) {
      alert('Selecione um responsável já cadastrado para vincular ao aluno.');
      return;
    }
    const fallbackParentName = normalizedStudentName
      ? `Responsável pelo(a) ${normalizedStudentName}`
      : 'Responsável não informado';
    const parentNameToPersist = formData.type === 'ALUNO'
      ? (isStudentUsingCollaborator
        ? String(selectedResponsibleCollaborator?.name || normalizedParentName || fallbackParentName).trim()
        : isStudentUsingResponsible
          ? String(selectedResponsibleClient?.name || normalizedParentName || fallbackParentName).trim()
        : (normalizedParentName || fallbackParentName))
      : normalizedClientName;
    const parentWhatsappCountryCodeToPersist = isStudentUsingCollaborator
      ? (selectedResponsibleCollaborator ? collaboratorCountryCode : formData.parentWhatsappCountryCode)
      : isStudentUsingResponsible
        ? responsibleClientCountryCode
        : formData.parentWhatsappCountryCode;
    const parentWhatsappToPersist = isStudentUsingCollaborator
      ? (selectedResponsibleCollaborator ? collaboratorPhone : formData.parentWhatsapp)
      : isStudentUsingResponsible
        ? responsibleClientPhone
        : formData.parentWhatsapp;
    const parentEmailToPersist = isStudentUsingCollaborator
      ? (selectedResponsibleCollaborator ? (collaboratorParentEmail || formData.parentEmail) : formData.parentEmail)
      : isStudentUsingResponsible
        ? (responsibleClientEmail || formData.parentEmail)
        : formData.parentEmail;
    const parentCpfToPersist = isStudentUsingCollaborator
      ? (selectedResponsibleCollaborator ? (collaboratorParentCpf || formData.parentCpf) : formData.parentCpf)
      : isStudentUsingResponsible
        ? (responsibleClientCpf || formData.parentCpf)
        : formData.parentCpf;
    
    isSubmittingClientFormRef.current = true;
    setIsSubmittingClientForm(true);

    let finalPhoto = formData.photo || editingClient?.photo || `https://api.dicebear.com/7.x/avataaars/svg?seed=${formData.name}`;

    if (clientPhotoFile) {
      try {
        const dataBase64 = await fileToBase64(clientPhotoFile);
        const uploaded = await ApiService.uploadClientPhoto({
          fileName: clientPhotoFile.name,
          mimeType: clientPhotoFile.type,
          dataBase64,
        });
        finalPhoto = String(uploaded?.photoUrl || finalPhoto);
      } catch (err) {
        console.error('Erro ao enviar foto do cliente:', err);
        alert('Erro ao enviar foto do cliente. Tente novamente.');
        isSubmittingClientFormRef.current = false;
        setIsSubmittingClientForm(false);
        return;
      }
    }

    const clientPayloadBase = {
      registrationId: editingClient?.registrationId || (clients.length + 1000).toString(),
      name: formData.name,
      type: formData.type,
      class: classValue,
      servicePlans: [
        ...(formData.servicePlans.includes('PREPAGO') ? ['PREPAGO'] : []),
        ...selectedPlanConfigs.map(plan => plan.planName),
      ] as any,
      selectedPlansConfig: selectedPlanConfigs,
      spentToday: editingClient ? (editingClient.spentToday || 0) : 0,
      isBlocked: editingClient ? editingClient.isBlocked : false,
      restrictions: formData.restrictions,
      dietaryNotes: formData.dietaryNotes,
      photo: finalPhoto,
      enterpriseId: editingClient?.enterpriseId || activeEnterpriseId,
      parentName: parentNameToPersist,
      parentRelationship: formData.type === 'ALUNO'
        ? (isStudentUsingCollaborator ? normalizedCollaboratorRole : normalizedParentRelationship)
        : '',
      phone: joinPhoneWithCountryCode(parentWhatsappCountryCodeToPersist, parentWhatsappToPersist),
      email: parentEmailToPersist,
      cpf: formData.type === 'ALUNO' ? '' : parentCpfToPersist,
      parentWhatsappCountryCode: parentWhatsappCountryCodeToPersist,
      parentWhatsapp: joinPhoneWithCountryCode(parentWhatsappCountryCodeToPersist, parentWhatsappToPersist),
      parentCpf: parentCpfToPersist,
      parentEmail: parentEmailToPersist,
      responsibleCollaboratorId: isStudentUsingCollaborator ? String(selectedResponsibleCollaborator?.id || '') : '',
      responsibleClientId: isStudentUsingResponsible ? String(selectedResponsibleClient?.id || '') : '',
      relatedStudent: formData.type === 'COLABORADOR' && addDependentStudent && String(dependentStudentForm.name || '').trim()
        ? {
            name: String(dependentStudentForm.name || '').trim(),
            classType: dependentStudentForm.classType,
            classGrade: dependentStudentForm.classGrade,
            class: [dependentStudentForm.classType, dependentStudentForm.classGrade].filter(Boolean).join(' - '),
            dailyLimit: Number(dependentStudentForm.dailyLimit || 30),
            restrictions: String(dependentStudentForm.restrictions || '')
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean),
            responsibleType: 'COLABORADOR',
          }
        : null
    };
    const clientPayload = editingClient
      ? clientPayloadBase
      : {
          ...clientPayloadBase,
          balance: Number.isFinite(parsedFormBalance) ? parsedFormBalance : 0,
        };

    try {
      if (editingClient) {
        const updatedClient = await ApiService.updateClient(editingClient.id, clientPayload, {
          expectedUpdatedAt: String((editingClient as any)?.updatedAt || '').trim() || undefined,
        });
        setClients(prev => prev.map(c => (c.id === editingClient.id ? updatedClient : c)));
        if (viewingClient?.id === editingClient.id) setViewingClient(updatedClient);
      } else {
        const newClient = await ApiService.createClient(clientPayload);
        setClients(prev => [newClient, ...prev]);
      }
      setEditingClient(null);
      setIsStudentOnlyMode(false);
      setLinkingStudentContextName('');
      setClientPhotoFile(null);
      setClientPhotoPreview('');
      setIsClientModalOpen(false);
      setSelectedPlanShifts({});
      alert(editingClient ? 'Cadastro atualizado com sucesso!' : 'Matrícula concluída com sucesso!');
    } catch (err) {
      console.error('Erro ao salvar cliente:', err);
      if (editingClient && isClientVersionConflictError(err)) {
        try {
          await reloadClientSnapshot(editingClient.id);
        } catch (refreshError) {
          console.error('Erro ao recarregar cliente após conflito de versão:', refreshError);
        }
        alert('Este cadastro foi atualizado em outra operação. Dados recarregados; revise e salve novamente.');
        return;
      }
      const errorMessage = err instanceof Error && err.message
        ? err.message
        : 'Erro ao salvar cliente. Tente novamente.';
      alert(errorMessage);
    } finally {
      isSubmittingClientFormRef.current = false;
      setIsSubmittingClientForm(false);
    }
  };

  const handleQuickRecharge = async (
    amount: number,
    planName?: string,
    planConfig?: { planId: string; planPrice: number; daysOfWeek: string[]; selectedDates: string[]; subtotal: number }
  ) => {
    if (!rechargingClient) return;
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Informe um valor válido para recarga.');
      return;
    }
    
    const isPlanRecharge = Boolean(planName && planConfig);
    const purchasedUnits = planConfig
      ? ((planConfig.selectedDates.length > 0 ? planConfig.selectedDates.length : planConfig.daysOfWeek.length) || 0)
      : 0;

    const newBalance = isPlanRecharge
      ? Number(rechargingClient.balance || 0)
      : Number((rechargingClient.balance || 0) + amount);
    const newPlans = planName && !rechargingClient.servicePlans.includes(planName as any)
      ? [...rechargingClient.servicePlans, planName as any] 
      : rechargingClient.servicePlans;

    const existingSelectedPlansRaw = (rechargingClient as any).selectedPlansConfig;
    const existingSelectedPlans = ((Array.isArray(existingSelectedPlansRaw) ? existingSelectedPlansRaw : []) as Array<any>);
    const existingPlanCreditBalances = ({ ...(((rechargingClient as any).planCreditBalances || {}) as Record<string, any>) });
    let nextSelectedPlans = existingSelectedPlans;
    let nextPlanCreditBalances = existingPlanCreditBalances;

    if (planConfig) {
      const normalizedPlanConfig = {
        planId: planConfig.planId,
        planName: planName || '',
        planPrice: planConfig.planPrice,
        daysOfWeek: planConfig.daysOfWeek,
        selectedDates: planConfig.selectedDates,
        subtotal: planConfig.subtotal,
      };

      const index = existingSelectedPlans.findIndex((cfg: any) => cfg?.planId === planConfig.planId);
      if (index >= 0) {
        nextSelectedPlans = existingSelectedPlans.map((cfg: any, idx: number) => {
          if (idx !== index) return cfg;
          const currentDates = Array.isArray(cfg?.selectedDates) ? cfg.selectedDates : [];
          const currentDays = Array.isArray(cfg?.daysOfWeek) ? cfg.daysOfWeek : [];
          return {
            ...cfg,
            ...normalizedPlanConfig,
            selectedDates: Array.from(new Set([...(currentDates || []), ...(planConfig.selectedDates || [])])).sort(),
            daysOfWeek: Array.from(new Set([...(currentDays || []), ...(planConfig.daysOfWeek || [])])),
            subtotal: Number(cfg?.subtotal || 0) + Number(planConfig.subtotal || 0),
          };
        });
      } else {
        nextSelectedPlans = [...existingSelectedPlans, normalizedPlanConfig];
      }

      const normalizedPlanName = String(planName || '').trim();
      const matchedBalanceEntry = Object.entries(existingPlanCreditBalances).find(([, entry]) => {
        const entryPlanId = String((entry as any)?.planId || '').trim();
        const entryPlanName = String((entry as any)?.planName || '').trim();
        return (
          (entryPlanId && entryPlanId === String(planConfig.planId || '').trim())
          || (entryPlanName && normalizeSearchText(entryPlanName) === normalizeSearchText(normalizedPlanName))
        );
      });
      const balanceKey = String(
        matchedBalanceEntry?.[0]
        || planConfig.planId
        || normalizeSearchText(normalizedPlanName)
      ).trim();
      const currentBalanceEntry = (matchedBalanceEntry?.[1] || existingPlanCreditBalances[balanceKey] || {}) as any;
      const unitValue = Math.max(0, Number(planConfig.planPrice || currentBalanceEntry?.unitValue || 0));
      const currentBalanceUnitsRaw = Number(currentBalanceEntry?.balanceUnits);
      const currentBalanceUnits = Number.isFinite(currentBalanceUnitsRaw)
        ? Math.max(0, currentBalanceUnitsRaw)
        : (unitValue > 0 ? Math.max(0, Number(currentBalanceEntry?.balance || 0) / unitValue) : 0);
      const currentTotalUnitsRaw = Number(currentBalanceEntry?.totalUnits);
      const currentTotalUnits = Number.isFinite(currentTotalUnitsRaw)
        ? Math.max(0, currentTotalUnitsRaw)
        : currentBalanceUnits;
      const nextBalanceUnits = Math.max(0, currentBalanceUnits + purchasedUnits);
      const nextTotalUnits = Math.max(0, currentTotalUnits + purchasedUnits);
      const nextConsumedUnits = Math.max(0, nextTotalUnits - nextBalanceUnits);
      const nextBalanceValue = unitValue > 0 ? Number((nextBalanceUnits * unitValue).toFixed(2)) : Number(currentBalanceEntry?.balance || 0);

      nextPlanCreditBalances = {
        ...existingPlanCreditBalances,
        [balanceKey]: {
          ...currentBalanceEntry,
          planId: String(planConfig.planId || currentBalanceEntry?.planId || balanceKey).trim() || balanceKey,
          planName: normalizedPlanName || String(currentBalanceEntry?.planName || 'PLANO'),
          unitValue,
          planPrice: unitValue,
          balanceUnits: Number(nextBalanceUnits.toFixed(4)),
          totalUnits: Number(nextTotalUnits.toFixed(4)),
          consumedUnits: Number(nextConsumedUnits.toFixed(4)),
          unitsProgress: `${Math.max(0, Number((nextTotalUnits - nextBalanceUnits).toFixed(4)))}/${Math.max(0, Number(nextTotalUnits.toFixed(4)))}`,
          balance: nextBalanceValue,
          updatedAt: new Date().toISOString(),
        }
      };
    }
    
    try {
      const updated = await ApiService.updateClient(rechargingClient.id, {
        balance: newBalance,
        balanceAdjustment: {
          source: 'OPERACAO_RECARGA',
          reason: planName ? `Recarga operacional de plano ${planName}` : 'Recarga operacional de saldo livre',
          requestedByUserId: String((currentUser as any)?.id || ''),
          requestedByName: String((currentUser as any)?.name || (currentUser as any)?.username || ''),
        },
        servicePlans: newPlans,
        selectedPlansConfig: nextSelectedPlans,
        ...(isPlanRecharge ? { planCreditBalances: nextPlanCreditBalances } : {}),
      }, {
        expectedUpdatedAt: String((rechargingClient as any)?.updatedAt || '').trim() || undefined,
      });
      const createdTransaction = await ApiService.createTransaction({
        clientId: rechargingClient.id,
        clientName: rechargingClient.name,
        enterpriseId: rechargingClient.enterpriseId,
        type: 'CREDIT',
        amount,
        plan: planName || 'PREPAGO',
        planId: planConfig?.planId,
        planUnitValue: planConfig?.planPrice,
        planUnits: isPlanRecharge ? purchasedUnits : undefined,
        selectedDates: planConfig?.selectedDates || [],
        selectedDays: planConfig?.daysOfWeek || [],
        description: planName
          ? `Recarga de plano: ${planName}${planConfig ? ` (${purchasedUnits} unidade(s))` : ''}`
          : 'Recarga de saldo',
        item: planName ? `Crédito plano ${planName}` : 'Crédito livre cantina',
        paymentMethod: paymentMethod,
        method: paymentMethod,
        timestamp: new Date().toISOString(),
        status: 'CONCLUIDA'
      });
      setTransactions(prev => [createdTransaction, ...prev]);
      setClients(prev => prev.map(c => c.id === rechargingClient.id ? updated : c));
      setIsRechargeModalOpen(false);
      setRechargingClient(null);
      resetRechargePlanSelection();
      alert(`Recarga de R$ ${amount.toFixed(2)} ${planName ? `para o plano ${planName} ` : ''}realizada com sucesso para ${rechargingClient.name}!`);
    } catch (err) {
      console.error('Erro ao recarregar cliente:', err);
      if (isClientVersionConflictError(err)) {
        try {
          await reloadClientSnapshot(rechargingClient.id);
        } catch (refreshError) {
          console.error('Erro ao recarregar cliente após conflito de versão:', refreshError);
        }
        alert('Este cliente foi atualizado em outra operação. Dados recarregados; confirme e tente novamente.');
        return;
      }
      alert('Erro ao recarregar cliente. Tente novamente.');
    }
  };

  const handleManualBalanceAdjustment = async () => {
    if (!viewingClient) return;

    const currentBalance = Number(viewingClient.balance || 0);
    const currentLabel = currentBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const targetRaw = window.prompt(
      `Saldo atual: R$ ${currentLabel}\nInforme o novo saldo final do aluno/cliente:`,
      currentBalance.toFixed(2)
    );
    if (targetRaw === null) return;

    const normalizedTargetRaw = targetRaw.replace(',', '.').trim();
    const parsedTarget = Number(normalizedTargetRaw);
    if (!Number.isFinite(parsedTarget)) {
      alert('Valor de saldo inválido.');
      return;
    }

    const nextBalance = Number(parsedTarget.toFixed(2));
    if (nextBalance === Number(currentBalance.toFixed(2))) {
      alert('O saldo informado é igual ao saldo atual. Nenhum ajuste foi aplicado.');
      return;
    }

    const reason = window.prompt('Informe o motivo do ajuste de saldo:');
    if (reason === null) return;
    const normalizedReason = String(reason || '').trim();
    if (normalizedReason.length < 3) {
      alert('Informe um motivo válido (mínimo de 3 caracteres).');
      return;
    }

    const confirmed = window.confirm(
      `Confirmar ajuste de saldo de R$ ${currentBalance.toFixed(2)} para R$ ${nextBalance.toFixed(2)}?\nMotivo: ${normalizedReason}`
    );
    if (!confirmed) return;

    try {
      const updated = await ApiService.updateClient(viewingClient.id, {
        balance: nextBalance,
        balanceAdjustment: {
          reason: normalizedReason,
          source: 'CLIENTS_PAGE_DETAIL',
          requestedByUserId: String((currentUser as any)?.id || ''),
          requestedByName: String((currentUser as any)?.name || (currentUser as any)?.username || ''),
        },
      }, {
        expectedUpdatedAt: String((viewingClient as any)?.updatedAt || '').trim() || undefined,
      });

      setClients(prev => prev.map(c => (c.id === viewingClient.id ? updated : c)));
      setViewingClient(updated);
      alert(`Ajuste aplicado com sucesso. Novo saldo: R$ ${nextBalance.toFixed(2)}.`);
    } catch (error: any) {
      console.error('Erro ao ajustar saldo manualmente:', error);
      if (isClientVersionConflictError(error)) {
        try {
          await reloadClientSnapshot(viewingClient.id);
        } catch (refreshError) {
          console.error('Erro ao recarregar cliente após conflito de versão:', refreshError);
        }
        alert('Este cliente foi atualizado em outra operação. Dados recarregados; revise o saldo e tente novamente.');
        return;
      }
      alert(error?.message || 'Erro ao ajustar saldo. Tente novamente.');
    }
  };

  const handleDeleteClient = async (client: Client) => {
    const confirmed = window.confirm(`Tem certeza que deseja excluir o cliente ${client.name}?`);
    if (!confirmed) return;

    try {
      await ApiService.deleteClient(client.id);
      setClients(prev => prev.filter(c => c.id !== client.id));
      if (viewingClient?.id === client.id) {
        setViewingClient(null);
        setIsDetailModalOpen(false);
      }
      if (historyClient?.id === client.id) {
        setHistoryClient(null);
        setIsHistoryModalOpen(false);
      }
      if (rechargingClient?.id === client.id) {
        setRechargingClient(null);
        setIsRechargeModalOpen(false);
      }
      alert('Cliente excluído com sucesso!');
    } catch (err) {
      console.error('Erro ao excluir cliente:', err);
      alert('Erro ao excluir cliente. Tente novamente.');
    }
  };

  const totalToPay = useMemo(() => {
    const initialCredit = formData.servicePlans.includes('PREPAGO') ? formData.initialCredit : 0;
    return initialCredit + selectedPlansTotal;
  }, [formData.servicePlans, formData.initialCredit, selectedPlansTotal]);

  const getTimestamp = (tx: any): number => {
    if (tx?.timestamp) {
      const ts = new Date(tx.timestamp).getTime();
      if (!Number.isNaN(ts)) return ts;
    }
    if (tx?.date || tx?.time) {
      const combined = `${tx.date || ''} ${tx.time || ''}`.trim();
      const ts = new Date(combined).getTime();
      if (!Number.isNaN(ts)) return ts;
    }
    return 0;
  };

  function resolveTransactionDateKey(tx: any): string {
    const direct = String(tx?.deliveryDate || tx?.scheduledDate || tx?.mealDate || tx?.date || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;

    const description = String(tx?.description || tx?.item || '');
    const isoMatch = description.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if (isoMatch?.[1]) return isoMatch[1];

    const brMatch = description.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
    if (brMatch) {
      const [, dd, mm, yyyy] = brMatch;
      return `${yyyy}-${mm}-${dd}`;
    }

    return '';
  }

  const getTransactionAmount = (tx: any): number => {
    const amount = Number(tx?.amount ?? tx?.value ?? tx?.total ?? 0);
    return Number.isFinite(amount) ? amount : 0;
  };

  const classifyTransaction = (tx: any): 'RECARGA' | 'CONSUMO' | 'VENDA' => {
    const rawType = String(tx?.type || '').toUpperCase();
    const rawDescription = String(tx?.description || tx?.item || tx?.plan || '').toUpperCase();

    if (rawType === 'CREDIT') return 'RECARGA';
    if (rawType === 'DEBIT') return 'CONSUMO';
    if (rawType === 'VENDA_BALCAO') return 'VENDA';
    if (rawType === 'CONSUMO') return 'CONSUMO';
    if (rawDescription.includes('RECARGA') || rawDescription.includes('CRÉDITO') || rawDescription.includes('CREDITO')) return 'RECARGA';
    if (rawDescription.includes('VENDA') || rawDescription.includes('BALCÃO') || rawDescription.includes('BALCAO')) return 'VENDA';
    return 'CONSUMO';
  };

  function isTransactionFromClient(tx: any, client: Client) {
    const clientIdMatches = tx?.clientId && tx.clientId === client.id;
    const clientNameMatches = tx?.client && String(tx.client).toLowerCase() === client.name.toLowerCase();
    const clientNameAltMatches = tx?.clientName && String(tx.clientName).toLowerCase() === client.name.toLowerCase();
    return clientIdMatches || clientNameMatches || clientNameAltMatches;
  }

  const clientPlanBalances = useMemo(() => {
    const planById = new Map<string, Plan>(plans.map((plan) => [plan.id, plan]));
    const planByName = new Map<string, Plan>(plans.map((plan) => [String(plan.name || '').trim().toUpperCase(), plan]));
    const result = new Map<string, Array<{
      planId?: string;
      planName: string;
      isActive: boolean;
      total: number;
      used: number;
      remaining: number;
      unitPrice: number;
      remainingValue: number;
      totalValue: number;
      creditValue?: number;
    }>>();

    clients.forEach((client) => {
      const selectedConfigsRaw = (client as any).selectedPlansConfig;
      const selectedConfigs = ((Array.isArray(selectedConfigsRaw) ? selectedConfigsRaw : []) as Array<any>);
      const planCreditBalances = (((client as any).planCreditBalances || {}) as Record<string, { planId?: string; planName?: string; balance?: number }>);
      const txFromClient = transactions.filter((tx: any) => isTransactionFromClient(tx, client));
      const planEntries: Array<{
        planId?: string;
        planName: string;
        isActive: boolean;
        total: number;
        used: number;
        remaining: number;
        unitPrice: number;
        remainingValue: number;
        totalValue: number;
        creditValue?: number;
      }> = [];
      const seenPlanNames = new Set<string>();

      const buildEntry = (planNameRaw: string, totalCount: number, creditValue?: number, planIdHint?: string) => {
        const normalizedName = String(planNameRaw || '').trim();
        if (!normalizedName) return;
        const normalizedKey = normalizedName.toUpperCase();
        if (seenPlanNames.has(normalizedKey)) return;
        seenPlanNames.add(normalizedKey);

        const linkedPlan = planIdHint ? planById.get(planIdHint) || planByName.get(normalizedKey) : planByName.get(normalizedKey);
        const finalPlanName = linkedPlan?.name || normalizedName;
        const finalPlanNameUpper = String(finalPlanName).toUpperCase();
        const isActive = Boolean(linkedPlan && linkedPlan.isActive !== false);

        const usedCount = txFromClient.filter((tx: any) => {
          const category = classifyTransaction(tx);
          if (category !== 'CONSUMO') return false;
          const txPlan = String(tx?.plan || '').trim().toUpperCase();
          const txDescription = String(tx?.description || tx?.item || '').toUpperCase();
          return txPlan === finalPlanNameUpper || txDescription.includes(finalPlanNameUpper);
        }).length;

        const safeTotal = Math.max(0, Number.isFinite(totalCount) ? totalCount : 0);
        const remaining = Math.max(0, safeTotal - usedCount);
        const unitPrice = Math.max(0, Number(linkedPlan?.price || 0));
        const remainingValue = remaining * unitPrice;
        const totalValue = safeTotal * unitPrice;

        planEntries.push({
          planId: linkedPlan?.id || planIdHint || undefined,
          planName: finalPlanName,
          isActive,
          total: safeTotal,
          used: usedCount,
          remaining,
          unitPrice,
          remainingValue,
          totalValue,
          creditValue: Number.isFinite(Number(creditValue || 0)) ? Number(creditValue || 0) : 0,
        });
      };

      selectedConfigs.forEach((config: any) => {
        const configPlanId = String(config?.planId || '').trim();
        const configPlanName = String(config?.planName || '').trim();
        const planFromId = configPlanId ? planById.get(configPlanId) : null;
        const finalPlanName = planFromId?.name || configPlanName;
        const creditById = configPlanId ? Number(planCreditBalances[configPlanId]?.balance || 0) : 0;
        const creditByName = Object.values(planCreditBalances).find((entry) => String(entry?.planName || '').trim().toUpperCase() === String(finalPlanName || '').trim().toUpperCase());
        const creditValue = creditById > 0 ? creditById : Number(creditByName?.balance || 0);

        const selectedDates = Array.isArray(config?.selectedDates) ? config.selectedDates : [];
        const daysOfWeek = Array.isArray(config?.daysOfWeek) ? config.daysOfWeek : [];
        const totalCount = selectedDates.length > 0 ? selectedDates.length : daysOfWeek.length;

        buildEntry(finalPlanName, totalCount, creditValue, configPlanId || undefined);
      });

      (Array.isArray(client.servicePlans) ? client.servicePlans : [])
        .filter((planName) => planName && !['PREPAGO', 'PF_FIXO', 'LANCHE_FIXO'].includes(String(planName).toUpperCase()))
        .forEach((planName) => {
          const creditByName = Object.values(planCreditBalances).find((entry) => String(entry?.planName || '').trim().toUpperCase() === String(planName || '').trim().toUpperCase());
          buildEntry(String(planName), 0, Number(creditByName?.balance || 0));
        });

      Object.values(planCreditBalances).forEach((entry) => {
        const planName = String(entry?.planName || '').trim();
        if (!planName) return;
        buildEntry(planName, 0, Number(entry?.balance || 0));
      });

      result.set(client.id, planEntries);
    });

    return result;
  }, [clients, plans, transactions]);

  useEffect(() => {
    if (!isDetailModalOpen || !viewingClient) return;
    const balances = clientPlanBalances.get(viewingClient.id) || [];
    if (balances.length === 0) return;

    const nextRequired: Record<string, number> = { ...planRequiredUnitsById };
    let hasChanges = false;

    activePlansInView.forEach((plan) => {
      const byId = balances.find((entry: any) => String(entry?.planId || '') === String(plan.planId));
      const byName = balances.find((entry: any) => normalizeSearchText(entry?.planName) === normalizeSearchText(plan.planName));
        const resolved = Math.max(0, Number(byId?.remaining ?? byName?.remaining ?? planRequiredUnitsById[plan.planId] ?? 0));
      if (nextRequired[plan.planId] !== resolved) {
        nextRequired[plan.planId] = resolved;
        hasChanges = true;
      }
    });

    if (hasChanges) setPlanRequiredUnitsById(nextRequired);
  }, [isDetailModalOpen, viewingClient, clientPlanBalances, activePlansInView, planRequiredUnitsById]);

  const requiredUnitsByPlanId = useMemo(() => {
    const result = new Map<string, number>();
    if (!viewingClient) return result;

    const balances = clientPlanBalances.get(viewingClient.id) || [];
    const balanceByPlanId = new Map(
      balances
        .filter((entry: any) => String(entry?.planId || '').trim())
        .map((entry: any) => [String(entry.planId), Math.max(0, Number(entry.remaining || 0))])
    );
    const balanceByPlanName = new Map(
      balances.map((entry) => [normalizeSearchText(entry.planName), Math.max(0, Number(entry.remaining || 0))])
    );

    activePlansInView.forEach((plan) => {
      const byId = balanceByPlanId.get(plan.planId);
      const byName = balanceByPlanName.get(normalizeSearchText(plan.planName));
      const snapshotFallback = Math.max(0, Number(planRequiredUnitsById[plan.planId] || 0));
      const resolved = Number.isFinite(Number(byId))
        ? Number(byId)
        : (Number.isFinite(Number(byName)) ? Number(byName) : snapshotFallback);
      result.set(plan.planId, Math.max(0, Number(resolved || 0)));
    });

    return result;
  }, [viewingClient, clientPlanBalances, activePlansInView, planRequiredUnitsById]);

  const detailPlanBalances = useMemo(() => {
    if (!viewingClient) return [] as Array<{
      planId?: string;
      planName: string;
      total: number;
      remaining: number;
      remainingValue: number;
    }>;
    const balances = clientPlanBalances.get(viewingClient.id) || [];
    return balances.map((entry: any) => ({
      planId: String(entry?.planId || '').trim(),
      planName: String(entry?.planName || '').trim(),
      total: Math.max(0, Number(entry?.total || 0)),
      remaining: Math.max(0, Number(entry?.remaining || 0)),
      remainingValue: Math.max(0, Number(entry?.remainingValue || 0)),
    }));
  }, [viewingClient, clientPlanBalances]);

  const planAdjustmentStatus = useMemo(() => {
      return activePlansInView.map((plan) => {
        const selectedCount = (selectedPlanDates[plan.planId] || []).length;
        const requiredCount = requiredUnitsByPlanId.get(plan.planId) ?? selectedCount;
        return {
        planId: plan.planId,
        planName: plan.planName,
        selectedCount,
        requiredCount,
        isValid: selectedCount === requiredCount,
      };
    });
  }, [activePlansInView, requiredUnitsByPlanId, selectedPlanDates]);

  const isPlanAllocationValid = useMemo(() => {
    if (!isDetailModalOpen) return true;
    if (planAdjustmentStatus.length === 0) return true;
    return planAdjustmentStatus.every((item) => item.isValid);
  }, [isDetailModalOpen, planAdjustmentStatus]);

  const totalRequiredUnitsInView = useMemo(() => {
    return planAdjustmentStatus.reduce((sum, item) => sum + Number(item.requiredCount || 0), 0);
  }, [planAdjustmentStatus]);

  const enforcePlanAllocationBeforeAction = () => {
    if (isPlanAllocationValid) return true;
    const pending = planAdjustmentStatus.find((item) => !item.isValid);
    if (pending) {
      showPlanNotice(
        `Ajuste o plano ${pending.planName}: selecione ${pending.requiredCount} dia(s). Atual: ${pending.selectedCount}.`,
        'warning'
      );
    } else {
      showPlanNotice('Ajuste os dias do plano para seguir.', 'warning');
    }
    return false;
  };

  const handleSavePlanViewChanges = async () => {
    if (!viewingClient) return;
    if (!enforcePlanAllocationBeforeAction()) return;

    const activeConfigs = activePlansInView.map((plan) => ({
      planId: plan.planId,
      planName: plan.planName,
      planPrice: plan.planPrice,
      daysOfWeek: plan.daysOfWeek,
      selectedDates: plan.selectedDates,
      deliveryShifts: plan.deliveryShifts,
      subtotal: plan.subtotal,
    }));

    const baseServicePlans = (Array.isArray(viewingClient.servicePlans) ? viewingClient.servicePlans : []).filter((plan) => String(plan || '').toUpperCase() === 'PREPAGO');
    const nextServicePlans = [...baseServicePlans, ...activeConfigs.map((cfg) => cfg.planName as ClientPlanType)];

    setIsSavingPlanView(true);
    try {
      const updated = await ApiService.updateClient(viewingClient.id, {
        selectedPlansConfig: activeConfigs,
        servicePlans: nextServicePlans,
      }, {
        expectedUpdatedAt: String((viewingClient as any)?.updatedAt || '').trim() || undefined,
      });

      const changedPlans = activeConfigs
        .map((config) => {
          const originalDates = Array.from(new Set(planOriginalDatesById[config.planId] || [])).sort();
          const nextDates = Array.from(new Set(config.selectedDates || [])).sort();
          const removedDates = originalDates.filter((dateKey) => !nextDates.includes(dateKey));
          const addedDates = nextDates.filter((dateKey) => !originalDates.includes(dateKey));
          return {
            ...config,
            removedDates,
            addedDates,
            changed: removedDates.length > 0 || addedDates.length > 0,
          };
        })
        .filter((entry) => entry.changed);

      if (changedPlans.length > 0) {
        const now = new Date();
        const timeLabel = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const transactionPromises = changedPlans.map((entry, index) => {
          const removedLabel = entry.removedDates.length > 0
            ? `Removidos: ${entry.removedDates.map((dateKey) => formatDateKeyBr(dateKey)).join(', ')}`
            : '';
          const addedLabel = entry.addedDates.length > 0
            ? `Remarcados: ${entry.addedDates.map((dateKey) => formatDateKeyBr(dateKey)).join(', ')}`
            : '';
          const details = [removedLabel, addedLabel].filter(Boolean).join(' | ');
          const txTimestamp = new Date(now.getTime() + index * 1000);

          return ApiService.createTransaction({
            clientId: viewingClient.id,
            clientName: viewingClient.name,
            enterpriseId: activeEnterpriseId,
            type: 'CREDIT',
            amount: 0,
            total: 0,
            plan: entry.planName,
            planId: entry.planId,
            paymentMethod: 'SISTEMA',
            method: 'SISTEMA',
            executionSource: 'SISTEMA',
            status: 'SISTEMA',
            date: toDateKey(now),
            time: timeLabel,
            timestamp: txTimestamp.toISOString(),
            description: `Ajuste de calendário do plano ${entry.planName}`,
            item: details || `Ajuste de datas do plano ${entry.planName}`,
          });
        });
        const createdTransactions = await Promise.all(transactionPromises);
        setTransactions((prev) => [...(Array.isArray(createdTransactions) ? createdTransactions : []), ...prev]);
      }

      setClients(prev => prev.map(c => (c.id === viewingClient.id ? updated : c)));
      setViewingClient(updated);
      setPlanEditBaseDatesById(
        activeConfigs.reduce((acc, config) => {
          acc[config.planId] = Array.from(new Set(config.selectedDates || [])).sort();
          return acc;
        }, {} as Record<string, string[]>)
      );
      setPlanOriginalDatesById(
        activeConfigs.reduce((acc, config) => {
          acc[config.planId] = Array.from(new Set(config.selectedDates || [])).sort();
          return acc;
        }, {} as Record<string, string[]>)
      );
      showPlanNotice('Planos e dias de refeição atualizados com sucesso.', 'success');
    } catch (error) {
      console.error('Erro ao salvar alterações dos planos:', error);
      if (isClientVersionConflictError(error)) {
        try {
          await reloadClientSnapshot(viewingClient.id);
        } catch (refreshError) {
          console.error('Erro ao recarregar cliente após conflito de versão:', refreshError);
        }
        showPlanNotice('Cadastro atualizado em outro ponto. Recarregamos os dados deste cliente.', 'warning');
        return;
      }
      showPlanNotice('Não foi possível salvar as alterações dos planos.', 'error');
    } finally {
      setIsSavingPlanView(false);
    }
  };

  const getClientMovements = (client?: Client | null) => {
    if (!client) return [];

    return transactions
      .filter((tx: any) => {
        return isTransactionFromClient(tx, client);
      })
      .map((tx: any) => {
        const category = classifyTransaction(tx);
        const amount = getTransactionAmount(tx);
        const timestamp = getTimestamp(tx);
        const isCredit = category === 'RECARGA';
        return {
          id: String(tx?.id || `${client.id}-${timestamp}-${amount}`),
          category,
          amount,
          timestamp,
          method: String(tx?.paymentMethod || tx?.method || 'N/A'),
          status: String(tx?.status || 'CONFIRMADO'),
          description: String(tx?.description || tx?.item || tx?.plan || (category === 'RECARGA' ? 'Recarga de saldo' : 'Consumo')),
          signal: isCredit ? '+' : '-',
          amountColor: isCredit ? 'text-emerald-600' : 'text-red-600',
          iconBg: isCredit ? 'bg-emerald-100 text-emerald-600' : category === 'VENDA' ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  };

  const detailMovements = useMemo(() => getClientMovements(viewingClient), [transactions, viewingClient]);
  const historyMovements = useMemo(() => getClientMovements(historyClient), [transactions, historyClient]);

  const filterMovementsByPeriod = (movements: Array<any>) => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(todayEnd);
    yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 6);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const yearStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    const selectedDateStart = consumptionSpecificDate ? new Date(`${consumptionSpecificDate}T00:00:00`) : null;
    const selectedDateEnd = consumptionSpecificDate ? new Date(`${consumptionSpecificDate}T23:59:59`) : null;

    return movements.filter(move => {
      if (!move.timestamp) return false;
      const moveDate = new Date(move.timestamp);
      if (Number.isNaN(moveDate.getTime())) return false;

      if (consumptionPeriod === 'TODAY') return moveDate >= todayStart && moveDate <= todayEnd;
      if (consumptionPeriod === 'YESTERDAY') return moveDate >= yesterdayStart && moveDate <= yesterdayEnd;
      if (consumptionPeriod === 'WEEK') return moveDate >= weekStart && moveDate <= todayEnd;
      if (consumptionPeriod === 'MONTH') return moveDate >= monthStart && moveDate <= monthEnd;
      if (consumptionPeriod === 'YEAR') return moveDate >= yearStart && moveDate <= yearEnd;
      if (consumptionPeriod === 'DATE') {
        if (!selectedDateStart || !selectedDateEnd) return false;
        return moveDate >= selectedDateStart && moveDate <= selectedDateEnd;
      }

      const diffMs = todayEnd.getTime() - moveDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      if (consumptionPeriod === '15D') return diffDays <= 15;
      return false;
    });
  };

  const periodFilteredMovements = useMemo(() => {
    return filterMovementsByPeriod(detailMovements);
  }, [detailMovements, consumptionPeriod, consumptionSpecificDate]);

  const historyPeriodFilteredMovements = useMemo(() => {
    return filterMovementsByPeriod(historyMovements);
  }, [historyMovements, consumptionPeriod, consumptionSpecificDate]);

  const historyExtractBreakdown = useMemo(() => {
    const empty = {
      planCreditsByPlan: [] as Array<{ planName: string; quantity: number; value: number }>,
      planCreditQuantity: 0,
      planCreditValue: 0,
      planConsumedQuantity: 0,
      planConsumedValue: 0,
      cantinaCreditQuantity: 0,
      cantinaCreditValue: 0,
      cantinaConsumedQuantity: 0,
      cantinaConsumedValue: 0,
      planBalanceQuantity: 0,
      planBalanceValue: 0,
      cantinaBalanceQuantity: 0,
      cantinaBalanceValue: 0,
    };
    if (!historyClient) return empty;

    const planMap = new Map<string, { planName: string; quantity: number; value: number }>();

    const resolveUnits = (tx: any, fallbackText: string, fallbackAmount: number) => {
      const items = Array.isArray(tx?.items) ? tx.items : [];
      if (items.length > 0) {
        const unitsFromItems = items.reduce((sum: number, item: any) => sum + Number(item?.quantity || 1), 0);
        if (Number.isFinite(unitsFromItems) && unitsFromItems > 0) return unitsFromItems;
      }

      const directCandidates = [
        tx?.planUnits,
        tx?.units,
        tx?.quantity,
        Array.isArray(tx?.selectedDates) ? tx.selectedDates.length : 0,
      ]
        .map((value) => Number(value))
        .find((value) => Number.isFinite(value) && value > 0);
      if (Number.isFinite(directCandidates)) return Number(directCandidates);

      const textMatch = String(fallbackText || '').match(/(\d+(?:[.,]\d+)?)\s*x/i);
      if (textMatch?.[1]) {
        const parsed = Number(String(textMatch[1]).replace(',', '.'));
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
      }

      const unitPrice = Number(tx?.unitPrice ?? tx?.planUnitValue ?? tx?.price ?? 0);
      if (Number.isFinite(unitPrice) && unitPrice > 0 && fallbackAmount > 0) {
        return fallbackAmount / unitPrice;
      }

      return 1;
    };

    const isPlanMovement = (tx: any, move: any) => {
      const method = String(tx?.paymentMethod || tx?.method || move?.method || '').toUpperCase();
      if (method.includes('PLANO')) return true;
      const planId = String(tx?.planId || tx?.originPlanId || '').trim();
      if (planId) return true;
      const planName = String(tx?.plan || tx?.planName || '').trim().toUpperCase();
      if (planName && !['AVULSO', 'VENDA', 'CRÉDITO CANTINA', 'CREDITO CANTINA'].includes(planName)) return true;
      const text = String(tx?.description || tx?.item || move?.description || '').toUpperCase();
      return text.includes('PLANO');
    };

    const resolvePlanName = (tx: any, move: any) => {
      const raw = String(tx?.plan || tx?.planName || '').trim();
      if (raw) return raw;
      const fallback = String(tx?.item || tx?.description || move?.description || '').trim();
      const cleaned = fallback
        .replace(/^crédito plano\s+/i, '')
        .replace(/^credito plano\s+/i, '')
        .replace(/^consumo plano\s+/i, '')
        .trim();
      return cleaned || 'PLANO';
    };

    let planConsumedQuantity = 0;
    let planConsumedValue = 0;
    let cantinaCreditQuantity = 0;
    let cantinaCreditValue = 0;
    let cantinaConsumedQuantity = 0;
    let cantinaConsumedValue = 0;

    historyPeriodFilteredMovements.forEach((move) => {
      const tx = transactions.find((candidate: any) =>
        String(candidate?.id || '') === String(move?.id || '')
        && isTransactionFromClient(candidate, historyClient)
      ) as any;

        const amount = Number(move?.amount ?? getTransactionAmount(tx));
      const safeAmount = Number.isFinite(amount) ? amount : 0;
      const units = resolveUnits(tx, String(move?.description || ''), safeAmount);
      const isPlan = isPlanMovement(tx, move);
      const category = String(move?.category || '').toUpperCase();

      if (category === 'RECARGA') {
        if (isPlan) {
          const planName = resolvePlanName(tx, move);
          const current = planMap.get(planName) || { planName, quantity: 0, value: 0 };
          current.quantity += units;
          current.value += safeAmount;
          planMap.set(planName, current);
        } else {
          cantinaCreditQuantity += units;
          cantinaCreditValue += safeAmount;
        }
        return;
      }

      if (category !== 'CONSUMO' && category !== 'VENDA') return;

      if (isPlan) {
        planConsumedQuantity += units;
        planConsumedValue += safeAmount;
      } else {
        cantinaConsumedQuantity += units;
        cantinaConsumedValue += safeAmount;
      }
    });

    const planCreditsByPlan = Array.from(planMap.values())
      .sort((a, b) => a.planName.localeCompare(b.planName, 'pt-BR', { sensitivity: 'base' }));
    const planCreditQuantity = planCreditsByPlan.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const planCreditValue = planCreditsByPlan.reduce((sum, item) => sum + Number(item.value || 0), 0);

    return {
      planCreditsByPlan,
      planCreditQuantity,
      planCreditValue,
      planConsumedQuantity,
      planConsumedValue,
      cantinaCreditQuantity,
      cantinaCreditValue,
      cantinaConsumedQuantity,
      cantinaConsumedValue,
      planBalanceQuantity: planCreditQuantity - planConsumedQuantity,
      planBalanceValue: planCreditValue - planConsumedValue,
      cantinaBalanceQuantity: cantinaCreditQuantity - cantinaConsumedQuantity,
      cantinaBalanceValue: cantinaCreditValue - cantinaConsumedValue,
    };
  }, [historyPeriodFilteredMovements, historyClient, transactions]);

  const consumedProducts = useMemo(() => {
    const productMap = new Map<string, { name: string; quantity: number; totalValue: number }>();

    periodFilteredMovements
      .filter(move => move.category === 'CONSUMO' || move.category === 'VENDA')
      .forEach((move) => {
        const rawTx = transactions.find((t: any) => String(t?.id) === move.id) as any;
        const rawItems = rawTx?.items;

        if (Array.isArray(rawItems) && rawItems.length > 0) {
          rawItems.forEach((item: any) => {
            const name = String(item?.name || item?.productName || 'Produto');
            const qty = Number(item?.quantity || 1);
            const price = Number(item?.price || 0);
            const current = productMap.get(name) || { name, quantity: 0, totalValue: 0 };
            current.quantity += Number.isFinite(qty) ? qty : 1;
            current.totalValue += (Number.isFinite(qty) ? qty : 1) * (Number.isFinite(price) ? price : 0);
            productMap.set(name, current);
          });
          return;
        }

        const rawText = String(rawTx?.item || move.description || '');
        rawText.split(',').map(s => s.trim()).filter(Boolean).forEach(part => {
          const match = part.match(/^(\d+)\s*x\s*(.+)$/i);
          const qty = match ? Number(match[1]) : 1;
          const name = match ? match[2].trim() : part;
          const current = productMap.get(name) || { name, quantity: 0, totalValue: 0 };
          current.quantity += Number.isFinite(qty) ? qty : 1;
          productMap.set(name, current);
        });
      });

    return Array.from(productMap.values()).sort((a, b) => b.quantity - a.quantity);
  }, [periodFilteredMovements, transactions]);

  const detailSummary = useMemo(() => {
    return periodFilteredMovements.reduce(
      (acc, move) => {
        if (move.category === 'RECARGA') acc.recargas += move.amount;
        if (move.category === 'CONSUMO') acc.consumos += move.amount;
        if (move.category === 'VENDA') acc.vendas += move.amount;
        return acc;
      },
      { recargas: 0, consumos: 0, vendas: 0 }
    );
  }, [periodFilteredMovements]);

  const consumptionPeriodLabel = useMemo(() => {
    if (consumptionPeriod === 'TODAY') return 'Hoje';
    if (consumptionPeriod === 'YESTERDAY') return 'Ontem';
    if (consumptionPeriod === 'WEEK') return 'Semana';
    if (consumptionPeriod === '15D') return '15 dias';
    if (consumptionPeriod === 'MONTH') return 'Mês';
    if (consumptionPeriod === 'YEAR') return 'Ano';
    if (consumptionPeriod === 'DATE') {
      if (!consumptionSpecificDate) return 'Data';
      return new Date(`${consumptionSpecificDate}T00:00:00`).toLocaleDateString('pt-BR');
    }
    return 'Período';
  }, [consumptionPeriod, consumptionSpecificDate]);

  const buildExtractHeaderData = (client: Client) => {
    const clientEnterprise = enterprises.find((e) => e.id === client.enterpriseId);
    const enterpriseName = clientEnterprise?.name || activeEnterprise?.name || 'Não informado';
    const schoolName = clientEnterprise?.attachedSchoolName || activeEnterprise?.attachedSchoolName || 'Não informado';
    const guardianName = client.parentName || client.guardianName || client.guardians?.[0] || 'Não informado';
    const guardianPhone = formatPhoneNumber(client.parentWhatsapp || client.guardianPhone || client.phone || '');
    const className = client.class || '-';
    const planBalances = clientPlanBalances.get(client.id) || [];
    const planLines = planBalances.length > 0
      ? planBalances.map((plan) => `${plan.planName}: saldo ${plan.remaining}/${plan.total} | valor R$ ${formatCurrencyBRL(plan.remainingValue || 0)}${(plan.creditValue || 0) > 0 ? ` | crédito R$ ${formatCurrencyBRL(plan.creditValue || 0)}` : ''}`)
      : ['Sem planos ativos'];

    return {
      enterpriseName,
      schoolName,
      studentName: client.name || '-',
      className,
      guardianName,
      guardianPhone,
      planLines
    };
  };

  const buildExtractSummaryData = (client: Client, movements: Array<any>) => {
    const planBalances = clientPlanBalances.get(client.id) || [];
    const planByName = new Map<string, {
      planName: string;
      consumedQuantity: number;
      consumedValue: number;
      balanceQuantity: number;
      balanceValue: number;
    }>();

    planBalances.forEach((plan) => {
      const key = normalizeSearchText(plan.planName || '');
      if (!key) return;
      planByName.set(key, {
        planName: String(plan.planName || '').trim() || 'PLANO',
        consumedQuantity: 0,
        consumedValue: 0,
        balanceQuantity: Number(plan.remaining || 0),
        balanceValue: Number(plan.remainingValue || 0),
      });
    });

    const resolveUnits = (tx: any, move: any, amount: number) => {
      const rawItems = Array.isArray(tx?.items) ? tx.items : [];
      if (rawItems.length > 0) {
        const itemUnits = rawItems.reduce((sum: number, item: any) => sum + Number(item?.quantity || 1), 0);
        if (Number.isFinite(itemUnits) && itemUnits > 0) return itemUnits;
      }

      const directUnits = [
        tx?.planUnits,
        tx?.units,
        tx?.quantity,
        Array.isArray(tx?.selectedDates) ? tx.selectedDates.length : 0,
      ]
        .map((value) => Number(value))
        .find((value) => Number.isFinite(value) && value > 0);
      if (Number.isFinite(directUnits)) return Number(directUnits);

      const fallbackText = String(tx?.item || move?.description || '');
      const match = fallbackText.match(/(\d+(?:[.,]\d+)?)\s*x/i);
      if (match?.[1]) {
        const parsed = Number(String(match[1]).replace(',', '.'));
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
      }

      const unitPrice = Number(tx?.unitPrice ?? tx?.planUnitValue ?? tx?.price ?? 0);
      if (Number.isFinite(unitPrice) && unitPrice > 0 && amount > 0) return amount / unitPrice;
      return 1;
    };

    const isPlanTx = (tx: any, move: any) => {
      const method = String(tx?.paymentMethod || tx?.method || move?.method || '').toUpperCase();
      if (method.includes('PLANO')) return true;
      const planId = String(tx?.planId || tx?.originPlanId || '').trim();
      if (planId) return true;
      const planName = String(tx?.plan || tx?.planName || '').trim().toUpperCase();
      if (planName && !['AVULSO', 'VENDA', 'CRÉDITO CANTINA', 'CREDITO CANTINA'].includes(planName)) return true;
      const text = String(tx?.description || tx?.item || move?.description || '').toUpperCase();
      return text.includes('PLANO');
    };

    const resolvePlanName = (tx: any, move: any) => {
      const direct = String(tx?.plan || tx?.planName || '').trim();
      if (direct) return direct;
      return String(tx?.item || tx?.description || move?.description || 'PLANO')
        .replace(/^crédito plano\s+/i, '')
        .replace(/^credito plano\s+/i, '')
        .replace(/^consumo plano\s+/i, '')
        .trim() || 'PLANO';
    };

    let cantinaCreditValue = 0;
    let cantinaConsumedValue = 0;

    movements.forEach((move) => {
      const tx = transactions.find((candidate: any) =>
        String(candidate?.id || '') === String(move?.id || '')
        && isTransactionFromClient(candidate, client)
      ) as any;
      const amount = Number(move?.amount ?? getTransactionAmount(tx));
      const safeAmount = Number.isFinite(amount) ? amount : 0;
      const category = String(move?.category || '').toUpperCase();
      const planMovement = isPlanTx(tx, move);

      if (category === 'RECARGA') {
        if (!planMovement) cantinaCreditValue += safeAmount;
        return;
      }

      if (category !== 'CONSUMO' && category !== 'VENDA') return;
      if (!planMovement) {
        cantinaConsumedValue += safeAmount;
        return;
      }

      const planName = resolvePlanName(tx, move);
      const key = normalizeSearchText(planName);
      const current = planByName.get(key) || {
        planName: planName || 'PLANO',
        consumedQuantity: 0,
        consumedValue: 0,
        balanceQuantity: 0,
        balanceValue: 0,
      };
      current.consumedQuantity += resolveUnits(tx, move, safeAmount);
      current.consumedValue += safeAmount;
      planByName.set(key, current);
    });

    return {
      plans: Array.from(planByName.values()).sort((a, b) =>
        String(a.planName || '').localeCompare(String(b.planName || ''), 'pt-BR', { sensitivity: 'base' })
      ),
      cantinaCreditValue,
      cantinaConsumedValue,
      cantinaBalanceCurrentValue: Number(client.balance || 0),
    };
  };

  const drawProfessionalPdfHeader = (
    doc: jsPDF,
    title: string,
    header: ReturnType<typeof buildExtractHeaderData>,
    periodLabel: string,
    summary: ReturnType<typeof buildExtractSummaryData>
  ) => {
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 28;
    const contentWidth = pageWidth - (marginX * 2);
    const headerTop = 24;
    const logoSize = 22;
    const logoX = marginX + 12;
    const logoY = headerTop + 10;
    const titleX = logoX + logoSize + 8;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(marginX, headerTop, contentWidth, 126, 8, 8, 'FD');
    drawEnterpriseLogoOnPdf(doc, String(activeEnterprise?.logo || '').trim(), logoX, logoY, logoSize, 'CS');

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(16);
    doc.text(toPdfSafeText(title), titleX, headerTop + 22);

    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(`Período: ${toPdfSafeText(periodLabel)}`, marginX + contentWidth - 12, headerTop + 16, { align: 'right' });
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, marginX + contentWidth - 12, headerTop + 30, { align: 'right' });

    const colLeftX = marginX + 12;
    const colRightX = marginX + (contentWidth / 2) + 6;
    const baseY = headerTop + 50;

    doc.setTextColor(30, 41, 59);
    doc.text(`Escola: ${toPdfSafeText(header.schoolName)}`, colLeftX, baseY);
    doc.text(`Empresa/Unidade: ${toPdfSafeText(header.enterpriseName)}`, colLeftX, baseY + 14);
    doc.text(`Aluno/Cliente: ${toPdfSafeText(header.studentName)}`, colLeftX, baseY + 28);

    doc.text(`Turma: ${toPdfSafeText(header.className)}`, colRightX, baseY);
    doc.text(`Pai/Responsável: ${toPdfSafeText(header.guardianName)}`, colRightX, baseY + 14);
    doc.text(`Telefone Pai/Responsável: ${toPdfSafeText(header.guardianPhone)}`, colRightX, baseY + 28);

    const plansText = `Planos e saldos: ${toPdfSafeText(header.planLines.join(' | '))}`;
    const wrappedPlans = doc.splitTextToSize(plansText, contentWidth - 24);
    doc.text(wrappedPlans, colLeftX, baseY + 46);

    const summaryLines = [
      ...summary.plans.map((plan) =>
        `${toPdfSafeText(plan.planName)}: consumo qtd ${Number(plan.consumedQuantity || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} | valor consumo R$ ${formatCurrencyBRL(plan.consumedValue || 0)} | saldo consumo ${Number(plan.balanceQuantity || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} | saldo valor R$ ${formatCurrencyBRL(plan.balanceValue || 0)}`
      ),
      `Crédito valor cantina (venda itens): R$ ${formatCurrencyBRL(summary.cantinaCreditValue || 0)}`,
      `Consumo valor cantina (venda itens): R$ ${formatCurrencyBRL(summary.cantinaConsumedValue || 0)}`,
      `Saldo cantina atual valor: R$ ${formatCurrencyBRL(summary.cantinaBalanceCurrentValue || 0)}`,
    ];

    const summaryTop = baseY + 46 + (wrappedPlans.length * 10) + 8;
    const maxSummaryWidth = contentWidth - 36;
    const wrappedSummary = summaryLines
      .map((line) => doc.splitTextToSize(toPdfSafeText(line), maxSummaryWidth))
      .flat();
    const summaryHeight = Math.max(28, 12 + (wrappedSummary.length * 10));

    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(colLeftX, summaryTop, contentWidth - 24, summaryHeight, 4, 4, 'S');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text(wrappedSummary, colLeftX + 6, summaryTop + 12);

    return summaryTop + summaryHeight + 10;
  };

  const buildProfessionalPrintHeaderHtml = (
    clientName: string,
    header: ReturnType<typeof buildExtractHeaderData>,
    periodLabel: string,
    summary: ReturnType<typeof buildExtractSummaryData>,
    logoDataUrl: string
  ) => {
    const planLinesHtml = header.planLines.map((line) => `<li>${line}</li>`).join('');
    const logoHtml = buildEnterpriseLogoHtml(logoDataUrl, 'Logo da empresa');
    return `
      <section class="report-header">
        <div class="top-row">
          <div class="title-wrap">
            ${logoHtml}
            <h1>Extrato Completo - ${clientName}</h1>
          </div>
          <div class="meta">
            <p><strong>Período:</strong> ${periodLabel}</p>
            <p><strong>Gerado em:</strong> ${new Date().toLocaleString('pt-BR')}</p>
          </div>
        </div>
        <div class="info-grid">
          <p><strong>Escola:</strong> ${header.schoolName}</p>
          <p><strong>Turma:</strong> ${header.className}</p>
          <p><strong>Empresa/Unidade:</strong> ${header.enterpriseName}</p>
          <p><strong>Pai/Responsável:</strong> ${header.guardianName}</p>
          <p><strong>Aluno/Cliente:</strong> ${header.studentName}</p>
          <p><strong>Telefone Pai/Responsável:</strong> ${header.guardianPhone}</p>
        </div>
        <div class="plans-box">
          <p><strong>Saldo atual de cada plano:</strong></p>
          <ul>${planLinesHtml}</ul>
        </div>
        <div class="plans-box">
          <p><strong>Resumo do período:</strong></p>
          <ul>
            ${summary.plans.map((plan) => `<li><strong>${plan.planName}:</strong> consumo qtd ${Number(plan.consumedQuantity || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} | valor consumo R$ ${formatCurrencyBRL(plan.consumedValue || 0)} | saldo consumo ${Number(plan.balanceQuantity || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} | saldo valor R$ ${formatCurrencyBRL(plan.balanceValue || 0)}</li>`).join('')}
            <li><strong>Crédito valor cantina (venda itens):</strong> R$ ${formatCurrencyBRL(summary.cantinaCreditValue || 0)}</li>
            <li><strong>Consumo valor cantina (venda itens):</strong> R$ ${formatCurrencyBRL(summary.cantinaConsumedValue || 0)}</li>
            <li><strong>Saldo cantina atual valor:</strong> R$ ${formatCurrencyBRL(summary.cantinaBalanceCurrentValue || 0)}</li>
          </ul>
        </div>
      </section>
    `;
  };

  const handleExportClientExtractPdf = () => {
    if (!viewingClient) return;
    if (periodFilteredMovements.length === 0) {
      alert('Nenhuma movimentação para exportar no período selecionado.');
      return;
    }

    const header = buildExtractHeaderData(viewingClient);
    const summary = buildExtractSummaryData(viewingClient, periodFilteredMovements);
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const tableStartY = drawProfessionalPdfHeader(doc, `Extrato Completo - ${viewingClient.name}`, header, consumptionPeriodLabel, summary);

    autoTable(doc, {
      startY: tableStartY,
      head: [['Data/Hora', 'Movimentação', 'Descrição', 'Método', 'Status', 'Valor']],
      body: periodFilteredMovements.map((move) => [
        move.timestamp ? new Date(move.timestamp).toLocaleString('pt-BR') : '-',
        toPdfSafeText(move.category),
        toPdfSafeText(move.description),
        toPdfSafeText(move.method),
        toPdfSafeText(move.status),
        `${move.signal} R$ ${move.amount.toFixed(2)}`
      ]),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [79, 70, 229] }
    });

    doc.save(`extrato_${(viewingClient.name || 'cliente').replace(/\s+/g, '_').toLowerCase()}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const handlePrintClientExtract = () => {
    if (!viewingClient) return;
    if (periodFilteredMovements.length === 0) {
      alert('Nenhuma movimentação para imprimir no período selecionado.');
      return;
    }

    const header = buildExtractHeaderData(viewingClient);
    const summary = buildExtractSummaryData(viewingClient, periodFilteredMovements);
    const rowsHtml = periodFilteredMovements.map((move) => `
      <tr>
        <td>${move.timestamp ? new Date(move.timestamp).toLocaleString('pt-BR') : '-'}</td>
        <td>${move.category}</td>
        <td>${move.description}</td>
        <td>${move.method}</td>
        <td>${move.status}</td>
        <td>${move.signal} R$ ${move.amount.toFixed(2)}</td>
      </tr>
    `).join('');

    const printWindow = window.open('', '_blank', 'width=1200,height=800');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Extrato Completo</title>
          <style>
            @page { margin: 14mm; }
            body { font-family: Arial, sans-serif; margin: 0; color: #111827; }
            .report-header { width: 100%; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 10px; padding: 14px 16px; box-sizing: border-box; margin-bottom: 14px; }
            .top-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 12px; }
            .title-wrap { display: flex; align-items: center; gap: 10px; }
            .report-logo { width: 38px; height: 38px; border-radius: 8px; object-fit: cover; border: 1px solid #cbd5e1; background: #fff; }
            h1 { margin: 0; font-size: 30px; line-height: 1.2; }
            .meta p { margin: 0 0 4px 0; font-size: 12px; color: #475569; text-align: right; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; margin-bottom: 10px; }
            .info-grid p { margin: 0; font-size: 13px; color: #0f172a; }
            .plans-box { border-top: 1px solid #e2e8f0; padding-top: 8px; }
            .plans-box p { margin: 0 0 5px 0; font-size: 12px; color: #0f172a; }
            .plans-box ul { margin: 0; padding-left: 18px; font-size: 12px; color: #1e293b; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11px; }
            th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; vertical-align: top; }
            th { background: #eef2ff; color: #312e81; }
          </style>
        </head>
        <body>
          ${buildProfessionalPrintHeaderHtml(viewingClient.name, header, consumptionPeriodLabel, summary, String(activeEnterprise?.logo || '').trim())}
          <table>
            <thead>
              <tr>
                <th>Data/Hora</th>
                <th>Movimentação</th>
                <th>Descrição</th>
                <th>Método</th>
                <th>Status</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleExportHistoryExtractPdf = () => {
    if (!historyClient) return;
    if (historyPeriodFilteredMovements.length === 0) {
      alert('Nenhuma movimentação para exportar no período selecionado.');
      return;
    }

    const header = buildExtractHeaderData(historyClient);
    const summary = buildExtractSummaryData(historyClient, historyPeriodFilteredMovements);
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const tableStartY = drawProfessionalPdfHeader(doc, `Extrato Completo - ${historyClient.name}`, header, consumptionPeriodLabel, summary);

    autoTable(doc, {
      startY: tableStartY,
      head: [['Data/Hora', 'Movimentação', 'Descrição', 'Método', 'Status', 'Valor']],
      body: historyPeriodFilteredMovements.map((move) => [
        move.timestamp ? new Date(move.timestamp).toLocaleString('pt-BR') : '-',
        toPdfSafeText(move.category),
        toPdfSafeText(move.description),
        toPdfSafeText(move.method),
        toPdfSafeText(move.status),
        `${move.signal} R$ ${move.amount.toFixed(2)}`
      ]),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [79, 70, 229] }
    });

    doc.save(`extrato_${(historyClient.name || 'cliente').replace(/\s+/g, '_').toLowerCase()}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const handlePrintHistoryExtract = () => {
    if (!historyClient) return;
    if (historyPeriodFilteredMovements.length === 0) {
      alert('Nenhuma movimentação para imprimir no período selecionado.');
      return;
    }

    const header = buildExtractHeaderData(historyClient);
    const summary = buildExtractSummaryData(historyClient, historyPeriodFilteredMovements);
    const rowsHtml = historyPeriodFilteredMovements.map((move) => `
      <tr>
        <td>${move.timestamp ? new Date(move.timestamp).toLocaleString('pt-BR') : '-'}</td>
        <td>${move.category}</td>
        <td>${move.description}</td>
        <td>${move.method}</td>
        <td>${move.status}</td>
        <td>${move.signal} R$ ${move.amount.toFixed(2)}</td>
      </tr>
    `).join('');
    const planLinesHtml = header.planLines.map((line) => `<li>${line}</li>`).join('');

    const printWindow = window.open('', '_blank', 'width=1200,height=800');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Extrato Completo</title>
          <style>
            @page { margin: 14mm; }
            body { font-family: Arial, sans-serif; margin: 0; color: #111827; }
            .report-header { width: 100%; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 10px; padding: 14px 16px; box-sizing: border-box; margin-bottom: 14px; }
            .top-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 12px; }
            .title-wrap { display: flex; align-items: center; gap: 10px; }
            .report-logo { width: 38px; height: 38px; border-radius: 8px; object-fit: cover; border: 1px solid #cbd5e1; background: #fff; }
            h1 { margin: 0; font-size: 30px; line-height: 1.2; }
            .meta p { margin: 0 0 4px 0; font-size: 12px; color: #475569; text-align: right; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; margin-bottom: 10px; }
            .info-grid p { margin: 0; font-size: 13px; color: #0f172a; }
            .plans-box { border-top: 1px solid #e2e8f0; padding-top: 8px; }
            .plans-box p { margin: 0 0 5px 0; font-size: 12px; color: #0f172a; }
            .plans-box ul { margin: 0; padding-left: 18px; font-size: 12px; color: #1e293b; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11px; }
            th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; vertical-align: top; }
            th { background: #eef2ff; color: #312e81; }
          </style>
        </head>
        <body>
          ${buildProfessionalPrintHeaderHtml(historyClient.name, header, consumptionPeriodLabel, summary, String(activeEnterprise?.logo || '').trim())}
          <table>
            <thead>
              <tr>
                <th>Data/Hora</th>
                <th>Movimentação</th>
                <th>Descrição</th>
                <th>Método</th>
                <th>Status</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const exportRows = useMemo(() => {
    return filteredClients.map((client) => {
      const enterprise = enterprises.find((e) => e.id === client.enterpriseId);
      const responsibleOrSector = client.type === 'ALUNO'
        ? (client.parentName || client.guardianName || client.guardians?.[0] || client.parentEmail || 'Não informado')
        : (client.class || 'Não informado');
      const responsiblePhone = client.type === 'ALUNO'
        ? (client.parentWhatsapp || client.guardianPhone || client.phone || 'Não informado')
        : (client.phone || client.parentWhatsapp || 'Não informado');
      const planBalances = clientPlanBalances.get(client.id) || [];
      const plansText = planBalances.length > 0
        ? planBalances.map((plan) => `${plan.planName} (${plan.isActive ? 'Ativo' : 'Inativo'}) - saldo ${plan.remaining}/${plan.total} - R$ ${formatCurrencyBRL(plan.remainingValue || 0)}`).join(' | ')
        : 'Sem planos';

      return {
        matricula: client.registrationId || '-',
        nome: client.name || '-',
        tipo: client.type || '-',
        responsavel: responsibleOrSector,
        telefone: formatPhoneNumber(responsiblePhone),
        turma: client.type === 'ALUNO' ? (client.class || '-') : '-',
        planos: plansText,
        unidade: enterprise?.name || 'Unidade',
        saldo: Number(client.balance || 0)
      };
    });
  }, [filteredClients, enterprises, clientPlanBalances]);

  const backupResponsibleSnapshot = useMemo(() => {
    const enterpriseClients = clients.filter((client) => String(client.enterpriseId || '').trim() === String(activeEnterprise?.id || '').trim());
    const responsibleClients = enterpriseClients.filter((client) => {
      const type = String(client.type || '').toUpperCase();
      return type === 'RESPONSAVEL' || type === 'COLABORADOR';
    });

    const relatedStudentsMap = new Map<string, Client>();
    const enterpriseStudents = enterpriseClients.filter((client) => String(client.type || '').toUpperCase() === 'ALUNO');

    const responsibleIds = new Set(responsibleClients.map((client) => String(client.id || '').trim()).filter(Boolean));
    const responsibleNameKeys = new Set(
      responsibleClients
        .map((client) => normalizeSearchText(client.name))
        .filter(Boolean)
    );
    const responsiblePhones = new Set(
      responsibleClients
        .flatMap((client) => [
          normalizePhoneDigits(client.phone),
          normalizePhoneDigits(client.parentWhatsapp),
          normalizePhoneDigits(client.guardianPhone),
        ])
        .filter((value) => String(value || '').length >= 10)
    );
    const responsibleEmails = new Set(
      responsibleClients
        .flatMap((client) => [
          normalizeSearchText(client.email),
          normalizeSearchText(client.parentEmail),
          normalizeSearchText(client.guardianEmail),
        ])
        .filter(Boolean)
    );

    responsibleClients.forEach((responsible) => {
      const directIds = [
        ...(Array.isArray((responsible as any).relatedStudentIds) ? (responsible as any).relatedStudentIds : []),
        String((responsible as any)?.relatedStudent?.studentId || '').trim(),
      ]
        .map((id) => String(id || '').trim())
        .filter(Boolean);

      directIds.forEach((studentId) => {
        const found = enterpriseStudents.find((student) => String(student.id || '').trim() === studentId);
        if (found) relatedStudentsMap.set(String(found.id), found);
      });
    });

    enterpriseStudents.forEach((student) => {
      const responsibleCollaboratorId = String((student as any)?.responsibleCollaboratorId || '').trim();
      const responsibleClientId = String((student as any)?.responsibleClientId || '').trim();
      const parentNameKey = normalizeSearchText(student.parentName || student.guardianName);
      const parentPhoneDigits = normalizePhoneDigits(student.parentWhatsapp || student.guardianPhone || student.phone);
      const parentEmailKey = normalizeSearchText(student.parentEmail || student.guardianEmail || student.email);

      const isRelated =
        (responsibleCollaboratorId && responsibleIds.has(responsibleCollaboratorId))
        || (responsibleClientId && responsibleIds.has(responsibleClientId))
        || (parentNameKey && responsibleNameKeys.has(parentNameKey))
        || (parentPhoneDigits && responsiblePhones.has(parentPhoneDigits))
        || (parentEmailKey && responsibleEmails.has(parentEmailKey));

      if (isRelated) {
        relatedStudentsMap.set(String(student.id), student);
      }
    });

    const items = [...responsibleClients, ...Array.from(relatedStudentsMap.values())];
    return {
      items,
      responsibleCount: responsibleClients.length,
      studentsCount: relatedStudentsMap.size,
    };
  }, [clients, activeEnterprise?.id]);

  const viewingClientRelatedStudents = useMemo(() => {
    if (!viewingClient) return [] as Client[];
    const viewingType = String(viewingClient.type || '').toUpperCase();
    if (viewingType !== 'RESPONSAVEL' && viewingType !== 'COLABORADOR') return [] as Client[];

    const enterpriseStudents = clients.filter((client) => {
      return String(client.type || '').toUpperCase() === 'ALUNO'
        && String(client.enterpriseId || '').trim() === String(viewingClient.enterpriseId || '').trim();
    });

    const relatedMap = new Map<string, Client>();
    const directIds = [
      ...(Array.isArray((viewingClient as any).relatedStudentIds) ? (viewingClient as any).relatedStudentIds : []),
      String((viewingClient as any)?.relatedStudent?.studentId || '').trim(),
    ]
      .map((id) => String(id || '').trim())
      .filter(Boolean);

    directIds.forEach((studentId) => {
      const found = enterpriseStudents.find((student) => String(student.id || '').trim() === studentId);
      if (found) relatedMap.set(String(found.id), found);
    });

    const viewingNameKey = normalizeSearchText(viewingClient.name);
    const viewingPhoneDigits = normalizePhoneDigits(viewingClient.phone || viewingClient.parentWhatsapp);
    const viewingEmailKey = normalizeSearchText(viewingClient.email || viewingClient.parentEmail);

    enterpriseStudents.forEach((student) => {
      const sameResponsibleId = viewingType === 'RESPONSAVEL' && String((student as any)?.responsibleClientId || '').trim() === String(viewingClient.id || '').trim();
      const sameCollaboratorId = viewingType === 'COLABORADOR' && String((student as any)?.responsibleCollaboratorId || '').trim() === String(viewingClient.id || '').trim();
      const sameName = viewingNameKey && normalizeSearchText(student.parentName || student.guardianName) === viewingNameKey;
      const samePhone = viewingPhoneDigits && normalizePhoneDigits(student.parentWhatsapp || student.guardianPhone || student.phone) === viewingPhoneDigits;
      const sameEmail = viewingEmailKey && normalizeSearchText(student.parentEmail || student.guardianEmail || student.email) === viewingEmailKey;

      if (sameResponsibleId || sameCollaboratorId || sameName || samePhone || sameEmail) {
        relatedMap.set(String(student.id), student);
      }
    });

    return Array.from(relatedMap.values()).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR', { sensitivity: 'base' }));
  }, [viewingClient, clients]);

  const handleBackupResponsibleClients = () => {
    const now = new Date();
    const payload = {
      kind: 'CLIENTS_RESPONSAVEIS_BACKUP',
      version: 1,
      generatedAt: now.toISOString(),
      generatedAtReadable: now.toLocaleString('pt-BR'),
      audit: {
        exportedBy: String(currentUser?.name || currentUser?.email || '').trim() || 'Não informado',
        enterpriseId: String(activeEnterprise?.id || ''),
        enterpriseName: String(activeEnterprise?.name || '').trim() || 'Não informada',
        viewMode,
      },
      totalItems: backupResponsibleSnapshot.items.length,
      responsibleCount: backupResponsibleSnapshot.responsibleCount,
      relatedStudentsCount: backupResponsibleSnapshot.studentsCount,
      items: backupResponsibleSnapshot.items,
    };

    if (payload.totalItems === 0) {
      alert('Nenhum responsável/colaborador ou aluno relacionado encontrado para backup.');
      return;
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup-clientes-responsaveis-${now.toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const parseClientsRestoreItems = (payload: any): Client[] => {
    const itemsRaw = Array.isArray(payload)
      ? payload
      : (Array.isArray(payload?.items) ? payload.items : []);

    return itemsRaw
      .map((item: any) => ({
        ...item,
        id: String(item?.id || '').trim(),
        enterpriseId: String(item?.enterpriseId || activeEnterprise?.id || '').trim(),
        type: String(item?.type || '').toUpperCase(),
      }))
      .filter((item: any) => {
        const type = String(item.type || '').toUpperCase();
        return Boolean(item.id) && Boolean(item.enterpriseId) && ['ALUNO', 'RESPONSAVEL', 'COLABORADOR'].includes(type);
      });
  };

  const handleRestoreResponsibleClients = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsRestoringClientsBackup(true);
      const text = await file.text();
      const parsed = JSON.parse(text);
      const items = parseClientsRestoreItems(parsed);

      if (items.length === 0) {
        alert('Arquivo inválido. Nenhum registro de cliente/responsável/aluno relacionado encontrado.');
        return;
      }

      const totalResponsibles = items.filter((item: any) => {
        const type = String(item?.type || '').toUpperCase();
        return type === 'RESPONSAVEL' || type === 'COLABORADOR';
      }).length;
      const totalStudents = items.filter((item: any) => String(item?.type || '').toUpperCase() === 'ALUNO').length;

      const backupKind = String(parsed?.kind || 'Arquivo genérico').trim();
      const backupVersion = String(parsed?.version || '-').trim();
      const backupGeneratedAt = String(parsed?.generatedAtReadable || '').trim()
        || (parsed?.generatedAt ? new Date(parsed.generatedAt).toLocaleString('pt-BR') : 'Não informado');
      const backupExportedBy = String(parsed?.audit?.exportedBy || 'Não informado').trim();
      const backupEnterpriseName = String(parsed?.audit?.enterpriseName || 'Não informada').trim();
      const backupEnterpriseId = String(parsed?.audit?.enterpriseId || '').trim();
      const sourceTotalItems = Number(parsed?.totalItems || items.length);
      const isDifferentEnterprise = Boolean(backupEnterpriseId) && backupEnterpriseId !== String(activeEnterprise?.id || '').trim();

      const confirmText = [
        'Pré-visualização do backup',
        `Tipo: ${backupKind} (v${backupVersion})`,
        `Exportado por: ${backupExportedBy}`,
        `Data: ${backupGeneratedAt}`,
        `Empresa origem: ${backupEnterpriseName}${backupEnterpriseId ? ` (${backupEnterpriseId})` : ''}`,
        `Empresa destino: ${String(activeEnterprise?.name || 'Não informada')} (${String(activeEnterprise?.id || '-')})`,
        `Total no arquivo: ${sourceTotalItems}`,
        `Responsáveis/Colaboradores: ${totalResponsibles}`,
        `Alunos relacionados: ${totalStudents}`,
        isDifferentEnterprise ? 'ATENÇÃO: backup de outra empresa/unidade.' : '',
        '',
        'Deseja continuar a restauração?',
      ].filter(Boolean).join('\n');

      if (!window.confirm(confirmText)) {
        return;
      }

      await ApiService.restoreClientsSnapshot(String(activeEnterprise?.id || ''), items);
      const refreshed = await ApiService.getClients(String(activeEnterprise?.id || ''));
      setClients(Array.isArray(refreshed) ? refreshed : []);
      alert('Backup de Cliente/Responsável restaurado com sucesso.');
    } catch (error) {
      console.error('Erro ao restaurar backup de clientes/responsáveis:', error);
      alert('Erro ao restaurar backup de clientes/responsáveis.');
    } finally {
      setIsRestoringClientsBackup(false);
      if (restoreClientsInputRef.current) {
        restoreClientsInputRef.current.value = '';
      }
    }
  };

  const handleExportCsv = () => {
    if (exportRows.length === 0) {
      alert('Nenhum cliente para exportar.');
      return;
    }

    const escapeCsv = (value: string | number) => {
      const text = String(value ?? '');
      if (/[",;\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
      return text;
    };

    const headers = ['Matricula', 'Aluno/Cliente', 'Tipo', 'Responsavel/Setor', 'Telefone', 'Turma', 'Planos', 'Unidade', 'Saldo Carteira'];
    const lines = [
      headers.join(';'),
      ...exportRows.map((row) => [
        row.matricula,
        row.nome,
        row.tipo,
        row.responsavel,
        row.telefone,
        row.turma,
        row.planos,
        row.unidade,
        row.saldo.toFixed(2)
      ].map(escapeCsv).join(';'))
    ];

    const csvContent = `\uFEFF${lines.join('\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clientes_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    if (exportRows.length === 0) {
      alert('Nenhum cliente para exportar.');
      return;
    }

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFontSize(14);
    doc.text('Relatorio de Clientes', 40, 34);
    doc.setFontSize(9);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 40, 50);

    autoTable(doc, {
      startY: 62,
      head: [['Matricula', 'Aluno/Cliente', 'Tipo', 'Responsavel/Setor', 'Telefone', 'Turma', 'Planos', 'Unidade', 'Saldo']],
      body: exportRows.map((row) => [
        row.matricula,
        row.nome,
        row.tipo,
        row.responsavel,
        row.telefone,
        row.turma,
        row.planos,
        row.unidade,
        `R$ ${row.saldo.toFixed(2)}`
      ]),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [79, 70, 229] }
    });

    doc.save(`clientes_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const handlePrintClients = () => {
    if (exportRows.length === 0) {
      alert('Nenhum cliente para imprimir.');
      return;
    }

    const rowsHtml = exportRows.map((row) => `
      <tr>
        <td>${row.matricula}</td>
        <td>${row.nome}</td>
        <td>${row.tipo}</td>
        <td>${row.responsavel}</td>
        <td>${row.telefone}</td>
        <td>${row.turma}</td>
      </tr>
    `).join('');

    const printWindow = window.open('', '_blank', 'width=1200,height=800');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Relatorio de Clientes</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
            h1 { margin: 0 0 8px 0; font-size: 20px; }
            p { margin: 0 0 16px 0; font-size: 12px; color: #6b7280; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; vertical-align: top; }
            th { background: #eef2ff; color: #312e81; }
          </style>
        </head>
        <body>
          <h1>Relatorio de Clientes</h1>
          <p>Gerado em ${new Date().toLocaleString('pt-BR')}</p>
          <table>
            <thead>
              <tr>
                <th>Matricula</th>
                <th>Aluno/Cliente</th>
                <th>Tipo</th>
                <th>Responsavel/Setor</th>
                <th>Telefone</th>
                <th>Turma</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  if (!activeEnterpriseId && !isSystemWideAdmin) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full"></div>
          <p className="text-gray-600 font-medium">Carregando clientes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dash-shell clients-shell animate-in fade-in duration-500 w-full max-w-none">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-gray-800 tracking-tight uppercase">
            {viewMode === 'ALUNOS' ? 'Gestão de Alunos' : 'Gestão de Clientes/Responsáveis'}
          </h1>
          <p className="text-gray-400 text-[8px] sm:text-[9px] font-black uppercase tracking-[0.14em] mt-1">
            {viewMode === 'ALUNOS'
              ? 'Controle de alunos, planos e carteira digital'
              : 'Controle de responsáveis e colaboradores'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button onClick={handleOpenCreateModal} className="bg-indigo-600 text-white px-3.5 py-2 rounded-xl font-black uppercase tracking-[0.12em] text-[9px] shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center gap-1.5">
            <Plus size={12} /> {viewMode === 'ALUNOS' ? 'Adicionar' : 'Novo Responsável'}
          </button>
          {viewMode === 'CLIENTES_RESPONSAVEIS' && (
            <>
              <button
                onClick={handleGenerateExistingPortalLinks}
                disabled={isGeneratingExistingPortalLinks}
                className="bg-cyan-50 border border-cyan-200 text-cyan-700 px-3 py-2 rounded-xl font-black uppercase tracking-[0.12em] text-[9px] hover:bg-cyan-100 transition-all flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Copy size={12} /> {isGeneratingExistingPortalLinks ? 'Gerando links...' : 'Gerar links existentes'}
              </button>
              <button
                onClick={handleBackupResponsibleClients}
                className="bg-white border border-emerald-200 text-emerald-700 px-3 py-2 rounded-xl font-black uppercase tracking-[0.12em] text-[9px] hover:bg-emerald-50 transition-all flex items-center gap-1.5"
              >
                <Download size={12} /> Backup JSON
              </button>
              <button
                onClick={() => restoreClientsInputRef.current?.click()}
                disabled={isRestoringClientsBackup}
                className="bg-white border border-amber-200 text-amber-700 px-3 py-2 rounded-xl font-black uppercase tracking-[0.12em] text-[9px] hover:bg-amber-50 transition-all flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Upload size={12} /> {isRestoringClientsBackup ? 'Restaurando...' : 'Restaurar JSON'}
              </button>
              <input
                ref={restoreClientsInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleRestoreResponsibleClients}
                className="hidden"
              />
            </>
          )}
          <button onClick={handleExportCsv} className="bg-white border border-gray-200 text-gray-700 px-3 py-2 rounded-xl font-black uppercase tracking-[0.12em] text-[9px] hover:border-indigo-200 hover:text-indigo-700 transition-all flex items-center gap-1.5">
            <FileSpreadsheet size={12} /> CSV
          </button>
          <button onClick={handleExportPdf} className="bg-white border border-gray-200 text-gray-700 px-3 py-2 rounded-xl font-black uppercase tracking-[0.12em] text-[9px] hover:border-red-200 hover:text-red-700 transition-all flex items-center gap-1.5">
            <FileText size={12} /> PDF
          </button>
          <button onClick={handlePrintClients} className="bg-white border border-gray-200 text-gray-700 px-3 py-2 rounded-xl font-black uppercase tracking-[0.12em] text-[9px] hover:border-emerald-200 hover:text-emerald-700 transition-all flex items-center gap-1.5">
            <Printer size={12} /> Imprimir
          </button>
        </div>
      </div>

      <div className="bg-white p-2.5 sm:p-3 rounded-[20px] sm:rounded-[28px] border shadow-sm flex flex-col xl:flex-row items-stretch xl:items-center gap-2.5 sm:gap-3 xl:gap-5">
        {!isUnitAdmin && (
          <>
            <div className="flex flex-col gap-1 w-full xl:w-72">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-4">Unidade Operacional</label>
              <div className="relative group">
                <Building2 size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-400" />
                <select 
                  value={selectedUnitId}
                  onChange={(e) => setSelectedUnitId(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none font-black text-[10px] uppercase tracking-widest appearance-none cursor-pointer transition-all shadow-inner"
                >
                  <option value="ALL">Todas as Unidades</option>
                  {enterprises.map(ent => (
                    <option key={ent.id} value={ent.id}>{ent.name}</option>
                  ))}
                </select>
                <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div className="h-8 w-px bg-gray-100 hidden xl:block"></div>
          </>
        )}

        <div className="relative flex-1 w-full">
           <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
           <input type="text" placeholder={viewMode === 'ALUNOS' ? 'Pesquisar por matrícula, nome ou turma...' : 'Pesquisar por nome, vínculo ou telefone...'} className="w-full pl-10 pr-3 py-2 sm:py-2.5 bg-gray-50 border border-transparent focus:border-indigo-500 rounded-xl sm:rounded-2xl outline-none font-semibold text-[11px] sm:text-xs transition-all shadow-inner" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
      </div>

      <div className="bg-white rounded-[24px] sm:rounded-[32px] shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className={`w-full text-left ${viewMode === 'ALUNOS' ? 'min-w-[1140px] lg:min-w-[1240px]' : 'min-w-[980px] lg:min-w-[1080px]'}`}>
            <thead className="bg-gray-50 text-[8px] sm:text-[9px] font-black text-gray-500 uppercase tracking-[0.14em] border-b">
              <tr>
                <th className="px-2.5 sm:px-4 py-2.5 sm:py-3">ID</th>
                {viewMode === 'ALUNOS' && <th className="px-2.5 sm:px-4 py-2.5 sm:py-3 whitespace-nowrap">Cad.</th>}
                <th className="px-2.5 sm:px-4 py-2.5 sm:py-3">{viewMode === 'ALUNOS' ? 'Aluno' : 'Cliente / Responsável'}</th>
                {viewMode === 'ALUNOS' ? (
                  <>
                    <th className="px-2.5 sm:px-4 py-2.5 sm:py-3">Responsável / Setor</th>
                    <th className="px-2.5 sm:px-4 py-2.5 sm:py-3">Tipo Responsável</th>
                    <th className="px-2.5 sm:px-4 py-2.5 sm:py-3">Telefone</th>
                    <th className="px-2.5 sm:px-4 py-2.5 sm:py-3">Turma</th>
                    <th className="px-2.5 sm:px-4 py-2.5 sm:py-3 text-center">Restrição</th>
                  </>
                ) : (
                  <>
                    <th className="px-2.5 sm:px-4 py-2.5 sm:py-3">Tipo</th>
                    <th className="px-2.5 sm:px-4 py-2.5 sm:py-3">Vínculo</th>
                    <th className="px-2.5 sm:px-4 py-2.5 sm:py-3">Telefone</th>
                    <th className="px-2.5 sm:px-4 py-2.5 sm:py-3">Link do Painel</th>
                  </>
                )}
                <th className="px-2.5 sm:px-4 py-2.5 sm:py-3 text-right whitespace-nowrap">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(viewMode === 'ALUNOS' ? filteredClients.length : responsibleOrCollaboratorRows.length) === 0 ? (
                <tr>
                  <td colSpan={viewMode === 'ALUNOS' ? 9 : 7} className="px-4 sm:px-6 py-20 text-center text-gray-400 font-bold uppercase text-xs tracking-widest opacity-40">
                    {viewMode === 'ALUNOS' ? 'Nenhum aluno na base' : 'Nenhum responsável ou colaborador na base'}
                  </td>
                </tr>
              ) : viewMode === 'ALUNOS' ? filteredClients.map(client => {
                const clientRestrictions = Array.isArray(client.restrictions) ? client.restrictions : [];
                const hasRestriction = clientRestrictions.length > 0;
                const responsibleOrSector = client.type === 'ALUNO'
                  ? (client.parentName || client.guardianName || client.guardians?.[0] || client.parentEmail || 'Não informado')
                  : (client.class || 'Não informado');
                const responsibleEmail = client.type === 'ALUNO'
                  ? (client.parentEmail || client.guardianEmail || client.email || 'Não informado')
                  : (client.email || client.parentEmail || 'Não informado');
                const responsiblePhone = client.type === 'ALUNO'
                  ? (client.parentWhatsapp || client.guardianPhone || client.phone || 'Não informado')
                  : (client.phone || client.parentWhatsapp || 'Não informado');
                const responsibleTypeLabel = formatParentRelationship((client as any)?.parentRelationship) || resolveResponsibleRelationshipLabel(client);
                const responsiblePhoneDigits = normalizePhoneDigits(responsiblePhone);
                const whatsappStatusLabel = !responsiblePhoneDigits
                  ? 'SEM NÚMERO'
                  : openingWhatsAppKey === client.id
                    ? 'ABRINDO...'
                    : 'ABRIR CONVERSA';
                return (
                  <tr key={client.id} className="hover:bg-indigo-50/30 transition-all group">
                    <td className="px-2.5 sm:px-4 py-2.5 sm:py-3 font-mono text-[10px] sm:text-[11px] font-black text-indigo-600">#{client.registrationId}</td>
                    <td className="px-2.5 sm:px-4 py-2.5 sm:py-3">
                      <span className="text-[10px] sm:text-[11px] font-black text-gray-500 uppercase tracking-wider">
                        {formatClientCreatedAtShort(client)}
                      </span>
                    </td>
                    <td className="px-2.5 sm:px-4 py-2.5 sm:py-3">
                      <div className="flex items-center gap-2.5">
                        <img src={resolveClientPhotoUrl(client.photo, client.name)} className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg object-cover border-2 border-white shadow-sm" />
                        <div>
                          <p className="font-black text-gray-800 text-[11px] sm:text-xs leading-tight uppercase">{renderHighlightedText(client.name, searchTerm)}</p>
                          <p className="text-[9px] text-gray-500 font-bold uppercase mt-0.5">{client.type}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-2.5 sm:px-4 py-2.5 sm:py-3">
                      <div className="space-y-1">
                        <p className="text-[10px] sm:text-[11px] font-black text-gray-700 uppercase tracking-wider">
                          {responsibleOrSector}
                        </p>
                        <p className="text-[9px] sm:text-[10px] font-semibold text-gray-500 lowercase">
                          {responsibleEmail}
                        </p>
                      </div>
                    </td>
                    <td className="px-2.5 sm:px-4 py-2.5 sm:py-3">
                      <span className="inline-flex px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-wider bg-cyan-50 text-cyan-700 border border-cyan-100">
                        {responsibleTypeLabel}
                      </span>
                    </td>
                    <td className="px-2.5 sm:px-4 py-2.5 sm:py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[10px] sm:text-[11px] font-black text-gray-600 uppercase tracking-wider">
                          {formatPhoneNumber(responsiblePhone)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenWhatsAppConversation(
                            responsiblePhone,
                            client.id,
                            {
                              displayName: responsibleOrSector !== 'Não informado' ? responsibleOrSector : client.name,
                              contactTypeLabel: client.type === 'COLABORADOR' ? 'Colaborador' : 'Responsável',
                              relationshipLabel: client.type === 'COLABORADOR'
                                ? (String(client.class || '').trim() || 'Indefinido')
                                : resolveResponsibleRelationshipLabel(client),
                            }
                          )}
                          disabled={!responsiblePhoneDigits}
                          className={`inline-flex px-1.5 py-0.5 rounded-full border text-[7px] sm:text-[8px] font-black uppercase tracking-wider disabled:cursor-not-allowed ${
                            !responsiblePhoneDigits
                              ? 'bg-gray-50 text-gray-400 border-gray-200'
                              : openingWhatsAppKey === client.id
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100'
                          }`}
                          title={!responsiblePhoneDigits ? 'Telefone não informado' : 'Abrir conversa no WhatsApp'}
                        >
                          {whatsappStatusLabel}
                        </button>
                      </div>
                    </td>
                    <td className="px-2.5 sm:px-4 py-2.5 sm:py-3">
                      {client.type === 'ALUNO' ? (
                        <span className="text-[10px] sm:text-[11px] font-black text-indigo-600 uppercase tracking-wider">
                          {client.class || 'Não informado'}
                        </span>
                      ) : (
                        <span className="text-[10px] sm:text-[11px] font-black text-gray-300 uppercase tracking-wider">—</span>
                      )}
                    </td>
                    <td className="px-2.5 sm:px-4 py-2.5 sm:py-3 text-center">
                      {hasRestriction ? (
                        <div className="flex justify-center">
                          <span className="p-1 bg-red-50 text-red-600 rounded-md border border-red-100 animate-pulse" title={clientRestrictions.join(', ')}>
                            <AlertTriangle size={12} />
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-200">—</span>
                      )}
                    </td>
                    <td className="px-2.5 sm:px-4 py-2.5 sm:py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                         <button onClick={() => handleOpenDetail(client)} className="p-1.5 sm:p-2 bg-white border text-gray-500 rounded-lg hover:text-indigo-600 hover:bg-indigo-50 transition-all shadow-sm" title="Ver Detalhes"><Eye size={12} /></button>
                         <button onClick={() => { setConsumptionPeriod('MONTH'); setConsumptionSpecificDate(''); setHistoryClient(client); setIsHistoryModalOpen(true); }} className="p-1.5 sm:p-2 bg-white border text-cyan-600 rounded-lg hover:text-cyan-700 hover:bg-cyan-50 transition-all shadow-sm" title="Histórico"><History size={12} /></button>
                         <button
                           onClick={() => handleOpenEditModal(client)}
                           className="p-1.5 sm:p-2 bg-white border text-indigo-500 rounded-lg hover:text-indigo-700 hover:bg-indigo-50 transition-all shadow-sm"
                           title="Editar"
                         >
                           <Edit size={12} />
                         </button>
                         <button
                           onClick={() => handleDeleteClient(client)}
                           className="p-1.5 sm:p-2 bg-white border text-red-400 rounded-lg hover:text-red-600 hover:bg-red-50 transition-all shadow-sm"
                           title="Excluir Cliente"
                         >
                           <Trash2 size={12} />
                         </button>
                      </div>
                    </td>
                  </tr>
                );
              }) : responsibleOrCollaboratorRows.map((row) => {
                const phoneDigits = normalizePhoneDigits(row.phone);
                const portalLink = resolvePortalLinkForRow(row);
                const whatsappStatusLabel = !phoneDigits
                  ? 'Sem número'
                  : openingWhatsAppKey === row.id
                    ? 'Abrindo...'
                    : 'Abrir conversa';

                return (
                  <tr key={row.id} className="hover:bg-indigo-50/30 transition-all group">
                    <td className="px-2.5 sm:px-4 py-2.5 sm:py-3 font-mono text-[10px] sm:text-[11px] font-black text-indigo-600">#{row.registrationId || '-'}</td>
                    <td className="px-2.5 sm:px-4 py-2.5 sm:py-3">
                      <div className="flex items-center gap-2.5">
                        <img src={resolveClientPhotoUrl(row.photo, row.name)} className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg object-cover border-2 border-white shadow-sm" />
                        <div>
                          <p className="font-black text-gray-800 text-[11px] sm:text-xs leading-tight uppercase">{renderHighlightedText(row.name, searchTerm)}</p>
                          <p className="text-[9px] text-gray-500 font-bold uppercase mt-0.5">{row.email || 'Sem e-mail'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-2.5 sm:px-4 py-2.5 sm:py-3">
                      <span className={`inline-flex px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-wider ${
                        row.tipoConta === 'COLABORADOR'
                          ? 'bg-blue-50 text-blue-700 border border-blue-100'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                      }`}>
                        {row.tipoConta === 'COLABORADOR' ? 'Colaborador' : 'Responsável'}
                      </span>
                    </td>
                    <td className="px-2.5 sm:px-4 py-2.5 sm:py-3">
                      <span className="text-[10px] sm:text-[11px] font-black text-gray-700 uppercase tracking-wider">{row.cargoParentesco || 'Indefinido'}</span>
                    </td>
                    <td className="px-2.5 sm:px-4 py-2.5 sm:py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[10px] sm:text-[11px] font-black text-gray-600 uppercase tracking-wider">
                          {formatPhoneNumber(row.phone || 'Não informado')}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenWhatsAppConversation(
                            row.phone,
                            row.id,
                            {
                              displayName: row.name,
                              contactTypeLabel: row.tipoConta === 'COLABORADOR' ? 'Colaborador' : 'Responsável',
                              relationshipLabel: row.cargoParentesco || 'Indefinido',
                            }
                          )}
                          disabled={!phoneDigits}
                          className={`inline-flex px-1.5 py-0.5 rounded-full border text-[7px] sm:text-[8px] font-black uppercase tracking-wider disabled:cursor-not-allowed ${
                            !phoneDigits
                              ? 'bg-gray-50 text-gray-400 border-gray-200'
                              : openingWhatsAppKey === row.id
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100'
                          }`}
                          title={!phoneDigits ? 'Telefone não informado' : 'Abrir conversa no WhatsApp'}
                        >
                          {whatsappStatusLabel}
                        </button>
                      </div>
                    </td>
                    <td className="px-2.5 sm:px-4 py-2.5 sm:py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleGeneratePortalLink(row)}
                          disabled={isGeneratingPortalLink}
                          className="p-1.5 sm:p-2 bg-white border text-cyan-500 rounded-lg hover:text-cyan-700 hover:bg-cyan-50 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                          title={row.sourceClient ? 'Gerar link do painel' : 'Sem cadastro próprio para gerar link'}
                        >
                          <Sparkles size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopyPortalLink(row)}
                          disabled={!portalLink}
                          className="p-1.5 sm:p-2 bg-white border text-indigo-500 rounded-lg hover:text-indigo-700 hover:bg-indigo-50 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                          title={portalLink ? 'Copiar link do painel' : 'Gere o link primeiro'}
                        >
                          <Copy size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenPortalLink(row)}
                          disabled={!portalLink}
                          className="p-1.5 sm:p-2 bg-white border text-emerald-500 rounded-lg hover:text-emerald-700 hover:bg-emerald-50 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                          title={portalLink ? 'Abrir link do painel' : 'Gere o link primeiro'}
                        >
                          <ArrowRight size={12} />
                        </button>
                      </div>
                    </td>
                    <td className="px-2.5 sm:px-4 py-2.5 sm:py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => row.sourceClient && handleOpenEditModal(row.sourceClient as Client)}
                          disabled={!row.sourceClient}
                          className="p-1.5 sm:p-2 bg-white border text-indigo-500 rounded-lg hover:text-indigo-700 hover:bg-indigo-50 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                          title={row.sourceClient ? 'Editar' : 'Sem cadastro próprio para editar'}
                        >
                          <Edit size={12} />
                        </button>
                        <button
                          onClick={() => row.sourceClient && handleDeleteClient(row.sourceClient as Client)}
                          disabled={!row.sourceClient}
                          className="p-1.5 sm:p-2 bg-white border text-red-400 rounded-lg hover:text-red-600 hover:bg-red-50 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                          title={row.sourceClient ? 'Excluir' : 'Sem cadastro próprio para excluir'}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {portalLinkModalOpen && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setPortalLinkModalOpen(false)}></div>
          <div className="relative bg-white rounded-3xl p-6 max-w-2xl w-full shadow-2xl">
            <h3 className="text-lg font-black text-gray-900">Link do painel</h3>
            <p className="text-xs font-semibold text-gray-500 mt-1">Cliente: {portalLinkTargetName}</p>

            <div className="mt-4 p-3 rounded-xl border bg-gray-50 text-xs font-mono break-all">
              {portalLinkValue}
            </div>

            <div className="mt-4 flex gap-2 justify-end">
              <button
                onClick={() => setPortalLinkModalOpen(false)}
                className="px-4 py-2 rounded-xl border text-sm font-bold text-gray-600"
              >
                Fechar
              </button>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(portalLinkValue);
                  alert('Link copiado!');
                }}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold"
              >
                Copiar link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE DETALHES DO CLIENTE */}
      {isDetailModalOpen && viewingClient && (
      <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 animate-in fade-in">
           <div
             className="absolute inset-0 bg-indigo-950/80 backdrop-blur-md"
             onClick={() => {
               setPlanViewNotice(null);
               setIsDetailModalOpen(false);
             }}
           ></div>
           <div className="relative w-full max-w-4xl bg-white rounded-[48px] shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[92vh]">
              
              <div className="bg-indigo-900 p-10 text-white flex items-center justify-between shrink-0 relative overflow-hidden">
                 <div className="relative z-10 flex items-center gap-8">
                    <div className="relative">
                       <img src={resolveClientPhotoUrl(viewingClient.photo, viewingClient.name)} className="w-32 h-32 rounded-[32px] object-cover border-4 border-white/20 shadow-2xl" />
                       <div className={`absolute -bottom-2 -right-2 p-2 rounded-xl shadow-lg border-2 border-white ${viewingClient.isBlocked ? 'bg-red-600' : 'bg-emerald-500'}`}>
                          {viewingClient.isBlocked ? <ShieldAlert size={20} /> : <CheckCircle2 size={20} />}
                       </div>
                    </div>
                    <div>
                       <div className="flex items-center gap-3 mb-2">
                          <span className="text-[10px] font-black bg-white/10 px-3 py-1 rounded-full uppercase tracking-widest border border-white/10">ID: #{viewingClient.registrationId}</span>
                          <span className="text-[10px] font-black bg-indigo-500/30 px-3 py-1 rounded-full uppercase tracking-widest border border-white/10">{viewingClient.type}</span>
                       </div>
                       <h2 className="text-4xl font-black uppercase tracking-tight leading-none">{viewingClient.name}</h2>
                       <p className="text-indigo-200 text-sm font-black uppercase tracking-[3px] mt-2 opacity-80 flex items-center gap-2">
                          <GraduationCap size={16} /> {viewingClient.class || 'Corpo Docente / Staff'}
                       </p>
                    </div>
                 </div>
                 <button
                   onClick={() => {
                     setPlanViewNotice(null);
                     setIsDetailModalOpen(false);
                   }}
                   className="p-3 hover:bg-white/10 rounded-full transition-colors relative z-10"
                 >
                   <X size={32} />
                 </button>
                 
                 {/* Decorativo de fundo */}
                 <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
              </div>

              <div className="flex-1 overflow-y-auto p-10 space-y-8 scrollbar-hide">
                 {planViewNotice && (
                   <div
                     className={`px-4 py-3 rounded-2xl border text-xs font-black uppercase tracking-widest ${
                       planViewNotice.type === 'success'
                         ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                         : planViewNotice.type === 'error'
                           ? 'bg-red-50 border-red-200 text-red-700'
                           : 'bg-amber-50 border-amber-200 text-amber-700'
                     }`}
                   >
                     {planViewNotice.message}
                   </div>
                 )}

                 <section className="bg-indigo-50 border border-indigo-100 rounded-[28px] p-6">
                   <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[3px]">Saldo Atual em Unidades</p>
                   <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mt-2">
                     <div>
                       <p className="text-5xl font-black text-indigo-700 leading-none">{totalRequiredUnitsInView}</p>
                       <p className="text-[11px] font-black text-indigo-500 uppercase tracking-widest mt-2">
                         unidades disponíveis para edição de datas
                       </p>
                     </div>
                     <div className="flex flex-wrap gap-2">
                       {planAdjustmentStatus.map((item) => (
                         <span
                           key={`saldo-${item.planId}`}
                           className="px-3 py-2 rounded-xl border border-indigo-200 bg-white text-[10px] font-black text-indigo-700 uppercase tracking-widest"
                         >
                           {item.planName}: {item.requiredCount}
                         </span>
                       ))}
                     </div>
                   </div>
                 </section>
                 <section className="space-y-4">
                    <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-[4px] flex items-center gap-2 border-b pb-2">
                       <ShieldCheck size={16} className="text-indigo-600" /> Responsável Relacionado
                    </h3>
                    <div className="bg-emerald-50/70 p-5 rounded-[24px] border border-emerald-100 space-y-2">
                      <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Dados do responsável</p>
                      {viewingClient.parentName && <InfoItem label="Nome" value={viewingClient.parentName} />}
                      {Boolean((viewingClient as any).parentRelationship) && (
                        <InfoItem label="Tipo" value={formatParentRelationship((viewingClient as any).parentRelationship) || 'Indefinido'} />
                      )}
                      {viewingClient.parentWhatsapp && <InfoItem label="WhatsApp" value={viewingClient.parentWhatsapp} />}
                      {viewingClient.parentEmail && <InfoItem label="E-mail" value={viewingClient.parentEmail} />}
                      {!viewingClient.parentName && !viewingClient.parentWhatsapp && !viewingClient.parentEmail && (
                        <p className="text-[10px] font-black text-gray-400 uppercase">Sem responsável relacionado cadastrado</p>
                      )}
                    </div>
                 </section>

                 <section className="space-y-4">
                    <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-[4px] flex items-center gap-2 border-b pb-2">
                       <Beef size={16} className="text-indigo-600" /> Planos ativos
                    </h3>

                    {activePlansInView.length === 0 ? (
                      <div className="bg-white border border-gray-100 rounded-[24px] p-6 text-center">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                          Este cliente não possui plano ativo configurado.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        {activePlansInView.map((plan) => {
                          const activeDates = selectedPlanDates[plan.planId] || [];
                          const activeShifts = selectedPlanShifts[plan.planId] || [];
                          const deliveredDateSet = deliveredDateKeysByPlanId.get(plan.planId) || new Set<string>();
                          const isCalendarOpen = openPlanCalendarId === plan.planId;
                          const requiredCount = requiredUnitsByPlanId.get(plan.planId) ?? activeDates.length;
                          const isPlanValid = activeDates.length === requiredCount;
                          const currentPlanBalance = detailPlanBalances.find((entry) => {
                            const sameId = String(entry.planId || '').trim() === String(plan.planId || '').trim();
                            const sameName = String(entry.planName || '').trim().toUpperCase() === String(plan.planName || '').trim().toUpperCase();
                            return sameId || sameName;
                          });
                          const temporaryCreditUnits = getPlanTemporaryCreditUnits(plan.planId);
                          const hasPendingChanges = hasPendingPlanDateChanges(plan.planId);

                          return (
                            <div key={plan.planId} className="bg-white border border-gray-100 rounded-[28px] p-5 space-y-4">
                              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                <div>
                                  <p className="text-sm font-black text-gray-800 uppercase">{plan.planName}</p>
                                  <p className={`text-[10px] font-black uppercase tracking-widest ${isPlanValid ? 'text-emerald-600' : 'text-amber-600'}`}>
                                    Selecionado: {activeDates.length} • Necessário: {requiredCount}
                                  </p>
                                  {currentPlanBalance && (
                                    <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mt-1">
                                      Saldo: {currentPlanBalance.remaining}/{currentPlanBalance.total} • R$ {formatCurrencyBRL(currentPlanBalance.remainingValue)}
                                    </p>
                                  )}
                                </div>
                                <button
                                  onClick={() => {
                                    if (!isCalendarOpen) {
                                      setPlanEditBaseDatesById((prev) => ({
                                        ...prev,
                                        [plan.planId]: Array.from(new Set(prev[plan.planId] || activeDates || [])).sort(),
                                      }));
                                    }
                                    setOpenPlanCalendarId(isCalendarOpen ? null : plan.planId);
                                  }}
                                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
                                    isCalendarOpen
                                      ? 'bg-indigo-600 border-indigo-600 text-white'
                                      : 'bg-white border-indigo-100 text-indigo-600 hover:bg-indigo-50'
                                  }`}
                                >
                                  {isCalendarOpen ? 'Ocultar calendário' : 'Consumo/Entrega'}
                                </button>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                {DELIVERY_SHIFT_OPTIONS.map((shift) => {
                                  const isActive = activeShifts.includes(shift.key);
                                  return (
                                    <button
                                      key={`${plan.planId}-shift-${shift.key}`}
                                      type="button"
                                      onClick={() => togglePlanShift(plan.planId, shift.key)}
                                      className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                                        isActive
                                          ? 'bg-indigo-600 border-indigo-600 text-white'
                                          : 'bg-white border-gray-200 text-gray-500 hover:border-indigo-200'
                                      }`}
                                    >
                                      {shift.label}
                                    </button>
                                  );
                                })}
                              </div>

                              {isCalendarOpen && (
                                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                                  <div className="flex items-center justify-between mb-3">
                                    <button
                                      type="button"
                                      onClick={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                                      className="px-3 py-1.5 rounded-lg border bg-white text-gray-600 text-xs font-black"
                                    >
                                      <ChevronLeft size={14} />
                                    </button>
                                    <p className="text-xs font-black text-gray-700 uppercase tracking-widest">{calendarMonthLabel}</p>
                                    <button
                                      type="button"
                                      onClick={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                                      className="px-3 py-1.5 rounded-lg border bg-white text-gray-600 text-xs font-black"
                                    >
                                      <ArrowRight size={14} />
                                    </button>
                                  </div>
                                  <div className="flex items-center justify-end mb-2">
                                    <div className="flex items-center gap-2">
                                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-rose-50 border border-rose-100 text-[9px] font-black text-rose-700 uppercase tracking-widest">
                                        <AlertTriangle size={10} /> Dia sem aula
                                      </span>
                                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-100 text-[9px] font-black text-emerald-700 uppercase tracking-widest">
                                        <Check size={10} strokeWidth={4} /> Dia já entregue
                                      </span>
                                    </div>
                                  </div>
                                  {!isSchoolCalendarYearLoaded(calendarMonth.getFullYear()) && (
                                    <div className="mb-2 px-2 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-[9px] font-black text-amber-700 uppercase tracking-widest">
                                      Carregando calendário escolar do ano selecionado...
                                    </div>
                                  )}
                                  <div className="grid grid-cols-7 gap-1.5">
                                    {['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'].map((label) => (
                                      <div key={`${plan.planId}-header-${label}`} className="text-center text-[9px] font-black text-gray-400 uppercase py-1">
                                        {label}
                                      </div>
                                    ))}
                                    {calendarGrid.map((dateCell, index) => {
                                      if (!dateCell) return <div key={`${plan.planId}-empty-${index}`} className="h-9" />;
                                      const dateKey = toDateKey(dateCell);
                                      const isCalendarReady = isSchoolCalendarReadyForDate(dateCell);
                                      const isAllowed = isServiceDateAllowed(dateCell);
                                      const isSchoolBlockedDate = isSchoolCalendarBlockedDate(dateCell);
                                      const eventTitle = isSchoolBlockedDate ? (getSchoolEventTitle(dateCell) || 'Sem aula') : null;
                                      const isPast = isPastDate(dateCell);
                                      const isSelected = activeDates.includes(dateKey);
                                      const isDelivered = deliveredDateSet.has(dateKey);
                                      const isAtLimit = activeDates.length >= requiredCount && temporaryCreditUnits <= 0;
                                      const looksDisabledByLimit = !isSelected && isAtLimit;
                                      const isLocked = !isCalendarReady || !isAllowed || isSchoolBlockedDate || isPast;

                                      return (
                                        <button
                                          key={`${plan.planId}-date-${dateKey}`}
                                          type="button"
                                          disabled={isLocked}
                                          title={isSchoolBlockedDate ? (eventTitle || 'Dia sem aula') : undefined}
                                          onClick={() => togglePlanDate(plan.planId, dateCell)}
                                          className={`rounded-lg text-[10px] font-black transition-all ${
                                            !isCalendarReady
                                              ? 'h-9 bg-gray-100 text-gray-300 border border-gray-200 cursor-not-allowed'
                                              : isSchoolBlockedDate
                                              ? 'h-auto min-h-[36px] py-1 bg-rose-50 text-rose-400 border border-rose-100 cursor-not-allowed'
                                              : !isAllowed
                                              ? 'h-9 bg-gray-100 text-gray-300 cursor-not-allowed'
                                              : isPast
                                                ? isSelected
                                                  ? 'h-9 bg-slate-200 text-slate-600 border border-slate-300 cursor-not-allowed'
                                                  : 'h-9 bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                                              : isSelected
                                                ? 'h-9 bg-indigo-600 text-white'
                                                : looksDisabledByLimit
                                                  ? 'h-9 bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
                                                  : 'h-9 bg-white text-gray-600 border border-gray-200 hover:border-indigo-300'
                                          }`}
                                        >
                                          {isSchoolBlockedDate ? (
                                            <span className="flex flex-col items-center justify-center gap-0.5 w-full px-0.5">
                                              <span className="font-black text-rose-500 text-[10px] leading-none">{dateCell.getDate()}</span>
                                              <span className="text-[7px] font-black text-rose-400 leading-tight text-center line-clamp-2 w-full">{eventTitle}</span>
                                            </span>
                                          ) : (
                                            <span className="inline-flex items-center justify-center relative w-full h-full">
                                              {dateCell.getDate()}
                                              {isSelected && !isPast && (
                                                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-white text-indigo-700 text-[10px] leading-none flex items-center justify-center font-black border border-indigo-200">
                                                  ×
                                                </span>
                                              )}
                                              {isDelivered && (
                                                <span
                                                  className="absolute -bottom-0.5 -left-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 text-white text-[10px] leading-none flex items-center justify-center font-black border border-emerald-200"
                                                  title="Dia entregue"
                                                >
                                                  <Check size={10} strokeWidth={4} />
                                                </span>
                                              )}
                                            </span>
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-t border-gray-200 pt-3">
                                    <div className="space-y-1">
                                      <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">
                                        Saldo temporário: {temporaryCreditUnits} un
                                      </p>
                                      <p className={`text-[9px] font-black uppercase tracking-widest ${hasPendingChanges ? 'text-amber-600' : 'text-emerald-600'}`}>
                                        {hasPendingChanges ? 'Alterações pendentes' : 'Alterações confirmadas'}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => handleCancelPlanDateChanges(plan.planId)}
                                        disabled={!hasPendingChanges || isSavingPlanView}
                                        className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-[10px] font-black uppercase tracking-widest text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        Cancelar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleConfirmPlanDateChanges(plan.planId)}
                                        disabled={!hasPendingChanges || isSavingPlanView}
                                        className="px-3 py-1.5 rounded-lg border border-indigo-600 bg-indigo-600 text-[10px] font-black uppercase tracking-widest text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        {isSavingPlanView ? 'Salvando...' : 'Confirmar'}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                 </section>
              </div>

              <div className="p-10 bg-gray-50 border-t flex flex-col sm:flex-row gap-4 shrink-0 shadow-[0_-15px_45px_rgba(0,0,0,0.05)]">
                 <button
                    onClick={() => {
                      setPlanViewNotice(null);
                      handleOpenCreateStudentFromDetail();
                    }}
                    className="flex-1 py-4 bg-emerald-600 text-white rounded-[20px] font-black uppercase tracking-[2px] text-xs shadow-xl shadow-emerald-100 hover:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center gap-2 text-center"
                 >
                      <UserPlus size={18} /> {String(viewingClient?.type || '').toUpperCase() === 'ALUNO' ? `Vincular ao Aluno ${String(viewingClient?.name || '').trim()}` : 'Adicionar Aluno'}
                 </button>
                 <button
                    onClick={() => {
                      setPlanViewNotice(null);
                      setIsDetailModalOpen(false);
                      handleOpenEditModal(viewingClient);
                    }}
                    className="flex-1 py-4 bg-violet-600 text-white rounded-[20px] font-black uppercase tracking-[2px] text-xs shadow-xl shadow-violet-100 hover:bg-violet-700 active:scale-95 transition-all flex items-center justify-center gap-2 text-center"
                 >
                    <Edit size={18} /> Editar Cadastro
                 </button>
                 <button
                    onClick={handleSavePlanViewChanges}
                    disabled={isSavingPlanView || !isPlanAllocationValid}
                    className="flex-1 py-4 bg-indigo-700 text-white rounded-[20px] font-black uppercase tracking-[2px] text-xs shadow-xl shadow-indigo-100 hover:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 text-center"
                 >
                    <Check size={18} /> {isSavingPlanView ? 'Salvando...' : 'Confirmar'}
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* MODAL DE CADASTRO (EXISTENTE) */}
      {isClientModalOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 animate-in fade-in">
          <div
            className="absolute inset-0 bg-indigo-950/60 backdrop-blur-sm"
            onClick={() => {
              setIsClientModalOpen(false);
              setResolveNowHelper(null);
              setLinkingStudentContextName('');
            }}
          ></div>
          <div className="relative w-full max-w-4xl bg-white rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[92vh]">
            
            <div className="bg-indigo-600 p-8 text-white flex items-center justify-between shrink-0 shadow-lg">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center"><UserPlus size={28} /></div>
                    <div>
                       <h2 className="text-xl font-black uppercase tracking-tight">{editingClient ? 'Editar Cliente' : (isStudentOnlyMode ? (linkingStudentContextName ? `Vincular ao Aluno ${linkingStudentContextName}` : 'Adicionar Aluno') : (isResponsibleView ? 'Novo Responsável/Colaborador' : 'Novo Cadastro de Cliente'))}</h2>
                       <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest mt-0.5">
                         {editingClient ? 'Atualização de dados cadastrais' : (isStudentOnlyMode ? (linkingStudentContextName ? `Responsável herdado de ${linkingStudentContextName} (dados bloqueados)` : 'Cadastro de novo aluno vinculado ao responsável atual') : (isResponsibleView ? 'Gestão de responsável e colaborador' : 'Gestão de perfil cadastral'))}
                       </p>
                    </div>
                 </div>
                 <button
                   type="button"
                   onClick={() => {
                     setIsClientModalOpen(false);
                     setResolveNowHelper(null);
                     setLinkingStudentContextName('');
                   }}
                   className="p-3 hover:bg-white/10 rounded-full transition-all"
                 ><X size={28} /></button>
             </div>

             <div className="flex-1 overflow-y-auto bg-slate-50/60 p-6 sm:p-8 lg:p-10 space-y-6 scrollbar-hide">
               {resolveNowHelper && (
                 <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-4">
                   <p className="text-[11px] font-black uppercase tracking-widest text-emerald-700">Correção rápida</p>
                   <p className="text-sm font-bold mt-1">
                     {resolveNowHelper.message}
                   </p>
                   <p className="text-[11px] font-semibold text-emerald-700 mt-1">Preencha os campos de turma/ano e salve para retomar a venda.</p>
                 </div>
               )}
               <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <section className="xl:col-span-2 bg-white rounded-[28px] border border-slate-200 shadow-sm p-6 sm:p-7 space-y-5">
                      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
                            <UserIcon size={16} />
                          </div>
                          <div>
                            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide">Dados Cadastrais</h3>
                            <p className="text-[11px] font-semibold text-slate-400">
                              {isResponsibleView ? 'Informações principais do colaborador' : 'Informações principais do aluno/colaborador'}
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full border border-indigo-100">
                          Cadastro
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-1.5 md:col-span-2">
                          <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider ml-1">Nome completo *</label>
                          <input
                            required
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-2xl outline-none font-semibold text-sm transition-all"
                            placeholder={formData.type === 'ALUNO' ? 'NOME DO ALUNO' : (formData.type === 'RESPONSAVEL' ? 'NOME DO RESPONSÁVEL' : 'NOME DO COLABORADOR')}
                          />
                        </div>

                        <div className="space-y-2 md:col-span-2">
                          <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider ml-1">Foto do Cliente (Opcional)</label>
                          <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                            <img
                              src={clientPhotoPreview || resolveClientPhotoUrl(formData.photo, formData.name)}
                              className="w-20 h-20 rounded-2xl object-cover border-2 border-white shadow-sm"
                            />
                            <div className="flex-1 space-y-2">
                              <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[11px] font-black uppercase tracking-wider text-indigo-600 cursor-pointer hover:bg-indigo-50 transition-all">
                                <Upload size={14} />
                                Enviar Foto
                                <input
                                  type="file"
                                  accept="image/png,image/jpeg,image/webp"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0] || null;
                                    if (!file) return;
                                    if (file.size > 5 * 1024 * 1024) {
                                      alert('A imagem deve ter no máximo 5MB.');
                                      return;
                                    }
                                    setClientPhotoFile(file);
                                    setClientPhotoPreview(URL.createObjectURL(file));
                                  }}
                                />
                              </label>
                              {clientPhotoFile && (
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                  Arquivo: {clientPhotoFile.name}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider ml-1">Tipo de Cadastro</label>
                          {isStudentOnlyMode ? (
                            <div className="w-full px-5 py-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl font-black text-sm text-emerald-700 uppercase tracking-widest">
                              Aluno
                            </div>
                          ) : isResponsibleView ? (
                            <div className="w-full px-5 py-3.5 bg-blue-50 border border-blue-200 rounded-2xl font-black text-sm text-blue-700 uppercase tracking-widest">
                              Colaborador
                            </div>
                          ) : (
                            <select
                              value={formData.type}
                              onChange={e => {
                                const newType = e.target.value as 'ALUNO' | 'COLABORADOR' | 'RESPONSAVEL';
                                setSelectedPlanDays({});
                                setSelectedPlanDates({});
                                setOpenPlanCalendarId(null);
                                setCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
                                if (newType !== 'ALUNO') {
                                  setResponsibleSourceMode('NEW');
                                  setResponsibleClientSearch('');
                                  setResponsibleClientId(null);
                                  setResponsibleCollaboratorSearch('');
                                  setResponsibleCollaboratorId(null);
                                }
                                setFormData({ ...formData, type: newType, servicePlans: ['PREPAGO'] });
                              }}
                              className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-2xl outline-none font-semibold text-sm transition-all"
                            >
                              <option value="ALUNO">Aluno</option>
                              <option value="COLABORADOR">Colaborador</option>
                            </select>
                          )}
                        </div>

                        {formData.type === 'ALUNO' ? (
                          <>
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider ml-1">Nível de Ensino</label>
                              <select
                                data-resolve-target="classType"
                                value={formData.classType}
                                onChange={e => setFormData({ ...formData, classType: e.target.value as '' | 'INFANTIL' | 'FUNDAMENTAL' | 'MEDIO' | 'INTEGRAL', classGrade: '' })}
                                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-2xl outline-none font-semibold text-sm transition-all"
                              >
                                <option value="">Selecione o nível...</option>
                                <option value="INFANTIL">Educação Infantil</option>
                                <option value="FUNDAMENTAL">Ensino Fundamental</option>
                                <option value="MEDIO">Ensino Médio</option>
                                <option value="INTEGRAL">Integral</option>
                              </select>
                            </div>
                            {formData.classType && formData.classType !== 'INTEGRAL' && (
                              <div className="space-y-1.5 animate-in fade-in">
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider ml-1">Série / Ano</label>
                                <select
                                  data-resolve-target="classGrade"
                                  value={formData.classGrade}
                                  onChange={e => setFormData({ ...formData, classGrade: e.target.value })}
                                  className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-2xl outline-none font-semibold text-sm transition-all"
                                >
                                  <option value="">Selecione a série...</option>
                                  {gradeOptions[formData.classType as keyof typeof gradeOptions].map(grade => (
                                    <option key={grade} value={grade}>{grade}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="space-y-1.5 md:col-span-2">
                            <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider ml-1">Cargo / Departamento</label>
                            <input
                              value={formData.class}
                              onChange={e => setFormData({ ...formData, class: e.target.value })}
                              className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-2xl outline-none font-semibold text-sm transition-all"
                              placeholder="Ex.: Cozinha, Limpeza, Administrativo"
                            />
                          </div>
                        )}

                        {formData.type === 'ALUNO' && (
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider ml-1">Limite Diário (R$)</label>
                            <input
                              type="number"
                              value={formData.dailyLimit}
                              onChange={e => setFormData({ ...formData, dailyLimit: Number(e.target.value) })}
                              className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-2xl outline-none font-semibold text-sm transition-all"
                            />
                          </div>
                        )}

                        <div className="space-y-1.5 md:col-span-2">
                          <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider ml-1">Restrições Alimentares</label>
                          <input
                            value={formData.restrictions.join(', ')}
                            onChange={e => {
                              const parsed = e.target.value
                                .split(',')
                                .map(item => item.trim())
                                .filter(Boolean);
                              setFormData({ ...formData, restrictions: parsed });
                            }}
                            className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-2xl outline-none font-semibold text-sm transition-all"
                            placeholder="Ex: Lactose, Glúten, Amendoim"
                          />
                        </div>
                      </div>
                    </section>

                    <section className="xl:col-span-2 bg-white rounded-[28px] border border-slate-200 shadow-sm p-6 sm:p-7 space-y-5">
                      <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${formData.type === 'ALUNO' ? 'bg-emerald-100 text-emerald-600' : (formData.type === 'RESPONSAVEL' ? 'bg-cyan-100 text-cyan-600' : 'bg-blue-100 text-blue-600')}`}>
                          <Phone size={16} />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide">
                            {formData.type === 'ALUNO' ? 'Dados do Responsável' : (formData.type === 'RESPONSAVEL' ? 'Contato do Responsável' : 'Contato do Colaborador')}
                          </h3>
                          <p className="text-[11px] font-semibold text-slate-400">
                            {formData.type === 'ALUNO' ? 'Contato principal para comunicação e cobrança' : 'Telefone, CPF e e-mail para contato principal'}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {formData.type === 'ALUNO' && !isResponsibleDataLocked && (
                          <div className="md:col-span-2 space-y-2">
                            <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider ml-1">Origem do responsável</label>
                            <div className={`grid grid-cols-1 ${isUnitAdmin ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} gap-2`}>
                              <button
                                type="button"
                                onClick={() => {
                                  setResponsibleSourceMode('NEW');
                                  setResponsibleClientId(null);
                                  setResponsibleCollaboratorId(null);
                                  setNewCollaboratorRole('');
                                }}
                                className={`px-4 py-3 rounded-2xl border text-[11px] font-black uppercase tracking-widest transition-all ${
                                  responsibleSourceMode === 'NEW'
                                    ? 'bg-emerald-600 border-emerald-600 text-white'
                                    : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-300'
                                }`}
                              >
                                Cadastrar Novo Responsável
                              </button>
                              {!isUnitAdmin && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setResponsibleSourceMode('RESPONSAVEL');
                                    setResponsibleCollaboratorId(null);
                                    setNewCollaboratorRole('');
                                  }}
                                  className={`px-4 py-3 rounded-2xl border text-[11px] font-black uppercase tracking-widest transition-all ${
                                    responsibleSourceMode === 'RESPONSAVEL'
                                      ? 'bg-cyan-600 border-cyan-600 text-white'
                                      : 'bg-white border-slate-200 text-slate-600 hover:border-cyan-300'
                                  }`}
                                >
                                  Usar Responsável
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setResponsibleSourceMode('COLABORADOR');
                                  setResponsibleClientId(null);
                                  setNewCollaboratorRole(String(formData.parentRelationship || ''));
                                }}
                                className={`px-4 py-3 rounded-2xl border text-[11px] font-black uppercase tracking-widest transition-all ${
                                  responsibleSourceMode === 'COLABORADOR'
                                    ? 'bg-indigo-600 border-indigo-600 text-white'
                                    : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'
                                }`}
                              >
                                Cadastrar Novo Colaborador
                              </button>
                            </div>
                          </div>
                        )}

                        {formData.type === 'ALUNO' && isResponsibleDataLocked ? (
                          <>
                            <div className="md:col-span-2 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3">
                              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Responsável vinculado</p>
                              <p className="text-sm font-black text-slate-800 mt-1">Dados do responsável bloqueados para manter vínculo único entre alunos.</p>
                            </div>
                            <div className="space-y-1.5 md:col-span-2">
                              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider ml-1">Nome do Pai/Responsável</label>
                              <input
                                value={formData.parentName}
                                disabled
                                className="w-full px-5 py-3.5 bg-slate-100 border border-slate-200 rounded-2xl outline-none font-semibold text-sm text-slate-600"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider ml-1">Tipo de Responsável</label>
                              <select
                                value={formData.parentRelationship}
                                disabled
                                className="w-full px-5 py-3.5 bg-slate-100 border border-slate-200 rounded-2xl outline-none font-semibold text-sm text-slate-600"
                              >
                                {RESPONSIBLE_RELATION_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider ml-1">WhatsApp</label>
                              <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-2.5">
                                <select
                                  value={formData.parentWhatsappCountryCode}
                                  disabled
                                  className="w-full px-3.5 py-3.5 bg-slate-100 border border-slate-200 rounded-2xl outline-none font-semibold text-sm text-slate-600"
                                >
                                  {COUNTRY_OPTIONS.map((country) => (
                                    <option key={country.code} value={country.code}>
                                      {country.label} ({country.dial})
                                    </option>
                                  ))}
                                </select>
                                <input
                                  value={formData.parentWhatsapp}
                                  disabled
                                  className="w-full px-5 py-3.5 bg-slate-100 border border-slate-200 rounded-2xl outline-none font-semibold text-sm text-slate-600"
                                />
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider ml-1">CPF</label>
                              <input
                                value={formData.parentCpf}
                                disabled
                                className="w-full px-5 py-3.5 bg-slate-100 border border-slate-200 rounded-2xl outline-none font-semibold text-sm text-slate-600"
                              />
                            </div>
                            <div className="space-y-1.5 md:col-span-2">
                              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider ml-1">E-mail</label>
                              <input
                                type="email"
                                value={formData.parentEmail}
                                disabled
                                className="w-full px-5 py-3.5 bg-slate-100 border border-slate-200 rounded-2xl outline-none font-semibold text-sm text-slate-600"
                              />
                            </div>
                          </>
                        ) : formData.type === 'ALUNO' && responsibleSourceMode === 'COLABORADOR' ? (
                          <>
                            <div className="md:col-span-2 space-y-1.5">
                              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider ml-1">Buscar colaborador</label>
                              <input
                                value={responsibleCollaboratorSearch}
                                onChange={(e) => {
                                  setResponsibleCollaboratorSearch(e.target.value);
                                  setResponsibleCollaboratorId(null);
                                }}
                                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-2xl outline-none font-semibold text-sm transition-all"
                                placeholder="Digite nome, matrícula ou setor do colaborador"
                              />
                            </div>
                            <div className="md:col-span-2 max-h-44 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50">
                              {filteredResponsibleCollaborators.length === 0 ? (
                                <p className="px-4 py-3 text-xs font-semibold text-slate-500">Nenhum colaborador encontrado.</p>
                              ) : (
                                filteredResponsibleCollaborators.map((collaborator) => {
                                  const phoneParts = splitPhoneByCountryCode(collaborator.phone || '');
                                  const isSelected = responsibleCollaboratorId === collaborator.id;
                                  return (
                                    <button
                                      type="button"
                                      key={collaborator.id}
                                      onClick={() => {
                                        setResponsibleCollaboratorId(collaborator.id);
                                        setResponsibleCollaboratorSearch(String(collaborator.name || ''));
                                        setNewCollaboratorRole(String(collaborator.class || ''));
                                        setFormData((prev) => ({
                                          ...prev,
                                          parentName: String(collaborator.name || ''),
                                          parentWhatsappCountryCode: phoneParts.countryCode || '55',
                                          parentWhatsapp: phoneParts.localPhone || normalizePhoneDigits(collaborator.phone || ''),
                                          parentEmail: String(collaborator.email || ''),
                                        }));
                                      }}
                                      className={`w-full px-4 py-3 text-left border-b border-slate-200 last:border-b-0 transition-colors ${
                                        isSelected ? 'bg-indigo-100/70' : 'hover:bg-indigo-50'
                                      }`}
                                    >
                                      <p className="text-sm font-black text-slate-800">{collaborator.name}</p>
                                      <p className="text-[11px] font-semibold text-slate-500">
                                        {collaborator.registrationId ? `#${collaborator.registrationId}` : 'Sem matrícula'} • {collaborator.class || 'Sem setor'} • {formatPhoneNumber(collaborator.phone || '')}
                                      </p>
                                    </button>
                                  );
                                })
                              )}
                            </div>
                            {selectedResponsibleCollaborator && (
                              <div className="md:col-span-2 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Colaborador selecionado</p>
                                <p className="text-sm font-black text-slate-800 mt-1">{selectedResponsibleCollaborator.name}</p>
                                <p className="text-xs font-semibold text-slate-600">
                                  {formatPhoneNumber(selectedResponsibleCollaborator.phone || '')} • {selectedResponsibleCollaborator.email || 'Sem e-mail'}
                                </p>
                              </div>
                            )}
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider ml-1">Cargo do Colaborador</label>
                              <input
                                value={newCollaboratorRole}
                                onChange={e => setNewCollaboratorRole(e.target.value)}
                                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-2xl outline-none font-semibold text-sm transition-all"
                                placeholder="Ex.: Auxiliar de Cozinha"
                              />
                            </div>
                          </>
                        ) : formData.type === 'ALUNO' && responsibleSourceMode === 'RESPONSAVEL' ? (
                          <>
                            <div className="md:col-span-2 space-y-1.5">
                              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider ml-1">Buscar responsável cadastrado</label>
                              <input
                                value={responsibleClientSearch}
                                onChange={(e) => {
                                  setResponsibleClientSearch(e.target.value);
                                  setResponsibleClientId(null);
                                }}
                                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 rounded-2xl outline-none font-semibold text-sm transition-all"
                                placeholder="Digite nome, matrícula ou parentesco do responsável"
                              />
                            </div>
                            <div className="md:col-span-2 max-h-44 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50">
                              {filteredResponsibleClients.length === 0 ? (
                                <p className="px-4 py-3 text-xs font-semibold text-slate-500">Nenhum responsável encontrado.</p>
                              ) : (
                                filteredResponsibleClients.map((responsible) => {
                                  const phoneParts = splitPhoneByCountryCode(responsible.phone || responsible.parentWhatsapp || '');
                                  const isSelected = responsibleClientId === responsible.id;
                                  return (
                                    <button
                                      type="button"
                                      key={responsible.id}
                                      onClick={() => {
                                        setResponsibleClientId(responsible.id);
                                        setResponsibleClientSearch(String(responsible.name || ''));
                                        setFormData((prev) => ({
                                          ...prev,
                                          parentName: String(responsible.name || ''),
                                          parentWhatsappCountryCode: phoneParts.countryCode || String((responsible as any)?.parentWhatsappCountryCode || '55'),
                                          parentWhatsapp: phoneParts.localPhone || normalizePhoneDigits(responsible.phone || responsible.parentWhatsapp || ''),
                                          parentEmail: String(responsible.email || responsible.parentEmail || ''),
                                          parentCpf: String(responsible.cpf || responsible.parentCpf || ''),
                                          parentRelationship: String(
                                            (responsible as any)?.parentRelationship
                                              || RESPONSIBLE_RELATION_OPTIONS.find((option) => normalizeSearchText(option.label) === normalizeSearchText(responsible.class || ''))?.value
                                              || prev.parentRelationship
                                              || 'PAIS'
                                          ),
                                        }));
                                      }}
                                      className={`w-full px-4 py-3 text-left border-b border-slate-200 last:border-b-0 transition-colors ${
                                        isSelected ? 'bg-cyan-100/70' : 'hover:bg-cyan-50'
                                      }`}
                                    >
                                      <p className="text-sm font-black text-slate-800">{responsible.name}</p>
                                      <p className="text-[11px] font-semibold text-slate-500">
                                        {responsible.registrationId ? `#${responsible.registrationId}` : 'Sem matrícula'} • {responsible.class || 'Sem parentesco'} • {formatPhoneNumber(responsible.phone || responsible.parentWhatsapp || '')}
                                      </p>
                                    </button>
                                  );
                                })
                              )}
                            </div>
                            {selectedResponsibleClient && (
                              <div className="md:col-span-2 rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-cyan-700">Responsável selecionado</p>
                                <p className="text-sm font-black text-slate-800 mt-1">{selectedResponsibleClient.name}</p>
                                <p className="text-xs font-semibold text-slate-600">
                                  {formatPhoneNumber(selectedResponsibleClient.phone || selectedResponsibleClient.parentWhatsapp || '')} • {selectedResponsibleClient.email || selectedResponsibleClient.parentEmail || 'Sem e-mail'}
                                </p>
                              </div>
                            )}
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider ml-1">Tipo de Responsável</label>
                              <select
                                value={formData.parentRelationship}
                                onChange={e => setFormData({ ...formData, parentRelationship: e.target.value })}
                                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 rounded-2xl outline-none font-semibold text-sm transition-all"
                              >
                                {RESPONSIBLE_RELATION_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                            </div>
                          </>
                        ) : (
                          <>
                            {formData.type === 'ALUNO' && (
                              <div className="space-y-1.5 md:col-span-2">
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider ml-1">Nome do Pai/Responsável</label>
                                <input
                                  value={formData.parentName}
                                  onChange={e => setFormData({ ...formData, parentName: e.target.value })}
                                  className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-2xl outline-none font-semibold text-sm transition-all"
                                  placeholder="Nome completo do responsável"
                                />
                              </div>
                            )}

                            {formData.type === 'ALUNO' && (
                              <div className="space-y-1.5">
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider ml-1">Tipo de Responsável</label>
                                <select
                                  value={formData.parentRelationship}
                                  onChange={e => setFormData({ ...formData, parentRelationship: e.target.value })}
                                  className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-2xl outline-none font-semibold text-sm transition-all"
                                >
                                  {RESPONSIBLE_RELATION_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                  ))}
                                </select>
                              </div>
                            )}

                            <div className="space-y-1.5">
                              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider ml-1">WhatsApp</label>
                              <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-2.5">
                                <select
                                  value={formData.parentWhatsappCountryCode}
                                  onChange={e => setFormData({ ...formData, parentWhatsappCountryCode: e.target.value })}
                                  className="w-full px-3.5 py-3.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-2xl outline-none font-semibold text-sm transition-all"
                                >
                                  {COUNTRY_OPTIONS.map((country) => (
                                    <option key={country.code} value={country.code}>
                                      {country.label} ({country.dial})
                                    </option>
                                  ))}
                                </select>
                                <input
                                  value={formData.parentWhatsapp}
                                  onChange={e => setFormData({ ...formData, parentWhatsapp: e.target.value })}
                                  className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-2xl outline-none font-semibold text-sm transition-all"
                                  placeholder="DDD + número"
                                />
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider ml-1">CPF</label>
                              <input
                                value={formData.parentCpf}
                                onChange={e => setFormData({ ...formData, parentCpf: e.target.value })}
                                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-2xl outline-none font-semibold text-sm transition-all"
                                placeholder="000.000.000-00"
                              />
                            </div>

                            <div className="space-y-1.5 md:col-span-2">
                              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider ml-1">E-mail</label>
                              <input
                                type="email"
                                value={formData.parentEmail}
                                onChange={e => setFormData({ ...formData, parentEmail: e.target.value })}
                                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-2xl outline-none font-semibold text-sm transition-all"
                                placeholder="email@exemplo.com"
                              />
                            </div>
                          </>
                        )}
                      </div>

                      {formData.type === 'COLABORADOR' && (
                        <div className="mt-6 rounded-2xl border-2 border-indigo-200 bg-indigo-50/60 p-4 space-y-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-black text-indigo-800 uppercase tracking-wide">Adicionar aluno como seu dependente para consumo na cantina?</p>
                              <p className="text-xs font-semibold text-indigo-700/80">Ative para incluir o cadastro do aluno dependente junto com o colaborador.</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setAddDependentStudent((prev) => !prev)}
                              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${addDependentStudent ? 'bg-indigo-600' : 'bg-slate-300'}`}
                              aria-label="Ativar cadastro de dependente"
                            >
                              <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${addDependentStudent ? 'translate-x-7' : 'translate-x-1'}`} />
                            </button>
                          </div>

                          {addDependentStudent && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in">
                              <div className="md:col-span-2 space-y-1.5">
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider ml-1">Nome do Aluno Dependente</label>
                                <input
                                  value={dependentStudentForm.name}
                                  onChange={(e) => setDependentStudentForm((prev) => ({ ...prev, name: e.target.value }))}
                                  className="w-full px-5 py-3.5 bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-2xl outline-none font-semibold text-sm transition-all"
                                  placeholder="Nome completo do aluno"
                                />
                              </div>

                              <div className="space-y-1.5">
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider ml-1">Nível de Ensino</label>
                                <select
                                  value={dependentStudentForm.classType}
                                  onChange={(e) => setDependentStudentForm((prev) => ({
                                    ...prev,
                                    classType: e.target.value as '' | 'INFANTIL' | 'FUNDAMENTAL' | 'MEDIO' | 'INTEGRAL',
                                    classGrade: '',
                                  }))}
                                  className="w-full px-5 py-3.5 bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-2xl outline-none font-semibold text-sm transition-all"
                                >
                                  <option value="">Selecione o nível...</option>
                                  <option value="INFANTIL">Educação Infantil</option>
                                  <option value="FUNDAMENTAL">Ensino Fundamental</option>
                                  <option value="MEDIO">Ensino Médio</option>
                                  <option value="INTEGRAL">Integral</option>
                                </select>
                              </div>

                              {dependentStudentForm.classType && dependentStudentForm.classType !== 'INTEGRAL' && (
                                <div className="space-y-1.5">
                                  <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider ml-1">Série / Ano</label>
                                  <select
                                    value={dependentStudentForm.classGrade}
                                    onChange={(e) => setDependentStudentForm((prev) => ({ ...prev, classGrade: e.target.value }))}
                                    className="w-full px-5 py-3.5 bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-2xl outline-none font-semibold text-sm transition-all"
                                  >
                                    <option value="">Selecione a série...</option>
                                    {gradeOptions[dependentStudentForm.classType as keyof typeof gradeOptions].map((grade) => (
                                      <option key={grade} value={grade}>{grade}</option>
                                    ))}
                                  </select>
                                </div>
                              )}

                              <div className="space-y-1.5">
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider ml-1">Limite Diário (R$)</label>
                                <input
                                  type="number"
                                  value={dependentStudentForm.dailyLimit}
                                  onChange={(e) => setDependentStudentForm((prev) => ({ ...prev, dailyLimit: Number(e.target.value || 0) }))}
                                  className="w-full px-5 py-3.5 bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-2xl outline-none font-semibold text-sm transition-all"
                                />
                              </div>

                              <div className="space-y-1.5 md:col-span-2">
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider ml-1">Restrições Alimentares</label>
                                <input
                                  value={dependentStudentForm.restrictions}
                                  onChange={(e) => setDependentStudentForm((prev) => ({ ...prev, restrictions: e.target.value }))}
                                  className="w-full px-5 py-3.5 bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-2xl outline-none font-semibold text-sm transition-all"
                                  placeholder="Ex.: Lactose, Glúten, Amendoim"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </section>
                 </div>
              </div>

              <div className="p-5 sm:p-6 bg-white border-t border-slate-200 flex flex-col sm:flex-row gap-3 shrink-0">
                 <button
                   type="button"
                   onClick={() => {
                     setIsClientModalOpen(false);
                     setLinkingStudentContextName('');
                   }}
                   className="sm:flex-1 py-3.5 px-5 rounded-2xl border border-slate-300 text-slate-600 text-xs font-black uppercase tracking-widest hover:bg-slate-100 transition-all"
                 >
                   Cancelar
                 </button>
                 <button
                   disabled={!formData.name || isSubmittingClientForm}
                   onClick={handleFinishRegistration}
                   className="sm:flex-[1.8] py-3.5 px-6 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-sm shadow-lg shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99] transition-all flex items-center justify-center gap-2"
                 >
                   <CheckCircle2 size={20} /> {isSubmittingClientForm ? 'Salvando...' : (editingClient ? 'Salvar Alterações' : 'Concluir Cadastro')}
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* MODAL DE RECARGA RÁPIDA */}
      {isRechargeModalOpen && rechargingClient && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 animate-in fade-in">
           <div
             className="absolute inset-0 bg-indigo-950/60 backdrop-blur-sm"
             onClick={() => {
               setIsRechargeModalOpen(false);
               setRechargingClient(null);
               resetRechargePlanSelection();
             }}
           ></div>
           <div className="relative w-full max-w-2xl bg-white rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]">
              <div className="bg-emerald-600 p-8 text-white text-center shrink-0">
                 <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4"><Wallet size={32} /></div>
                 <h2 className="text-xl font-black uppercase tracking-tight">Recarga Rápida</h2>
                 <p className="text-[10px] font-bold text-emerald-100 uppercase tracking-widest mt-1">{rechargingClient.name}</p>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-hide">
                 {/* SEÇÃO PRÉ-PAGO CANTINA */}
                 <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b pb-2">
                       <ShieldCheck size={16} className="text-indigo-600" /> {String(viewingClient.type || '').toUpperCase() === 'ALUNO' ? 'Responsáveis' : 'Vínculos'}
                       <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Pré-pago Cantina (Saldo Livre)</h3>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">
                          {String(viewingClient.type || '').toUpperCase() === 'ALUNO' ? 'Responsáveis cadastrados' : 'Alunos vinculados'}
                        </p>
                        {String(viewingClient.type || '').toUpperCase() === 'ALUNO' ? (
                          Array.isArray(viewingClient.guardians) && viewingClient.guardians.length > 0 ? viewingClient.guardians.map((g, idx) => (
                            <div key={idx} className="flex items-center gap-3 bg-white p-3 rounded-xl border border-indigo-100">
                              <div className="w-9 h-9 bg-indigo-600 text-white rounded-lg flex items-center justify-center font-black">{g.charAt(0)}</div>
                              <div>
                                <p className="text-xs font-black text-gray-800 uppercase">{g}</p>
                                <p className="text-[9px] font-bold text-indigo-400 uppercase">Responsável</p>
                              </div>
                            </div>
                          )) : (
                            <p className="text-[10px] font-black text-gray-400 uppercase">Nenhum responsável vinculado</p>
                          )
                        ) : viewingClientRelatedStudents.length > 0 ? (
                          viewingClientRelatedStudents.map((student) => (
                            <div key={student.id} className="flex items-center gap-3 bg-white p-3 rounded-xl border border-indigo-100">
                              <div className="w-9 h-9 bg-indigo-600 text-white rounded-lg flex items-center justify-center font-black">{String(student.name || '?').charAt(0)}</div>
                              <div>
                                <p className="text-xs font-black text-gray-800 uppercase">{student.name}</p>
                                <p className="text-[9px] font-bold text-indigo-400 uppercase">{student.class || 'Aluno vinculado'}</p>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-[10px] font-black text-gray-400 uppercase">Nenhum aluno vinculado</p>
                        )}
                       <input 
                          type="number" 
                          placeholder="Outro valor para saldo livre..." 
                          className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent focus:border-emerald-500 rounded-2xl outline-none font-black text-lg"
                          onKeyDown={(e) => {
                             if (e.key === 'Enter') {
                                handleQuickRecharge(parseFloat((e.target as HTMLInputElement).value));
                             }
                          }}
                       />
                    </div>
                 </div>

                 {/* SEÇÃO PLANOS DO ADMINISTRADOR */}
                 <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b pb-2">
                       <Layers size={16} className="text-indigo-600" />
                       <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Planos de Serviço</h3>
                    </div>
                    {rechargeSelectedPlanSummary && (
                      <div className="p-4 rounded-2xl border border-indigo-200 bg-indigo-50/70">
                        <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Resumo Final da Recarga</p>
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-4 gap-3">
                          <div>
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Plano</p>
                            <p className="text-xs font-black text-indigo-700 uppercase">{rechargeSelectedPlanSummary.planName}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Valor por Unidade</p>
                            <p className="text-xs font-black text-indigo-700">R$ {rechargeSelectedPlanSummary.unitPrice.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Unidades Selecionadas</p>
                            <p className="text-xs font-black text-indigo-700">{rechargeSelectedPlanSummary.selectedCount} un</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Total</p>
                            <p className="text-sm font-black text-emerald-700">R$ {rechargeSelectedPlanSummary.subtotal.toFixed(2)}</p>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                       {plans.filter(p => p.enterpriseId === activeEnterpriseId).map(plan => {
                         const isSelected = rechargeSelectedPlanId === plan.id;
                         const isCalendarOpen = rechargeOpenCalendarId === plan.id;
                         const selectedDaysCount = rechargePlanDays[plan.id]?.length || 0;
                         const selectedDatesCount = rechargePlanDates[plan.id]?.length || 0;
                         const selectedCount = selectedDatesCount > 0 ? selectedDatesCount : selectedDaysCount;
                         const subtotal = plan.price * selectedCount;

                         return (
                           <div
                             key={plan.id}
                             className={`p-5 rounded-[24px] border-2 text-left transition-all ${isSelected ? 'bg-indigo-50 border-indigo-400 shadow-lg shadow-indigo-100' : 'bg-white border-gray-100 hover:border-indigo-200'}`}
                           >
                             <div className="flex items-start justify-between gap-4">
                               <div>
                                 <p className="text-xs font-black text-gray-800 uppercase tracking-tight">{plan.name}</p>
                                 <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mt-0.5">Valor por unidade</p>
                               </div>
                               <div className="text-right">
                                 <p className="text-lg font-black text-indigo-600 tracking-tighter">R$ {plan.price.toFixed(2)}</p>
                               </div>
                             </div>

                             <div className="mt-4 pt-4 border-t border-indigo-100 flex flex-wrap items-center gap-2">
                               <button
                                 type="button"
                                 onClick={() => toggleRechargePlan(plan.id)}
                                 className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300'}`}
                               >
                                 {isSelected ? 'Plano Selecionado' : 'Selecionar Plano'}
                               </button>
                               {isSelected && (
                                 <button
                                   type="button"
                                   onClick={() => setRechargeOpenCalendarId(isCalendarOpen ? null : plan.id)}
                                   className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 bg-white border-indigo-200 text-indigo-600 hover:border-indigo-400 transition-all"
                                 >
                                   {isCalendarOpen ? 'Fechar Calendário' : 'Escolher Unidades'}
                                 </button>
                               )}
                             </div>

                             {isSelected && (
                               <div className="mt-3">
                                 <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">
                                   {selectedDatesCount} un do mês selecionada(s) • Subtotal: R$ {subtotal.toFixed(2)}
                                 </p>
                                 {(() => {
                                   const availableBalance = getAvailableRechargePlanCreditBalance(viewingClient, plan);
                                   const discountedSubtotal = Math.max(0, subtotal - availableBalance);
                                   return (availableBalance > 0.01 && (
                                     <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mt-1">
                                       Saldo disponível: R$ {availableBalance.toFixed(2)} • Líquido: R$ {discountedSubtotal.toFixed(2)}
                                     </p>
                                   ));
                                 })()}
                                 <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                                   {selectedDaysCount} un por dia da semana marcado(s)
                                 </p>
                               </div>
                             )}

                             {isSelected && isCalendarOpen && (
                               <div className="mt-4 bg-white border border-indigo-200 rounded-2xl p-4">
                                 <p className="text-[10px] font-black text-indigo-700 uppercase tracking-widest mb-3">
                                   Calendário de Entregas - Dias da Semana e do Mês
                                 </p>
                                 {allowedServiceDayKeys.length === 0 && (
                                   <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-3">
                                     Nenhum dia de atendimento ativo em Ajustes da Unidade.
                                   </p>
                                 )}
                                 <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-4">
                                   {WEEK_DAY_OPTIONS.map(day => {
                                     const active = rechargePlanDays[plan.id]?.includes(day.key);
                                     const isAllowedDay = allowedServiceDayKeySet.has(day.key);
                                     return (
                                       <button
                                         type="button"
                                         key={`${plan.id}-recharge-${day.key}`}
                                         onClick={() => toggleRechargePlanDay(plan.id, day.key)}
                                         disabled={!isAllowedDay}
                                         className={`w-full h-11 rounded-xl text-[10px] font-black uppercase tracking-wider border-2 transition-all flex items-center justify-center text-center ${
                                           !isAllowedDay
                                             ? 'bg-gray-100 border-gray-200 text-gray-300 cursor-not-allowed'
                                             : active
                                               ? 'bg-indigo-600 border-indigo-600 text-white'
                                               : 'bg-white border-indigo-100 text-indigo-500 hover:border-indigo-300'
                                         }`}
                                       >
                                         {day.label}
                                       </button>
                                     );
                                   })}
                                 </div>

                                 <div className="bg-indigo-50/60 rounded-2xl p-4 border border-indigo-100 space-y-3">
                                   <div className="flex items-center justify-between">
                                     <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                                       {rechargeCalendarMonthLabel}
                                     </p>
                                     <div className="flex items-center gap-2">
                                       <button
                                         type="button"
                                         onClick={() => setRechargeCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                                         className="w-8 h-8 rounded-lg border border-indigo-200 bg-white text-indigo-600 text-xs font-black"
                                         title="Mês anterior"
                                       >
                                         {'<'}
                                       </button>
                                       <button
                                         type="button"
                                         onClick={() => setRechargeCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
                                         className="px-2 h-8 rounded-lg border border-indigo-200 bg-white text-indigo-600 text-[9px] font-black uppercase tracking-widest"
                                       >
                                         Hoje
                                       </button>
                                       <button
                                         type="button"
                                         onClick={() => setRechargeCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                                         className="w-8 h-8 rounded-lg border border-indigo-200 bg-white text-indigo-600 text-xs font-black"
                                         title="Próximo mês"
                                       >
                                         {'>'}
                                       </button>
                                     </div>
                                   </div>

                                   <div className="grid grid-cols-7 gap-2">
                                     {WEEK_DAY_OPTIONS.map(day => (
                                       <div
                                         key={`${plan.id}-recharge-header-${day.key}`}
                                         className={`w-full h-9 rounded-lg border text-[10px] font-black uppercase flex items-center justify-center text-center ${
                                           allowedServiceDayKeySet.has(day.key)
                                             ? 'bg-white border-indigo-100 text-indigo-500'
                                             : 'bg-gray-100 border-gray-200 text-gray-300'
                                         }`}
                                       >
                                         {day.label}
                                       </div>
                                     ))}
                                   </div>

                                   {!isSchoolCalendarYearLoaded(rechargeCalendarMonth.getFullYear()) && (
                                     <div className="mb-2 px-2 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-[9px] font-black text-amber-700 uppercase tracking-widest">
                                       Carregando calendário escolar do ano selecionado...
                                     </div>
                                   )}
                                   <div className="grid grid-cols-7 gap-2">
                                     {rechargeCalendarGrid.map((dateCell, index) => {
                                       if (!dateCell) {
                                         return <div key={`${plan.id}-recharge-empty-${index}`} className="w-full h-9 rounded-lg bg-transparent" />;
                                       }
                                       const isCalendarReady = isSchoolCalendarReadyForDate(dateCell);
                                       const isAllowedDate = isServiceDateAllowed(dateCell);
                                       const isSchoolBlockedDate = isSchoolCalendarBlockedDate(dateCell);
                                       const dateKey = toDateKey(dateCell);
                                       const isSelectedDate = (rechargePlanDates[plan.id] || []).includes(dateKey);
                                       const reversedDatesForPlan = reversedRechargeDateKeysByPlanId.get(plan.id) || new Set<string>();
                                       const isReversedDate = reversedDatesForPlan.has(dateKey);
                                       return (
                                         <button
                                           type="button"
                                           key={`${plan.id}-recharge-${dateKey}`}
                                           onClick={() => toggleRechargePlanDate(plan.id, dateCell)}
                                           disabled={!isCalendarReady || !isAllowedDate || isSchoolBlockedDate}
                                           className={`w-full rounded-lg border text-[10px] font-black transition-all flex items-center justify-center text-center ${
                                             !isCalendarReady
                                               ? 'h-9 bg-gray-100 border-gray-200 text-gray-300 cursor-not-allowed'
                                               : isSchoolBlockedDate
                                               ? 'h-auto min-h-[36px] py-1 bg-rose-50 border-rose-100 text-rose-400 cursor-not-allowed'
                                               : !isAllowedDate
                                               ? 'h-9 bg-gray-100 border-gray-200 text-gray-300 cursor-not-allowed'
                                               : isSelectedDate
                                                 ? 'h-9 bg-indigo-600 border-indigo-600 text-white'
                                                 : (isReversedDate && !isSelectedDate ? 'h-9 bg-rose-50 border-rose-200 text-rose-700 hover:border-rose-300' : 'h-9 bg-white border-indigo-100 text-indigo-600 hover:border-indigo-300')
                                           }`}
                                           title={isSchoolBlockedDate ? (getSchoolEventTitle(dateCell) || 'Dia sem aula') : (isReversedDate && !isSelectedDate ? 'Estornado' : undefined)}
                                         >
                                             {isSchoolBlockedDate ? (
                                               <span className="flex flex-col items-center justify-center gap-0.5 w-full px-0.5">
                                                 <span className="font-black text-rose-500 text-[10px] leading-none">{dateCell.getDate()}</span>
                                                 <span className="text-[7px] font-black text-rose-400 leading-tight text-center line-clamp-2 w-full">{getSchoolEventTitle(dateCell) || 'Sem aula'}</span>
                                               </span>
                                             ) : isReversedDate && !isSelectedDate ? (
                                               <span className="flex flex-col items-center justify-center gap-0 w-full">
                                                 <span className="font-black text-[10px] leading-none">{dateCell.getDate()}</span>
                                                 <span className="text-[7px] font-black uppercase tracking-wider">Estornado</span>
                                               </span>
                                             ) : (
                                               <span className="inline-flex items-center justify-center relative w-full h-full">
                                                 {dateCell.getDate()}
                                               </span>
                                             )}
                                             {isReversedDate && !isSelectedDate && !isSchoolBlockedDate && (
                                               <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] leading-none flex items-center justify-center">
                                                 !
                                               </span>
                                             )}
                                         </button>
                                       );
                                     })}
                                   </div>
                                 </div>
                               </div>
                             )}

                             {isSelected && (
                               <button
                                 type="button"
                                 onClick={() => handleQuickRecharge(
                                   subtotal,
                                   plan.name,
                                   {
                                     planId: plan.id,
                                     planPrice: plan.price,
                                     daysOfWeek: rechargePlanDays[plan.id] || [],
                                     selectedDates: rechargePlanDates[plan.id] || [],
                                     subtotal,
                                   }
                                 )}
                                 disabled={selectedCount <= 0}
                                 className="w-full mt-4 py-3 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                               >
                                 Confirmar Recarga do Plano
                               </button>
                             )}
                           </div>
                         );
                       })}
                    </div>
                 </div>
              </div>

              <div className="p-6 bg-gray-50 border-t flex justify-center shrink-0">
                 <button
                   onClick={() => {
                     setIsRechargeModalOpen(false);
                     setRechargingClient(null);
                     resetRechargePlanSelection();
                   }}
                   className="text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-gray-600 transition-colors"
                 >
                   Cancelar Operação
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* MODAL DE HISTÓRICO */}
      {isHistoryModalOpen && historyClient && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 animate-in fade-in">
           <div className="absolute inset-0 bg-indigo-950/80 backdrop-blur-md" onClick={() => setIsHistoryModalOpen(false)}></div>
           <div className="relative w-full max-w-2xl bg-white rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[85vh]">
              <div className="bg-gray-900 p-8 text-white flex items-center justify-between shrink-0">
                 <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center"><History size={24} /></div>
                    <div>
                       <h2 className="text-lg font-black uppercase tracking-tight">Extrato de Movimentação</h2>
                       <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">{historyClient.name}</p>
                    </div>
                 </div>
                 <button onClick={() => setIsHistoryModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={24} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-8 space-y-4 scrollbar-hide">
                 <div className="flex flex-wrap gap-2 pb-2 border-b border-gray-100">
                    {[
                      { id: 'TODAY', label: 'Hoje' },
                      { id: 'YESTERDAY', label: 'Ontem' },
                      { id: 'WEEK', label: 'Semana' },
                      { id: '15D', label: '15 dias' },
                      { id: 'MONTH', label: 'Mês' },
                      { id: 'YEAR', label: 'Ano' },
                      { id: 'DATE', label: 'Data' }
                    ].map(period => (
                      <button
                        key={`history-${period.id}`}
                        onClick={() => setConsumptionPeriod(period.id as 'TODAY' | 'YESTERDAY' | 'WEEK' | '15D' | 'MONTH' | 'YEAR' | 'DATE')}
                        className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
                          consumptionPeriod === period.id
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'bg-white border-gray-100 text-gray-500 hover:border-indigo-200'
                        }`}
                      >
                        {period.label}
                      </button>
                    ))}
                    {consumptionPeriod === 'DATE' && (
                      <input
                        type="date"
                        value={consumptionSpecificDate}
                        onChange={(e) => setConsumptionSpecificDate(e.target.value)}
                        className="px-3 py-2 rounded-xl border-2 border-indigo-100 focus:border-indigo-500 outline-none text-xs font-black text-gray-600 bg-white"
                      />
                    )}
                    <button
                      onClick={handleExportHistoryExtractPdf}
                      className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 bg-white border-gray-100 text-gray-600 hover:border-red-200 hover:text-red-700 transition-all flex items-center gap-2"
                    >
                      <FileText size={14} /> Exportar PDF
                    </button>
                    <button
                      onClick={handlePrintHistoryExtract}
                      className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 bg-white border-gray-100 text-gray-600 hover:border-emerald-200 hover:text-emerald-700 transition-all flex items-center gap-2"
                    >
                      <Printer size={14} /> Imprimir
                    </button>
                 </div>
                 <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-3.5">
                    <p className="text-[9px] font-black uppercase tracking-widest text-indigo-500 mb-2">Resumo do período filtrado</p>
                    <div className="space-y-1.5 text-[11px] font-bold text-gray-700">
                      <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Crédito de planos (por plano)</p>
                      {historyExtractBreakdown.planCreditsByPlan.length > 0 ? historyExtractBreakdown.planCreditsByPlan.map((plan) => (
                        <p key={`history-plan-credit-${plan.planName}`} className="leading-tight">
                          {plan.planName}: qtd {Number(plan.quantity || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} • R$ {formatCurrencyBRL(plan.value || 0)}
                        </p>
                      )) : (
                        <p className="text-gray-500">Sem crédito de plano no período.</p>
                      )}

                      <div className="border-t border-indigo-100 my-2"></div>
                      <p>Total consumido em planos: qtd {Number(historyExtractBreakdown.planConsumedQuantity || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} • R$ {formatCurrencyBRL(historyExtractBreakdown.planConsumedValue || 0)}</p>
                      <p>Total crédito cantina: R$ {formatCurrencyBRL(historyExtractBreakdown.cantinaCreditValue || 0)}</p>
                      <p>Total consumido em cantina: qtd {Number(historyExtractBreakdown.cantinaConsumedQuantity || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} • R$ {formatCurrencyBRL(historyExtractBreakdown.cantinaConsumedValue || 0)}</p>

                      <div className="border-t border-indigo-100 my-2"></div>
                      <p>Saldo planos: qtd {Number(historyExtractBreakdown.planBalanceQuantity || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} • R$ {formatCurrencyBRL(historyExtractBreakdown.planBalanceValue || 0)}</p>
                      <p>Saldo cantina: qtd {Number(historyExtractBreakdown.cantinaBalanceQuantity || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} • R$ {formatCurrencyBRL(historyExtractBreakdown.cantinaBalanceValue || 0)}</p>
                    </div>
                 </div>
                 {historyPeriodFilteredMovements.length > 0 ? (
                    historyPeriodFilteredMovements.map((move) => (
                       <div key={move.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100 hover:border-indigo-100 transition-colors">
                          <div className="flex items-center gap-4">
                             <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${move.iconBg}`}>
                                {move.category === 'RECARGA' ? <DollarSign size={18} /> : <ShoppingCart size={18} />}
                             </div>
                             <div>
                                <p className="text-sm font-black text-gray-800 uppercase leading-none mb-1">{move.description}</p>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                  {move.timestamp ? new Date(move.timestamp).toLocaleDateString('pt-BR') : 'Data indisponível'} • {move.timestamp ? new Date(move.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                                </p>
                             </div>
                          </div>
                          <div className="text-right">
                             <p className={`text-sm font-black ${move.amountColor}`}>
                                {move.signal} R$ {move.amount.toFixed(2)}
                             </p>
                          </div>
                       </div>
                    ))
                 ) : (
                    <div className="py-20 text-center space-y-4">
                       <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto text-gray-200"><History size={32} /></div>
                       <p className="text-xs font-black text-gray-300 uppercase tracking-widest">Nenhuma movimentação no período selecionado</p>
                    </div>
                 )}
              </div>
              <div className="p-6 bg-gray-50 border-t text-center">
                 <button onClick={() => setIsHistoryModalOpen(false)} className="px-8 py-3 bg-white border text-[10px] font-black text-gray-400 uppercase tracking-widest rounded-xl hover:text-gray-600 transition-colors shadow-sm">Fechar Extrato</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

// COMPONENTES AUXILIARES
const DetailStatCard = ({ icon, label, value, color }: any) => {
  const colorMap: any = {
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
  };
  return (
    <div className={`${colorMap[color]} p-6 rounded-[32px] border shadow-sm transition-all hover:scale-[1.02]`}>
       <div className="flex items-center justify-between mb-4">
          <div className="p-3 bg-white/60 rounded-2xl shadow-inner">{icon}</div>
          <div className="w-2 h-2 rounded-full bg-current opacity-30 animate-pulse"></div>
       </div>
       <p className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-1">{label}</p>
       <p className="text-2xl font-black leading-none tracking-tighter">{value}</p>
    </div>
  );
};

const InfoItem = ({ label, value }: { label: string, value: string }) => (
  <div className="space-y-1">
    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
    <p className="text-sm font-bold text-gray-700 truncate">{value}</p>
  </div>
);

export default ClientsPage;



