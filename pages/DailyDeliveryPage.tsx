
import React, { useState, useMemo, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Enterprise, TransactionRecord, Client, Plan } from '../types';
import { 
  Truck, Calendar, Clock, Search, 
  User, CheckCircle2, AlertCircle, Sparkles,
  UtensilsCrossed, Sandwich, ArrowRight, Download, 
  Printer, Sun, Sunset, Moon, ListFilter,
  HeartPulse, Info, Beef, Check,
  Timer, Utensils, ClipboardCheck, Loader2,
  FileText
} from 'lucide-react';
import ApiService from '../services/api';

type TimeFilter = 'TODAY' | 'TOMORROW' | 'CUSTOM';
type PeriodFilter = 'ALL' | 'MORNING' | 'AFTERNOON' | 'NIGHT';
type DeliveryStatus = 'PENDENTE' | 'PREPARANDO' | 'PRONTO' | 'SERVIDO';
type SearchFieldFilter = 'NAME' | 'RESPONSIBLE' | 'PLAN' | 'CLASS' | 'STATUS';
type DateScopeFilter = 'ALL' | 'CURRENT_WEEK' | 'BIWEEKLY' | 'DATE';

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
  restrictions: string[];
  dietaryNotes: string;
  description: string;
  planName: string;
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
          <p className="text-gray-600 font-medium">Carregando entrega...</p>
        </div>
      </div>
    );
  }

  const [selectedDays, setSelectedDays] = useState<('TODAY' | 'TOMORROW')[]>([]);
  const [customDate, setCustomDate] = useState<string>('');
  const [selectedPlans, setSelectedPlans] = useState<string[]>([]);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('ALL');
  const [searchFieldFilter, setSearchFieldFilter] = useState<SearchFieldFilter>('NAME');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateScopeFilter, setDateScopeFilter] = useState<DateScopeFilter>('ALL');
  const [filterDate, setFilterDate] = useState<string>('');
  const [nowTick, setNowTick] = useState<number>(Date.now());

  // Estado local para gerenciar a preparação dos alunos
  const [students, setStudents] = useState<DeliveryProfile[]>([]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowTick(Date.now()), 30000);
    return () => window.clearInterval(intervalId);
  }, []);

  const serviceContext = useMemo(
    () => getServiceContext(activeEnterprise?.openingHours, new Date(nowTick)),
    [activeEnterprise?.openingHours, nowTick]
  );

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

        const deliveredKeys = new Set<string>(
          transactions
            .filter((tx: any) => {
              const type = String(tx?.type || '').toUpperCase();
              if (type !== 'CONSUMO') return false;
              const bag = String(tx?.description || '').toLowerCase();
              return bag.includes('entrega do dia');
            })
            .map((tx: any) => {
              const clientId = String(tx?.clientId || '').trim();
              const planName = normalizePlanName(tx?.plan || tx?.planName || tx?.item || '');
              const deliveryDate = String(tx?.deliveryDate || tx?.scheduledDate || tx?.mealDate || tx?.date || '').slice(0, 10);
              return `${clientId}|${planName}|${deliveryDate}`;
            })
            .filter((key: string) => key.split('|').every((part) => Boolean(part)))
        );

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
              const selectedDates = (Array.isArray(config?.selectedDates) ? config.selectedDates : []) as string[];
              const daysOfWeekRaw = (Array.isArray(config?.daysOfWeek) ? config.daysOfWeek : []) as string[];
              const daysOfWeek = daysOfWeekRaw
                .map((day) => normalizeDayKey(day))
                .filter(Boolean);
              const daysOfWeekSet = new Set(daysOfWeek);
              const deliveryShifts = (Array.isArray(config?.deliveryShifts) ? config.deliveryShifts : []) as string[];
              const normalizedPeriods = deliveryShifts
                .map(mapShiftToPeriod)
                .filter(Boolean) as PeriodFilter[];
              const effectivePeriods = normalizedPeriods.length > 0 ? normalizedPeriods : ['ALL'];

              const candidateDates = [currentContext.todayIso, currentContext.tomorrowIso, customDate]
                .filter(Boolean) as string[];
              const datesByWeekDay = candidateDates.filter((dateIso) => {
                if (daysOfWeekSet.size === 0) return false;
                const dayKey = getDayKeyFromDateIso(dateIso);
                return Boolean(dayKey) && daysOfWeekSet.has(dayKey);
              });

              const scheduleDates = Array.from(new Set([
                ...selectedDates,
                ...datesByWeekDay
              ]));

              if (scheduleDates.length === 0) return [];

              return scheduleDates.flatMap((dateKey, dateIndex) => {
                const scheduledDate = dateKey;
                const scheduledDay: 'TODAY' | 'TOMORROW' = scheduledDate === currentContext.todayIso ? 'TODAY' : 'TOMORROW';
                const planNameUpper = normalizePlanName(plan?.name || planName || 'PLANO');
                const deliveredKey = `${client.id}|${planNameUpper}|${scheduledDate}`;
                const deliveredForDate = deliveredKeys.has(deliveredKey);

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
                  restrictions: client.restrictions || [],
                  dietaryNotes: client.dietaryNotes || '',
                  description: plan?.description || planName || 'Plano sem descrição',
                  planName: plan?.name || planName || 'PLANO',
                  items: [{
                    id: `item-${client.id}-${plan?.id || planName || idx}-${dateIndex}-${periodIndex}`,
                    type: 'ALMOCO',
                    name: plan?.name || planName || 'Plano',
                    components: (plan?.items || []).map(i => ({ name: i.name, checked: deliveredForDate })),
                    status: (deliveredForDate ? 'SERVIDO' : 'PENDENTE') as DeliveryStatus,
                  }],
                }));
              });
            });

            return fromSelectedConfig;
          });

        setStudents(deliveryProfiles);
      } catch (error) {
        console.error('Erro ao carregar dados de entrega do dia:', error);
        setStudents([]);
      }
    };

    loadDeliveryProfiles();
  }, [activeEnterprise?.id, activeEnterprise?.openingHours, customDate]);

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

    const now = new Date();
    const startOfCurrentWeek = new Date(now);
    startOfCurrentWeek.setHours(0, 0, 0, 0);
    startOfCurrentWeek.setDate(startOfCurrentWeek.getDate() - startOfCurrentWeek.getDay());
    const endOfCurrentWeek = new Date(startOfCurrentWeek);
    endOfCurrentWeek.setDate(endOfCurrentWeek.getDate() + 6);

    const startOfBiWeekly = new Date(now);
    startOfBiWeekly.setHours(0, 0, 0, 0);
    startOfBiWeekly.setDate(startOfBiWeekly.getDate() - 13);

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
          if (day === 'TODAY') {
            if (!serviceContext.isWithinServiceHours) return false;
            return d.scheduledDate === serviceContext.todayIso;
          }

          if (serviceContext.isWithinServiceHours) {
            return d.scheduledDate === serviceContext.tomorrowIso;
          }
          return Boolean(d.scheduledDate && d.scheduledDate >= serviceContext.tomorrowIso);
        });
      })();
      const matchesDateScope = (() => {
        if (!d.scheduledDate) return dateScopeFilter === 'ALL';
        const scheduledDate = new Date(`${d.scheduledDate}T00:00:00`);
        if (Number.isNaN(scheduledDate.getTime())) return false;

        if (dateScopeFilter === 'CURRENT_WEEK') {
          return scheduledDate >= startOfCurrentWeek && scheduledDate <= endOfCurrentWeek;
        }
        if (dateScopeFilter === 'BIWEEKLY') {
          return scheduledDate >= startOfBiWeekly && scheduledDate <= now;
        }
        if (dateScopeFilter === 'DATE') {
          return Boolean(filterDate) && d.scheduledDate === filterDate;
        }
        return true;
      })();
      const matchesPlan = selectedPlans.length === 0 || selectedPlans.includes(d.planName);
      return matchesSearch && matchesPeriod && matchesDay && matchesDateScope && matchesPlan;
    }).sort((a, b) => {
      const byName = String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR', { sensitivity: 'base' });
      if (byName !== 0) return byName;
      const aDate = String(a.scheduledDate || '');
      const bDate = String(b.scheduledDate || '');
      if (aDate !== bDate) return aDate.localeCompare(bDate);
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
  }, [students, searchTerm, searchFieldFilter, periodFilter, selectedDays, selectedPlans, customDate, serviceContext, dateScopeFilter, filterDate]);

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

    setStudents(prev => prev.map(s => {
      if (s.id !== studentId) return s;
      return {
        ...s,
        items: s.items.map(item => ({ ...item, status: 'SERVIDO' }))
      };
    }));

    const now = new Date();
    const method = 'PLANO';
    const status = 'CONCLUIDA';
    const transactionDate = now.toISOString().split('T')[0];
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
          plan: student.planName,
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

  const exportToPDF = () => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });
    const tableColumn = ["Aluno", "Matrícula", "Ano/Turma", "Responsável", "Turno", "Plano", "Data Refeição", "Descrição", "Status"];
    const tableRows: any[] = [];

    filteredData.forEach(student => {
      const studentData = [
        student.name,
        student.registrationId,
        `${student.year} - ${student.class}`,
        student.responsibleName,
        student.scheduledPeriod === 'MORNING' ? 'Manhã' : student.scheduledPeriod === 'AFTERNOON' ? 'Tarde' : student.scheduledPeriod === 'NIGHT' ? 'Noite' : 'Todos',
        student.planName.replace('_', ' '),
        student.scheduledDate ? new Date(`${student.scheduledDate}T00:00:00`).toLocaleDateString('pt-BR') : '-',
        student.description,
        student.items.every(i => i.status === 'SERVIDO') ? 'Servido' : 'Pendente'
      ];
      tableRows.push(studentData);
    });

    // Cabeçalho da Empresa
    doc.setFontSize(18);
    doc.setTextColor(79, 70, 229); // Indigo 600
    doc.text(activeEnterprise?.name || "CantinaSmart", 14, 15);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    const enterpriseInfo = [
      activeEnterprise?.attachedSchoolName ? `Escola: ${activeEnterprise.attachedSchoolName}` : null,
      activeEnterprise?.address ? `Endereço: ${activeEnterprise.address}` : null,
      activeEnterprise?.phone1 ? `WhatsApp: ${activeEnterprise.phone1}` : null
    ].filter(Boolean).join(' | ');
    
    doc.text(enterpriseInfo, 14, 20);

    doc.setDrawColor(230);
    doc.line(14, 23, 283, 23);

    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text("Relatório de Entrega Diária", 14, 32);
    
    doc.setFontSize(9);
    doc.setTextColor(100);
    const periodLabel = periodFilter === 'ALL' ? 'Todos' : periodFilter === 'MORNING' ? 'Manhã' : periodFilter === 'AFTERNOON' ? 'Tarde' : 'Noite';
    const plansLabel = selectedPlans.length > 0 ? selectedPlans.map(p => p.replace('_', ' ')).join(', ') : 'Todos';
    const daysLabel = selectedDays.length > 0 ? selectedDays.map(d => d === 'TODAY' ? 'Hoje' : 'Amanhã').join(', ') : 'Todos';
    
    doc.text(`Filtros Aplicados - Turno: ${periodLabel} | Planos: ${plansLabel} | Dias: ${daysLabel}`, 14, 37);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 42,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 247, 250] }
    });

    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Página ${i} de ${pageCount} - Gerado em ${new Date().toLocaleString('pt-BR')}`,
        doc.internal.pageSize.getWidth() / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      );
    }
    
    doc.save(`relatorio_entrega_${activeEnterprise?.name || 'unidade'}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="p-6 space-y-8 animate-in fade-in duration-500 pb-20 bg-gray-50">
      
      {/* HEADER OPERACIONAL - FOCO EM COZINHA */}
      <header className="flex flex-col xl:flex-row xl:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-indigo-600 rounded-[24px] text-white shadow-2xl shadow-indigo-200">
              <Truck size={36} />
            </div>
            <div>
              <h1 className="text-4xl font-black text-gray-900 tracking-tight leading-none uppercase">
                Esteira de Produção
              </h1>
              <p className="text-gray-500 text-[10px] font-black uppercase tracking-[4px] mt-1 opacity-70">
                Logística em Tempo Real • Expedição Canteen Pro
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
           <div className="bg-white px-6 py-4 rounded-2xl border-2 border-gray-100 flex items-center gap-6 shadow-sm">
              <div className="text-center">
                 <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Pendentes</p>
                 <p className="text-xl font-black text-indigo-600">{students.filter(s => s.items.some(i => i.status === 'PENDENTE')).length}</p>
              </div>
              <div className="w-px h-8 bg-gray-100"></div>
              <div className="text-center">
                 <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Servidos</p>
                 <p className="text-xl font-black text-emerald-600">{students.filter(s => s.items.every(i => i.status === 'SERVIDO')).length}</p>
              </div>
           </div>
           <button onClick={exportToPDF} className="bg-indigo-600 text-white px-6 py-4 rounded-2xl hover:bg-indigo-700 transition-all shadow-lg flex items-center gap-2 font-black text-[10px] uppercase tracking-widest">
             <FileText size={20} /> Exportar PDF
           </button>
           <button onClick={() => window.print()} className="bg-white border-2 border-gray-100 p-4 rounded-2xl text-gray-400 hover:text-indigo-600 transition-all shadow-sm">
             <Printer size={20} />
           </button>
        </div>
      </header>

      {/* PAINEL DE CONTROLE DE FILTROS - OTIMIZADO PARA TURNOS */}
      <div className="bg-white p-6 rounded-[40px] border border-gray-100 shadow-xl space-y-8">
         <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* 1. SELEÇÃO DE DIA (MULTI-SELEÇÃO) */}
            <div className="lg:col-span-4 space-y-3">
               <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4 flex items-center gap-2">
                  <Calendar size={12} className="text-indigo-600"/> Dias de Referência
               </label>
               <div className="flex gap-2">
                  <div className="flex flex-1 gap-2 bg-gray-100 p-1 rounded-2xl">
                    {['TODAY', 'TOMORROW'].map((day) => (
                      <button
                        key={day}
                        onClick={() => {
                          setSelectedDays(prev => 
                            prev.includes(day as any) 
                            ? prev.filter(d => d !== day) 
                            : [...prev, day as any]
                          );
                        }}
                        className={`flex-1 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${
                          selectedDays.includes(day as any)
                          ? 'bg-indigo-600 text-white shadow-lg'
                          : 'text-gray-400 hover:text-gray-600'
                        }`}
                      >
                        {day === 'TODAY' ? 'Hoje' : 'Amanhã'}
                      </button>
                    ))}
                  </div>
                  <div className="relative flex-1">
                    <input 
                      type="date"
                      value={customDate}
                      onChange={(e) => setCustomDate(e.target.value)}
                      className={`w-full pl-10 pr-4 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest border-2 transition-all outline-none ${
                        customDate 
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' 
                        : 'bg-white border-gray-100 text-gray-400 hover:border-indigo-100'
                      }`}
                    />
                    <Calendar size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 ${customDate ? 'text-white' : 'text-indigo-600'}`} />
                  </div>
               </div>
            </div>

            {/* 1.5 SELEÇÃO DE PLANO (MULTI-SELEÇÃO) */}
            <div className="lg:col-span-4 space-y-3">
               <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4 flex items-center gap-2">
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
                      className={`px-3 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest border-2 transition-all ${
                        selectedPlans.includes(plan)
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg'
                        : 'bg-white border-gray-100 text-gray-400 hover:border-emerald-100'
                      }`}
                    >
                      {plan.replace('_', ' ')}
                    </button>
                  ))}
               </div>
            </div>

            {/* 2. FILTRO POR TURNO - O MAIS IMPORTANTE NA COZINHA */}
            <div className="lg:col-span-4 space-y-3">
               <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4 flex items-center gap-2">
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
            <div className="lg:col-span-12 space-y-3">
               <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4 flex items-center gap-2">
                  <User size={12} className="text-indigo-600"/> Pesquisa e Período
               </label>
               <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <select
                    value={searchFieldFilter}
                    onChange={(e) => setSearchFieldFilter(e.target.value as SearchFieldFilter)}
                    className="px-4 py-3.5 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-3xl outline-none font-bold text-sm transition-all"
                  >
                    <option value="NAME">Por nome</option>
                    <option value="RESPONSIBLE">Por responsável</option>
                    <option value="PLAN">Por tipo de plano</option>
                    <option value="CLASS">Por turma</option>
                    <option value="STATUS">Por status</option>
                  </select>

                  <div className="relative md:col-span-2">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
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
                      className="w-full pl-12 pr-6 py-3.5 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-3xl outline-none font-bold text-sm transition-all"
                    />
                  </div>

                  <select
                    value={dateScopeFilter}
                    onChange={(e) => setDateScopeFilter(e.target.value as DateScopeFilter)}
                    className="px-4 py-3.5 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-3xl outline-none font-bold text-sm transition-all"
                  >
                    <option value="ALL">Período: Todos</option>
                    <option value="CURRENT_WEEK">Semana atual</option>
                    <option value="BIWEEKLY">Quinzenal</option>
                    <option value="DATE">Por data</option>
                  </select>
               </div>
               {dateScopeFilter === 'DATE' && (
                 <div className="mt-3 max-w-sm">
                   <input
                     type="date"
                     value={filterDate}
                     onChange={(e) => setFilterDate(e.target.value)}
                     className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none font-bold text-sm transition-all"
                   />
                 </div>
               )}
               <div className="flex flex-wrap gap-2 mt-3">
                 <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Atalhos:</span>
                 <button
                   type="button"
                   onClick={() => setDateScopeFilter('CURRENT_WEEK')}
                   className="px-3 py-1.5 rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-widest"
                 >
                   Semana atual
                 </button>
                 <button
                   type="button"
                   onClick={() => setDateScopeFilter('BIWEEKLY')}
                   className="px-3 py-1.5 rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-widest"
                 >
                   Quinzenal
                 </button>
                 <button
                   type="button"
                   onClick={() => setDateScopeFilter('DATE')}
                   className="px-3 py-1.5 rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-widest"
                 >
                   Por data
                 </button>
               </div>
            </div>
         </div>
      </div>

      {/* RESUMO POR PLANO */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
         <div className="bg-amber-50 p-6 rounded-[32px] border border-amber-100 shadow-sm flex items-center justify-between">
            <div>
               <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Total Lanches</p>
               <p className="text-2xl font-black text-amber-900">{planSummary['LANCHE'] || 0}</p>
            </div>
            <div className="p-3 bg-white rounded-2xl text-amber-500 shadow-sm"><Sandwich size={24}/></div>
         </div>
         <div className="bg-emerald-50 p-6 rounded-[32px] border border-emerald-100 shadow-sm flex items-center justify-between">
            <div>
               <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Total Almoços</p>
               <p className="text-2xl font-black text-emerald-900">{planSummary['ALMOCO'] || 0}</p>
            </div>
            <div className="p-3 bg-white rounded-2xl text-emerald-500 shadow-sm"><Beef size={24}/></div>
         </div>
      </div>

      {/* ESTEIRA DE PRODUÇÃO - LISTA DETALHADA */}
      <div className="bg-white rounded-[40px] border border-gray-100 shadow-xl overflow-hidden">
         <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
               <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                     <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Aluno / Matrícula</th>
                     <th className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Ano / Turma</th>
                     <th className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Responsável</th>
                     <th className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Turno</th>
                     <th className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Plano</th>
                     <th className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Data Refeição</th>
                     <th className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Descrição</th>
                     <th className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Restrições</th>
                     <th className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                     <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Ações</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-gray-50">
                  {filteredData.map(student => {
                     const allServiced = student.items.every(i => i.status === 'SERVIDO');
                     const someAllergy = student.restrictions.length > 0;

                     return (
                        <tr key={student.id} className={`group hover:bg-gray-50/50 transition-all ${allServiced ? 'opacity-50 grayscale' : ''}`}>
                           <td className="px-8 py-6">
                              <div className="flex items-center gap-4">
                                 <img src={student.photo} className="w-12 h-12 rounded-2xl object-cover border-2 border-white shadow-sm" />
                                 <div>
                                    <p className="text-sm font-black text-gray-800 uppercase tracking-tight">{student.name}</p>
                                    <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-tighter">Mat: #{student.registrationId}</p>
                                 </div>
                              </div>
                           </td>
                           <td className="px-6 py-6">
                              <div className="space-y-1">
                                 <p className="text-xs font-black text-gray-700 uppercase">{student.year}</p>
                                 <span className="text-[9px] font-black text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100 uppercase">Turma {student.class}</span>
                              </div>
                           </td>
                           <td className="px-6 py-6">
                              <p className="text-xs font-black text-gray-700 uppercase tracking-tight">{student.responsibleName}</p>
                           </td>
                           <td className="px-6 py-6">
                              <div className="flex items-center gap-2">
                                 <div className={`p-1.5 rounded-lg ${
                                    student.scheduledPeriod === 'MORNING' ? 'bg-amber-100 text-amber-600' :
                                    student.scheduledPeriod === 'AFTERNOON' ? 'bg-blue-100 text-blue-600' :
                                    student.scheduledPeriod === 'NIGHT' ? 'bg-indigo-100 text-indigo-900' :
                                    'bg-slate-100 text-slate-700'
                                 }`}>
                                    {student.scheduledPeriod === 'MORNING' ? <Sun size={12}/> : student.scheduledPeriod === 'AFTERNOON' ? <Sunset size={12}/> : student.scheduledPeriod === 'NIGHT' ? <Moon size={12}/> : <Clock size={12}/>}
                                 </div>
                                 <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">
                                   {student.scheduledPeriod === 'MORNING' ? 'MANHÃ' : student.scheduledPeriod === 'AFTERNOON' ? 'TARDE' : student.scheduledPeriod === 'NIGHT' ? 'NOITE' : 'TODOS'}
                                 </span>
                              </div>
                           </td>
                           <td className="px-6 py-6">
                              <span className={`text-[10px] font-black px-3 py-1 rounded-full border uppercase ${
                                student.planName === 'PF_FIXO' ? 'bg-orange-50 text-orange-600 border-orange-100' :
                                student.planName === 'LANCHE_FIXO' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                'bg-indigo-50 text-indigo-600 border-indigo-100'
                              }`}>
                                {student.planName.replace('_', ' ')}
                              </span>
                           </td>
                           <td className="px-6 py-6">
                              <span className="text-[10px] font-black px-3 py-1 rounded-full border border-cyan-100 bg-cyan-50 text-cyan-700 uppercase tracking-widest">
                                {student.scheduledDate ? new Date(`${student.scheduledDate}T00:00:00`).toLocaleDateString('pt-BR') : '-'}
                              </span>
                           </td>
                           <td className="px-6 py-6">
                              <div className="flex items-center gap-2">
                                 <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg"><Beef size={12}/></div>
                                 <p className="text-xs font-black text-gray-700 uppercase tracking-tight">{student.description}</p>
                              </div>
                           </td>
                           <td className="px-6 py-6">
                              <div className="flex flex-wrap gap-1.5">
                                 {someAllergy ? (
                                    student.restrictions.map(res => (
                                       <span key={res} className="bg-red-50 text-red-600 px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border border-red-100 flex items-center gap-1">
                                          <HeartPulse size={10} /> {res}
                                       </span>
                                    ))
                                 ) : (
                                    <span className="text-[9px] font-bold text-gray-300 uppercase tracking-widest">Nenhuma</span>
                                 )}
                              </div>
                           </td>
                           <td className="px-6 py-6">
                              <div className="flex items-center gap-2">
                                 <div className={`w-2 h-2 rounded-full ${allServiced ? 'bg-emerald-500' : student.items.some(i => i.status === 'PRONTO') ? 'bg-blue-500' : 'bg-amber-500 animate-pulse'}`}></div>
                                 <span className={`text-[10px] font-black uppercase tracking-widest ${allServiced ? 'text-emerald-600' : 'text-gray-500'}`}>
                                    {allServiced ? 'Servido' : student.items.some(i => i.status === 'PRONTO') ? 'Pronto' : 'Pendente'}
                                 </span>
                              </div>
                           </td>
                           <td className="px-8 py-6 text-right">
                              {!allServiced ? (
                                 <button 
                                    onClick={() => serveStudent(student.id)}
                                    className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-2 ml-auto"
                                 >
                                    Entregar <ArrowRight size={14}/>
                                 </button>
                              ) : (
                                 <div className="text-emerald-500 flex items-center gap-2 justify-end">
                                    <CheckCircle2 size={18} />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Concluído</span>
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
      className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all active:scale-95 ${active ? `${themes[label]} text-white shadow-lg scale-105` : 'bg-white border-gray-100 text-gray-400 hover:border-indigo-100'}`}
    >
      <div className={`${active ? 'scale-110 transition-transform' : ''}`}>{icon}</div>
      <span className="text-[8px] font-black uppercase tracking-tighter">{label}</span>
    </button>
  );
};

export default DailyDeliveryPage;
