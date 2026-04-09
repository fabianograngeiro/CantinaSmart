
import React, { useState, useMemo, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Enterprise, TransactionRecord, Client, Plan } from '../types';
import { 
  Truck, Calendar, Clock, Search, 
  User, CheckCircle2, AlertCircle, Sparkles,
  UtensilsCrossed, Sandwich, Download, 
  Printer, Sun, Sunset, Moon, ListFilter,
  HeartPulse, Info, Beef, Check,
  Timer, Utensils, ClipboardCheck, Loader2,
  FileText, Undo2, X
} from 'lucide-react';
import ApiService from '../services/api';
import { formatPhoneWithFlag } from '../utils/phone';
import { extractSchoolCalendarOperationalData } from '../utils/schoolCalendar';
import { drawEnterpriseLogoOnPdf } from '../utils/enterpriseBranding';

type PeriodFilter = 'ALL' | 'MORNING' | 'AFTERNOON' | 'NIGHT';
type DeliveryStatus = 'PENDENTE' | 'PREPARANDO' | 'PRONTO' | 'SERVIDO';
type SearchFieldFilter = 'NAME' | 'RESPONSIBLE' | 'PLAN' | 'CLASS' | 'STATUS';
type DeliveryScheduleOrigin = 'SELECTED_DATES' | 'DAYS_OF_WEEK';

const JS_DAY_TO_KEY: Record<number, string> = {
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

const normalizeDayKey = (rawDay?: string): string => {
  const normalized = String(rawDay || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  for (const [canonical, aliases] of Object.entries(DAY_KEY_ALIASES)) {
    if (aliases.some((alias) => normalizeDayKeyAlias(alias) === normalized)) return canonical;
  }
  return normalized;
};

const normalizeDayKeyAlias = (value?: string) =>
  String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

const getDayKeyFromDateIso = (dateIso?: string): string => {
  if (!dateIso) return '';
  const parsed = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return '';
  return JS_DAY_TO_KEY[parsed.getDay()] || '';
};

const getServiceContext = (openingHours?: Record<string, any>, now: Date = new Date()) => {
  const dayKey = JS_DAY_TO_KEY[now.getDay()];
  const hoursConfig = openingHours || {};
  const dayAlias = DAY_KEY_ALIASES[dayKey]?.find((alias) => hoursConfig[alias as keyof typeof hoursConfig] !== undefined);
  const dayConfig: any = dayAlias ? hoursConfig[dayAlias as keyof typeof hoursConfig] : undefined;

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const todayIso = today.toISOString().split('T')[0];
  const tomorrowIso = tomorrow.toISOString().split('T')[0];

  let isWithinServiceHours = true;
  if (dayConfig?.closed) {
    isWithinServiceHours = false;
  } else if (dayConfig?.close && typeof dayConfig.close === 'string') {
    const [closeHour, closeMinute] = String(dayConfig.close).split(':').map(Number);
    if (Number.isFinite(closeHour) && Number.isFinite(closeMinute)) {
      const closeAt = new Date(now);
      closeAt.setHours(closeHour, closeMinute, 0, 0);
      isWithinServiceHours = now <= closeAt;
    }
  }

  return {
    todayIso,
    tomorrowIso,
    isWithinServiceHours,
    shouldRollToTomorrow: !isWithinServiceHours,
  };
};

const toLocalDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

interface DeliveryItem {
  id: string;
  type: 'ALMOCO' | 'LANCHE';
  name: string;
  components: { name: string; checked: boolean }[];
  status: DeliveryStatus;
}

interface DeliveryProfile {
  id: string;
  clientId: string;
  planId: string;
  name: string;
  responsibleName: string;
  photo: string;
  class: string;
  year: string;
  registrationId: string;
  balance: number;
  scheduledPeriod: PeriodFilter;
  scheduledDay: 'TODAY' | 'TOMORROW';
  scheduledDate?: string; // Adicionado Data Específica
  scheduleOrigin: DeliveryScheduleOrigin;
  restrictions: string[];
  dietaryNotes: string;
  description: string;
  planName: string;
  planUnitValue?: number;
  planProgressConsumed: number;
  planProgressTotal: number;
  items: DeliveryItem[];
}

interface DailyDeliveryPageProps {
  activeEnterprise?: Enterprise;
  onRegisterTransaction?: (transaction: TransactionRecord) => void;
}

const DailyDeliveryPage: React.FC<DailyDeliveryPageProps> = ({ activeEnterprise, onRegisterTransaction }) => {
  // Guard clause: se não houver enterprise ativa, retornar carregamento
  if (!activeEnterprise) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full"></div>
          <p className="text-gray-600 dark:text-zinc-300 font-medium">Carregando entrega...</p>
        </div>
      </div>
    );
  }

  const [selectedDays, setSelectedDays] = useState<('TODAY')[]>(['TODAY']);
  const [customDate, setCustomDate] = useState<string>('');
  const [selectedPlans, setSelectedPlans] = useState<string[]>([]);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('ALL');
  const [searchFieldFilter, setSearchFieldFilter] = useState<SearchFieldFilter>('NAME');
  const [searchTerm, setSearchTerm] = useState('');
  const [nowTick, setNowTick] = useState<number>(Date.now());

  // Estado local para gerenciar a preparação dos alunos
  const [students, setStudents] = useState<DeliveryProfile[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);
  const [reverseTarget, setReverseTarget] = useState<DeliveryProfile | null>(null);
  const [reverseMode, setReverseMode] = useState<'OPEN' | 'RESCHEDULE'>('OPEN');
  const [reverseDate, setReverseDate] = useState('');
  const [isReversingDelivery, setIsReversingDelivery] = useState(false);
  const [schoolCalendarBlockedDatesByYear, setSchoolCalendarBlockedDatesByYear] = useState<Record<number, string[]>>({});

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowTick(Date.now()), 30000);
    return () => window.clearInterval(intervalId);
  }, []);

  const serviceContext = useMemo(
    () => getServiceContext(activeEnterprise?.openingHours, new Date(nowTick)),
    [activeEnterprise?.openingHours, nowTick]
  );

  const schoolCalendarYearsToLoad = useMemo(() => {
    const years = [
      new Date().getFullYear(),
      customDate ? Number(String(customDate).slice(0, 4)) : NaN,
      reverseDate ? Number(String(reverseDate).slice(0, 4)) : NaN,
    ].filter((year) => Number.isFinite(year));
    return Array.from(new Set(years));
  }, [customDate, reverseDate]);

  useEffect(() => {
    setSchoolCalendarBlockedDatesByYear({});
  }, [activeEnterprise?.id]);

  useEffect(() => {
    const enterpriseId = String(activeEnterprise?.id || '').trim();
    if (!enterpriseId) return;

    const missingYears = schoolCalendarYearsToLoad.filter((year) => schoolCalendarBlockedDatesByYear[year] === undefined);
    if (missingYears.length === 0) return;

    let cancelled = false;

    const loadSchoolCalendarYears = async () => {
      const results = await Promise.all(
        missingYears.map(async (year) => {
          try {
            const payload = await ApiService.getSchoolCalendar(enterpriseId, year);
            const { blockedDates } = extractSchoolCalendarOperationalData(payload, year);

            return [year, blockedDates] as const;
          } catch (error) {
            console.error(`Erro ao carregar calendário escolar (${year}):`, error);
            return [year, []] as const;
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
    };

    void loadSchoolCalendarYears();

    return () => {
      cancelled = true;
    };
  }, [activeEnterprise?.id, schoolCalendarYearsToLoad, schoolCalendarBlockedDatesByYear]);

  const schoolCalendarBlockedDateSetByYear = useMemo(() => {
    return Object.entries(schoolCalendarBlockedDatesByYear).reduce((acc, [yearKey, dates]) => {
      acc[Number(yearKey)] = new Set(Array.isArray(dates) ? dates : []);
      return acc;
    }, {} as Record<number, Set<string>>);
  }, [schoolCalendarBlockedDatesByYear]);

  const isSchoolDateAllowed = (dateIso?: string) => {
    const key = String(dateIso || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
    const year = Number(key.slice(0, 4));
    const blocked = schoolCalendarBlockedDateSetByYear[year];
    return !(blocked?.has(key));
  };

  const isCustomDateBlocked = Boolean(customDate) && !isSchoolDateAllowed(customDate);
  const isReverseDateBlocked = reverseMode === 'RESCHEDULE' && Boolean(reverseDate) && !isSchoolDateAllowed(reverseDate);

  useEffect(() => {
    const enterpriseId = activeEnterprise?.id;
    if (!enterpriseId) {
      setStudents([]);
      return;
    }

    const mapShiftToPeriod = (shift: string): PeriodFilter | null => {
      const normalized = String(shift || '').toUpperCase();
      if (normalized === 'MORNING' || normalized === 'MANHA' || normalized === 'MANHÃ') return 'MORNING';
      if (normalized === 'AFTERNOON' || normalized === 'TARDE') return 'AFTERNOON';
      if (normalized === 'NIGHT' || normalized === 'NOITE') return 'NIGHT';
      return null;
    };

    const loadDeliveryProfiles = async () => {
      try {
        const [clientsData, plansData, transactionsData] = await Promise.all([
          ApiService.getClients(enterpriseId),
          ApiService.getPlans(enterpriseId),
          ApiService.getTransactions({ enterpriseId }),
        ]);

        const clients = (Array.isArray(clientsData) ? clientsData : []) as Client[];
        const plans = (Array.isArray(plansData) ? plansData : []) as Plan[];
        const transactions = Array.isArray(transactionsData) ? transactionsData : [];
        const activePlans = plans.filter(plan => plan.isActive !== false);
        const planById = new Map(activePlans.map(plan => [plan.id, plan]));
        const planByName = new Map(activePlans.map(plan => [String(plan.name).trim().toUpperCase(), plan]));
        const blockedPlanNames = new Set(['PREPAGO', 'PRÉ-PAGO', 'PRE-PAGO', 'PF_FIXO', 'LANCHE_FIXO']);
        const normalizePlanName = (value?: string) => String(value || '').trim().toUpperCase();
        const normalizeDateIso = (value?: string) => {
          const dateKey = String(value || '').slice(0, 10);
          return /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : '';
        };

        const deliveryBalanceByKey = new Map<string, number>();
        const manuallyDeletedDeliveryKeys = new Set<string>();
        const autoFinalizeQueue = new Map<string, {
          clientId: string;
          clientName: string;
          enterpriseId: string;
          planName: string;
          scheduledDate: string;
        }>();
        const processingProfile = (activeEnterprise as any)?.planConsumptionProcessingProfile || {};
        const processingEnabled = processingProfile?.enabled !== false;
        const processingPlanIds = new Set(
          Array.isArray(processingProfile?.planIds)
            ? processingProfile.planIds.map((id: any) => String(id || '').trim()).filter(Boolean)
            : []
        );
        const cutoffRaw = String(processingProfile?.cutoffTime || '').trim();
        const cutoffTime = /^([01]\d|2[0-3]):([0-5]\d)$/.test(cutoffRaw) ? cutoffRaw : '18:00';
        const [cutoffHour, cutoffMinute] = cutoffTime.split(':').map(Number);
        const nowRuntime = new Date();
        const isPastDeliveryCutoff = (dateIso: string) => {
          const base = new Date(`${dateIso}T00:00:00`);
          base.setHours(cutoffHour, cutoffMinute, 0, 0);
          if (Number.isNaN(base.getTime())) return false;
          return nowRuntime.getTime() > base.getTime();
        };

        transactions.forEach((tx: any) => {
          const type = String(tx?.type || '').toUpperCase();
          if (type === 'AUDITORIA_EXCLUSAO') {
            const deletedKeys = Array.isArray(tx?.deletedDeliveryKeys) ? tx.deletedDeliveryKeys : [];
            deletedKeys.forEach((rawKey: any) => {
              const normalized = String(rawKey || '').trim().toUpperCase();
              if (normalized) manuallyDeletedDeliveryKeys.add(normalized);
            });
          }

          const description = String(tx?.description || '').toLowerCase();
          const isDelivery = description.includes('entrega do dia');
          if (!isDelivery) return;

          const clientId = String(tx?.clientId || '').trim();
          const planName = normalizePlanName(tx?.plan || tx?.planName || tx?.item || '');
          const deliveryDate = normalizeDateIso(tx?.deliveryDate || tx?.scheduledDate || tx?.mealDate || tx?.date);
          if (!clientId || !planName || !deliveryDate) return;

          const key = `${clientId}|${planName}|${deliveryDate}`;
          const current = Number(deliveryBalanceByKey.get(key) || 0);
          const isReversal = description.includes('estorno') || type === 'CREDITO';
          deliveryBalanceByKey.set(key, isReversal ? current - 1 : current + 1);
        });

        const currentContext = getServiceContext(activeEnterprise?.openingHours, new Date());

        const deliveryProfiles: DeliveryProfile[] = clients
          .filter(client => client.type === 'ALUNO')
          .flatMap((client) => {
            const selectedPlans = (((client as any).selectedPlansConfig || []) as Array<any>);
            const validSelectedPlans = selectedPlans.filter((config: any) => {
              const planId = String(config?.planId || '');
              const planName = String(config?.planName || '');
              const plan = planById.get(planId) || planByName.get(planName.toUpperCase());
              const normalizedPlanName = String(plan?.name || planName || '').trim().toUpperCase();

              // Entrega do dia deve exibir apenas planos ativos cadastrados no Admin.
              if (!plan) return false;
              if (blockedPlanNames.has(normalizedPlanName)) return false;
              return true;
            });

            const fromSelectedConfig = validSelectedPlans.flatMap((config: any, idx: number) => {
              const planId = String(config?.planId || '');
              const planName = String(config?.planName || '');
              const plan = planById.get(planId) || planByName.get(planName.toUpperCase());
              const selectedDates = Array.from(
                new Set(
                  ((Array.isArray(config?.selectedDates) ? config.selectedDates : []) as string[])
                    .map((date) => normalizeDateIso(date))
                    .filter((date) => Boolean(date) && isSchoolDateAllowed(date))
                )
              ) as string[];
              const daysOfWeekRaw = (Array.isArray(config?.daysOfWeek) ? config.daysOfWeek : []) as string[];
              const daysOfWeek = daysOfWeekRaw
                .map((day) => normalizeDayKey(day))
                .filter(Boolean);
              const daysOfWeekSet = new Set(daysOfWeek);
              const deliveryShifts = (Array.isArray(config?.deliveryShifts) ? config.deliveryShifts : []) as string[];
              const normalizedPeriods = deliveryShifts
                .map(mapShiftToPeriod)
                .filter(Boolean) as PeriodFilter[];
              const effectivePeriods: PeriodFilter[] = normalizedPeriods.length > 0 ? normalizedPeriods : ['ALL'];

              const candidateDates = [currentContext.todayIso, currentContext.tomorrowIso, customDate]
                .filter((dateIso) => Boolean(dateIso) && isSchoolDateAllowed(dateIso)) as string[];
              const datesByWeekDay = candidateDates.filter((dateIso) => {
                if (daysOfWeekSet.size === 0) return false;
                const dayKey = getDayKeyFromDateIso(dateIso);
                return Boolean(dayKey) && daysOfWeekSet.has(dayKey);
              });

              const scheduleDates = selectedDates.length > 0
                ? selectedDates
                : Array.from(new Set(datesByWeekDay));
              const scheduleOrigin: DeliveryScheduleOrigin = selectedDates.length > 0 ? 'SELECTED_DATES' : 'DAYS_OF_WEEK';

              if (scheduleDates.length === 0) return [];

              const planNameUpper = normalizePlanName(plan?.name || planName || 'PLANO');
              const progressReferenceDates = selectedDates.length > 0 ? selectedDates : scheduleDates;
              const configuredTotalUnits = selectedDates.length > 0 ? selectedDates.length : daysOfWeek.length;

              const rows = scheduleDates.flatMap((dateKey, dateIndex) => {
                const scheduledDate = dateKey;
                const scheduledDay: 'TODAY' | 'TOMORROW' = scheduledDate === currentContext.todayIso ? 'TODAY' : 'TOMORROW';
                const deliveredKey = `${client.id}|${planNameUpper}|${scheduledDate}`;
                const deliveredForDate = Number(deliveryBalanceByKey.get(deliveredKey) || 0) > 0;
                const isMarkedAsManuallyDeleted = manuallyDeletedDeliveryKeys.has(deliveredKey.toUpperCase());
                const currentPlanId = String(plan?.id || planId || '').trim();
                const isPlanIncludedInProfile = processingPlanIds.size === 0 || (currentPlanId && processingPlanIds.has(currentPlanId));
                const shouldAutoFinalizeByCutoff = processingEnabled && isPlanIncludedInProfile && !deliveredForDate && !isMarkedAsManuallyDeleted && isPastDeliveryCutoff(scheduledDate);
                if (shouldAutoFinalizeByCutoff) {
                  autoFinalizeQueue.set(deliveredKey, {
                    clientId: String(client.id),
                    clientName: String(client.name || ''),
                    enterpriseId: String(activeEnterprise.id),
                    planName: String(plan?.name || planName || 'PLANO'),
                    scheduledDate,
                  });
                  deliveryBalanceByKey.set(deliveredKey, 1);
                }
                const isServed = deliveredForDate || shouldAutoFinalizeByCutoff;

                return effectivePeriods.map((period, periodIndex) => ({
                  id: `${client.id}-${plan?.id || planName || idx}-${dateIndex}-${periodIndex}`,
                  clientId: client.id,
                  planId: String(plan?.id || planId || ''),
                  name: client.name,
                  responsibleName: String(
                    client.parentName
                    || (client as any).guardianName
                    || (Array.isArray((client as any).guardians) ? (client as any).guardians[0] : '')
                    || ''
                  ).trim() || '-',
                  photo: client.photo || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(client.name)}`,
                  class: (client.class || '').split(' - ')[1] || client.class || 'Sem turma',
                  year: (client.class || '').split(' - ')[0] || 'Aluno',
                  registrationId: client.registrationId || client.id,
                  balance: Number(client.balance || 0),
                  scheduledPeriod: period,
                  scheduledDay,
                  scheduledDate,
                  scheduleOrigin,
                  restrictions: client.restrictions || [],
                  dietaryNotes: client.dietaryNotes || '',
                  description: plan?.description || planName || 'Plano sem descrição',
                  planName: plan?.name || planName || 'PLANO',
                  planUnitValue: Number(plan?.price || config?.planPrice || 0),
                  items: [{
                    id: `item-${client.id}-${plan?.id || planName || idx}-${dateIndex}-${periodIndex}`,
                    type: 'ALMOCO' as const,
                    name: plan?.name || planName || 'Plano',
                    components: (plan?.items || []).map(i => ({ name: i.name, checked: isServed })),
                    status: (isServed ? 'SERVIDO' : 'PENDENTE') as DeliveryStatus,
                  }],
                }));
              });

              const consumedUnits = progressReferenceDates.reduce((sum, dateIso) => {
                const deliveredKey = `${client.id}|${planNameUpper}|${dateIso}`;
                return sum + (Number(deliveryBalanceByKey.get(deliveredKey) || 0) > 0 ? 1 : 0);
              }, 0);
              const safeTotal = Math.max(0, Number(configuredTotalUnits || 0));
              const safeConsumed = Math.max(0, safeTotal > 0 ? Math.min(consumedUnits, safeTotal) : consumedUnits);
              const resolvedTotal = Math.max(safeTotal, safeConsumed);

              return rows.map((row) => ({
                ...row,
                planProgressConsumed: safeConsumed,
                planProgressTotal: resolvedTotal,
              }));
            });

            return fromSelectedConfig;
          });

        if (autoFinalizeQueue.size > 0) {
          const finalizeNow = new Date();
          const finalizeTime = finalizeNow.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          await Promise.all(
            Array.from(autoFinalizeQueue.values()).map((entry) =>
              ApiService.createTransaction({
                clientId: entry.clientId,
                clientName: entry.clientName,
                enterpriseId: entry.enterpriseId,
                type: 'CONSUMO',
                amount: 0,
                description: `Entrega do dia - ${entry.planName} - ${entry.planName} - ${entry.scheduledDate}`,
                item: entry.planName,
                paymentMethod: 'PLANO',
                method: 'PLANO',
                timestamp: finalizeNow.toISOString(),
                date: entry.scheduledDate,
                deliveryDate: entry.scheduledDate,
                time: finalizeTime,
                status: 'CONCLUIDA',
                executionSource: 'SISTEMA',
                plan: entry.planName,
              }).catch((error) => {
                console.error(`Erro ao auto-finalizar entrega por vencimento (${cutoffTime}):`, error);
              })
            )
          );
        }

        setStudents(deliveryProfiles);
      } catch (error) {
        console.error('Erro ao carregar dados de entrega do dia:', error);
        setStudents([]);
      }
    };

    loadDeliveryProfiles();
  }, [activeEnterprise?.id, activeEnterprise?.openingHours, customDate, refreshTick, schoolCalendarBlockedDatesByYear]);

  const filteredData = useMemo(() => {
    const getStudentStatus = (student: DeliveryProfile): DeliveryStatus => {
      if (student.items.every((i) => i.status === 'SERVIDO')) return 'SERVIDO';
      if (student.items.some((i) => i.status === 'PRONTO')) return 'PRONTO';
      if (student.items.some((i) => i.status === 'PREPARANDO')) return 'PREPARANDO';
      return 'PENDENTE';
    };

    const normalize = (value: string) =>
      String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();

    return students.filter(d => {
      const searchValue = normalize(searchTerm);
      const statusLabel = getStudentStatus(d);
      const searchTarget = (() => {
        if (searchFieldFilter === 'RESPONSIBLE') return normalize(d.responsibleName);
        if (searchFieldFilter === 'PLAN') return normalize(d.planName);
        if (searchFieldFilter === 'CLASS') return normalize(`${d.year} ${d.class}`);
        if (searchFieldFilter === 'STATUS') return normalize(statusLabel);
        return normalize(`${d.name} ${d.registrationId}`);
      })();

      const matchesSearch = !searchValue || searchTarget.includes(searchValue);
      const matchesPeriod = periodFilter === 'ALL' || d.scheduledPeriod === periodFilter;
      const matchesDay = (() => {
        if (customDate) {
          if (!serviceContext.isWithinServiceHours && customDate <= serviceContext.todayIso) return false;
          return d.scheduledDate === customDate;
        }

        if (selectedDays.length === 0) return true;

        return selectedDays.some((day) => {
          if (day !== 'TODAY') return false;
          if (!serviceContext.isWithinServiceHours) return false;
          return d.scheduledDate === serviceContext.todayIso;
        });
      })();
      const matchesPlan = selectedPlans.length === 0 || selectedPlans.includes(d.planName);
      return matchesSearch && matchesPeriod && matchesDay && matchesPlan;
    }).sort((a, b) => {
      const byName = String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR', { sensitivity: 'base' });
      if (byName !== 0) return byName;
      const aDate = String(a.scheduledDate || '');
      const bDate = String(b.scheduledDate || '');
      if (aDate !== bDate) return aDate.localeCompare(bDate);
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
  }, [students, searchTerm, searchFieldFilter, periodFilter, selectedDays, selectedPlans, customDate, serviceContext]);

  const availablePlanNames = useMemo(() => {
    return Array.from(new Set(students.map(s => s.planName))).filter(Boolean);
  }, [students]);

  const toggleComponent = (studentId: string, itemId: string, componentName: string) => {
    setStudents(prev => prev.map(s => {
      if (s.id !== studentId) return s;
      return {
        ...s,
        items: s.items.map(item => {
          if (item.id !== itemId) return item;
          const newComponents = item.components.map(c => 
            c.name === componentName ? { ...c, checked: !c.checked } : c
          );
          
          // Se todos os componentes forem marcados, muda status para PRONTO automaticamente
          const allChecked = newComponents.every(c => c.checked);
          const status: DeliveryStatus = allChecked ? 'PRONTO' : 'PREPARANDO';
          
          return { ...item, components: newComponents, status: item.status === 'SERVIDO' ? 'SERVIDO' : status };
        })
      };
    }));
  };

  const serveStudent = async (studentId: string) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;
    const itemsToServe = student.items.filter(item => item.status !== 'SERVIDO');
    if (itemsToServe.length === 0) return;

    setStudents(prev => {
      let wasPromotedToServed = false;
      const normalizedTargetPlan = String(student.planName || '').trim().toUpperCase();
      const targetPlanId = String(student.planId || '').trim();

      const nextRows = prev.map(s => {
        if (s.id !== studentId) return s;
        const alreadyServed = s.items.every(item => item.status === 'SERVIDO');
        if (!alreadyServed) wasPromotedToServed = true;
        return {
          ...s,
          items: s.items.map(item => ({ ...item, status: 'SERVIDO' }))
        };
      });

      if (!wasPromotedToServed) return nextRows;

      return nextRows.map((row) => {
        const sameClient = String(row.clientId || '') === String(student.clientId || '');
        const rowPlanId = String(row.planId || '').trim();
        const rowPlanName = String(row.planName || '').trim().toUpperCase();
        const samePlan = (targetPlanId && rowPlanId && rowPlanId === targetPlanId)
          || rowPlanName === normalizedTargetPlan;
        if (!sameClient || !samePlan) return row;

        const currentConsumed = Math.max(0, Number(row.planProgressConsumed || 0));
        const currentTotal = Math.max(0, Number(row.planProgressTotal || 0));
        const nextConsumed = currentTotal > 0 ? Math.min(currentTotal, currentConsumed + 1) : currentConsumed + 1;

        return {
          ...row,
          planProgressConsumed: nextConsumed,
          planProgressTotal: Math.max(currentTotal, nextConsumed),
        };
      });
    });

    const now = new Date();
    const method = 'PLANO';
    const status = 'CONCLUIDA';
    const transactionDate = student.scheduledDate || now.toISOString().split('T')[0];
    const transactionTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    try {
      await Promise.all(itemsToServe.map((item) =>
        ApiService.createTransaction({
          clientId: student.clientId,
          clientName: student.name,
          enterpriseId: activeEnterprise.id,
          type: 'CONSUMO',
          amount: 0,
          description: `Entrega do dia - ${student.planName} - ${item.name} - ${student.scheduledDate || transactionDate}`,
          item: item.name,
          paymentMethod: method,
          method,
          timestamp: now.toISOString(),
          date: transactionDate,
          deliveryDate: student.scheduledDate || transactionDate,
          time: transactionTime,
          status,
          executionSource: 'USUARIO',
          plan: student.planName,
          planId: student.planId,
          planUnitValue: Number(student.planUnitValue || 0) > 0 ? Number(student.planUnitValue || 0) : undefined,
          planUnits: 1,
        })
      ));
    } catch (error) {
      console.error('Erro ao registrar transação de entrega do dia:', error);
    }

    if (onRegisterTransaction) {
      itemsToServe.forEach(item => {
        onRegisterTransaction({
          id: `DEL-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
          time: transactionTime,
          date: transactionDate,
          client: student.name,
          plan: student.planName,
          item: item.name,
          type: 'CONSUMO',
          method,
          value: 0,
          status: 'CONCLUIDA'
        });
      });
    }
  };

  const openReverseModal = (student: DeliveryProfile) => {
    const todayKey = toLocalDateKey(new Date());
    const fallbackDate = student.scheduledDate && student.scheduledDate >= todayKey
      ? student.scheduledDate
      : todayKey;
    setReverseTarget(student);
    setReverseMode('OPEN');
    setReverseDate(fallbackDate);
  };

  const closeReverseModal = () => {
    if (isReversingDelivery) return;
    setReverseTarget(null);
    setReverseMode('OPEN');
    setReverseDate('');
  };

  const reverseServeStudent = async (studentId: string, options?: { rescheduleDate?: string }) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;
    const servedItems = student.items.filter(item => item.status === 'SERVIDO');
    if (servedItems.length === 0) return;

    const requestedRescheduleDate = String(options?.rescheduleDate || '').slice(0, 10);
    const willReschedule = /^\d{4}-\d{2}-\d{2}$/.test(requestedRescheduleDate);

    setIsReversingDelivery(true);

    try {
      setStudents(prev => {
        let wasReversed = false;
        const normalizedTargetPlan = String(student.planName || '').trim().toUpperCase();
        const targetPlanId = String(student.planId || '').trim();

        const nextRows = prev.map(s => {
          if (s.id !== studentId) return s;
          const hadServedItems = s.items.some(item => item.status === 'SERVIDO');
          if (hadServedItems) wasReversed = true;
          return {
            ...s,
            items: s.items.map(item => ({
              ...item,
              status: 'PENDENTE',
              components: item.components.map(c => ({ ...c, checked: false })),
            }))
          };
        });

        if (!wasReversed) return nextRows;

        return nextRows.map((row) => {
          const sameClient = String(row.clientId || '') === String(student.clientId || '');
          const rowPlanId = String(row.planId || '').trim();
          const rowPlanName = String(row.planName || '').trim().toUpperCase();
          const samePlan = (targetPlanId && rowPlanId && rowPlanId === targetPlanId)
            || rowPlanName === normalizedTargetPlan;
          if (!sameClient || !samePlan) return row;

          const currentConsumed = Math.max(0, Number(row.planProgressConsumed || 0));
          return {
            ...row,
            planProgressConsumed: Math.max(0, currentConsumed - 1),
          };
        });
      });

      const now = new Date();
      const transactionDate = student.scheduledDate || toLocalDateKey(now);
      const transactionTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      await Promise.all(servedItems.map((item) =>
        ApiService.createTransaction({
          clientId: student.clientId,
          clientName: student.name,
          enterpriseId: activeEnterprise.id,
          type: 'CREDITO',
          amount: 0,
          description: willReschedule
            ? `Estorno entrega do dia - ${student.planName} - ${item.name} - ${student.scheduledDate || transactionDate} (crédito aberto • reagendar para ${requestedRescheduleDate})`
            : `Estorno entrega do dia - ${student.planName} - ${item.name} - ${student.scheduledDate || transactionDate} (crédito aberto)`,
          item: item.name,
          paymentMethod: 'PLANO',
          method: 'PLANO',
          timestamp: now.toISOString(),
          date: transactionDate,
          deliveryDate: student.scheduledDate || transactionDate,
          time: transactionTime,
          status: 'CONCLUIDA',
          executionSource: 'USUARIO',
          plan: student.planName,
          planId: student.planId,
          planUnitValue: Number(student.planUnitValue || 0) > 0 ? Number(student.planUnitValue || 0) : undefined,
          planUnits: 1,
          selectedDates: willReschedule ? [requestedRescheduleDate] : [],
        })
      ));

      if (willReschedule) {
        const latestClient = await ApiService.getClient(student.clientId);
        const selectedPlansRaw = (latestClient as any)?.selectedPlansConfig;
        const selectedPlans = Array.isArray(selectedPlansRaw) ? [...selectedPlansRaw] : [];
        const normalizedTargetPlanName = String(student.planName || '').trim().toUpperCase();
        const targetPlanId = String(student.planId || '').trim();
        let matched = false;

        const updatedSelectedPlans = selectedPlans.map((config: any) => {
          const configPlanId = String(config?.planId || '').trim();
          const configPlanName = String(config?.planName || '').trim().toUpperCase();
          const isSamePlan = (
            Boolean(targetPlanId) && Boolean(configPlanId) && targetPlanId === configPlanId
          ) || (
            Boolean(configPlanName) && configPlanName === normalizedTargetPlanName
          );
          if (!isSamePlan) return config;
          matched = true;

          const currentDates = Array.isArray(config?.selectedDates) ? config.selectedDates : [];
          const normalizedCurrentDates = Array.from(
            new Set(
              currentDates
                .map((date: string) => String(date || '').slice(0, 10))
                .filter((date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date))
            )
          );
          const withoutOldDate = student.scheduledDate
            ? normalizedCurrentDates.filter((date: string) => date !== student.scheduledDate)
            : normalizedCurrentDates;
          const nextDates = Array.from(new Set([...withoutOldDate, requestedRescheduleDate])).sort();

          return {
            ...config,
            selectedDates: nextDates,
          };
        });

        const nextSelectedPlans = matched
          ? updatedSelectedPlans
          : [
              ...updatedSelectedPlans,
              {
                planId: targetPlanId || `plan_${String(student.planName || 'PLANO').toLowerCase().replace(/\s+/g, '_')}`,
                planName: student.planName,
                selectedDates: [requestedRescheduleDate],
                daysOfWeek: [],
                deliveryShifts: [],
              }
            ];

        await ApiService.updateClient(student.clientId, {
          selectedPlansConfig: nextSelectedPlans,
        });
      }

      if (onRegisterTransaction) {
        servedItems.forEach(item => {
          onRegisterTransaction({
            id: `EST-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
            time: transactionTime,
            date: transactionDate,
            client: student.name,
            plan: student.planName,
            item: item.name,
            type: 'CREDITO',
            method: 'PLANO',
            value: 0,
            status: 'CONCLUIDA'
          });
        });
      }

    } catch (error) {
      console.error('Erro ao registrar estorno de entrega do dia:', error);
      alert('Não foi possível concluir o estorno. Tente novamente.');
    } finally {
      setRefreshTick((prev) => prev + 1);
      setIsReversingDelivery(false);
    }
  };

  const handleConfirmReverse = async () => {
    if (!reverseTarget || isReversingDelivery) return;
    if (reverseMode === 'RESCHEDULE' && !/^\d{4}-\d{2}-\d{2}$/.test(reverseDate)) {
      alert('Selecione uma nova data válida para reagendamento.');
      return;
    }
    if (reverseMode === 'RESCHEDULE' && !isSchoolDateAllowed(reverseDate)) {
      alert('A data escolhida não é letiva (feriado/recesso). Selecione um dia com aula.');
      return;
    }
    await reverseServeStudent(reverseTarget.id, {
      rescheduleDate: reverseMode === 'RESCHEDULE' ? reverseDate : '',
    });
    closeReverseModal();
  };

  const resetPreparation = (studentId: string) => {
    setStudents(prev => prev.map(s => {
      if (s.id !== studentId) return s;
      return {
        ...s,
        items: s.items.map(item => ({ 
          ...item, 
          status: 'PENDENTE', 
          components: item.components.map(c => ({ ...c, checked: false })) 
        }))
      };
    }));
  };

  const planSummary = useMemo(() => {
    return filteredData.reduce((acc, student) => {
      student.items.forEach(item => {
        acc[item.type] = (acc[item.type] || 0) + 1;
      });
      return acc;
    }, {} as Record<string, number>);
  }, [filteredData]);

  const planCreatedSummary = useMemo(() => {
    const totals = new Map<string, number>();

    filteredData.forEach((student) => {
      const rawPlanName = String(student.planName || '').trim();
      if (!rawPlanName) return;
      const displayPlanName = rawPlanName.replace(/_/g, ' ').toUpperCase();
      const units = Array.isArray(student.items) && student.items.length > 0 ? student.items.length : 1;
      totals.set(displayPlanName, (totals.get(displayPlanName) || 0) + units);
    });

    return Array.from(totals.entries())
      .map(([planName, count]) => ({ planName, count }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.planName.localeCompare(b.planName, 'pt-BR');
      });
  }, [filteredData]);

  const exportToPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const generatedAt = new Date();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 12;
    const logoSize = 12;
    const logoX = marginX;
    const logoY = 5.7;

    const sanitizePlanName = (value?: string) => String(value || 'PLANO').replace(/_/g, ' ').toUpperCase();
    const periodLabel = periodFilter === 'ALL' ? 'Todos' : periodFilter === 'MORNING' ? 'Manhã' : periodFilter === 'AFTERNOON' ? 'Tarde' : 'Noite';
    const plansLabel = selectedPlans.length > 0 ? selectedPlans.map((p) => p.replace(/_/g, ' ')).join(', ') : 'Todos';
    const dayLabel = customDate
      ? new Date(`${customDate}T00:00:00`).toLocaleDateString('pt-BR')
      : new Date().toLocaleDateString('pt-BR');

    const totalStudents = filteredData.length;
    const servedStudents = filteredData.filter((student) => student.items.every((item) => item.status === 'SERVIDO')).length;
    const pendingStudents = totalStudents - servedStudents;
    const servedRate = totalStudents > 0 ? ((servedStudents / totalStudents) * 100) : 0;

    const planStats = new Map<string, { scheduled: number; served: number }>();
    filteredData.forEach((student) => {
      const planName = sanitizePlanName(student.planName);
      const current = planStats.get(planName) || { scheduled: 0, served: 0 };
      current.scheduled += 1;
      if (student.items.every((item) => item.status === 'SERVIDO')) current.served += 1;
      planStats.set(planName, current);
    });

    const topPlansSummary = Array.from(planStats.entries())
      .sort((a, b) => b[1].scheduled - a[1].scheduled || a[0].localeCompare(b[0], 'pt-BR'))
      .slice(0, 4)
      .map(([planName, stats]) => `${planName}: ${stats.served}/${stats.scheduled}`)
      .join('  |  ');

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 24, 'F');
    drawEnterpriseLogoOnPdf(doc, String(activeEnterprise?.logo || '').trim(), logoX, logoY, logoSize, 'CS');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('RELATÓRIO ESCOLAR • CARDÁPIO DO DIA', marginX + logoSize + 3, 10.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(activeEnterprise?.name || 'CantinaSmart', marginX + logoSize + 3, 16.8);
    doc.text(`Emitido em ${generatedAt.toLocaleDateString('pt-BR')} ${generatedAt.toLocaleTimeString('pt-BR')}`, pageWidth - marginX, 16.8, { align: 'right' });

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(marginX, 28, pageWidth - (marginX * 2), 21, 2, 2, 'FD');
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(`Escola: ${activeEnterprise?.attachedSchoolName || '-'}`, marginX + 3, 33.8);
    doc.text(`Data da produção: ${dayLabel}`, pageWidth - marginX - 3, 33.8, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.4);
    const enterpriseInfo = [
      activeEnterprise?.address ? `Endereço: ${activeEnterprise.address}` : null,
      activeEnterprise?.phone1 ? `WhatsApp: ${formatPhoneWithFlag(activeEnterprise.phone1, '-')}` : null,
    ].filter(Boolean).join('  |  ');
    doc.text(enterpriseInfo || '-', marginX + 3, 38.6);
    doc.text(`Filtros: Turno ${periodLabel} | Planos ${plansLabel}`, marginX + 3, 43.3);

    const metricStartY = 53;
    const metricGap = 3;
    const metricW = (pageWidth - (marginX * 2) - (metricGap * 3)) / 4;
    const metricH = 14;
    const metrics = [
      { label: 'ALUNOS NO DIA', value: `${totalStudents}` },
      { label: 'SERVIDOS', value: `${servedStudents}` },
      { label: 'PENDENTES', value: `${pendingStudents}` },
      { label: 'TAXA DE ENTREGA', value: `${servedRate.toFixed(1).replace('.', ',')}%` },
    ];
    metrics.forEach((metric, index) => {
      const cardX = marginX + (index * (metricW + metricGap));
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(cardX, metricStartY, metricW, metricH, 1.8, 1.8, 'FD');
      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.2);
      doc.text(metric.label, cardX + 2.3, metricStartY + 4.3);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11.2);
      doc.text(metric.value, cardX + 2.3, metricStartY + 10.6);
    });

    doc.setFillColor(247, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(marginX, 70, pageWidth - (marginX * 2), 11, 1.8, 1.8, 'FD');
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.4);
    doc.text('Resumo dos planos (servidos/programados):', marginX + 2.5, 76.3);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    const topPlansText = topPlansSummary || 'Sem planos para o período selecionado.';
    doc.text(doc.splitTextToSize(topPlansText, pageWidth - (marginX * 2) - 86).slice(0, 2), marginX + 61, 76.3);

    const tableRows = filteredData.map((student) => {
      const consumed = Math.max(0, Number(student.planProgressConsumed || 0));
      const total = Math.max(Number(student.planProgressTotal || 0), consumed, 0);
      const status = student.items.every((item) => item.status === 'SERVIDO') ? 'SERVIDO' : 'PENDENTE';
      return [
        student.registrationId || '-',
        student.name || '-',
        `${student.year || '-'} - ${student.class || '-'}`,
        `${sanitizePlanName(student.planName)} • ${consumed}/${total}`,
        student.scheduledDate ? new Date(`${student.scheduledDate}T00:00:00`).toLocaleDateString('pt-BR') : '-',
        status,
      ];
    });

    autoTable(doc, {
      head: [['Matrícula', 'Aluno', 'Ano/Turma', 'Plano e Progresso', 'Data', 'Status']],
      body: tableRows,
      startY: 84,
      theme: 'grid',
      styles: { fontSize: 8.1, cellPadding: 2.8, textColor: [30, 41, 59], lineColor: [226, 232, 240], lineWidth: 0.2 },
      headStyles: { fillColor: [30, 64, 175], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 24 },
        1: { cellWidth: 54 },
        2: { cellWidth: 40 },
        3: { cellWidth: 92 },
        4: { cellWidth: 26, halign: 'center' },
        5: { cellWidth: 24, halign: 'center', fontStyle: 'bold' },
      },
      didParseCell: (hookData) => {
        if (hookData.section !== 'body' || hookData.column.index !== 5) return;
        const status = String(hookData.cell.raw || '').toUpperCase();
        if (status === 'SERVIDO') {
          hookData.cell.styles.textColor = [22, 101, 52];
          hookData.cell.styles.fillColor = [220, 252, 231];
        } else {
          hookData.cell.styles.textColor = [154, 52, 18];
          hookData.cell.styles.fillColor = [255, 237, 213];
        }
      },
    });

    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i += 1) {
      doc.setPage(i);
      doc.setDrawColor(226, 232, 240);
      doc.line(marginX, pageHeight - 12, pageWidth - marginX, pageHeight - 12);
      doc.setTextColor(120, 120, 120);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(`Página ${i} de ${pageCount}`, marginX, pageHeight - 7.8);
      doc.text(`Relatório interno escolar • ${activeEnterprise?.name || 'Unidade'}`, pageWidth - marginX, pageHeight - 7.8, { align: 'right' });
    }

    doc.save(`cardapio_dia_${activeEnterprise?.name || 'unidade'}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="dash-shell daily-delivery-shell space-y-3 animate-in fade-in duration-500 bg-gray-50 dark:bg-zinc-900/50">
      
      {/* HEADER OPERACIONAL - FOCO EM COZINHA */}
      <header className="flex flex-col xl:flex-row xl:items-end justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-indigo-600 rounded-xl text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-900/40">
              <Truck size={22} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-zinc-100 tracking-tight leading-none uppercase">
                Esteira de Produção
              </h1>
              <p className="text-gray-500 dark:text-zinc-400 text-[8px] sm:text-[9px] font-black uppercase tracking-[0.14em] mt-1 opacity-80">
                Logística em Tempo Real • Expedição Canteen Pro
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
           <div className="bg-white dark:bg-[#121214] px-3 py-2 rounded-xl border border-gray-100 dark:border-white/10 dark:ring-1 dark:ring-white/5 flex items-center gap-4 shadow-sm">
              <div className="text-center">
                 <p className="text-[8px] font-black text-gray-400 dark:text-zinc-400 uppercase tracking-[0.12em]">Pendentes</p>
                 <p className="text-base font-black text-indigo-600">{students.filter(s => s.items.some(i => i.status === 'PENDENTE')).length}</p>
              </div>
              <div className="w-px h-8 bg-gray-100 dark:bg-white/10"></div>
              <div className="text-center">
                 <p className="text-[8px] font-black text-gray-400 dark:text-zinc-400 uppercase tracking-[0.12em]">Servidos</p>
                 <p className="text-base font-black text-emerald-600">{students.filter(s => s.items.every(i => i.status === 'SERVIDO')).length}</p>
              </div>
           </div>
           <button onClick={exportToPDF} className="bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 transition-all shadow-md dark:shadow-indigo-900/40 flex items-center gap-1.5 font-black text-[9px] uppercase tracking-[0.12em]">
             <FileText size={13} /> Exportar PDF
           </button>
           <button onClick={() => window.print()} className="bg-white dark:bg-[#121214] border border-gray-100 dark:border-white/10 p-2 rounded-lg text-gray-400 hover:text-indigo-600 transition-all shadow-sm dark:ring-1 dark:ring-white/5">
             <Printer size={14} />
           </button>
        </div>
      </header>

      {/* PAINEL DE CONTROLE DE FILTROS - OTIMIZADO PARA TURNOS */}
      <div className="bg-white dark:bg-[#121214] p-3 rounded-[22px] border border-gray-100 dark:border-white/10 shadow-xl dark:ring-1 dark:ring-white/5 space-y-3">
         <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            
            {/* 1. SELEÇÃO DE DIA (MULTI-SELEÇÃO) */}
            <div className="lg:col-span-4 space-y-2">
               <label className="text-[9px] font-black text-gray-400 dark:text-zinc-400 uppercase tracking-[0.12em] ml-2 flex items-center gap-1.5">
                  <Calendar size={12} className="text-indigo-600"/> Dias de Referência
               </label>
               <div className="flex gap-2">
                  <div className="flex flex-1 gap-1.5 bg-gray-100 dark:bg-zinc-900 p-1 rounded-xl border border-transparent dark:border-white/10">
                    <button
                      key="TODAY"
                      onClick={() => {
                        setSelectedDays(prev =>
                          prev.includes('TODAY') ? prev.filter(d => d !== 'TODAY') : ['TODAY']
                        );
                      }}
                      className={`flex-1 py-1.5 rounded-lg font-black text-[9px] uppercase tracking-[0.12em] transition-all ${
                        selectedDays.includes('TODAY')
                          ? 'bg-indigo-600 text-white shadow-lg'
                          : 'text-gray-400 hover:text-gray-600 dark:text-zinc-400 dark:hover:text-zinc-200'
                      }`}
                    >
                      Hoje
                    </button>
                  </div>
                  <div className="relative flex-1">
                    <input 
                      type="date"
                      value={customDate}
                      onChange={(e) => {
                        const nextDate = e.target.value;
                        if (nextDate && !isSchoolDateAllowed(nextDate)) {
                          alert('Dia sem aula (feriado/recesso) não está disponível para entrega.');
                          return;
                        }
                        setCustomDate(nextDate);
                      }}
                      className={`w-full pl-10 pr-3 py-2 rounded-xl font-black text-[9px] uppercase tracking-[0.12em] border transition-all outline-none ${
                        customDate 
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' 
                        : 'bg-white dark:bg-[#121214] border-gray-100 dark:border-white/10 text-gray-400 dark:text-zinc-300 hover:border-indigo-100 dark:hover:border-indigo-400/50'
                      }`}
                    />
                    <Calendar size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${customDate ? 'text-white' : 'text-indigo-600'}`} />
                  </div>
               </div>
               {isCustomDateBlocked && (
                 <p className="text-[9px] font-black uppercase tracking-[0.12em] text-rose-600 ml-2">
                   Dia não letivo: feriado/recesso
                 </p>
               )}
            </div>

            {/* 1.5 SELEÇÃO DE PLANO (MULTI-SELEÇÃO) */}
            <div className="lg:col-span-4 space-y-2">
               <label className="text-[9px] font-black text-gray-400 dark:text-zinc-400 uppercase tracking-[0.12em] ml-2 flex items-center gap-1.5">
                  <Sparkles size={12} className="text-indigo-600"/> Planos Ativos
               </label>
               <div className="flex flex-wrap gap-2">
                  {availablePlanNames.map((plan) => (
                    <button
                      key={plan}
                      onClick={() => {
                        setSelectedPlans(prev => 
                          prev.includes(plan) 
                          ? prev.filter(p => p !== plan) 
                          : [...prev, plan]
                        );
                      }}
                      className={`px-2.5 py-1.5 rounded-lg font-black text-[8px] uppercase tracking-[0.12em] border transition-all ${
                        selectedPlans.includes(plan)
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg'
                        : 'bg-white dark:bg-[#121214] border-gray-100 dark:border-white/10 text-gray-400 dark:text-zinc-300 hover:border-emerald-100 dark:hover:border-emerald-400/40'
                      }`}
                    >
                      {plan.replace('_', ' ')}
                    </button>
                  ))}
               </div>
            </div>

            {/* 2. FILTRO POR TURNO - O MAIS IMPORTANTE NA COZINHA */}
            <div className="lg:col-span-4 space-y-2">
               <label className="text-[9px] font-black text-gray-400 dark:text-zinc-400 uppercase tracking-[0.12em] ml-2 flex items-center gap-1.5">
                  <Clock size={12} className="text-indigo-600"/> Filtrar por Turno de Preparo
               </label>
               <div className="grid grid-cols-4 gap-2">
                  <PeriodButton active={periodFilter === 'ALL'} onClick={() => setPeriodFilter('ALL')} icon={<ListFilter size={14}/>} label="Todos" />
                  <PeriodButton active={periodFilter === 'MORNING'} onClick={() => setPeriodFilter('MORNING')} icon={<Sun size={14}/>} label="Manhã" />
                  <PeriodButton active={periodFilter === 'AFTERNOON'} onClick={() => setPeriodFilter('AFTERNOON')} icon={<Sunset size={14}/>} label="Tarde" />
                  <PeriodButton active={periodFilter === 'NIGHT'} onClick={() => setPeriodFilter('NIGHT')} icon={<Moon size={14}/>} label="Noite" />
               </div>
            </div>

            {/* 3. BUSCA POR ALUNO */}
            <div className="lg:col-span-12 space-y-2">
               <label className="text-[9px] font-black text-gray-400 dark:text-zinc-400 uppercase tracking-[0.12em] ml-2 flex items-center gap-1.5">
                  <User size={12} className="text-indigo-600"/> Pesquisa e Período
               </label>
               <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <select
                    value={searchFieldFilter}
                    onChange={(e) => setSearchFieldFilter(e.target.value as SearchFieldFilter)}
                    className="px-3 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-transparent dark:border-white/10 focus:border-indigo-500 rounded-xl outline-none font-semibold text-xs transition-all"
                  >
                    <option value="NAME">Por nome</option>
                    <option value="RESPONSIBLE">Por responsável</option>
                    <option value="PLAN">Por tipo de plano</option>
                    <option value="CLASS">Por turma</option>
                    <option value="STATUS">Por status</option>
                  </select>

                  <div className="relative md:col-span-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      placeholder={
                        searchFieldFilter === 'RESPONSIBLE'
                          ? 'Digite o nome do responsável...'
                          : searchFieldFilter === 'PLAN'
                            ? 'Digite o tipo de plano...'
                            : searchFieldFilter === 'CLASS'
                              ? 'Digite a turma...'
                              : searchFieldFilter === 'STATUS'
                                ? 'Ex: pendente, pronto, servido...'
                                : 'Nome ou matrícula do aluno...'
                      }
                      className="w-full pl-9 pr-3 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-transparent dark:border-white/10 focus:border-indigo-500 rounded-xl outline-none font-semibold text-xs transition-all"
                    />
                  </div>

               </div>
            </div>
         </div>
      </div>

      {/* RESUMO POR PLANO */}
      <div className="flex gap-2 overflow-x-auto pb-1">
         <div className="min-w-[150px] bg-amber-50 dark:bg-amber-500/10 p-3 rounded-xl border border-amber-100 dark:border-amber-400/30 shadow-sm flex items-center justify-between">
            <div>
               <p className="text-[8px] font-black text-amber-600 uppercase tracking-[0.12em]">Total Lanches</p>
               <p className="text-base font-black text-amber-900 dark:text-amber-300">{planSummary['LANCHE'] || 0}</p>
            </div>
            <div className="p-2 bg-white dark:bg-[#121214] rounded-lg text-amber-500 shadow-sm"><Sandwich size={14}/></div>
         </div>
         <div className="min-w-[150px] bg-emerald-50 dark:bg-emerald-500/10 p-3 rounded-xl border border-emerald-100 dark:border-emerald-400/30 shadow-sm flex items-center justify-between">
            <div>
               <p className="text-[8px] font-black text-emerald-600 uppercase tracking-[0.12em]">Total Almoços</p>
               <p className="text-base font-black text-emerald-900 dark:text-emerald-300">{planSummary['ALMOCO'] || 0}</p>
            </div>
            <div className="p-2 bg-white dark:bg-[#121214] rounded-lg text-emerald-500 shadow-sm"><Beef size={14}/></div>
         </div>
      
        {planCreatedSummary.length === 0 ? (
          <div className="min-w-[320px] bg-white dark:bg-[#121214] p-4 rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm dark:ring-1 dark:ring-white/5">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">
              Nenhum plano selecionado para soma no período/filtro atual.
            </p>
          </div>
        ) : (
          planCreatedSummary.map((plan) => (
            <div
              key={plan.planName}
              className="min-w-[200px] bg-indigo-50 dark:bg-indigo-500/10 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-400/30 shadow-sm flex items-center justify-between"
            >
              <div>
                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Total {plan.planName}</p>
                <p className="text-xl font-black text-indigo-900 dark:text-indigo-300">{plan.count}</p>
              </div>
              <div className="p-2.5 bg-white dark:bg-[#121214] rounded-xl text-indigo-500 shadow-sm">
                <ClipboardCheck size={20} />
              </div>
            </div>
          ))
        )}
      </div>

      {/* ESTEIRA DE PRODUÇÃO - LISTA DETALHADA */}
      <div className="bg-white dark:bg-[#121214] rounded-[22px] border border-gray-100 dark:border-white/10 shadow-xl dark:ring-1 dark:ring-white/5 overflow-hidden">
         <div className="overflow-x-auto">
            <table className="w-full table-fixed text-left border-collapse min-w-[760px]">
               <thead>
                  <tr className="bg-gray-50 dark:bg-zinc-900 border-b border-gray-100 dark:border-white/10">
                     <th className="px-2 py-2.5 text-[9px] font-black text-gray-400 uppercase tracking-[0.12em] w-[150px]">Aluno / Matrícula</th>
                     <th className="pl-2 pr-0.5 py-2.5 text-[9px] font-black text-gray-400 uppercase tracking-[0.12em] w-[98px]">Ano / Turma</th>
                     <th className="pl-0.5 pr-2 py-2.5 text-[9px] font-black text-gray-400 uppercase tracking-[0.12em] w-[96px]">Plano</th>
                     <th className="px-2 py-2.5 text-[9px] font-black text-gray-400 uppercase tracking-[0.12em] w-[108px]">Data Refeição</th>
                     <th className="pl-2 pr-0.5 py-2.5 text-[9px] font-black text-gray-400 uppercase tracking-[0.12em] w-[72px]">Restrições</th>
                     <th className="pl-0.5 pr-0.5 py-2.5 text-[9px] font-black text-gray-400 uppercase tracking-[0.12em] w-[68px]">Status</th>
                     <th className="pl-0.5 pr-0.5 py-2.5 text-[9px] font-black text-gray-400 uppercase tracking-[0.12em] text-left w-[72px]">Ações</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-gray-50 dark:divide-white/10">
                  {filteredData.map((student, idx) => {
                     const allServiced = student.items.every(i => i.status === 'SERVIDO');
                     const hasReadyItem = student.items.some(i => i.status === 'PRONTO');
                     const someAllergy = student.restrictions.length > 0;

                     return (
                        <tr key={student.id} className={`group transition-all hover:bg-gray-50/70 dark:hover:bg-indigo-500/10 ${idx % 2 === 1 ? 'bg-gray-50/30 dark:bg-zinc-900/30' : ''} ${allServiced ? 'opacity-70' : ''}`}>
                           <td className="px-2 py-2 w-[150px]">
                              <div className="flex items-center gap-2">
                                 <img src={student.photo} className="w-8 h-8 rounded-xl object-cover border-2 border-white dark:border-zinc-800 shadow-sm" />
                                 <div className="min-w-0">
                                    <p className="text-xs font-black text-gray-800 uppercase tracking-tight truncate">{student.name}</p>
                                    <p className="text-[9px] font-bold text-indigo-600 uppercase tracking-tighter">Mat: #{student.registrationId}</p>
                                 </div>
                              </div>
                           </td>
                           <td className="pl-2 pr-0.5 py-2 w-[98px]">
                              <div className="space-y-0.5">
                                 <p className="text-[11px] font-black text-gray-700 uppercase">{student.year}</p>
                                 <span className="text-[9px] font-black text-indigo-500 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-100 dark:border-indigo-400/30 uppercase">Turma {student.class}</span>
                              </div>
                           </td>
                           <td className="pl-0.5 pr-2 py-2 w-[96px] min-w-[96px]">
                              <div className="inline-flex flex-col items-start gap-0.5">
                                <span className={`text-[10px] font-black px-3 py-1 rounded-full border uppercase ${
                                  student.planName === 'PF_FIXO' ? 'bg-orange-50 dark:bg-orange-500/10 text-orange-600 border-orange-100 dark:border-orange-400/30' :
                                  student.planName === 'LANCHE_FIXO' ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 border-amber-100 dark:border-amber-400/30' :
                                  'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 border-indigo-100 dark:border-indigo-400/30'
                                }`}>
                                  {student.planName.replace('_', ' ')}
                                </span>
                                <span className="text-[9px] font-black text-indigo-600 dark:text-indigo-300 uppercase tracking-tight">
                                  {Math.max(0, Number(student.planProgressConsumed || 0))}/{Math.max(Number(student.planProgressTotal || 0), Number(student.planProgressConsumed || 0), 0)}
                                </span>
                              </div>
                           </td>
                           <td className="px-2 py-2 w-[108px]">
                              <div className="inline-flex flex-col items-center gap-0.5">
                                <span className="text-[10px] font-black px-3 py-1 rounded-full border border-cyan-100 dark:border-cyan-400/30 bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 uppercase tracking-widest">
                                  {student.scheduledDate ? new Date(`${student.scheduledDate}T00:00:00`).toLocaleDateString('pt-BR') : '-'}
                                </span>
                                <span className="text-[9px] font-black text-cyan-700 dark:text-cyan-300 uppercase tracking-widest">
                                  {student.scheduledDate
                                    ? new Date(`${student.scheduledDate}T00:00:00`)
                                      .toLocaleDateString('pt-BR', { weekday: 'long' })
                                      .normalize('NFD')
                                      .replace(/[\u0300-\u036f]/g, '')
                                      .toUpperCase()
                                    : '-'}
                                </span>
                                <span
                                  className={`text-[8px] font-black uppercase tracking-wider ${
                                    student.scheduleOrigin === 'SELECTED_DATES'
                                      ? 'text-indigo-600 dark:text-indigo-300'
                                      : 'text-amber-600 dark:text-amber-300'
                                  }`}
                                  title={student.scheduleOrigin === 'SELECTED_DATES'
                                    ? 'Origem: Datas selecionadas no plano'
                                    : 'Origem: Dia da semana configurado no plano'}
                                >
                                  {student.scheduleOrigin === 'SELECTED_DATES' ? 'Origem: Datas' : 'Origem: Semana'}
                                </span>
                              </div>
                           </td>
                           <td className="pl-2 pr-0.5 py-2 w-[72px]">
                              <div className="flex flex-wrap gap-1.5">
                                 {someAllergy ? (
                                    student.restrictions.map(res => (
                                       <span key={res} className="bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-300 px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border border-red-100 dark:border-red-400/30 flex items-center gap-1">
                                          <HeartPulse size={10} /> {res}
                                       </span>
                                    ))
                                 ) : (
                                    <span className="text-[9px] font-bold text-gray-300 uppercase tracking-widest">Nenhuma</span>
                                 )}
                              </div>
                           </td>
                           <td className="pl-0.5 pr-0.5 py-2 w-[68px]">
                              <div className="flex items-center gap-1.5">
                                 <div className={`w-2 h-2 rounded-full ${allServiced ? 'bg-emerald-500' : hasReadyItem ? 'bg-blue-500' : 'bg-amber-500 animate-pulse'}`}></div>
                                 <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                                   allServiced
                                     ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 border-emerald-100 dark:border-emerald-400/30'
                                     : hasReadyItem
                                       ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 border-blue-100 dark:border-blue-400/30'
                                       : 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 border-amber-100 dark:border-amber-400/30'
                                 }`}>
                                    {allServiced ? 'Servido' : hasReadyItem ? 'Pronto' : 'Pendente'}
                                 </span>
                              </div>
                           </td>
                           <td className="pl-0.5 pr-0.5 py-2 text-left w-[72px]">
                              {!allServiced ? (
                                 <button 
                                    onClick={() => serveStudent(student.id)}
                                    className="bg-indigo-600 text-white px-3 py-1.5 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-lg shadow-indigo-100 dark:shadow-indigo-900/40 hover:bg-indigo-700 active:scale-95 transition-all"
                                 >
                                    Entregar
                                 </button>
                              ) : (
                                 <div className="flex items-center justify-start gap-1.5">
                                    <div className="text-emerald-500 flex items-center gap-2">
                                       <CheckCircle2 size={18} />
                                       <span className="text-[10px] font-black uppercase tracking-widest">Concluído</span>
                                    </div>
                                   <button
                                      onClick={() => openReverseModal(student)}
                                      className="inline-flex items-center justify-center bg-rose-600 text-white w-8 h-8 rounded-lg shadow-lg shadow-rose-100 dark:shadow-rose-900/40 hover:bg-rose-700 active:scale-95 transition-all"
                                      title="Estornar entrega"
                                      aria-label="Estornar entrega"
                                    >
                                      <Undo2 size={14} />
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
      </div>

      {reverseTarget && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-indigo-950/50 backdrop-blur-sm"
            onClick={closeReverseModal}
            aria-label="Fechar modal de estorno"
          />
          <div className="relative w-full max-w-lg rounded-2xl border border-indigo-100 dark:border-indigo-400/30 bg-white dark:bg-zinc-900 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-indigo-700 dark:text-indigo-300">Estornar Unidade</h3>
                <p className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 mt-1">
                  {reverseTarget.name} • {reverseTarget.planName.replace(/_/g, ' ')}
                </p>
              </div>
              <button
                type="button"
                className="w-8 h-8 rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-500 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800"
                onClick={closeReverseModal}
                disabled={isReversingDelivery}
                aria-label="Fechar"
              >
                <X size={14} className="mx-auto" />
              </button>
            </div>

            <div className="rounded-xl border border-amber-100 dark:border-amber-400/30 bg-amber-50/70 dark:bg-amber-500/10 p-3">
              <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300">
                O estorno devolve 1 unidade ao plano como crédito aberto.
              </p>
              <p className="text-[10px] font-bold text-amber-600/90 dark:text-amber-200/90 mt-1">
                Esse crédito pode ser usado depois em novo consumo de plano/cantina.
              </p>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-600 dark:text-zinc-300">
                <input
                  type="radio"
                  name="reverse-mode"
                  checked={reverseMode === 'OPEN'}
                  onChange={() => setReverseMode('OPEN')}
                  disabled={isReversingDelivery}
                />
                Deixar crédito aberto (sem data)
              </label>
              <label className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-600 dark:text-zinc-300">
                <input
                  type="radio"
                  name="reverse-mode"
                  checked={reverseMode === 'RESCHEDULE'}
                  onChange={() => setReverseMode('RESCHEDULE')}
                  disabled={isReversingDelivery}
                />
                Reagendar para nova data
              </label>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400">
                Nova Data de Consumo
              </label>
              <input
                type="date"
                value={reverseDate}
                onChange={(e) => {
                  const nextDate = e.target.value;
                  if (nextDate && !isSchoolDateAllowed(nextDate)) {
                    alert('Dia sem aula (feriado/recesso) não pode ser usado para reagendamento.');
                    return;
                  }
                  setReverseDate(nextDate);
                }}
                disabled={reverseMode !== 'RESCHEDULE' || isReversingDelivery}
                min={toLocalDateKey(new Date())}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-bold text-slate-700 dark:text-zinc-200 disabled:opacity-50"
              />
              {isReverseDateBlocked && (
                <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-rose-600">
                  Dia não letivo: selecione um dia com aula
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={closeReverseModal}
                disabled={isReversingDelivery}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-zinc-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmReverse}
                disabled={isReversingDelivery}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-60"
              >
                {isReversingDelivery ? <Loader2 size={12} className="animate-spin" /> : <Undo2 size={12} />}
                Confirmar Estorno
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// Componentes Auxiliares Locais
const FilterTab = ({ active, onClick, label }: any) => (
  <button 
    onClick={onClick}
    className={`flex-1 py-3 rounded-full font-black text-[10px] uppercase tracking-widest transition-all ${active ? 'bg-indigo-600 text-white shadow-xl scale-105' : 'text-gray-400 hover:text-gray-600'}`}
  >
    {label}
  </button>
);

const PeriodButton = ({ active, onClick, icon, label }: any) => {
  const themes: any = {
     Manhã: 'bg-amber-500 border-amber-500',
     Tarde: 'bg-blue-500 border-blue-500',
     Noite: 'bg-indigo-900 border-indigo-900',
     Todos: 'bg-slate-900 border-slate-900'
  };

  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all active:scale-95 ${active ? `${themes[label]} text-white shadow-lg scale-105` : 'bg-white dark:bg-[#121214] border-gray-100 dark:border-white/10 text-gray-400 dark:text-zinc-400 hover:border-indigo-100 dark:hover:border-indigo-400/40'}`}
    >
      <div className={`${active ? 'scale-110 transition-transform' : ''}`}>{icon}</div>
      <span className="text-[8px] font-black uppercase tracking-tighter">{label}</span>
    </button>
  );
};

export default DailyDeliveryPage;
