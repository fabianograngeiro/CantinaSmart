import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  TrendingUp, Users, AlertTriangle, ArrowUpRight, ArrowDownRight, 
  Sparkles, Clock, Ban, Utensils, LayoutDashboard, Calendar, 
  Percent, Tag, Save, X, ArrowRight, Info, Globe, ShieldCheck, Building, Wallet,
  // Added missing FileBarChart import
  ChefHat, Scale, Coffee, UtensilsCrossed, FileBarChart, Trash2, RefreshCw
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Cell, PieChart, Pie, Area } from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Role, User, Enterprise, Product } from '../types';
import ApiService from '../services/api';
import { resolveUserAvatar } from '../utils/avatar';
import { drawEnterpriseLogoOnPdf } from '../utils/enterpriseBranding';
import { useTheme } from '../components/ThemeProvider';

interface DashboardProps {
  currentUser: User;
  activeEnterprise: Enterprise;
}

type DashboardMetrics = {
  salesToday: number;
  salesYesterday: number;
  salesMonth: number;
  salesPreviousMonth: number;
  creditsToday: number;
  creditsYesterday: number;
  creditsMonth: number;
  creditsPreviousMonth: number;
  uniqueClientsToday: number;
  uniqueClientsYesterday: number;
  criticalStockCount: number;
  activeStudentsWithPlanBalance: number;
  activePlanBreakdown: Array<{
    planName: string;
    studentsCount: number;
    totalBalance: number;
    members: Array<{
      clientId: string;
      name: string;
      className: string;
      responsible: string;
      balance: number;
    }>;
  }>;
  weekdayDeliveriesCount: number;
  weekdayDeliveriesByDay: Array<{
    key: string;
    label: string;
    fullLabel: string;
    dateLabel: string;
    count: number;
    plans: Array<{ planName: string; count: number }>;
  }>;
  weekdayDeliveriesWindowLabel: string;
  todayHourly: Array<{ name: string; sales: number }>;
  salesByCategory: Array<{ name: string; value: number; fill: string }>;
};

type SuperAdminInsights = {
  totalRevenue: number;
  renewalsCount: number;
  totalClientsByDocument: number;
  activeOwners: number;
  inactiveOwners: number;
  newOwnersInRange: number;
  convertedTrialsCount: number;
  mrrEstimated: number;
  avgRenewalTicket: number;
  previousRevenue: number;
  revenueProgressPct: number;
  trendSeries: Array<{
    label: string;
    revenue: number;
    profitPct: number;
  }>;
};

type SaasInvoice = {
  id: string;
  enterpriseId: string;
  amount: number;
  status: 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELED';
  paidAt?: string;
};

const SAAS_INVOICES_STORAGE_KEY = 'saas_invoices_v1';

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toPercentDelta = (current: number, previous: number) => {
  if (previous <= 0) return current > 0 ? '+100%' : '0%';
  const delta = ((current - previous) / previous) * 100;
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${delta.toFixed(0)}%`;
};

const toCountDelta = (current: number, previous: number) => {
  const delta = current - previous;
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${delta}`;
};

const DashboardPage: React.FC<DashboardProps> = ({ currentUser, activeEnterprise }) => {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [systemStats, setSystemStats] = useState<any>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics>({
    salesToday: 0,
    salesYesterday: 0,
    salesMonth: 0,
    salesPreviousMonth: 0,
    creditsToday: 0,
    creditsYesterday: 0,
    creditsMonth: 0,
    creditsPreviousMonth: 0,
    uniqueClientsToday: 0,
    uniqueClientsYesterday: 0,
    criticalStockCount: 0,
    activeStudentsWithPlanBalance: 0,
    activePlanBreakdown: [],
    weekdayDeliveriesCount: 0,
    weekdayDeliveriesByDay: [],
    weekdayDeliveriesWindowLabel: '',
    todayHourly: [],
    salesByCategory: [],
  });
  const [isLoadingDashboardMetrics, setIsLoadingDashboardMetrics] = useState(false);
  const [superAdminRange, setSuperAdminRange] = useState<{ start: string; end: string }>(() => {
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() - 29);
    return {
      start: toDateKey(start),
      end: toDateKey(today),
    };
  });
  const [superAdminInsights, setSuperAdminInsights] = useState<SuperAdminInsights>({
    totalRevenue: 0,
    renewalsCount: 0,
    totalClientsByDocument: 0,
    activeOwners: 0,
    inactiveOwners: 0,
    newOwnersInRange: 0,
    convertedTrialsCount: 0,
    mrrEstimated: 0,
    avgRenewalTicket: 0,
    previousRevenue: 0,
    revenueProgressPct: 0,
    trendSeries: [],
  });
  const [isLoadingSuperAdminInsights, setIsLoadingSuperAdminInsights] = useState(false);
  const [superAdminChartTick, setSuperAdminChartTick] = useState(0);
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const [chartContainerSize, setChartContainerSize] = useState({ width: 0, height: 0 });
  const chartGridColor = isDark ? '#334155' : '#f1f5f9';
  const chartTextColor = isDark ? '#cbd5e1' : '#64748b';
  const chartTooltipBg = isDark ? '#0f172a' : '#ffffff';
  const chartTooltipBorder = isDark ? '#334155' : '#e2e8f0';

  // Buscar estatísticas do sistema para SUPERADMIN
  useEffect(() => {
    if (currentUser.role === Role.SUPERADMIN) {
      loadSystemStats();
    } else {
      setIsLoadingStats(false); // Para não-SUPERADMIN, não precisa carregar stats
    }
  }, [currentUser.role]);

  useEffect(() => {
    if (currentUser.role !== Role.SUPERADMIN) return;
    loadSuperAdminInsights();
  }, [currentUser.role, superAdminRange.start, superAdminRange.end]);

  useEffect(() => {
    if (currentUser.role !== Role.SUPERADMIN) return;
    const interval = window.setInterval(() => {
      setSuperAdminChartTick((prev) => prev + 1);
    }, 4500);
    return () => window.clearInterval(interval);
  }, [currentUser.role]);

  // Buscar colaboradores com débito para unidades
  useEffect(() => {
    if (activeEnterprise && currentUser.role !== Role.SUPERADMIN) {
      loadDashboardMetrics();
    }
  }, [activeEnterprise, currentUser.role]);

  useEffect(() => {
    const node = chartContainerRef.current;
    if (!node) return;

    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      const width = Math.max(0, Math.floor(rect.width));
      const height = Math.max(0, Math.floor(rect.height));
      setChartContainerSize({ width, height });
    };

    updateSize();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => updateSize());
      observer.observe(node);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const loadSystemStats = async () => {
    try {
      setIsLoadingStats(true);
      const response = await ApiService.getSystemStatus();
      setSystemStats(response.stats);
    } catch (err) {
      console.error('Erro ao carregar estatísticas:', err);
    } finally {
      setIsLoadingStats(false);
    }
  };

  const loadDashboardMetrics = async () => {
    if (!activeEnterprise) return;

    try {
      setIsLoadingDashboardMetrics(true);
      const [transactions, products, clients, plansData] = await Promise.all([
        ApiService.getTransactions({ enterpriseId: activeEnterprise.id }),
        ApiService.getProducts(activeEnterprise.id),
        ApiService.getClients(activeEnterprise.id),
        ApiService.getPlans(activeEnterprise.id),
      ]);

      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const previousMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const todayKey = toDateKey(today);
      const yesterdayKey = toDateKey(yesterday);
      const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      const previousMonthKey = `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, '0')}`;

      const productById = new Map<string, Product>(products.map((product: Product) => [product.id, product]));
      const todayHourlyMap = new Map<string, number>();
      const categoryMap = new Map<string, number>();

      const normalize = (value?: string) =>
        String(value || '')
          .trim()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toUpperCase();

      const blockedPlanNames = new Set(['PREPAGO', 'PRE-PAGO', 'PRÉ-PAGO', 'CANTINA', 'CREDITO CANTINA', 'CRÉDITO CANTINA']);

      const resolvedActivePlans = (Array.isArray(plansData) ? plansData : []).filter((plan: any) => plan?.isActive !== false);
      const activePlanIds = new Set(
        resolvedActivePlans
          .map((plan: any) => String(plan?.id || '').trim())
          .filter(Boolean)
      );
      const activePlanNames = new Set(
        resolvedActivePlans
          .map((plan: any) => normalize(plan?.name))
          .filter(Boolean)
      );

      const clientsData = Array.isArray(clients) ? clients : [];
      const toIsoDate = (date: Date) => {
        const year = date.getFullYear();
        const month = `${date.getMonth() + 1}`.padStart(2, '0');
        const day = `${date.getDate()}`.padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const ptWeekdayToKey: Record<number, string> = {
        1: 'SEGUNDA',
        2: 'TERCA',
        3: 'QUARTA',
        4: 'QUINTA',
        5: 'SEXTA',
      };
      const weekdayLabels: Record<string, string> = {
        SEGUNDA: 'SEG',
        TERCA: 'TER',
        QUARTA: 'QUA',
        QUINTA: 'QUI',
        SEXTA: 'SEX',
      };
      const activeStudentsWithPlanBalanceCount = clientsData.filter((client: any) => {
        if (String(client?.type || '').toUpperCase() !== 'ALUNO') return false;
        const balances = client?.planCreditBalances && typeof client.planCreditBalances === 'object'
          ? Object.values(client.planCreditBalances)
          : [];
        return balances.some((entry: any) => {
          const planId = String(entry?.planId || '').trim();
          const planName = normalize(entry?.planName);
          const balance = Number(entry?.balance || 0);
          const isKnownActivePlan = (planId && activePlanIds.has(planId)) || activePlanNames.has(planName);
          return balance > 0 && !blockedPlanNames.has(planName) && isKnownActivePlan;
        });
      }).length;

      const planBreakdownMap = new Map<
        string,
        {
          planName: string;
          students: Set<string>;
          totalBalance: number;
          membersById: Map<string, { clientId: string; name: string; className: string; responsible: string; balance: number }>;
        }
      >();
      clientsData.forEach((client: any) => {
        if (String(client?.type || '').toUpperCase() !== 'ALUNO') return;
        const balances = client?.planCreditBalances && typeof client.planCreditBalances === 'object'
          ? Object.values(client.planCreditBalances)
          : [];

        balances.forEach((entry: any) => {
          const planId = String(entry?.planId || '').trim();
          const normalizedPlanName = normalize(entry?.planName);
          const balance = Number(entry?.balance || 0);
          const isKnownActivePlan = (planId && activePlanIds.has(planId)) || activePlanNames.has(normalizedPlanName);
          if (!normalizedPlanName || balance <= 0 || blockedPlanNames.has(normalizedPlanName) || !isKnownActivePlan) return;

          const displayPlanName = String(entry?.planName || normalizedPlanName)
            .replace(/_/g, ' ')
            .trim()
            .toUpperCase();

          const existing = planBreakdownMap.get(normalizedPlanName) || {
            planName: displayPlanName,
            students: new Set<string>(),
            totalBalance: 0,
            membersById: new Map<string, { clientId: string; name: string; className: string; responsible: string; balance: number }>(),
          };
          const clientId = String(client?.id || '');
          existing.students.add(clientId);
          existing.totalBalance += balance;
          existing.membersById.set(clientId, {
            clientId,
            name: String(client?.name || 'Sem nome'),
            className: String(client?.class || '-'),
            responsible: String(client?.parentName || client?.responsible || '-'),
            balance: Number(balance.toFixed(2)),
          });
          planBreakdownMap.set(normalizedPlanName, existing);
        });
      });

      const activePlanBreakdown = Array.from(planBreakdownMap.values())
        .map((item) => ({
          planName: item.planName,
          studentsCount: item.students.size,
          totalBalance: Number(item.totalBalance.toFixed(2)),
          members: Array.from(item.membersById.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
        }))
        .sort((a, b) => {
          if (b.studentsCount !== a.studentsCount) return b.studentsCount - a.studentsCount;
          return a.planName.localeCompare(b.planName, 'pt-BR');
        });

      const WEEKDAY_SET = new Set(['SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA']);

      const nowLocal = new Date();
      const nowDay = nowLocal.getDay();
      const nowHour = nowLocal.getHours();
      const mondayCurrent = new Date(nowLocal);
      mondayCurrent.setHours(0, 0, 0, 0);
      mondayCurrent.setDate(mondayCurrent.getDate() - ((nowDay + 6) % 7));
      const shouldUseNextWeek = nowDay === 6 || nowDay === 0 || (nowDay === 5 && nowHour >= 18);
      const mondayReference = new Date(mondayCurrent);
      if (shouldUseNextWeek) {
        mondayReference.setDate(mondayReference.getDate() + 7);
      }

      const weekdayDates = [0, 1, 2, 3, 4].map((offset) => {
        const d = new Date(mondayReference);
        d.setDate(mondayReference.getDate() + offset);
        const jsDay = d.getDay();
        const key = ptWeekdayToKey[jsDay] || '';
        return {
          key,
          label: weekdayLabels[key] || '',
          fullLabel: key,
          iso: toIsoDate(d),
          dateLabel: d.toLocaleDateString('pt-BR'),
        };
      });

      const weekdayDeliveriesByDay = weekdayDates.map((dayInfo) => {
        const dayPlanMap = new Map<string, number>();

        clientsData.forEach((client: any) => {
          if (String(client?.type || '').toUpperCase() !== 'ALUNO') return;
          const selectedPlans = Array.isArray(client?.selectedPlansConfig) ? client.selectedPlansConfig : [];
          selectedPlans.forEach((config: any) => {
            const days = Array.isArray(config?.daysOfWeek) ? config.daysOfWeek : [];
            const selectedDates = Array.isArray(config?.selectedDates) ? config.selectedDates : [];
            const deliveryShifts = Array.isArray(config?.deliveryShifts) ? config.deliveryShifts : [];
            const shiftsMultiplier = deliveryShifts.length > 0 ? deliveryShifts.length : 1;

            // Se o plano usa datas específicas (selectedDates), elas são a fonte autoritativa.
            // Só usa daysOfWeek como fallback quando selectedDates está vazio.
            const hasSelectedDateMatch = selectedDates.some((date: string) => String(date || '').slice(0, 10) === dayInfo.iso);
            const hasWeekDayMatch = selectedDates.length === 0 && days.some((day: string) => normalize(day) === dayInfo.key);
            if (!hasWeekDayMatch && !hasSelectedDateMatch) return;

            const rawPlanName = String(config?.planName || config?.name || '').trim();
            const rawPlanId = String(config?.planId || '').trim();
            const normalizedPlanName = normalize(rawPlanName);
            const isKnownActivePlan = (rawPlanId && activePlanIds.has(rawPlanId)) || activePlanNames.has(normalizedPlanName);
            if (!normalizedPlanName || blockedPlanNames.has(normalizedPlanName) || !isKnownActivePlan) return;
            const displayPlanName = rawPlanName.replace(/_/g, ' ').toUpperCase();
            dayPlanMap.set(displayPlanName, (dayPlanMap.get(displayPlanName) || 0) + shiftsMultiplier);
          });
        });

        const plans = Array.from(dayPlanMap.entries())
          .map(([planName, count]) => ({ planName, count }))
          .sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count;
            return a.planName.localeCompare(b.planName, 'pt-BR');
          });

        const count = plans.reduce((sum, item) => sum + item.count, 0);

        return {
          key: dayInfo.key,
          label: dayInfo.label,
          fullLabel: dayInfo.fullLabel,
          dateLabel: dayInfo.dateLabel,
          count,
          plans,
        };
      });

      const weekdayDeliveriesCount = weekdayDeliveriesByDay.reduce((sum, day) => sum + day.count, 0);

      const fridayReference = new Date(mondayReference);
      fridayReference.setDate(mondayReference.getDate() + 4);
      const weekdayDeliveriesWindowLabel = `Semana de ${mondayReference.toLocaleDateString('pt-BR')} a ${fridayReference.toLocaleDateString('pt-BR')}`;

      const getDateKeyFromTransaction = (tx: any) => {
        if (tx?.date) return tx.date;
        if (tx?.timestamp) return toDateKey(new Date(tx.timestamp));
        return '';
      };

      const getNumericValue = (tx: any) => {
        const value = Number(tx?.total ?? tx?.amount ?? tx?.value ?? 0);
        return Number.isFinite(value) ? value : 0;
      };

      const normalizeType = (tx: any) =>
        String(tx?.type || '')
          .trim()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toUpperCase();

      const resolveDashboardBucket = (tx: any): 'CREDIT' | 'SALE' | 'IGNORE' => {
        const txType = normalizeType(tx);
        if (txType.includes('AUDITORIA')) return 'IGNORE';
        if (txType === 'CREDIT' || txType === 'CREDITO' || txType === 'ENTRADA') return 'CREDIT';
        if (txType === 'DEBIT' || txType === 'CONSUMO' || txType === 'VENDA_BALCAO') return 'SALE';
        return 'IGNORE';
      };

      const txToday = transactions.filter((tx: any) => getDateKeyFromTransaction(tx) === todayKey);
      const txYesterday = transactions.filter((tx: any) => getDateKeyFromTransaction(tx) === yesterdayKey);
      const txCurrentMonth = transactions.filter((tx: any) => getDateKeyFromTransaction(tx).startsWith(`${currentMonthKey}-`));
      const txPreviousMonth = transactions.filter((tx: any) => getDateKeyFromTransaction(tx).startsWith(`${previousMonthKey}-`));

      let salesToday = 0;
      let salesYesterday = 0;
      let salesMonth = 0;
      let salesPreviousMonth = 0;
      let creditsToday = 0;
      let creditsYesterday = 0;
      let creditsMonth = 0;
      let creditsPreviousMonth = 0;

      txToday.forEach((tx: any) => {
        const value = getNumericValue(tx);
        const bucket = resolveDashboardBucket(tx);
        if (bucket === 'CREDIT') {
          creditsToday += value;
        } else if (bucket === 'SALE') {
          salesToday += value;
        } else {
          return;
        }

        const txDate = tx?.timestamp ? new Date(tx.timestamp) : null;
        const hourKey = txDate && Number.isFinite(txDate.getTime()) ? `${`${txDate.getHours()}`.padStart(2, '0')}:00` : '00:00';
        todayHourlyMap.set(hourKey, (todayHourlyMap.get(hourKey) || 0) + value);

        if (Array.isArray(tx?.items)) {
          tx.items.forEach((item: any) => {
            const product = productById.get(item.productId);
            const category = String(product?.category || 'GERAL').toUpperCase();
            const itemTotal = Number(item?.price || 0) * Number(item?.quantity || 0);
            categoryMap.set(category, (categoryMap.get(category) || 0) + (Number.isFinite(itemTotal) ? itemTotal : 0));
          });
        }
      });

      txYesterday.forEach((tx: any) => {
        const value = getNumericValue(tx);
        const bucket = resolveDashboardBucket(tx);
        if (bucket === 'CREDIT') {
          creditsYesterday += value;
        } else if (bucket === 'SALE') {
          salesYesterday += value;
        }
      });

      txCurrentMonth.forEach((tx: any) => {
        const value = getNumericValue(tx);
        const bucket = resolveDashboardBucket(tx);
        if (bucket === 'CREDIT') {
          creditsMonth += value;
        } else if (bucket === 'SALE') {
          salesMonth += value;
        }
      });

      txPreviousMonth.forEach((tx: any) => {
        const value = getNumericValue(tx);
        const bucket = resolveDashboardBucket(tx);
        if (bucket === 'CREDIT') {
          creditsPreviousMonth += value;
        } else if (bucket === 'SALE') {
          salesPreviousMonth += value;
        }
      });

      const uniqueClientsToday = new Set(
        txToday
          .map((tx: any) => tx?.clientId)
          .filter((clientId: string | undefined) => Boolean(clientId))
      ).size;
      const uniqueClientsYesterday = new Set(
        txYesterday
          .map((tx: any) => tx?.clientId)
          .filter((clientId: string | undefined) => Boolean(clientId))
      ).size;

      const criticalStockCount = products.filter((product: Product) => {
        if (product.controlsStock === false) return false;
        const stock = Number(product.stock || 0);
        const minStock = Number(product.minStock || 0);
        return stock <= minStock;
      }).length;

      const hourlyBase = Array.from({ length: 24 }, (_unused, index) => `${`${index}`.padStart(2, '0')}:00`);
      const todayHourly = hourlyBase.map((hourKey) => ({
        name: hourKey,
        sales: Number((todayHourlyMap.get(hourKey) || 0).toFixed(2)),
      }));

      const categoryColors = ['#4f46e5', '#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6'];
      const salesByCategory = Array.from(categoryMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name, value], index) => ({
          name,
          value: Number(value.toFixed(2)),
          fill: categoryColors[index % categoryColors.length],
        }));

      setDashboardMetrics({
        salesToday: Number(salesToday.toFixed(2)),
        salesYesterday: Number(salesYesterday.toFixed(2)),
        salesMonth: Number(salesMonth.toFixed(2)),
        salesPreviousMonth: Number(salesPreviousMonth.toFixed(2)),
        creditsToday: Number(creditsToday.toFixed(2)),
        creditsYesterday: Number(creditsYesterday.toFixed(2)),
        creditsMonth: Number(creditsMonth.toFixed(2)),
        creditsPreviousMonth: Number(creditsPreviousMonth.toFixed(2)),
        uniqueClientsToday,
        uniqueClientsYesterday,
        criticalStockCount,
        activeStudentsWithPlanBalance: activeStudentsWithPlanBalanceCount,
        activePlanBreakdown,
        weekdayDeliveriesCount,
        weekdayDeliveriesByDay,
        weekdayDeliveriesWindowLabel,
        todayHourly,
        salesByCategory,
      });
    } catch (err) {
      console.error('Erro ao carregar métricas do dashboard:', err);
    } finally {
      setIsLoadingDashboardMetrics(false);
    }
  };

  const loadSuperAdminInsights = async () => {
    try {
      setIsLoadingSuperAdminInsights(true);
      const [users, enterprises] = await Promise.all([
        ApiService.getUsers(),
        ApiService.getEnterprises(),
      ]);

      let invoices: SaasInvoice[] = [];
      try {
        const raw = localStorage.getItem(SAAS_INVOICES_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        invoices = Array.isArray(parsed) ? parsed : [];
      } catch (storageErr) {
        console.error('Erro ao carregar faturas SaaS no dashboard:', storageErr);
        invoices = [];
      }

      const startDate = new Date(`${superAdminRange.start}T00:00:00`);
      const endDate = new Date(`${superAdminRange.end}T23:59:59`);
      const periodDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
      const prevEnd = new Date(startDate);
      prevEnd.setDate(prevEnd.getDate() - 1);
      const prevStart = new Date(prevEnd);
      prevStart.setDate(prevStart.getDate() - (periodDays - 1));

      const normalizePaidDate = (invoice: SaasInvoice) => {
        const date = new Date(invoice.paidAt || '');
        return Number.isNaN(date.getTime()) ? null : date;
      };
      const numericInvoiceValue = (invoice: SaasInvoice) => {
        const value = Number(invoice?.amount ?? 0);
        return Number.isFinite(value) ? value : 0;
      };

      const paidInvoices = invoices.filter((invoice) => String(invoice?.status || '').toUpperCase() === 'PAID');
      const inRangePaidInvoices = paidInvoices.filter((invoice) => {
        const paidDate = normalizePaidDate(invoice);
        return paidDate && paidDate >= startDate && paidDate <= endDate;
      });
      const prevRangePaidInvoices = paidInvoices.filter((invoice) => {
        const paidDate = normalizePaidDate(invoice);
        return paidDate && paidDate >= prevStart && paidDate <= prevEnd;
      });

      const totalRevenue = inRangePaidInvoices.reduce((sum, invoice) => sum + numericInvoiceValue(invoice), 0);
      const previousRevenue = prevRangePaidInvoices.reduce((sum, invoice) => sum + numericInvoiceValue(invoice), 0);

      const owners = (Array.isArray(users) ? users : []).filter((user: User) => String(user.role || '').toUpperCase() === Role.OWNER);
      const sanitizedDocuments = owners
        .map((owner: User) => String(owner.document || '').replace(/\D/g, ''))
        .filter((document) => document.length >= 11);
      const totalClientsByDocument = new Set(sanitizedDocuments).size;
      const activeOwners = owners.filter((owner: User) => owner.isActive !== false).length;
      const inactiveOwners = owners.filter((owner: User) => owner.isActive === false).length;
      const newOwnersInRange = owners.filter((owner: User) => {
        const createdAt = owner.createdAt ? new Date(owner.createdAt) : null;
        return createdAt && !Number.isNaN(createdAt.getTime()) && createdAt >= startDate && createdAt <= endDate;
      }).length;

      const activeEnterprises = (Array.isArray(enterprises) ? enterprises : []).filter((enterprise: Enterprise) => String(enterprise.serviceStatus || '').toUpperCase() !== 'CANCELADO');
      const mrrEstimated = activeEnterprises.reduce((sum: number, enterprise: Enterprise) => sum + Number(enterprise.monthlyFee || 0), 0);
      const convertedTrialsCount = new Set(
        activeEnterprises
          .filter((enterprise: Enterprise) => String(enterprise.serviceStatus || '').toUpperCase() !== 'TRIAL')
          .map((enterprise: Enterprise) => enterprise.id)
          .filter((enterpriseId: string) => paidInvoices.some((invoice) => invoice.enterpriseId === enterpriseId))
      ).size;

      const inRangeRenewalsCount = inRangePaidInvoices.length;
      const avgRenewalTicket = inRangeRenewalsCount > 0 ? totalRevenue / inRangeRenewalsCount : 0;

      const trendMap = new Map<string, { revenue: number; date: Date }>();
      for (let cursor = new Date(startDate); cursor <= endDate; cursor.setDate(cursor.getDate() + 1)) {
        const key = toDateKey(cursor);
        trendMap.set(key, { revenue: 0, date: new Date(cursor) });
      }
      inRangePaidInvoices.forEach((invoice) => {
        const paidDate = normalizePaidDate(invoice);
        if (!paidDate) return;
        const key = toDateKey(paidDate);
        const current = trendMap.get(key);
        if (!current) return;
        current.revenue += numericInvoiceValue(invoice);
      });

      const trendRevenueSeries = Array.from(trendMap.values()).map((point) => ({
        label: point.date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        revenue: Number(point.revenue.toFixed(2)),
      }));
      const trendSeries = trendRevenueSeries.map((point, index) => {
        const previousPoint = trendRevenueSeries[index - 1];
        const previousRevenueByDay = Number(previousPoint?.revenue || 0);
        const profitPct = previousRevenueByDay <= 0
          ? (point.revenue > 0 ? 100 : 0)
          : ((point.revenue - previousRevenueByDay) / previousRevenueByDay) * 100;
        return {
          label: point.label,
          revenue: point.revenue,
          profitPct: Number(profitPct.toFixed(1)),
        };
      });

      const revenueProgressPct = previousRevenue <= 0
        ? (totalRevenue > 0 ? 100 : 0)
        : ((totalRevenue - previousRevenue) / previousRevenue) * 100;

      setSuperAdminInsights({
        totalRevenue: Number(totalRevenue.toFixed(2)),
        renewalsCount: inRangeRenewalsCount,
        totalClientsByDocument,
        activeOwners,
        inactiveOwners,
        newOwnersInRange,
        convertedTrialsCount,
        mrrEstimated: Number(mrrEstimated.toFixed(2)),
        avgRenewalTicket: Number(avgRenewalTicket.toFixed(2)),
        previousRevenue: Number(previousRevenue.toFixed(2)),
        revenueProgressPct: Number(revenueProgressPct.toFixed(1)),
        trendSeries,
      });
    } catch (err) {
      console.error('Erro ao carregar insights do SUPERADMIN:', err);
      setSuperAdminInsights({
        totalRevenue: 0,
        renewalsCount: 0,
        totalClientsByDocument: 0,
        activeOwners: 0,
        inactiveOwners: 0,
        newOwnersInRange: 0,
        convertedTrialsCount: 0,
        mrrEstimated: 0,
        avgRenewalTicket: 0,
        previousRevenue: 0,
        revenueProgressPct: 0,
        trendSeries: [],
      });
    } finally {
      setIsLoadingSuperAdminInsights(false);
    }
  };

  const isSuperAdmin = currentUser.role === Role.SUPERADMIN;
  const isOwner = currentUser.role === Role.OWNER;
  const isRestaurant = activeEnterprise?.type === 'RESTAURANTE';
  const hasHourlyMovement = (dashboardMetrics.todayHourly || []).some((point) => Number(point?.sales || 0) > 0);

  if (isSuperAdmin) {
    return (
      <div className="dash-shell space-y-4 p-4">
        <header className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src={resolveUserAvatar(currentUser?.avatar, currentUser?.name)}
              alt={currentUser?.name || 'Usuário'}
              className="w-11 h-11 rounded-xl object-cover border-2 border-white shadow-sm"
            />
            <div>
              <h1 className="text-xl font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tight flex items-center gap-2">
                <Globe className="text-indigo-600" size={18} /> Dashboard SUPERADMIN
              </h1>
              <p className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">Desempenho, financeiro, clientes e progresso global da plataforma</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={superAdminRange.start}
              onChange={(e) => setSuperAdminRange((prev) => ({ ...prev, start: e.target.value }))}
              className="h-9 px-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-bold"
            />
            <span className="text-xs font-black text-slate-400 uppercase">até</span>
            <input
              type="date"
              value={superAdminRange.end}
              onChange={(e) => setSuperAdminRange((prev) => ({ ...prev, end: e.target.value }))}
              className="h-9 px-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-bold"
            />
          </div>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 p-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Receita no período</p>
            <p className="text-xl font-black text-emerald-800 dark:text-emerald-200">R$ {superAdminInsights.totalRevenue.toFixed(2)}</p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-900/20 p-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-blue-600">Renovações no período</p>
            <p className="text-xl font-black text-blue-800 dark:text-blue-200">{superAdminInsights.renewalsCount}</p>
          </div>
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 dark:bg-indigo-900/20 p-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-indigo-600">MRR estimado</p>
            <p className="text-xl font-black text-indigo-800 dark:text-indigo-200">R$ {superAdminInsights.mrrEstimated.toFixed(2)}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 p-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-amber-600">Ticket médio da renovação</p>
            <p className="text-xl font-black text-amber-800 dark:text-amber-200">R$ {superAdminInsights.avgRenewalTicket.toFixed(2)}</p>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4 space-y-2">
            <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-500">Clientes e contas</h3>
            <p className="text-sm font-bold text-slate-700 dark:text-zinc-200">Clientes totais (donos com doc): {superAdminInsights.totalClientsByDocument}</p>
            <p className="text-sm font-bold text-slate-700 dark:text-zinc-200">Owners ativos: {superAdminInsights.activeOwners}</p>
            <p className="text-sm font-bold text-slate-700 dark:text-zinc-200">Owners inativos: {superAdminInsights.inactiveOwners}</p>
            <p className="text-sm font-bold text-slate-700 dark:text-zinc-200">Novos owners no período: {superAdminInsights.newOwnersInRange}</p>
            <p className="text-sm font-bold text-slate-700 dark:text-zinc-200">Testes convertidos em clientes: {superAdminInsights.convertedTrialsCount}</p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4 space-y-2">
            <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-500">Base da plataforma</h3>
            <p className="text-sm font-bold text-slate-700 dark:text-zinc-200">Usuários: {systemStats?.users || 0}</p>
            <p className="text-sm font-bold text-slate-700 dark:text-zinc-200">Empresas: {systemStats?.enterprises || 0}</p>
            <p className="text-sm font-bold text-slate-700 dark:text-zinc-200">Pedidos: {systemStats?.orders || 0}</p>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3">
          <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4 space-y-3">
            <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-500">Desempenho e progresso</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <p className="text-sm font-bold text-slate-700 dark:text-zinc-200">Receita: R$ {superAdminInsights.totalRevenue.toFixed(2)}</p>
              <p className={`text-sm font-black ${superAdminInsights.revenueProgressPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                Porcentagem de lucro: {superAdminInsights.revenueProgressPct >= 0 ? '+' : ''}{superAdminInsights.revenueProgressPct.toFixed(1)}%
              </p>
            </div>
            <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400">Comparado ao período anterior equivalente.</p>
            <div className="h-56 w-full rounded-lg border border-slate-100 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-950/40 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart key={`superadmin-trend-${superAdminChartTick}`} data={superAdminInsights.trendSeries} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                  <XAxis dataKey="label" tick={{ fill: chartTextColor, fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={14} />
                  <YAxis yAxisId="revenue" tick={{ fill: chartTextColor, fontSize: 10 }} axisLine={false} tickLine={false} width={56} />
                  <YAxis yAxisId="profitPct" orientation="right" tick={{ fill: chartTextColor, fontSize: 10 }} axisLine={false} tickLine={false} width={44} tickFormatter={(value) => `${value}%`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: chartTooltipBg,
                      border: `1px solid ${chartTooltipBorder}`,
                      borderRadius: '10px',
                      color: chartTextColor,
                      fontSize: '12px',
                    }}
                    formatter={(value: number, name: string) => {
                      if (name === 'Receita') return [`R$ ${Number(value).toFixed(2)}`, name];
                      if (name === '% Lucro') return [`${Number(value).toFixed(1)}%`, name];
                      return [String(value), name];
                    }}
                  />
                  <Line yAxisId="revenue" type="monotone" dataKey="revenue" name="Receita" stroke="#10b981" strokeWidth={3} dot={false} isAnimationActive animationDuration={2400} animationEasing="ease-in-out" />
                  <Line yAxisId="profitPct" type="monotone" dataKey="profitPct" name="% Lucro" stroke="#f59e0b" strokeWidth={2.5} dot={false} strokeDasharray="7 4" isAnimationActive animationDuration={2400} animationEasing="ease-in-out" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {(isLoadingStats || isLoadingSuperAdminInsights) && (
          <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4 text-sm font-bold text-slate-500 dark:text-zinc-400">
            Carregando indicadores do SUPERADMIN...
          </div>
        )}
      </div>
    );
  }

  // Guard clause: se não houver enterprise ativa E não for SUPERADMIN, mostrar mensagem
  if (!activeEnterprise && !isSuperAdmin) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-96">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="text-amber-600" size={32} />
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-800 mb-2">Nenhuma Empresa Ativa</h2>
              <p className="text-sm text-gray-600">
                Você não possui uma empresa vinculada ao seu usuário.
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Entre em contato com o administrador do sistema.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleResetDatabase = async () => {
    if (resetConfirmText !== 'RESETAR TUDO') {
      alert('Digite "RESETAR TUDO" para confirmar');
      return;
    }

    setIsResetting(true);
    try {
      try {
        await ApiService.resetDatabase();
      } catch (firstError) {
        const raw = String((firstError as any)?.message || '');
        const challengeId = (raw.match(/challengeId:\s*([^\s]+)/i)?.[1] || '').trim();
        const phrase = (raw.match(/phrase:\s*(.+?)(?:\s+expira em|\s+Repita a acao|$)/i)?.[1] || '').trim();
        if (!challengeId || !phrase) {
          throw firstError;
        }

        const reason = window.prompt(
          'Informe o motivo operacional do reset (minimo 8 caracteres):',
          'Reset completo autorizado pela administracao'
        );
        if (reason === null) {
          return;
        }

        await ApiService.resetDatabase({
          confirmationChallengeId: challengeId,
          confirmationPhrase: phrase,
          confirmationReason: String(reason || '').trim(),
        });
      }

      ApiService.clearToken();
      localStorage.removeItem('canteen_auth_user');
      localStorage.removeItem('canteen_active_enterprise');
      alert('Database resetada com sucesso! A pagina sera recarregada.');
      window.location.hash = '#/';
      window.location.reload();
    } catch (err) {
      console.error('Erro ao resetar database:', err);
      alert(err instanceof Error ? err.message : 'Erro ao resetar database. Verifique o console.');
    } finally {
      setIsResetting(false);
    }
  };

  const handlePrintPlanReport = (planName: string) => {
    try {
      const selectedPlan = (dashboardMetrics.activePlanBreakdown || []).find((item) => item.planName === planName);
      if (!selectedPlan) {
        alert('Plano não encontrado para gerar relatório.');
        return;
      }

      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const generatedAt = new Date();
      const leftStartX = 88;
      drawEnterpriseLogoOnPdf(doc, String(activeEnterprise?.logo || '').trim(), 40, 24, 36, 'CS');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('RELATÓRIO DE PLANO ATIVO', leftStartX, 40);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.text(`Empresa: ${activeEnterprise?.name || '-'}`, leftStartX, 62);
      doc.text(`Plano: ${selectedPlan.planName}`, leftStartX, 78);
      doc.text(`Total de alunos ativos: ${selectedPlan.studentsCount}`, leftStartX, 94);
      doc.text(`Saldo total do plano: R$ ${selectedPlan.totalBalance.toFixed(2)}`, leftStartX, 110);
      doc.text(`Gerado em: ${generatedAt.toLocaleString('pt-BR')}`, leftStartX, 126);

      const bodyRows = (selectedPlan.members || []).map((member, index) => [
        String(index + 1),
        member.name,
        member.className || '-',
        member.responsible || '-',
        `R$ ${Number(member.balance || 0).toFixed(2)}`,
      ]);

      autoTable(doc, {
        startY: 146,
        head: [['#', 'Aluno', 'Turma/Ano', 'Responsável', 'Saldo']],
        body: bodyRows,
        theme: 'grid',
        margin: { left: 40, right: 40 },
        styles: { fontSize: 10, cellPadding: 6, textColor: [31, 41, 55] },
        headStyles: { fillColor: [109, 40, 217], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });

      const safePlan = selectedPlan.planName.toLowerCase().replace(/\s+/g, '_');
      const safeEnterprise = String(activeEnterprise?.name || 'empresa').toLowerCase().replace(/\s+/g, '_');
      doc.save(`relatorio_plano_${safePlan}_${safeEnterprise}_${generatedAt.toISOString().slice(0, 10)}.pdf`);
    } catch (error) {
      console.error('Erro ao gerar PDF do plano:', error);
      alert('Não foi possível gerar o PDF deste plano.');
    }
  };

  const handlePrintWeekdayReport = (day: { label: string; dateLabel: string; count: number; plans: Array<{ planName: string; count: number }> }) => {
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const generatedAt = new Date();
      const leftStartX = 88;
      drawEnterpriseLogoOnPdf(doc, String(activeEnterprise?.logo || '').trim(), 40, 24, 36, 'CS');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('RELATÓRIO DE ENTREGA DO DIA', leftStartX, 40);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.text(`Empresa: ${activeEnterprise?.name || '-'}`, leftStartX, 62);
      doc.text(`Dia: ${day.label}`, leftStartX, 78);
      doc.text(`Data: ${day.dateLabel}`, leftStartX, 94);
      doc.text(`Total programado: ${day.count}`, leftStartX, 110);
      doc.text(`Gerado em: ${generatedAt.toLocaleString('pt-BR')}`, leftStartX, 126);

      const bodyRows = (day.plans || []).map((plan, index) => [
        String(index + 1),
        plan.planName,
        String(plan.count),
      ]);

      autoTable(doc, {
        startY: 146,
        head: [['#', 'Plano', 'Total']],
        body: bodyRows,
        theme: 'grid',
        margin: { left: 40, right: 40 },
        styles: { fontSize: 10, cellPadding: 6, textColor: [31, 41, 55] },
        headStyles: { fillColor: [13, 148, 136], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });

      const safeDate = String(day.dateLabel || '').replace(/\//g, '-');
      const safeEnterprise = String(activeEnterprise?.name || 'empresa').toLowerCase().replace(/\s+/g, '_');
      doc.save(`relatorio_entrega_${safeDate}_${safeEnterprise}.pdf`);
    } catch (error) {
      console.error('Erro ao gerar PDF do dia de entrega:', error);
      alert('Não foi possível gerar o PDF deste dia.');
    }
  };

  if (false && isSuperAdmin) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <img
              src={resolveUserAvatar(currentUser?.avatar, currentUser?.name)}
              alt={currentUser?.name || 'Usuário'}
              className="w-12 h-12 rounded-2xl object-cover border-2 border-white shadow-sm"
            />
            <div>
            <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2"><Globe className="text-indigo-600" /> Painel SaaS Platform</h1>
            <p className="text-sm text-gray-500 font-medium">Controle de Clientes Enterprise (Donos de Rede)</p>
            </div>
          </div>
          <button
            onClick={() => setIsResetModalOpen(true)}
            className="px-4 py-2 bg-red-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-red-700 transition-all flex items-center gap-2 shadow-lg"
          >
            <Trash2 size={16} />
            Resetar Database
          </button>
        </div>

        {isLoadingStats ? (
          <div className="flex items-center justify-center h-48">
            <div className="text-center space-y-4">
              <div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full"></div>
              <p className="text-gray-600 font-medium">Carregando estatísticas...</p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard 
                title="Usuários Registrados" 
                value={systemStats?.users || 0} 
                change={`${systemStats?.users || 0} total`} 
                isPositive 
                icon={<Users className="text-indigo-600" />} 
              />
              <StatCard 
                title="Empresas Cadastradas" 
                value={systemStats?.enterprises || 0} 
                change={`${systemStats?.enterprises || 0} total`} 
                isPositive 
                icon={<Building className="text-emerald-600" />} 
              />
              <StatCard 
                title="Transações/Vendas" 
                value={systemStats?.transactions || 0} 
                change={`${systemStats?.transactions || 0} total`} 
                isPositive 
                icon={<Wallet className="text-blue-600" />} 
              />
              <StatCard 
                title="Clientes Cadastrados" 
                value={systemStats?.clients || 0} 
                change={`${systemStats?.clients || 0} total`} 
                isPositive 
                icon={<Users className="text-amber-600" />} 
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard 
                title="Produtos" 
                value={systemStats?.products || 0} 
                change={`${systemStats?.products || 0} total`} 
                isPositive 
                icon={<Utensils className="text-purple-600" />} 
              />
              <StatCard 
                title="Fornecedores" 
                value={systemStats?.suppliers || 0} 
                change={`${systemStats?.suppliers || 0} total`} 
                isPositive 
                icon={<Building className="text-pink-600" />} 
              />
              <StatCard 
                title="Pedidos" 
                value={systemStats?.orders || 0} 
                change={`${systemStats?.orders || 0} total`} 
                isPositive 
                icon={<FileBarChart className="text-teal-600" />} 
              />
            </div>
          </>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
           <div className="lg:col-span-2 bg-white p-6 rounded-3xl border shadow-sm">
              <h3 className="font-black text-xs uppercase tracking-widest text-gray-400 mb-6">Visão Geral do Sistema</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-2xl border border-indigo-100">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
                      <Users className="text-indigo-600" size={24} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase">Total de Usuários</p>
                      <p className="text-2xl font-black text-gray-800">{systemStats?.users || 0}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-indigo-600">Sistema Ativo</p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-gradient-to-r from-emerald-50 to-green-50 rounded-2xl border border-emerald-100">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
                      <Building className="text-emerald-600" size={24} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase">Empresas Ativas</p>
                      <p className="text-2xl font-black text-gray-800">{systemStats?.enterprises || 0}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-emerald-600">Multi-Tenant</p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-2xl border border-blue-100">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
                      <Wallet className="text-blue-600" size={24} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase">Total de Transações</p>
                      <p className="text-2xl font-black text-gray-800">{systemStats?.transactions || 0}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-blue-600">Vendas</p>
                  </div>
                </div>
              </div>
           </div>
           <div className="bg-white p-6 rounded-3xl border shadow-sm">
              <h3 className="font-black text-xs uppercase tracking-widest text-gray-400 mb-6">Recursos do Sistema</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl border">
                  <div className="flex items-center gap-2">
                    <Utensils size={16} className="text-purple-600" />
                    <span className="text-sm font-bold text-gray-700">Produtos</span>
                  </div>
                  <span className="text-sm font-black text-gray-800">{systemStats?.products || 0}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl border">
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-amber-600" />
                    <span className="text-sm font-bold text-gray-700">Clientes</span>
                  </div>
                  <span className="text-sm font-black text-gray-800">{systemStats?.clients || 0}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl border">
                  <div className="flex items-center gap-2">
                    <Building size={16} className="text-pink-600" />
                    <span className="text-sm font-bold text-gray-700">Fornecedores</span>
                  </div>
                  <span className="text-sm font-black text-gray-800">{systemStats?.suppliers || 0}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl border">
                  <div className="flex items-center gap-2">
                    <FileBarChart size={16} className="text-teal-600" />
                    <span className="text-sm font-bold text-gray-700">Pedidos</span>
                  </div>
                  <span className="text-sm font-black text-gray-800">{systemStats?.orders || 0}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl border">
                  <div className="flex items-center gap-2">
                    <Scale size={16} className="text-indigo-600" />
                    <span className="text-sm font-bold text-gray-700">Ingredientes</span>
                  </div>
                  <span className="text-sm font-black text-gray-800">{systemStats?.ingredients || 0}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl border">
                  <div className="flex items-center gap-2">
                    <FileBarChart size={16} className="text-green-600" />
                    <span className="text-sm font-bold text-gray-700">Planos</span>
                  </div>
                  <span className="text-sm font-black text-gray-800">{systemStats?.plans || 0}</span>
                </div>
              </div>
           </div>
        </div>

        {/* Modal de Confirmação de Reset */}
        {isResetModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border-4 border-red-500 animate-in zoom-in-95 duration-200">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center">
                  <AlertTriangle className="text-red-600" size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-gray-800 uppercase tracking-tight">Resetar Database</h3>
                  <p className="text-xs text-red-600 font-bold uppercase tracking-widest">Ação irreversível</p>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4">
                  <p className="text-sm font-bold text-red-900 mb-2">⚠️ ATENÇÃO:</p>
                  <ul className="text-xs text-red-800 space-y-1 font-medium">
                    <li>• Todos os dados serão apagados permanentemente</li>
                    <li>• Empresas, usuários, produtos, clientes, planos</li>
                    <li>• Fornecedores, pedidos, transações, ingredientes</li>
                    <li>• Esta ação NÃO PODE SER DESFEITA</li>
                  </ul>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black text-gray-600 uppercase tracking-widest">
                    Digite "RESETAR TUDO" para confirmar:
                  </label>
                  <input
                    type="text"
                    value={resetConfirmText}
                    onChange={(e) => setResetConfirmText(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl font-bold text-center uppercase focus:border-red-500 focus:outline-none"
                    placeholder="RESETAR TUDO"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setIsResetModalOpen(false);
                    setResetConfirmText('');
                  }}
                  className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-gray-300 transition-all"
                  disabled={isResetting}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleResetDatabase}
                  disabled={resetConfirmText !== 'RESETAR TUDO' || isResetting}
                  className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isResetting ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      Resetando...
                    </>
                  ) : (
                    <>
                      <Trash2 size={16} />
                      Confirmar Reset
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="dash-shell dashboard-shell">
      <div className="dash-header">
        <div className="dash-title-wrap">
          <img
            src={resolveUserAvatar(currentUser?.avatar, currentUser?.name)}
            alt={currentUser?.name || 'Usuário'}
            className="w-10 h-10 rounded-xl object-cover border-2 border-white shadow-sm"
          />
          <div>
            <h1 className="dash-title text-xl flex items-center gap-2.5">
            {isRestaurant ? <ChefHat className="text-indigo-600" size={26} /> : isOwner ? <Building className="text-indigo-600" size={22} /> : <LayoutDashboardIcon className="text-indigo-600" size={22} />}
            Dashboard {isOwner ? 'da Rede' : isRestaurant ? 'do Restaurante' : 'da Cantina'}
            </h1>
            <p className="dash-subtitle">Análise de Performance: {activeEnterprise?.name}</p>
          </div>
        </div>
      </div>

      <div className="dash-kpi-grid gap-4">
        <StatCard
          title="Venda Mês"
          description="Total vendido no mês atual, comparado ao mês anterior."
          value={isLoadingDashboardMetrics ? '...' : `R$ ${dashboardMetrics.salesMonth.toFixed(2)}`}
          change={toPercentDelta(dashboardMetrics.salesMonth, dashboardMetrics.salesPreviousMonth)}
          isPositive={dashboardMetrics.salesMonth >= dashboardMetrics.salesPreviousMonth}
          icon={<TrendingUp className="text-indigo-600" />}
          monoValue
          loading={isLoadingDashboardMetrics}
          onClick={() => navigate('/unit-sales')}
          cta="Abrir Transações"
        />
        <StatCard
          title="Recarga Mês"
          description="Valor recarregado pelos clientes no mês atual."
          value={isLoadingDashboardMetrics ? '...' : `R$ ${dashboardMetrics.creditsMonth.toFixed(2)}`}
          change={toPercentDelta(dashboardMetrics.creditsMonth, dashboardMetrics.creditsPreviousMonth)}
          isPositive={dashboardMetrics.creditsMonth >= dashboardMetrics.creditsPreviousMonth}
          icon={<Wallet className="text-emerald-600" />}
          monoValue
          loading={isLoadingDashboardMetrics}
          onClick={() => navigate('/financial')}
          cta="Abrir Financeiro"
        />
        <StatCard
          title="Fluxo Clientes"
          description="Clientes únicos que tiveram movimentação hoje."
          value={isLoadingDashboardMetrics ? '...' : `${dashboardMetrics.uniqueClientsToday}`}
          change={toCountDelta(dashboardMetrics.uniqueClientsToday, dashboardMetrics.uniqueClientsYesterday)}
          isPositive={dashboardMetrics.uniqueClientsToday >= dashboardMetrics.uniqueClientsYesterday}
          icon={<Users className="text-blue-600" />}
          loading={isLoadingDashboardMetrics}
          onClick={() => navigate('/clients')}
          cta="Abrir Clientes"
        />
        <StatCard
          title="Estoque Crítico"
          description="Itens em nível mínimo que exigem reposição imediata."
          value={isLoadingDashboardMetrics ? '...' : `${dashboardMetrics.criticalStockCount} itens`}
          change={dashboardMetrics.criticalStockCount > 0 ? 'Urgente' : 'Normal'}
          isPositive={dashboardMetrics.criticalStockCount === 0}
          icon={<AlertTriangle className={`text-amber-600 ${dashboardMetrics.criticalStockCount > 5 ? 'animate-pulse' : ''}`} />}
          isWarning={dashboardMetrics.criticalStockCount > 0}
          loading={isLoadingDashboardMetrics}
          onClick={() => navigate('/products')}
          cta="Abrir Produtos"
        />
        <div className="lg:col-span-2">
          <StatCard
            title="Entrega SEG a SEX"
            description="Total de entregas programadas durante os dias úteis."
            value={isLoadingDashboardMetrics ? '...' : `${dashboardMetrics.weekdayDeliveriesCount}`}
            valueBesideIcon
            hideMainValue
            change="Dias programados"
            isPositive
            icon={<Calendar className="text-teal-600" />}
            loading={isLoadingDashboardMetrics}
            onClick={() => navigate('/daily-delivery')}
            cta="Abrir Entregas"
            renderExtra={
              <div className="mt-2.5 space-y-1.5">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                  {dashboardMetrics.weekdayDeliveriesWindowLabel || 'Semana de referência'}
                </p>
                <div className="flex justify-center gap-1.5 overflow-x-auto pb-1 pr-1">
                  {(dashboardMetrics.weekdayDeliveriesByDay || []).map((day) => (
                    <div
                      key={day.key}
                      className="w-[96px] min-w-[96px] rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white px-1.5 py-2 text-center min-h-[156px] flex flex-col shadow-sm"
                    >
                      <p className="text-[28px] font-black text-slate-800 uppercase tracking-tight leading-none">
                        {day.label || day.fullLabel || day.key}
                      </p>
                      <p className="text-[11px] font-bold text-slate-500 mt-1.5 leading-none whitespace-nowrap">{day.dateLabel}</p>
                      <div className="w-full border-b border-slate-300 mt-2 mb-2" />
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">Total</p>
                      <p className="text-[38px] font-black text-teal-700 leading-[0.9] mt-1">{day.count}</p>
                      <div className="mt-1.5 space-y-1 text-left">
                        {(day.plans || []).slice(0, 3).map((plan) => (
                          <div key={`${day.key}-${plan.planName}`} className="flex items-center justify-between gap-1 rounded-md border border-teal-100 bg-teal-50 px-1 py-0.5">
                            <span className="text-[8px] font-black text-teal-700 uppercase truncate">{plan.planName}</span>
                            <span className="text-[8px] font-black text-teal-900">{plan.count}</span>
                          </div>
                        ))}
                        {(day.plans || []).length === 0 && (
                          <div className="rounded-lg border border-slate-200 bg-slate-100 px-1.5 py-1 text-center">
                            <span className="text-[8px] font-bold text-slate-500 uppercase">Sem entrega</span>
                          </div>
                        )}
                      {(day.plans || []).length > 3 && (
                        <p className="text-[8px] font-black text-slate-500 text-right">
                          +{(day.plans || []).length - 3}
                        </p>
                      )}
                      <div className="mt-1.5">
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            event.stopPropagation();
                            handlePrintWeekdayReport(day);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              event.stopPropagation();
                              handlePrintWeekdayReport(day);
                            }
                          }}
                          className="inline-flex items-center justify-center w-full rounded-md border border-teal-200 bg-white px-1 py-0.5 text-[8px] font-black uppercase tracking-wide text-teal-700 hover:bg-teal-50 transition-colors cursor-pointer"
                        >
                          Imprimir PDF
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                </div>
              </div>
            }
          />
        </div>
        <div className="lg:col-span-1">
          <StatCard
            title="Alunos c/ Plano Ativo"
            description="Alunos com saldo disponível em planos ativos."
            value={isLoadingDashboardMetrics ? '...' : `${dashboardMetrics.activeStudentsWithPlanBalance}`}
            valueBesideIcon
            hideMainValue
            change="Saldo de plano > 0"
            isPositive
            icon={<Users className="text-purple-600" />}
            loading={isLoadingDashboardMetrics}
            onClick={() => navigate('/clients')}
            cta="Ver Alunos"
            renderExtra={
              <div className="mt-2.5 space-y-1.5">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Totais por Plano Ativo</p>
                <div className="flex justify-center gap-1.5 overflow-x-auto pb-1 pr-1">
                  {(dashboardMetrics.activePlanBreakdown || []).slice(0, 6).map((plan) => (
                    <div
                      key={plan.planName}
                      className="w-[96px] min-w-[96px] rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white px-1.5 py-2 text-center min-h-[156px] flex flex-col shadow-sm"
                    >
                      <p className="text-[13px] font-black text-slate-800 uppercase tracking-tight leading-none line-clamp-2 min-h-[28px]">
                        {plan.planName}
                      </p>
                      <p className="text-[10px] font-bold text-slate-500 mt-1.5 leading-none">Alunos ativos</p>
                      <div className="w-full border-b border-slate-300 mt-2 mb-2" />
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">Total</p>
                      <p className="text-[38px] font-black text-purple-700 leading-[0.9] mt-1">{plan.studentsCount}</p>
                      <div className="mt-1.5 rounded-md border border-purple-100 bg-purple-50 px-1 py-0.5 text-left">
                        <span className="text-[8px] font-black text-purple-700 uppercase">Saldo</span>
                        <p className="text-[10px] font-black text-purple-900">R$ {plan.totalBalance.toFixed(2)}</p>
                      </div>
                      <div className="mt-1.5">
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            event.stopPropagation();
                            handlePrintPlanReport(plan.planName);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              event.stopPropagation();
                              handlePrintPlanReport(plan.planName);
                            }
                          }}
                          className="inline-flex items-center justify-center w-full rounded-md border border-purple-200 bg-white px-1 py-0.5 text-[8px] font-black uppercase tracking-wide text-purple-700 hover:bg-purple-50 transition-colors cursor-pointer"
                        >
                          Imprimir PDF
                        </span>
                      </div>
                    </div>
                  ))}
                  {(dashboardMetrics.activePlanBreakdown || []).length === 0 && (
                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-2.5 py-2 text-center">
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Sem planos ativos</p>
                    </div>
                  )}
                </div>
                {(dashboardMetrics.activePlanBreakdown || []).length > 6 && (
                  <p className="text-[9px] font-bold text-purple-500">
                    +{(dashboardMetrics.activePlanBreakdown || []).length - 6} plano(s)...
                  </p>
                )}
              </div>
            }
          />
        </div>
        <div className="lg:col-span-1 dash-panel p-4 flex flex-col justify-between">
          <div className="space-y-3">
            <h3 className="font-black text-gray-400 dark:text-slate-400 uppercase tracking-widest text-[10px]">Indicadores Operacionais</h3>
            <div className="space-y-2">
              <button
                onClick={() => navigate('/unit-sales')}
                className="w-full text-left p-3 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl border border-indigo-100 dark:border-indigo-400/20 flex gap-2.5 items-center hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-all"
              >
                <div className="bg-indigo-600 text-white p-1.5 rounded-lg shadow-lg"><TrendingUp size={14} /></div>
                <div>
                  <p className="text-[9px] font-black text-indigo-900 dark:text-indigo-200 uppercase">Movimentações do Dia</p>
                  <p className="text-sm font-black text-indigo-600 leading-none mt-0.5">
                    R$ {dashboardMetrics.salesToday.toFixed(2)}
                  </p>
                </div>
              </button>
              <button
                onClick={() => navigate('/inventory')}
                className="w-full text-left p-3 bg-amber-50 dark:bg-amber-500/10 rounded-xl border border-amber-100 dark:border-amber-400/20 flex gap-2.5 items-center hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-all"
              >
                <div className="bg-amber-500 text-white p-1.5 rounded-lg shadow-lg"><AlertTriangle size={14} /></div>
                <div>
                  <p className="text-[9px] font-black text-amber-900 dark:text-amber-200 uppercase">Itens em Alerta de Estoque</p>
                  <p className="text-sm font-black text-amber-600 leading-none mt-0.5">
                    {dashboardMetrics.criticalStockCount} itens
                  </p>
                </div>
              </button>
              <button
                onClick={() => navigate('/financial')}
                className="w-full text-left p-3 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl border border-emerald-100 dark:border-emerald-400/20 flex gap-2.5 items-center hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-all"
              >
                <div className="bg-emerald-600 text-white p-1.5 rounded-lg shadow-lg"><Wallet size={14} /></div>
                <div>
                  <p className="text-[9px] font-black text-emerald-900 dark:text-emerald-200 uppercase">Recarga Hoje</p>
                  <p className="text-sm font-black text-emerald-600 leading-none mt-0.5">
                    R$ {dashboardMetrics.creditsToday.toFixed(2)}
                  </p>
                </div>
              </button>
            </div>
          </div>
          <button
            onClick={() => navigate('/reports')}
            className="w-full py-2.5 bg-gray-900 dark:bg-slate-700 text-white rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-black dark:hover:bg-slate-600 transition-all flex items-center justify-center gap-2 mt-4 shadow-lg"
          >
            <FileBarChart size={14} /> Gerar Fechamento
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Gráfico Principal */}
        <div className="lg:col-span-3 dash-panel p-5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-black text-gray-400 dark:text-slate-400 uppercase tracking-widest text-[10px]">
              {isRestaurant ? 'Mix de Vendas por Categoria (Hoje)' : isOwner ? 'Vendas por Hora (Unidade Selecionada)' : 'Performance Operacional por Hora'}
            </h3>
            {isRestaurant && (
                  <div className="flex gap-2.5 flex-wrap justify-end">
                {dashboardMetrics.salesByCategory.slice(0, 3).map((item) => (
                  <LegendItem key={item.name} color={item.fill} label={item.name} />
                ))}
              </div>
            )}
          </div>
          
          <div ref={chartContainerRef} className="h-64 min-h-[250px] min-w-0">
            {chartContainerSize.width > 0 && chartContainerSize.height > 0 ? (
              isLoadingDashboardMetrics ? (
                <div className="h-full w-full rounded-2xl border border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-700/40 animate-pulse" />
              ) : (!isRestaurant && !hasHourlyMovement) ? (
                <div className="h-full w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 flex items-center justify-center">
                  <div className="text-center px-4">
                    <Clock className="mx-auto text-slate-400 dark:text-slate-300 mb-2" size={22} />
                    <p className="text-sm font-bold text-slate-500 dark:text-slate-200">Aguardando primeiras movimentações do dia...</p>
                    <p className="text-xs text-slate-400 dark:text-slate-400 mt-1">Assim que houver transações, o gráfico será atualizado.</p>
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  {isRestaurant ? (
                    <BarChart data={dashboardMetrics.salesByCategory} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={chartGridColor} />
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={120} tick={{fontSize: 10, fontWeight: 'bold', fill: chartTextColor}} />
                      <Tooltip
                        cursor={{ fill: isDark ? '#1e293b' : '#f8fafc' }}
                        contentStyle={{ backgroundColor: chartTooltipBg, borderColor: chartTooltipBorder, borderRadius: 12 }}
                        labelStyle={{ color: chartTextColor, fontWeight: 700 }}
                      />
                      <Bar dataKey="value" radius={[0, 10, 10, 0]}>
                        {dashboardMetrics.salesByCategory.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                      </Bar>
                    </BarChart>
                  ) : (
                    <LineChart data={dashboardMetrics.todayHourly}>
                      <defs>
                        <linearGradient id="salesAreaGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.28} />
                          <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartGridColor} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: chartTextColor }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: chartTextColor }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: chartTooltipBg, borderColor: chartTooltipBorder, borderRadius: 12 }}
                        labelStyle={{ color: chartTextColor, fontWeight: 700 }}
                      />
                      <Area type="monotone" dataKey="sales" stroke="none" fill="url(#salesAreaGradient)" />
                      <Line type="monotone" dataKey="sales" stroke="#4f46e5" strokeWidth={4} dot={{r: 5, fill: '#4f46e5'}} />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              )
            ) : (
              <div className="h-full w-full rounded-2xl border border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-700/40 animate-pulse" />
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

const StatCard: React.FC<any> = ({ title, description, value, change, isPositive, icon, isWarning, onClick, cta, renderExtra, valueBesideIcon, hideMainValue, monoValue, loading }) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full text-left p-4 rounded-2xl border shadow-sm transition-all hover:shadow-xl group backdrop-blur-md ring-1 ring-inset ${isWarning ? 'border-amber-200 dark:border-amber-500/30 bg-gradient-to-br from-amber-50/80 via-white to-rose-50/40 dark:from-amber-500/10 dark:via-slate-800 dark:to-rose-500/5 ring-amber-100 dark:ring-amber-500/10' : 'border-slate-200 dark:border-slate-700 bg-gradient-to-br from-white via-white to-indigo-50/40 dark:from-slate-800 dark:via-slate-800 dark:to-indigo-500/10 ring-white/70 dark:ring-slate-600/40'} ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
  >
    <div className="flex items-center justify-between mb-2.5">
      <div className="flex items-center gap-2.5">
        <div className="p-2 bg-gray-50/90 rounded-xl group-hover:bg-indigo-50 transition-colors shadow-inner">{icon}</div>
        {valueBesideIcon ? (
          loading
            ? <div className="h-6 w-16 rounded-lg bg-slate-200 dark:bg-slate-700 animate-pulse" />
            : <p className={`text-xl font-black text-gray-800 dark:text-slate-100 leading-none ${monoValue ? 'font-mono' : ''}`}>{value}</p>
        ) : null}
      </div>
      <div className={`flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-full border ${isPositive ? 'bg-green-50 text-green-600 border-green-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
        {change}
      </div>
    </div>
    <p className="text-gray-400 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest">{title}</p>
    {description ? <p className="mt-1 text-[11px] leading-tight text-slate-500 dark:text-slate-300">{description}</p> : null}
    {!hideMainValue ? (
      loading
        ? <div className="mt-1.5 h-7 w-24 rounded-lg bg-slate-200 dark:bg-slate-700 animate-pulse" />
        : <p className={`text-xl font-black text-gray-800 dark:text-slate-100 mt-1 ${monoValue ? 'font-mono' : ''}`}>{value}</p>
    ) : null}
    {renderExtra || null}
    {cta ? (
      <div className="mt-3 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-indigo-600">
        {cta} <ChevronRight size={13} />
      </div>
    ) : null}
  </button>
);

const LegendItem = ({ color, label }: any) => (
  <div className="flex items-center gap-1.5">
    <div className="w-2 h-2 rounded-full" style={{backgroundColor: color}}></div>
    <span className="text-[9px] font-black text-gray-400 dark:text-slate-400 uppercase">{label}</span>
  </div>
);

const LayoutDashboardIcon = ({ size, className }: any) => (
  <svg width={size || 24} height={size || 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>
  </svg>
);

const ChevronRight = ({ size, className }: any) => (
  <svg width={size || 16} height={size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="m9 18 6-6-6-6"/>
  </svg>
);

export default DashboardPage;
