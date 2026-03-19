
import React, { useState, useMemo, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  Search, Plus, Wallet, X, User as UserIcon, History, 
  ShieldCheck, ArrowRight, CheckCircle2, DollarSign,
  Check, Smartphone, QrCode, Copy, FileText, Building2,
  ChevronDown, UserPlus, ChevronLeft, Eye, ShieldAlert,
  Phone, Mail, Fingerprint, GraduationCap, AlertTriangle, Trash2,
  Beef, HeartPulse, CreditCard, Landmark, Edit, ShoppingCart, Layers, Upload, FileSpreadsheet, Printer
} from 'lucide-react';
import { Client, ClientPlanType, User, Enterprise, Role, Plan, TransactionRecord } from '../types';
import ApiService from '../services/api';
import { formatPhoneWithFlag } from '../utils/phone';

interface ClientsPageProps {
  currentUser: User;
  activeEnterprise: Enterprise;
}

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

const renderHighlightedText = (value: string, query: string) => {
  const safeValue = String(value || '');
  const safeQuery = String(query || '').trim();

  if (!safeQuery) return safeValue;

  const lowerValue = safeValue.toLowerCase();
  const lowerQuery = safeQuery.toLowerCase();
  const startIndex = lowerValue.indexOf(lowerQuery);

  if (startIndex === -1) return safeValue;

  const before = safeValue.slice(0, startIndex);
  const match = safeValue.slice(startIndex, startIndex + safeQuery.length);
  const after = safeValue.slice(startIndex + safeQuery.length);

  return (
    <>
      {before}
      <mark className="bg-amber-200 text-gray-900 rounded px-0.5">{match}</mark>
      {after}
    </>
  );
};

const normalizeSearchText = (value?: string) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const ClientsPage: React.FC<ClientsPageProps> = ({ currentUser, activeEnterprise }) => {
  // Guard clause: se não houver enterprise ativa, retornar carregamento
  if (!activeEnterprise) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full"></div>
          <p className="text-gray-600 font-medium">Carregando clientes...</p>
        </div>
      </div>
    );
  }

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
  
  const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'BOLETO' | 'CAIXA'>('PIX');
  const [showPaymentFlow, setShowPaymentFlow] = useState(false);

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
  const [openPlanCalendarId, setOpenPlanCalendarId] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [rechargeSelectedPlanId, setRechargeSelectedPlanId] = useState<string | null>(null);
  const [rechargePlanDays, setRechargePlanDays] = useState<Record<string, string[]>>({});
  const [rechargePlanDates, setRechargePlanDates] = useState<Record<string, string[]>>({});
  const [rechargeOpenCalendarId, setRechargeOpenCalendarId] = useState<string | null>(null);
  const [rechargeCalendarMonth, setRechargeCalendarMonth] = useState<Date>(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [clientPhotoFile, setClientPhotoFile] = useState<File | null>(null);
  const [clientPhotoPreview, setClientPhotoPreview] = useState('');
  const [isSavingPlanView, setIsSavingPlanView] = useState(false);
  const [planViewNotice, setPlanViewNotice] = useState<{ type: 'warning' | 'success' | 'error'; message: string } | null>(null);

  const isUnitAdmin = currentUser?.role === Role.ADMIN
    || currentUser?.role === Role.ADMIN_RESTAURANTE
    || currentUser?.role === Role.GERENTE
    || currentUser?.role === Role.FUNCIONARIO_BASICO;

  // Carregar clientes, empresas, planos e transações da API
  const showPlanNotice = (message: string, type: 'warning' | 'success' | 'error' = 'warning') => {
    setPlanViewNotice({ type, message });
    window.setTimeout(() => {
      setPlanViewNotice((prev) => (prev?.message === message ? null : prev));
    }, 3500);
  };

  useEffect(() => {
    const enterpriseId = activeEnterprise?.id;
    if (!enterpriseId) return;

    const loadData = async () => {
      try {
        const [clientsData, enterprisesData, plansData, transactionsData] = await Promise.all([
          ApiService.getClients(enterpriseId),
          ApiService.getEnterprises(),
          ApiService.getPlans(enterpriseId),
          ApiService.getTransactions()
        ]);
        setClients(clientsData);
        setEnterprises(enterprisesData);
        setPlans(plansData);
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
  }, [activeEnterprise?.id]);

  useEffect(() => {
    if (consumptionPeriod !== 'DATE') return;
    if (consumptionSpecificDate) return;
    setConsumptionSpecificDate(new Date().toISOString().slice(0, 10));
  }, [consumptionPeriod, consumptionSpecificDate]);

  const [formData, setFormData] = useState({
    name: '',
    type: 'ALUNO' as 'ALUNO' | 'COLABORADOR',
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
    parentWhatsappCountryCode: '55',
    parentWhatsapp: '',
    parentCpf: '',
    parentEmail: '',
    photo: ''
  });

  const gradeOptions = {
    INFANTIL: ['1', '2', '3', '4', '5'],
    FUNDAMENTAL: ['1º ano', '2º ano', '3º ano', '4º ano', '5º ano', '6º ano', '7º ano', '8º ano', '9º ano'],
    MEDIO: ['1º ano', '2º ano', '3º ano'],
    INTEGRAL: []
  };

  const filteredClients = useMemo(() => {
    const normalizedSearch = normalizeSearchText(searchTerm);

    return clients.filter(c => {
      const matchesSearch =
        !normalizedSearch
        || normalizeSearchText(c.name).includes(normalizedSearch)
        || normalizeSearchText(c.registrationId).includes(normalizedSearch)
        || normalizeSearchText(c.class).includes(normalizedSearch);
      
      let matchesUnit = true;
      if (isUnitAdmin) {
        matchesUnit = c.enterpriseId === activeEnterprise.id;
      } else {
        matchesUnit = selectedUnitId === 'ALL' || c.enterpriseId === selectedUnitId;
      }
      
      return matchesSearch && matchesUnit;
    }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
  }, [clients, searchTerm, selectedUnitId, isUnitAdmin, activeEnterprise.id]);

  const availablePlans = useMemo(() => {
    return plans.filter(p => p.enterpriseId === activeEnterprise.id && p.isActive !== false);
  }, [plans, activeEnterprise.id]);

  const currentEnterpriseConfig = useMemo(() => {
    return enterprises.find(ent => ent.id === activeEnterprise.id) || activeEnterprise;
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
  const isServiceDateAllowed = (date: Date) => {
    const dayKey = jsDayToWeekDay[date.getDay()];
    return allowedServiceDayKeySet.has(dayKey);
  };

  useEffect(() => {
    const filterDateKeysByAllowedWeekdays = (dateKeys: string[]) => {
      return dateKeys.filter((dateKey) => {
        const parsed = new Date(`${dateKey}T00:00:00`);
        if (Number.isNaN(parsed.getTime())) return false;
        return isServiceDateAllowed(parsed);
      });
    };

    setSelectedPlanDays((prev) => {
      const next = Object.entries(prev).reduce((acc, [planId, days]) => {
        acc[planId] = (days || []).filter(day => allowedServiceDayKeySet.has(day));
        return acc;
      }, {} as Record<string, string[]>);
      return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
    });

    setRechargePlanDays((prev) => {
      const next = Object.entries(prev).reduce((acc, [planId, days]) => {
        acc[planId] = (days || []).filter(day => allowedServiceDayKeySet.has(day));
        return acc;
      }, {} as Record<string, string[]>);
      return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
    });

    setSelectedPlanDates((prev) => {
      const next = Object.entries(prev).reduce((acc, [planId, dates]) => {
        acc[planId] = filterDateKeysByAllowedWeekdays(dates || []);
        return acc;
      }, {} as Record<string, string[]>);
      return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
    });

    setRechargePlanDates((prev) => {
      const next = Object.entries(prev).reduce((acc, [planId, dates]) => {
        acc[planId] = filterDateKeysByAllowedWeekdays(dates || []);
        return acc;
      }, {} as Record<string, string[]>);
      return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
    });
  }, [allowedServiceDayKeySet]);

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
      if (date.getDay() === targetJsDay) result.push(toDateKey(date));
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
      if (date.getDay() === targetJsDay) result.push(toDateKey(date));
    }

    return result;
  };

  const handleOpenCreateModal = () => {
    setEditingClient(null);
    setIsStudentOnlyMode(false);
    setShowPaymentFlow(false);
    setSelectedPlanDays({});
    setSelectedPlanDates({});
    setSelectedPlanShifts({});
    setPlanRequiredUnitsById({});
    setOpenPlanCalendarId(null);
    setCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    setFormData({
      name: '', type: 'ALUNO', servicePlans: ['PREPAGO'], class: '', classType: '', classGrade: '', balance: 0,
      dailyLimit: 30, initialCredit: 0, isDailyLimitActive: false, isBlocked: false,
      restrictions: [], dietaryNotes: '', parentName: '', parentWhatsappCountryCode: '55', parentWhatsapp: '', parentCpf: '', parentEmail: '', photo: ''
    });
    setClientPhotoFile(null);
    setClientPhotoPreview('');
    setIsClientModalOpen(true);
  };

  const handleOpenCreateStudentFromDetail = () => {
    const phoneParts = splitPhoneByCountryCode(viewingClient?.parentWhatsapp || '');
    setEditingClient(null);
    setIsStudentOnlyMode(true);
    setShowPaymentFlow(false);
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
      parentName: viewingClient?.parentName || '',
      parentWhatsappCountryCode: phoneParts.countryCode,
      parentWhatsapp: phoneParts.localPhone,
      parentCpf: viewingClient?.parentCpf || '',
      parentEmail: viewingClient?.parentEmail || '',
      photo: ''
    });
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
    setShowPaymentFlow(false);
    setOpenPlanCalendarId(null);
    setCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    setFormData({
      name: client.name || '',
      type: (client.type === 'COLABORADOR' ? 'COLABORADOR' : 'ALUNO') as 'ALUNO' | 'COLABORADOR',
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
      parentWhatsappCountryCode: phoneParts.countryCode,
      parentWhatsapp: phoneParts.localPhone,
      parentCpf: client.parentCpf || '',
      parentEmail: client.parentEmail || '',
      photo: client.photo || ''
    });
    setClientPhotoFile(null);
    setClientPhotoPreview(resolveClientPhotoUrl(client.photo, client.name));
    setIsClientModalOpen(true);
  };

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

    setPlanRequiredUnitsById(requiredByPlan);

    setSelectedPlanDays(normalizedPlanDays);
    setSelectedPlanDates(normalizedPlanDates);
    setSelectedPlanShifts(normalizedPlanShifts);
    setOpenPlanCalendarId(null);
    setCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    setIsDetailModalOpen(true);
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

  const togglePlanDate = (planId: string, date: Date) => {
    if (!isServiceDateAllowed(date)) return;

    const dateKey = toDateKey(date);
    setSelectedPlanDates(prev => {
      const current = prev[planId] || [];
      const exists = current.includes(dateKey);
      const requiredCountRaw = Number(planRequiredUnitsById[planId] || 0);
      const requiredCount = Number.isFinite(requiredCountRaw) ? requiredCountRaw : 0;

      if (!exists && isDetailModalOpen && current.length >= requiredCount) return prev;

      const nextDates = exists ? current.filter(d => d !== dateKey) : [...current, dateKey].sort();

      return {
        ...prev,
        [planId]: nextDates,
      };
    });
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
    setRechargePlanDates({ [planId]: rechargePlanDates[planId] || [] });
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
    if (!isServiceDateAllowed(date)) return;

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
        const selectedDates = selectedPlanDates[planId] || [];
        const selectedCount = selectedDates.length > 0 ? selectedDates.length : (daysOfWeek?.length || 0);
        return {
          planId,
          planName: plan.name,
          planPrice: plan.price,
          daysOfWeek,
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

  const rechargeSelectedPlanSummary = useMemo(() => {
    if (!rechargeSelectedPlanId) return null;

    const plan = plans.find(p => p.id === rechargeSelectedPlanId && p.enterpriseId === activeEnterprise.id);
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
  }, [rechargeSelectedPlanId, rechargePlanDays, rechargePlanDates, plans, activeEnterprise.id]);

  const handleFinishRegistration = async () => {
    const classValue = formData.type === 'ALUNO'
      ? (
        formData.classType === 'INTEGRAL'
          ? 'INTEGRAL'
          : (formData.classType && formData.classGrade ? `${formData.classType} - ${formData.classGrade}` : '')
      )
      : formData.class;

    const parsedFormBalance = Number(formData.initialCredit || 0);
    const balanceToPersist = formData.type === 'ALUNO'
      ? (Number.isFinite(parsedFormBalance) ? parsedFormBalance : 0)
      : (editingClient?.balance || 0);
    
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
        return;
      }
    }

    const clientPayload = {
      registrationId: editingClient?.registrationId || (clients.length + 1000).toString(),
      name: formData.name,
      type: formData.type,
      class: classValue,
      servicePlans: [
        ...(formData.servicePlans.includes('PREPAGO') ? ['PREPAGO'] : []),
        ...selectedPlanConfigs.map(plan => plan.planName),
      ] as any,
      selectedPlansConfig: selectedPlanConfigs,
      balance: balanceToPersist,
      spentToday: editingClient ? (editingClient.spentToday || 0) : 0,
      isBlocked: editingClient ? editingClient.isBlocked : false,
      restrictions: formData.restrictions,
      dietaryNotes: formData.dietaryNotes,
      photo: finalPhoto,
      enterpriseId: editingClient?.enterpriseId || activeEnterprise.id,
      parentName: formData.parentName,
      parentWhatsappCountryCode: formData.parentWhatsappCountryCode,
      parentWhatsapp: joinPhoneWithCountryCode(formData.parentWhatsappCountryCode, formData.parentWhatsapp),
      parentCpf: formData.parentCpf,
      parentEmail: formData.parentEmail
    };

    try {
      if (editingClient) {
        const updatedClient = await ApiService.updateClient(editingClient.id, clientPayload);
        setClients(prev => prev.map(c => (c.id === editingClient.id ? updatedClient : c)));
        if (viewingClient?.id === editingClient.id) setViewingClient(updatedClient);
      } else {
        const newClient = await ApiService.createClient(clientPayload);
        setClients([newClient, ...clients]);
      }
      setEditingClient(null);
      setIsStudentOnlyMode(false);
      setClientPhotoFile(null);
      setClientPhotoPreview('');
      setIsClientModalOpen(false);
      setSelectedPlanShifts({});
      alert(editingClient ? 'Cadastro atualizado com sucesso!' : 'Matrícula concluída com sucesso!');
    } catch (err) {
      console.error('Erro ao salvar cliente:', err);
      alert('Erro ao salvar cliente. Tente novamente.');
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
    
    const newBalance = (rechargingClient.balance || 0) + amount;
    const newPlans = planName && !rechargingClient.servicePlans.includes(planName as any) 
      ? [...rechargingClient.servicePlans, planName as any] 
      : rechargingClient.servicePlans;

    const existingSelectedPlansRaw = (rechargingClient as any).selectedPlansConfig;
    const existingSelectedPlans = ((Array.isArray(existingSelectedPlansRaw) ? existingSelectedPlansRaw : []) as Array<any>);
    let nextSelectedPlans = existingSelectedPlans;

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
        nextSelectedPlans = existingSelectedPlans.map((cfg: any, idx: number) => idx === index ? normalizedPlanConfig : cfg);
      } else {
        nextSelectedPlans = [...existingSelectedPlans, normalizedPlanConfig];
      }
    }
    
    try {
      const updated = await ApiService.updateClient(rechargingClient.id, {
        balance: newBalance,
        servicePlans: newPlans,
        selectedPlansConfig: nextSelectedPlans,
      });
      const createdTransaction = await ApiService.createTransaction({
        clientId: rechargingClient.id,
        clientName: rechargingClient.name,
        enterpriseId: rechargingClient.enterpriseId,
        type: 'CREDIT',
        amount,
        description: planName
          ? `Recarga de plano: ${planName}${planConfig ? ` (${planConfig.selectedDates.length || planConfig.daysOfWeek.length} dia(s))` : ''}`
          : 'Recarga de saldo',
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
      alert('Erro ao recarregar cliente. Tente novamente.');
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

  const isTransactionFromClient = (tx: any, client: Client) => {
    const clientIdMatches = tx?.clientId && tx.clientId === client.id;
    const clientNameMatches = tx?.client && String(tx.client).toLowerCase() === client.name.toLowerCase();
    const clientNameAltMatches = tx?.clientName && String(tx.clientName).toLowerCase() === client.name.toLowerCase();
    return clientIdMatches || clientNameMatches || clientNameAltMatches;
  };

  const clientPlanBalances = useMemo(() => {
    const planById = new Map(plans.map((plan) => [plan.id, plan]));
    const planByName = new Map(plans.map((plan) => [String(plan.name || '').trim().toUpperCase(), plan]));
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
      });
      setClients(prev => prev.map(c => (c.id === viewingClient.id ? updated : c)));
      setViewingClient(updated);
      showPlanNotice('Planos e dias de refeição atualizados com sucesso.', 'success');
    } catch (error) {
      console.error('Erro ao salvar alterações dos planos:', error);
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

  const drawProfessionalPdfHeader = (
    doc: jsPDF,
    title: string,
    header: ReturnType<typeof buildExtractHeaderData>,
    periodLabel: string
  ) => {
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 28;
    const contentWidth = pageWidth - (marginX * 2);
    const headerTop = 24;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(marginX, headerTop, contentWidth, 126, 8, 8, 'FD');

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(16);
    doc.text(title, marginX + 12, headerTop + 22);

    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(`Período: ${periodLabel}`, marginX + contentWidth - 12, headerTop + 16, { align: 'right' });
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, marginX + contentWidth - 12, headerTop + 30, { align: 'right' });

    const colLeftX = marginX + 12;
    const colRightX = marginX + (contentWidth / 2) + 6;
    const baseY = headerTop + 50;

    doc.setTextColor(30, 41, 59);
    doc.text(`Escola: ${header.schoolName}`, colLeftX, baseY);
    doc.text(`Empresa/Unidade: ${header.enterpriseName}`, colLeftX, baseY + 14);
    doc.text(`Aluno/Cliente: ${header.studentName}`, colLeftX, baseY + 28);

    doc.text(`Turma: ${header.className}`, colRightX, baseY);
    doc.text(`Pai/Responsável: ${header.guardianName}`, colRightX, baseY + 14);
    doc.text(`Telefone Pai/Responsável: ${header.guardianPhone}`, colRightX, baseY + 28);

    const plansText = `Planos e saldos: ${header.planLines.join(' | ')}`;
    const wrappedPlans = doc.splitTextToSize(plansText, contentWidth - 24);
    doc.text(wrappedPlans, colLeftX, baseY + 46);

    return baseY + 46 + (wrappedPlans.length * 10) + 8;
  };

  const buildProfessionalPrintHeaderHtml = (
    clientName: string,
    header: ReturnType<typeof buildExtractHeaderData>,
    periodLabel: string
  ) => {
    const planLinesHtml = header.planLines.map((line) => `<li>${line}</li>`).join('');
    return `
      <section class="report-header">
        <div class="top-row">
          <h1>Extrato Completo - ${clientName}</h1>
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
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const tableStartY = drawProfessionalPdfHeader(doc, `Extrato Completo - ${viewingClient.name}`, header, consumptionPeriodLabel);

    autoTable(doc, {
      startY: tableStartY,
      head: [['Data/Hora', 'Movimentação', 'Descrição', 'Método', 'Status', 'Valor']],
      body: periodFilteredMovements.map((move) => [
        move.timestamp ? new Date(move.timestamp).toLocaleString('pt-BR') : '-',
        move.category,
        move.description,
        move.method,
        move.status,
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
          ${buildProfessionalPrintHeaderHtml(viewingClient.name, header, consumptionPeriodLabel)}
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
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const tableStartY = drawProfessionalPdfHeader(doc, `Extrato Completo - ${historyClient.name}`, header, consumptionPeriodLabel);

    autoTable(doc, {
      startY: tableStartY,
      head: [['Data/Hora', 'Movimentação', 'Descrição', 'Método', 'Status', 'Valor']],
      body: historyPeriodFilteredMovements.map((move) => [
        move.timestamp ? new Date(move.timestamp).toLocaleString('pt-BR') : '-',
        move.category,
        move.description,
        move.method,
        move.status,
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
          ${buildProfessionalPrintHeaderHtml(historyClient.name, header, consumptionPeriodLabel)}
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

  return (
    <div className="dash-shell clients-shell animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-800 tracking-tight uppercase">Gestão de Clientes</h1>
          <p className="text-gray-400 text-[10px] font-black uppercase tracking-[2px] mt-1">Controle de usuários, planos e carteira digital</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={handleOpenCreateModal} className="bg-indigo-600 text-white px-5 py-3 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center gap-2">
            <Plus size={16} /> Adicionar
          </button>
          <button onClick={handleExportCsv} className="bg-white border border-gray-200 text-gray-700 px-4 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:border-indigo-200 hover:text-indigo-700 transition-all flex items-center gap-2">
            <FileSpreadsheet size={15} /> CSV
          </button>
          <button onClick={handleExportPdf} className="bg-white border border-gray-200 text-gray-700 px-4 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:border-red-200 hover:text-red-700 transition-all flex items-center gap-2">
            <FileText size={15} /> PDF
          </button>
          <button onClick={handlePrintClients} className="bg-white border border-gray-200 text-gray-700 px-4 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:border-emerald-200 hover:text-emerald-700 transition-all flex items-center gap-2">
            <Printer size={15} /> Imprimir
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-[32px] border shadow-sm flex flex-col xl:flex-row items-center gap-6">
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
           <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
           <input type="text" placeholder="Pesquisar por matrícula, nome ou turma..." className="w-full pl-12 pr-6 py-3.5 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-3xl outline-none font-bold text-sm transition-all shadow-inner" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
      </div>

      <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-xs font-black text-gray-500 uppercase tracking-widest border-b">
              <tr>
                <th className="px-8 py-6">ID</th>
                <th className="px-8 py-6">Cliente</th>
                <th className="px-8 py-6">Responsável / Setor</th>
                <th className="px-8 py-6">Telefone Responsável</th>
                <th className="px-8 py-6">Turma</th>
                <th className="px-8 py-6 text-center">Restrição</th>
                <th className="px-8 py-6 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-8 py-20 text-center text-gray-400 font-bold uppercase text-xs tracking-widest opacity-40">Nenhum cliente na base</td>
                </tr>
              ) : filteredClients.map(client => {
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
                return (
                  <tr key={client.id} className="hover:bg-indigo-50/30 transition-all group">
                    <td className="px-8 py-5 font-mono text-sm font-black text-indigo-600">#{client.registrationId}</td>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <img src={resolveClientPhotoUrl(client.photo, client.name)} className="w-14 h-14 rounded-2xl object-cover border-2 border-white shadow-sm" />
                        <div>
                          <p className="font-black text-gray-800 text-base leading-tight uppercase">{renderHighlightedText(client.name, searchTerm)}</p>
                          <p className="text-xs text-gray-500 font-bold uppercase mt-0.5">{client.type}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="space-y-1">
                        <p className="text-xs font-black text-gray-700 uppercase tracking-widest">
                          {responsibleOrSector}
                        </p>
                        <p className="text-[11px] font-semibold text-gray-500 lowercase tracking-wide">
                          {responsibleEmail}
                        </p>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-xs font-black text-gray-600 uppercase tracking-widest">
                        {formatPhoneNumber(responsiblePhone)}
                      </span>
                    </td>
                    <td className="px-8 py-5">
                      {client.type === 'ALUNO' ? (
                        <span className="text-xs font-black text-indigo-600 uppercase tracking-widest">
                          {client.class || 'Não informado'}
                        </span>
                      ) : (
                        <span className="text-xs font-black text-gray-300 uppercase tracking-widest">—</span>
                      )}
                    </td>
                    <td className="px-8 py-5 text-center">
                      {hasRestriction ? (
                        <div className="flex justify-center">
                          <span className="p-1.5 bg-red-50 text-red-600 rounded-lg border border-red-100 animate-pulse" title={clientRestrictions.join(', ')}>
                            <AlertTriangle size={16} />
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-200">—</span>
                      )}
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                         <button onClick={() => handleOpenDetail(client)} className="p-3.5 bg-white border text-gray-500 rounded-xl hover:text-indigo-600 hover:bg-indigo-50 transition-all shadow-sm" title="Ver Detalhes"><Eye size={18} /></button>
                         <button onClick={() => { setConsumptionPeriod('MONTH'); setConsumptionSpecificDate(''); setHistoryClient(client); setIsHistoryModalOpen(true); }} className="p-3.5 bg-white border text-gray-500 rounded-xl hover:text-indigo-600 hover:bg-indigo-50 transition-all shadow-sm" title="Histórico"><History size={18} /></button>
                         <button
                           onClick={() => {
                             handleOpenDetail(client);
                           }}
                           className="p-3.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                           title="Ver Planos"
                         >
                           <Beef size={18} />
                         </button>
                         <button
                           onClick={() => handleOpenEditModal(client)}
                           className="p-3.5 bg-white border text-indigo-500 rounded-xl hover:text-indigo-700 hover:bg-indigo-50 transition-all shadow-sm"
                           title="Editar"
                         >
                           <Edit size={18} />
                         </button>
                         <button
                           onClick={() => handleDeleteClient(client)}
                           className="p-3.5 bg-white border text-red-400 rounded-xl hover:text-red-600 hover:bg-red-50 transition-all shadow-sm"
                           title="Excluir Cliente"
                         >
                           <Trash2 size={18} />
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
                       <ShieldCheck size={16} className="text-indigo-600" /> Responsáveis
                    </h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="bg-indigo-50/70 p-5 rounded-[24px] border border-indigo-100 space-y-3">
                        <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Responsáveis cadastrados</p>
                        {Array.isArray(viewingClient.guardians) && viewingClient.guardians.length > 0 ? viewingClient.guardians.map((g, idx) => (
                          <div key={idx} className="flex items-center gap-3 bg-white p-3 rounded-xl border border-indigo-100">
                            <div className="w-9 h-9 bg-indigo-600 text-white rounded-lg flex items-center justify-center font-black">{g.charAt(0)}</div>
                            <div>
                              <p className="text-xs font-black text-gray-800 uppercase">{g}</p>
                              <p className="text-[9px] font-bold text-indigo-400 uppercase">Responsável</p>
                            </div>
                          </div>
                        )) : (
                          <p className="text-[10px] font-black text-gray-400 uppercase">Nenhum responsável vinculado</p>
                        )}
                      </div>
                      <div className="bg-emerald-50/70 p-5 rounded-[24px] border border-emerald-100 space-y-2">
                        <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Contato principal</p>
                        {viewingClient.parentName && <InfoItem label="Nome" value={viewingClient.parentName} />}
                        {viewingClient.parentWhatsapp && <InfoItem label="WhatsApp" value={viewingClient.parentWhatsapp} />}
                        {viewingClient.parentEmail && <InfoItem label="E-mail" value={viewingClient.parentEmail} />}
                        {!viewingClient.parentName && !viewingClient.parentWhatsapp && !viewingClient.parentEmail && (
                          <p className="text-[10px] font-black text-gray-400 uppercase">Sem contato principal cadastrado</p>
                        )}
                      </div>
                    </div>
                 </section>

                 <section className="space-y-4">
                    <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-[4px] flex items-center gap-2 border-b pb-2">
                       <Beef size={16} className="text-indigo-600" /> Planos ativos (edição de dias)
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
                          const isCalendarOpen = openPlanCalendarId === plan.planId;
                          const requiredCount = requiredUnitsByPlanId.get(plan.planId) ?? activeDates.length;
                          const isPlanValid = activeDates.length === requiredCount;

                          return (
                            <div key={plan.planId} className="bg-white border border-gray-100 rounded-[28px] p-5 space-y-4">
                              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                <div>
                                  <p className="text-sm font-black text-gray-800 uppercase">{plan.planName}</p>
                                  <p className={`text-[10px] font-black uppercase tracking-widest ${isPlanValid ? 'text-emerald-600' : 'text-amber-600'}`}>
                                    Selecionado: {activeDates.length} • Necessário: {requiredCount}
                                  </p>
                                </div>
                                <button
                                  onClick={() => setOpenPlanCalendarId(isCalendarOpen ? null : plan.planId)}
                                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
                                    isCalendarOpen
                                      ? 'bg-indigo-600 border-indigo-600 text-white'
                                      : 'bg-white border-indigo-100 text-indigo-600 hover:bg-indigo-50'
                                  }`}
                                >
                                  {isCalendarOpen ? 'Ocultar calendário' : 'Editar datas'}
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
                                  <div className="grid grid-cols-7 gap-1.5">
                                    {['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'].map((label) => (
                                      <div key={`${plan.planId}-header-${label}`} className="text-center text-[9px] font-black text-gray-400 uppercase py-1">
                                        {label}
                                      </div>
                                    ))}
                                    {calendarGrid.map((dateCell, index) => {
                                      if (!dateCell) return <div key={`${plan.planId}-empty-${index}`} className="h-9" />;
                                      const dateKey = toDateKey(dateCell);
                                      const isAllowed = isServiceDateAllowed(dateCell);
                                      const isSelected = activeDates.includes(dateKey);
                                      const isAtLimit = activeDates.length >= requiredCount;
                                      const looksDisabledByLimit = !isSelected && isAtLimit;

                                      return (
                                        <button
                                          key={`${plan.planId}-date-${dateKey}`}
                                          type="button"
                                          disabled={!isAllowed}
                                          onClick={() => togglePlanDate(plan.planId, dateCell)}
                                          className={`h-9 rounded-lg text-[10px] font-black transition-all ${
                                            !isAllowed
                                              ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                                              : isSelected
                                                ? 'bg-indigo-600 text-white'
                                                : looksDisabledByLimit
                                                  ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
                                                  : 'bg-white text-gray-600 border border-gray-200 hover:border-indigo-300'
                                          }`}
                                        >
                                          <span className="inline-flex items-center justify-center relative w-full h-full">
                                            {dateCell.getDate()}
                                            {isSelected && (
                                              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-white text-indigo-700 text-[10px] leading-none flex items-center justify-center font-black border border-indigo-200">
                                                ×
                                              </span>
                                            )}
                                          </span>
                                        </button>
                                      );
                                    })}
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
                     setIsDetailModalOpen(false);
                   }}
                   className="px-8 py-4 text-xs font-black text-white uppercase tracking-[2px] bg-slate-600 hover:bg-slate-700 rounded-[20px] transition-colors text-center"
                 >
                   Fechar Perfil
                 </button>
                 <div className="flex-1 flex gap-4">
                    <button
                       onClick={handleSavePlanViewChanges}
                       disabled={isSavingPlanView || !isPlanAllocationValid}
                       className="flex-1 py-4 bg-indigo-700 text-white rounded-[20px] font-black uppercase tracking-[2px] text-xs shadow-xl shadow-indigo-100 hover:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 text-center"
                    >
                       <Check size={18} /> {isSavingPlanView ? 'Salvando...' : 'Salvar Planos'}
                    </button>
                    <button
                      onClick={() => {
                        setPlanViewNotice(null);
                        setIsDetailModalOpen(false);
                        setConsumptionPeriod('MONTH');
                        setConsumptionSpecificDate('');
                        setHistoryClient(viewingClient);
                        setIsHistoryModalOpen(true);
                      }}
                      className="flex-1 py-4 bg-cyan-600 border-2 border-cyan-600 text-white rounded-[20px] font-black uppercase tracking-[2px] text-xs shadow-sm hover:bg-cyan-700 transition-all flex items-center justify-center gap-2 text-center"
                    >
                       <History size={18} /> Ver Extrato Completo
                    </button>
                    <button
                       onClick={() => {
                         setPlanViewNotice(null);
                         handleOpenCreateStudentFromDetail();
                       }}
                       className="flex-1 py-4 bg-emerald-600 text-white rounded-[20px] font-black uppercase tracking-[2px] text-xs shadow-xl shadow-emerald-100 hover:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center gap-2 text-center"
                    >
                       <UserPlus size={18} /> Novo Aluno
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
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* MODAL DE CADASTRO (EXISTENTE) */}
      {isClientModalOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 animate-in fade-in">
           <div className="absolute inset-0 bg-indigo-950/60 backdrop-blur-sm" onClick={() => setIsClientModalOpen(false)}></div>
           <div className="relative w-full max-w-4xl bg-white rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[92vh]">
              
              <div className="bg-indigo-600 p-8 text-white flex items-center justify-between shrink-0 shadow-lg">
                 <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center"><UserPlus size={28} /></div>
                    <div>
                       <h2 className="text-xl font-black uppercase tracking-tight">{editingClient ? 'Editar Cliente' : 'Novo Cadastro de Cliente'}</h2>
                       <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest mt-0.5">
                         {editingClient ? 'Atualização de dados cadastrais e planos' : 'Gestão de perfil e carteira pré-paga'}
                       </p>
                    </div>
                 </div>
                 <button type="button" onClick={() => setIsClientModalOpen(false)} className="p-3 hover:bg-white/10 rounded-full transition-all"><X size={28} /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-10 space-y-12 scrollbar-hide">
                 {!showPaymentFlow ? (
                   <>
                     <div className="space-y-6">
                        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[4px] border-b pb-2 flex items-center gap-2"><UserIcon size={14} className="text-indigo-600"/> Dados Cadastrais</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <div className="space-y-1.5 md:col-span-2">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Nome Completo *</label>
                              <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-[24px] outline-none font-bold text-sm transition-all shadow-inner" />
                           </div>
                           <div className="space-y-1.5 md:col-span-2">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Foto do Cliente (Opcional)</label>
                              <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-[24px] p-4 flex flex-col md:flex-row md:items-center gap-4">
                                <img
                                  src={clientPhotoPreview || resolveClientPhotoUrl(formData.photo, formData.name)}
                                  className="w-20 h-20 rounded-2xl object-cover border-2 border-white shadow-sm"
                                />
                                <div className="flex-1 space-y-2">
                                  <label className="inline-flex items-center gap-2 px-4 py-2 bg-white border rounded-xl text-[10px] font-black uppercase tracking-widest text-indigo-600 cursor-pointer hover:bg-indigo-50 transition-all">
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
                                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                                      Arquivo: {clientPhotoFile.name}
                                    </p>
                                  )}
                                </div>
                              </div>
                           </div>
                           <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Tipo de Cadastro</label>
                              {isStudentOnlyMode ? (
                                <div className="w-full px-6 py-4 bg-emerald-50 border-2 border-emerald-200 rounded-[24px] font-bold text-sm text-emerald-700 uppercase tracking-widest">
                                  Aluno
                                </div>
                              ) : (
                                <select
                                  value={formData.type}
                                  onChange={e => {
                                    const newType = e.target.value as 'ALUNO' | 'COLABORADOR';
                                    setSelectedPlanDays({});
                                    setSelectedPlanDates({});
                                    setOpenPlanCalendarId(null);
                                    setCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
                                    setFormData({...formData, type: newType, servicePlans: ['PREPAGO']});
                                  }}
                                  className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-[24px] outline-none font-bold text-sm transition-all shadow-inner"
                                >
                                  <option value="ALUNO">Aluno</option>
                                  <option value="COLABORADOR">Colaborador</option>
                                </select>
                              )}
                           </div>
                           {formData.type === 'ALUNO' ? (
                             <>
                               <div className="space-y-1.5">
                                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Nível de Ensino</label>
                                  <select
                                    value={formData.classType}
                                    onChange={e => setFormData({...formData, classType: e.target.value as '' | 'INFANTIL' | 'FUNDAMENTAL' | 'MEDIO' | 'INTEGRAL', classGrade: ''})}
                                    className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-[24px] outline-none font-bold text-sm transition-all shadow-inner"
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
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Série / Ano</label>
                                    <select
                                      value={formData.classGrade}
                                      onChange={e => setFormData({...formData, classGrade: e.target.value})}
                                      className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-[24px] outline-none font-bold text-sm transition-all shadow-inner"
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
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Departamento / Área</label>
                                <input value={formData.class} onChange={e => setFormData({...formData, class: e.target.value})} className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-[24px] outline-none font-bold text-sm transition-all shadow-inner" />
                             </div>
                           )}
                           {formData.type === 'ALUNO' && (
                             <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Limite Diário (R$)</label>
                                <input type="number" value={formData.dailyLimit} onChange={e => setFormData({...formData, dailyLimit: Number(e.target.value)})} className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-[24px] outline-none font-bold text-sm transition-all shadow-inner" />
                             </div>
                           )}
                           <div className="space-y-1.5 md:col-span-2">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Restrição Alimentar</label>
                              <input
                                value={formData.restrictions.join(', ')}
                                onChange={e => {
                                  const parsed = e.target.value
                                    .split(',')
                                    .map(item => item.trim())
                                    .filter(Boolean);
                                  setFormData({ ...formData, restrictions: parsed });
                                }}
                                className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-[24px] outline-none font-bold text-sm transition-all shadow-inner"
                                placeholder="Ex: Lactose, Glúten, Amendoim"
                              />
                           </div>
                        </div>
                     </div>

                     <div className="space-y-6">
                        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[4px] border-b pb-2 flex items-center gap-2"><UserIcon size={14} className={formData.type === 'ALUNO' ? 'text-emerald-600' : 'text-blue-600'}/> {formData.type === 'ALUNO' ? 'Dados do Responsável' : 'Dados do Colaborador'}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <div className="space-y-1.5 md:col-span-2">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{formData.type === 'ALUNO' ? 'Nome do Pai/Responsável' : 'Nome do Colaborador'}</label>
                              <input value={formData.parentName} onChange={e => setFormData({...formData, parentName: e.target.value})} className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-[24px] outline-none font-bold text-sm transition-all shadow-inner" placeholder={formData.type === 'ALUNO' ? 'Nome completo do responsável' : 'Nome completo do colaborador'} />
                           </div>
                           <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{formData.type === 'ALUNO' ? 'WhatsApp do Responsável' : 'WhatsApp do Colaborador'}</label>
                              <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-3">
                                <select
                                  value={formData.parentWhatsappCountryCode}
                                  onChange={e => setFormData({...formData, parentWhatsappCountryCode: e.target.value})}
                                  className="w-full px-4 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-[24px] outline-none font-bold text-sm transition-all shadow-inner"
                                >
                                  {COUNTRY_OPTIONS.map((country) => (
                                    <option key={country.code} value={country.code}>
                                      {country.label} ({country.dial})
                                    </option>
                                  ))}
                                </select>
                                <input
                                  value={formData.parentWhatsapp}
                                  onChange={e => setFormData({...formData, parentWhatsapp: e.target.value})}
                                  className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-[24px] outline-none font-bold text-sm transition-all shadow-inner"
                                  placeholder="DDD + número"
                                />
                              </div>
                           </div>
                           <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{formData.type === 'ALUNO' ? 'CPF do Responsável' : 'CPF do Colaborador'}</label>
                              <input value={formData.parentCpf} onChange={e => setFormData({...formData, parentCpf: e.target.value})} className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-[24px] outline-none font-bold text-sm transition-all shadow-inner" placeholder="000.000.000-00" />
                           </div>
                           <div className="space-y-1.5 md:col-span-2">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{formData.type === 'ALUNO' ? 'E-mail do Responsável' : 'E-mail do Colaborador'}</label>
                              <input type="email" value={formData.parentEmail} onChange={e => setFormData({...formData, parentEmail: e.target.value})} className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-[24px] outline-none font-bold text-sm transition-all shadow-inner" placeholder="email@exemplo.com" />
                           </div>
                        </div>
                     </div>

                     <div className="space-y-6">
                        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[3px] border-b pb-2 flex items-center gap-2"><ShieldCheck size={14} className="text-indigo-600"/> {formData.type === 'ALUNO' ? 'Créditos e Planos' : 'Crédito para Colaborador'}</h3>
                        {formData.type === 'ALUNO' ? (
                          <>
                            <div className="grid grid-cols-1 gap-4">
                               <PlanToggleCard active={formData.servicePlans.includes('PREPAGO')} onClick={() => togglePlan('PREPAGO')} icon={<Wallet size={24} />} label="Carteira Pré-Paga" desc="Uso livre no caixa" color="indigo" />
                            </div>

                            {formData.servicePlans.includes('PREPAGO') && (
                              <div className="bg-emerald-50 p-8 rounded-[40px] border-2 border-emerald-100 animate-in zoom-in-95 text-center shadow-inner">
                                 <p className="text-[10px] font-black text-emerald-900 uppercase tracking-widest mb-4">Carga Inicial de Créditos</p>
                                 <div className="relative max-w-[240px] mx-auto">
                                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-black text-emerald-300">R$</span>
                                    <input 
                                      type="number" 
                                      value={formData.initialCredit || ''} 
                                      onChange={e => setFormData({...formData, initialCredit: parseFloat(e.target.value) || 0})}
                                      className="w-full pl-16 pr-6 py-5 bg-white border-2 border-emerald-200 rounded-[24px] outline-none text-3xl font-black text-emerald-600 text-center"
                                      placeholder="0,00"
                                    />
                                </div>
                              </div>
                            )}

                            <div className="space-y-4">
                              <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Planos Cadastrados para Matrícula</p>
                              {availablePlans.length > 0 ? (
                                <div className="space-y-4">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {availablePlans.map(plan => {
                                      const planSelected = Boolean(selectedPlanDays[plan.id]);
                                      const selectedDaysCount = selectedPlanDays[plan.id]?.length || 0;
                                      const selectedDatesCount = selectedPlanDates[plan.id]?.length || 0;
                                      const planSubtotal = plan.price * selectedDatesCount;
                                      const isCalendarOpen = openPlanCalendarId === plan.id;
                                      return (
                                        <div
                                          key={plan.id}
                                          className={`p-5 rounded-[24px] border-2 text-left transition-all ${planSelected ? 'bg-indigo-50 border-indigo-400 shadow-lg shadow-indigo-100' : 'bg-white border-gray-100 hover:border-indigo-200'}`}
                                        >
                                          <div className="flex items-start justify-between gap-4">
                                            <div>
                                              <p className="text-xs font-black text-gray-800 uppercase">{plan.name}</p>
                                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{plan.description || 'Plano de consumo'}</p>
                                            </div>
                                            <div className="text-right">
                                              <p className="text-lg font-black text-indigo-600">R$ {plan.price.toFixed(2)}</p>
                                              <p className="text-[9px] font-black text-gray-400 uppercase">por dia</p>
                                            </div>
                                          </div>
                                          <div className="mt-4 pt-4 border-t border-indigo-100 flex flex-wrap items-center gap-2">
                                            <button
                                              type="button"
                                              onClick={() => toggleCreatedPlan(plan.id)}
                                              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${planSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300'}`}
                                            >
                                              {planSelected ? 'Remover Plano' : 'Selecionar Plano'}
                                            </button>
                                            {planSelected && (
                                              <button
                                                type="button"
                                                onClick={() => setOpenPlanCalendarId(isCalendarOpen ? null : plan.id)}
                                                className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 bg-white border-indigo-200 text-indigo-600 hover:border-indigo-400 transition-all"
                                              >
                                                {isCalendarOpen ? 'Fechar Calendário' : 'Escolher Dias'}
                                              </button>
                                            )}
                                          </div>

                                          {planSelected && (
                                            <div className="mt-3">
                                              <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">
                                                {selectedDatesCount} dia(s) do mês selecionado(s) • Subtotal: R$ {planSubtotal.toFixed(2)}
                                              </p>
                                              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                                                {selectedDaysCount} dia(s) da semana marcado(s)
                                              </p>
                                              <div className="mt-3">
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">
                                                  Turnos de Entrega
                                                </p>
                                                <div className="flex flex-wrap gap-2">
                                                  {DELIVERY_SHIFT_OPTIONS.map(shift => {
                                                    const activeShift = (selectedPlanShifts[plan.id] || []).includes(shift.key);
                                                    return (
                                                      <label
                                                        key={`${plan.id}-shift-${shift.key}`}
                                                        className={`px-3 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-widest cursor-pointer transition-all ${
                                                          activeShift
                                                            ? 'bg-indigo-600 border-indigo-600 text-white'
                                                            : 'bg-white border-indigo-100 text-indigo-500 hover:border-indigo-300'
                                                        }`}
                                                      >
                                                        <input
                                                          type="checkbox"
                                                          className="sr-only"
                                                          checked={activeShift}
                                                          onChange={() => togglePlanShift(plan.id, shift.key)}
                                                        />
                                                        {shift.label}
                                                      </label>
                                                    );
                                                  })}
                                                </div>
                                              </div>
                                            </div>
                                          )}

                                          {planSelected && isCalendarOpen && (
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
                                                  const active = selectedPlanDays[plan.id]?.includes(day.key);
                                                  const isAllowedDay = allowedServiceDayKeySet.has(day.key);
                                                  return (
                                                    <button
                                                      type="button"
                                                      key={`${plan.id}-${day.key}`}
                                                      onClick={() => togglePlanDay(plan.id, day.key)}
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
                                                    {calendarMonthLabel}
                                                  </p>
                                                  <div className="flex items-center gap-2">
                                                    <button
                                                      type="button"
                                                      onClick={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                                                      className="w-8 h-8 rounded-lg border border-indigo-200 bg-white text-indigo-600 text-xs font-black"
                                                      title="Mês anterior"
                                                    >
                                                      {'<'}
                                                    </button>
                                                    <button
                                                      type="button"
                                                      onClick={() => setCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
                                                      className="px-2 h-8 rounded-lg border border-indigo-200 bg-white text-indigo-600 text-[9px] font-black uppercase tracking-widest"
                                                    >
                                                      Hoje
                                                    </button>
                                                    <button
                                                      type="button"
                                                      onClick={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
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
                                                      key={`${plan.id}-header-${day.key}`}
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

                                                <div className="grid grid-cols-7 gap-2">
                                                  {calendarGrid.map((dateCell, index) => {
                                                    if (!dateCell) {
                                                      return <div key={`${plan.id}-empty-${index}`} className="w-full h-9 rounded-lg bg-transparent" />;
                                                    }
                                                    const isAllowedDate = isServiceDateAllowed(dateCell);
                                                    const dateKey = toDateKey(dateCell);
                                                    const isSelected = (selectedPlanDates[plan.id] || []).includes(dateKey);
                                                    return (
                                                      <button
                                                        type="button"
                                                        key={`${plan.id}-${dateKey}`}
                                                        onClick={() => togglePlanDate(plan.id, dateCell)}
                                                        disabled={!isAllowedDate}
                                                        className={`w-full h-9 rounded-lg border text-[10px] font-black transition-all flex items-center justify-center text-center ${
                                                          !isAllowedDate
                                                            ? 'bg-gray-100 border-gray-200 text-gray-300 cursor-not-allowed'
                                                            : isSelected
                                                              ? 'bg-indigo-600 border-indigo-600 text-white'
                                                              : 'bg-white border-indigo-100 text-indigo-600 hover:border-indigo-300'
                                                        }`}
                                                      >
                                                        {dateCell.getDate()}
                                                      </button>
                                                    );
                                                  })}
                                                </div>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : (
                                <div className="bg-amber-50 border border-amber-100 rounded-[24px] p-4">
                                  <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">
                                    Nenhum plano ativo cadastrado para esta unidade.
                                  </p>
                                </div>
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="bg-blue-50 p-8 rounded-[40px] border-2 border-blue-100 shadow-inner space-y-4">
                            <p className="text-[10px] font-black text-blue-900 uppercase tracking-widest">Saldo para Pagamento ao Final do Mês</p>
                            <p className="text-sm text-blue-700 font-bold">O colaborador pagará suas despesas no final do mês</p>
                          </div>
                        )}
                     </div>
                   </>
                 ) : (
                   <div className="space-y-10 animate-in slide-in-from-right-10 text-center">
                      {formData.type === 'ALUNO' ? (
                        <>
                          <div className="w-24 h-24 bg-indigo-100 text-indigo-600 rounded-[32px] flex items-center justify-center mx-auto mb-4"><DollarSign size={48} /></div>
                          <h3 className="text-3xl font-black text-gray-800 uppercase tracking-tight">Pagamento de Matrícula</h3>
                          
                          <div className="bg-gray-900 rounded-[40px] p-8 text-white shadow-2xl relative overflow-hidden">
                             <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1 relative z-10">Total à Receber</p>
                             <p className="text-5xl font-black tracking-tighter relative z-10">R$ {totalToPay.toFixed(2)}</p>
                             <div className="mt-4 relative z-10 space-y-1">
                               {formData.servicePlans.includes('PREPAGO') && (
                                 <p className="text-[10px] font-black text-indigo-200 uppercase tracking-widest">
                                   Crédito Inicial: R$ {formData.initialCredit.toFixed(2)}
                                 </p>
                               )}
                               {selectedPlanConfigs.length > 0 && (
                                 <p className="text-[10px] font-black text-indigo-200 uppercase tracking-widest">
                                   Planos ({selectedPlanConfigs.length}): R$ {selectedPlansTotal.toFixed(2)}
                                 </p>
                               )}
                             </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                             <PaymentOptionCard active={paymentMethod === 'PIX'} onClick={() => setPaymentMethod('PIX')} icon={<QrCode size={24} />} label="Pix Online" desc="Liberação na hora" />
                             <PaymentOptionCard active={paymentMethod === 'CAIXA'} onClick={() => setPaymentMethod('CAIXA')} icon={<Smartphone size={24} />} label="Caixa Local" desc="Dinheiro ou Cartão" />
                             <PaymentOptionCard active={paymentMethod === 'BOLETO'} onClick={() => setPaymentMethod('BOLETO')} icon={<FileText size={24} />} label="Boleto Bancário" desc="Emissão instantânea" />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="w-24 h-24 bg-blue-100 text-blue-600 rounded-[32px] flex items-center justify-center mx-auto mb-4"><Wallet size={48} /></div>
                          <h3 className="text-3xl font-black text-gray-800 uppercase tracking-tight">Confirmação de Colaborador</h3>
                          
                          <div className="bg-blue-50 p-8 rounded-[40px] border-2 border-blue-100 space-y-4 text-center">
                             <p className="text-sm font-black text-blue-900 uppercase tracking-widest">Cadastro de Colaborador</p>
                             <p className="text-base text-blue-700 font-bold">O colaborador não possui saldo inicial</p>
                             <p className="text-[10px] text-blue-600 italic">Suas despesas serão cobradas ao final do mês</p>
                          </div>

                          <div className="bg-blue-50 p-8 rounded-[40px] border-2 border-blue-100 space-y-3">
                             <p className="text-sm font-black text-blue-900 uppercase tracking-widest">Resumo do Cadastro</p>
                             <div className="space-y-2 text-left">
                                <p className="text-xs text-gray-700"><span className="font-black text-blue-600">Nome:</span> {formData.parentName || 'Não informado'}</p>
                                <p className="text-xs text-gray-700"><span className="font-black text-blue-600">CPF:</span> {formData.parentCpf || 'Não informado'}</p>
                                <p className="text-xs text-gray-700"><span className="font-black text-blue-600">Departamento:</span> {formData.class || 'Não informado'}</p>
                             </div>
                          </div>
                        </>
                      )}
                   </div>
                 )}
              </div>

              <div className="p-8 bg-gray-50 border-t flex gap-4 shrink-0 shadow-[0_-15px_45px_rgba(0,0,0,0.05)]">
                 {!showPaymentFlow ? (
                   <>
                     <button type="button" onClick={() => setIsClientModalOpen(false)} className="flex-1 py-5 text-xs font-black text-gray-400 uppercase tracking-widest">Descartar</button>
                     {editingClient ? (
                       <button
                         disabled={!formData.name}
                         onClick={handleFinishRegistration}
                         className="flex-[2] py-5 bg-indigo-600 text-white rounded-[24px] font-black uppercase tracking-widest text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-30 active:scale-95 transition-all flex items-center justify-center gap-3"
                       >
                         <CheckCircle2 size={22} /> Salvar Alterações
                       </button>
                     ) : (
                       <button 
                         disabled={!formData.name}
                         onClick={() => setShowPaymentFlow(true)} 
                         className="flex-[2] py-5 bg-indigo-600 text-white rounded-[24px] font-black uppercase tracking-widest text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-30 active:scale-95 transition-all flex items-center justify-center gap-3"
                       >
                         Próxima Etapa <ArrowRight size={22} />
                       </button>
                     )}
                   </>
                 ) : (
                   <>
                     <button type="button" onClick={() => setShowPaymentFlow(false)} className="flex-1 py-5 text-xs font-black text-gray-400 uppercase tracking-widest flex items-center justify-center gap-2"><ChevronLeft size={18}/> Voltar</button>
                     <button 
                       onClick={handleFinishRegistration}
                       className="flex-[2] py-5 bg-indigo-900 text-white rounded-[24px] font-black uppercase tracking-widest text-sm shadow-xl hover:bg-black active:scale-95 transition-all flex items-center justify-center gap-3"
                     >
                        <CheckCircle2 size={22} /> {formData.type === 'COLABORADOR' ? 'Confirmar Cadastro de Colaborador' : (paymentMethod === 'CAIXA' ? 'Finalizar e Receber no Caixa' : 'Confirmar e Gerar Cobrança')}
                     </button>
                   </>
                 )}
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
                       <ShoppingCart size={16} className="text-emerald-600" />
                       <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Pré-pago Cantina (Saldo Livre)</h3>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                       {[20, 50, 100, 200].map(amount => (
                          <button 
                             key={amount}
                             onClick={() => handleQuickRecharge(amount)}
                             className="py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl font-black text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 transition-all active:scale-95"
                          >
                             R$ {amount.toFixed(2)}
                          </button>
                       ))}
                    </div>
                    <div className="relative">
                       <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-black">R$</span>
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
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Valor por Dia</p>
                            <p className="text-xs font-black text-indigo-700">R$ {rechargeSelectedPlanSummary.unitPrice.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Dias Selecionados</p>
                            <p className="text-xs font-black text-indigo-700">{rechargeSelectedPlanSummary.selectedCount} dia(s)</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Total</p>
                            <p className="text-sm font-black text-emerald-700">R$ {rechargeSelectedPlanSummary.subtotal.toFixed(2)}</p>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                       {plans.filter(p => p.enterpriseId === activeEnterprise.id).map(plan => {
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
                                 <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mt-0.5">Valor por dia</p>
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
                                   {isCalendarOpen ? 'Fechar Calendário' : 'Escolher Dias'}
                                 </button>
                               )}
                             </div>

                             {isSelected && (
                               <div className="mt-3">
                                 <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">
                                   {selectedDatesCount} dia(s) do mês selecionado(s) • Subtotal: R$ {subtotal.toFixed(2)}
                                 </p>
                                 <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                                   {selectedDaysCount} dia(s) da semana marcado(s)
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

                                   <div className="grid grid-cols-7 gap-2">
                                     {rechargeCalendarGrid.map((dateCell, index) => {
                                       if (!dateCell) {
                                         return <div key={`${plan.id}-recharge-empty-${index}`} className="w-full h-9 rounded-lg bg-transparent" />;
                                       }
                                       const isAllowedDate = isServiceDateAllowed(dateCell);
                                       const dateKey = toDateKey(dateCell);
                                       const isSelectedDate = (rechargePlanDates[plan.id] || []).includes(dateKey);
                                       return (
                                         <button
                                           type="button"
                                           key={`${plan.id}-recharge-${dateKey}`}
                                           onClick={() => toggleRechargePlanDate(plan.id, dateCell)}
                                           disabled={!isAllowedDate}
                                           className={`w-full h-9 rounded-lg border text-[10px] font-black transition-all flex items-center justify-center text-center ${
                                             !isAllowedDate
                                               ? 'bg-gray-100 border-gray-200 text-gray-300 cursor-not-allowed'
                                               : isSelectedDate
                                                 ? 'bg-indigo-600 border-indigo-600 text-white'
                                                 : 'bg-white border-indigo-100 text-indigo-600 hover:border-indigo-300'
                                           }`}
                                         >
                                           {dateCell.getDate()}
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

const PlanToggleCard = ({ active, onClick, icon, label, desc, color }: any) => {
  const colorMap: any = {
    indigo: active ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-lg ring-4 ring-indigo-500/10' : 'border-gray-100 bg-white text-gray-400',
    orange: active ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-lg ring-4 ring-orange-500/10' : 'border-gray-100 bg-white text-gray-400',
  };
  return (
    <button type="button" onClick={onClick} className={`p-6 rounded-[32px] border-2 flex flex-col items-center text-center gap-2 transition-all relative overflow-hidden group ${colorMap[color]}`}>
      <div className={`p-4 rounded-2xl transition-all ${active ? 'bg-white shadow-sm' : 'bg-gray-50'}`}>{icon}</div>
      <div>
        <p className="text-[11px] font-black uppercase tracking-tight leading-none">{label}</p>
        <p className="text-[9px] font-bold opacity-60 mt-1">{desc}</p>
      </div>
      <div className={`absolute top-3 right-3 w-5 h-5 rounded-full border flex items-center justify-center transition-all ${active ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' : 'bg-white border-gray-200 text-transparent'}`}><Check size={12} strokeWidth={4} /></div>
    </button>
  );
};

const PaymentOptionCard = ({ active, onClick, icon, label, desc }: any) => (
  <button type="button" onClick={onClick} className={`p-6 rounded-[32px] border-2 flex flex-col items-center text-center gap-2 transition-all relative group ${active ? 'border-indigo-600 bg-indigo-50 shadow-xl ring-4 ring-indigo-500/10' : 'border-gray-100 bg-white text-gray-400 hover:border-indigo-200'}`}>
    <div className={`p-4 rounded-2xl transition-all ${active ? 'bg-white shadow-sm text-indigo-600' : 'bg-gray-50 text-gray-300'}`}>{icon}</div>
    <div>
      <p className={`text-xs font-black uppercase tracking-tight leading-none ${active ? 'text-indigo-900' : ''}`}>{label}</p>
      <p className="text-[9px] font-bold opacity-60 mt-1">{desc}</p>
    </div>
  </button>
);

export default ClientsPage;
