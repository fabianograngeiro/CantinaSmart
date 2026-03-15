import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  TrendingUp, Users, AlertTriangle, ArrowUpRight, ArrowDownRight, 
  Sparkles, Clock, Ban, Utensils, LayoutDashboard, Calendar, 
  Percent, Tag, Save, X, ArrowRight, Info, Globe, ShieldCheck, Building, Wallet,
  // Added missing FileBarChart import
  ChefHat, Scale, Coffee, UtensilsCrossed, FileBarChart, Trash2, RefreshCw
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Cell, PieChart, Pie } from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Role, User, Enterprise, Product } from '../types';
import ApiService from '../services/api';
import { resolveUserAvatar } from '../utils/avatar';

interface DashboardProps {
  currentUser: User;
  activeEnterprise: Enterprise;
}

type DashboardMetrics = {
  salesToday: number;
  salesYesterday: number;
  creditsToday: number;
  creditsYesterday: number;
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
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [systemStats, setSystemStats] = useState<any>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics>({
    salesToday: 0,
    salesYesterday: 0,
    creditsToday: 0,
    creditsYesterday: 0,
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

  // Buscar estatísticas do sistema para SUPERADMIN
  useEffect(() => {
    if (currentUser.role === Role.SUPERADMIN) {
      loadSystemStats();
    } else {
      setIsLoadingStats(false); // Para não-SUPERADMIN, não precisa carregar stats
    }
  }, [currentUser.role]);

  // Buscar colaboradores com débito para unidades
  useEffect(() => {
    if (activeEnterprise && currentUser.role !== Role.SUPERADMIN) {
      loadDashboardMetrics();
    }
  }, [activeEnterprise, currentUser.role]);

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
      const [transactions, products, clients] = await Promise.all([
        ApiService.getTransactions({ enterpriseId: activeEnterprise.id }),
        ApiService.getProducts(activeEnterprise.id),
        ApiService.getClients(activeEnterprise.id),
      ]);

      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const todayKey = toDateKey(today);
      const yesterdayKey = toDateKey(yesterday);

      const productById = new Map(products.map((product: Product) => [product.id, product]));
      const todayHourlyMap = new Map<string, number>();
      const categoryMap = new Map<string, number>();

      const normalize = (value?: string) =>
        String(value || '')
          .trim()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toUpperCase();

      const blockedPlanNames = new Set(['PREPAGO', 'PRE-PAGO', 'PRÉ-PAGO', 'CANTINA', 'CREDITO CANTINA', 'CRÉDITO CANTINA']);

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
          const planName = normalize(entry?.planName);
          const balance = Number(entry?.balance || 0);
          return balance > 0 && !blockedPlanNames.has(planName);
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
          const normalizedPlanName = normalize(entry?.planName);
          const balance = Number(entry?.balance || 0);
          if (!normalizedPlanName || balance <= 0 || blockedPlanNames.has(normalizedPlanName)) return;

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

            const hasWeekDayMatch = days.some((day: string) => normalize(day) === dayInfo.key);
            const hasSelectedDateMatch = selectedDates.some((date: string) => String(date || '').slice(0, 10) === dayInfo.iso);
            if (!hasWeekDayMatch && !hasSelectedDateMatch) return;

            const rawPlanName = String(config?.planName || config?.name || '').trim();
            const normalizedPlanName = normalize(rawPlanName);
            if (!normalizedPlanName || blockedPlanNames.has(normalizedPlanName)) return;
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

      const isCreditTx = (tx: any) => {
        const txType = String(tx?.type || '').toUpperCase();
        const method = String(tx?.method || tx?.paymentMethod || '').toUpperCase();
        return txType.includes('CREDIT') || txType.includes('CREDITO') || txType.includes('ENTRADA') || method.includes('CREDIT');
      };

      const txToday = transactions.filter((tx: any) => getDateKeyFromTransaction(tx) === todayKey);
      const txYesterday = transactions.filter((tx: any) => getDateKeyFromTransaction(tx) === yesterdayKey);

      let salesToday = 0;
      let salesYesterday = 0;
      let creditsToday = 0;
      let creditsYesterday = 0;

      txToday.forEach((tx: any) => {
        const value = getNumericValue(tx);
        if (isCreditTx(tx)) {
          creditsToday += value;
        } else {
          salesToday += value;
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
        if (isCreditTx(tx)) {
          creditsYesterday += value;
        } else {
          salesYesterday += value;
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
        creditsToday: Number(creditsToday.toFixed(2)),
        creditsYesterday: Number(creditsYesterday.toFixed(2)),
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

  const isSuperAdmin = currentUser.role === Role.SUPERADMIN;
  const isOwner = currentUser.role === Role.OWNER;
  const isRestaurant = activeEnterprise?.type === 'RESTAURANTE';

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
      await ApiService.resetDatabase();
      alert('✅ Database resetada com sucesso! A página será recarregada.');
      // Recarrega a página para limpar o estado
      window.location.reload();
    } catch (err) {
      console.error('Erro ao resetar database:', err);
      alert('❌ Erro ao resetar database. Verifique o console.');
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

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('RELATÓRIO DE PLANO ATIVO', 40, 40);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.text(`Empresa: ${activeEnterprise?.name || '-'}`, 40, 62);
      doc.text(`Plano: ${selectedPlan.planName}`, 40, 78);
      doc.text(`Total de alunos ativos: ${selectedPlan.studentsCount}`, 40, 94);
      doc.text(`Saldo total do plano: R$ ${selectedPlan.totalBalance.toFixed(2)}`, 40, 110);
      doc.text(`Gerado em: ${generatedAt.toLocaleString('pt-BR')}`, 40, 126);

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

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('RELATÓRIO DE ENTREGA DO DIA', 40, 40);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.text(`Empresa: ${activeEnterprise?.name || '-'}`, 40, 62);
      doc.text(`Dia: ${day.label}`, 40, 78);
      doc.text(`Data: ${day.dateLabel}`, 40, 94);
      doc.text(`Total programado: ${day.count}`, 40, 110);
      doc.text(`Gerado em: ${generatedAt.toLocaleString('pt-BR')}`, 40, 126);

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

  if (isSuperAdmin) {
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
    <div className="dash-shell">
      <div className="dash-header">
        <div className="dash-title-wrap">
          <img
            src={resolveUserAvatar(currentUser?.avatar, currentUser?.name)}
            alt={currentUser?.name || 'Usuário'}
            className="w-12 h-12 rounded-2xl object-cover border-2 border-white shadow-sm"
          />
          <div>
            <h1 className="dash-title text-2xl flex items-center gap-3">
            {isRestaurant ? <ChefHat className="text-indigo-600" size={32} /> : isOwner ? <Building className="text-indigo-600" /> : <LayoutDashboardIcon className="text-indigo-600" />}
            Dashboard {isOwner ? 'da Rede' : isRestaurant ? 'do Restaurante' : 'da Cantina'}
            </h1>
            <p className="dash-subtitle">Análise de Performance: {activeEnterprise?.name}</p>
          </div>
        </div>
      </div>

      <div className="dash-kpi-grid">
        <StatCard
          title="Vendas Hoje"
          value={isLoadingDashboardMetrics ? '...' : `R$ ${dashboardMetrics.salesToday.toFixed(2)}`}
          change={toPercentDelta(dashboardMetrics.salesToday, dashboardMetrics.salesYesterday)}
          isPositive={dashboardMetrics.salesToday >= dashboardMetrics.salesYesterday}
          icon={<TrendingUp className="text-indigo-600" />}
          onClick={() => navigate('/unit-sales')}
          cta="Abrir Transações"
        />
        <StatCard
          title="Recargas Hoje"
          value={isLoadingDashboardMetrics ? '...' : `R$ ${dashboardMetrics.creditsToday.toFixed(2)}`}
          change={toPercentDelta(dashboardMetrics.creditsToday, dashboardMetrics.creditsYesterday)}
          isPositive={dashboardMetrics.creditsToday >= dashboardMetrics.creditsYesterday}
          icon={<Wallet className="text-emerald-600" />}
          onClick={() => navigate('/financial')}
          cta="Abrir Financeiro"
        />
        <StatCard
          title="Fluxo Clientes"
          value={isLoadingDashboardMetrics ? '...' : `${dashboardMetrics.uniqueClientsToday}`}
          change={toCountDelta(dashboardMetrics.uniqueClientsToday, dashboardMetrics.uniqueClientsYesterday)}
          isPositive={dashboardMetrics.uniqueClientsToday >= dashboardMetrics.uniqueClientsYesterday}
          icon={<Users className="text-blue-600" />}
          onClick={() => navigate('/clients')}
          cta="Abrir Clientes"
        />
        <StatCard
          title="Estoque Crítico"
          value={isLoadingDashboardMetrics ? '...' : `${dashboardMetrics.criticalStockCount} itens`}
          change={dashboardMetrics.criticalStockCount > 0 ? 'Urgente' : 'Normal'}
          isPositive={dashboardMetrics.criticalStockCount === 0}
          icon={<AlertTriangle className="text-amber-600" />}
          isWarning={dashboardMetrics.criticalStockCount > 0}
          onClick={() => navigate('/products')}
          cta="Abrir Produtos"
        />
        <div className="lg:col-span-2">
          <StatCard
            title="Entrega SEG a SEX"
            value={isLoadingDashboardMetrics ? '...' : `${dashboardMetrics.weekdayDeliveriesCount}`}
            valueBesideIcon
            hideMainValue
            change="Dias programados"
            isPositive
            icon={<Calendar className="text-teal-600" />}
            onClick={() => navigate('/daily-delivery')}
            cta="Abrir Entregas"
            renderExtra={
              <div className="mt-3 space-y-2">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                  {dashboardMetrics.weekdayDeliveriesWindowLabel || 'Semana de referência'}
                </p>
                <div className="flex justify-center gap-2 overflow-x-auto pb-1 pr-1">
                  {(dashboardMetrics.weekdayDeliveriesByDay || []).map((day) => (
                    <div
                      key={day.key}
                      className="w-[108px] min-w-[108px] rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white px-2 py-3 text-center min-h-[182px] flex flex-col shadow-sm"
                    >
                      <p className="text-[36px] font-black text-slate-800 uppercase tracking-tight leading-none">
                        {day.label || day.fullLabel || day.key}
                      </p>
                      <p className="text-[13px] font-bold text-slate-500 mt-2 leading-none whitespace-nowrap">{day.dateLabel}</p>
                      <div className="w-full border-b border-slate-300 mt-3 mb-2.5" />
                      <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest leading-none">Total</p>
                      <p className="text-[52px] font-black text-teal-700 leading-[0.9] mt-1">{day.count}</p>
                      <div className="mt-2 space-y-1 text-left">
                        {(day.plans || []).slice(0, 3).map((plan) => (
                          <div key={`${day.key}-${plan.planName}`} className="flex items-center justify-between gap-1 rounded-lg border border-teal-100 bg-teal-50 px-1.5 py-1">
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
                          className="inline-flex items-center justify-center w-full rounded-lg border border-teal-200 bg-white px-1.5 py-1 text-[8px] font-black uppercase tracking-wide text-teal-700 hover:bg-teal-50 transition-colors cursor-pointer"
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
            value={isLoadingDashboardMetrics ? '...' : `${dashboardMetrics.activeStudentsWithPlanBalance}`}
            valueBesideIcon
            hideMainValue
            change="Saldo de plano > 0"
            isPositive
            icon={<Users className="text-purple-600" />}
            onClick={() => navigate('/clients')}
            cta="Ver Alunos"
            renderExtra={
              <div className="mt-3 space-y-2">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Totais por Plano Ativo</p>
                <div className="flex justify-center gap-2 overflow-x-auto pb-1 pr-1">
                  {(dashboardMetrics.activePlanBreakdown || []).slice(0, 6).map((plan) => (
                    <div
                      key={plan.planName}
                      className="w-[108px] min-w-[108px] rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white px-2 py-3 text-center min-h-[182px] flex flex-col shadow-sm"
                    >
                      <p className="text-[16px] font-black text-slate-800 uppercase tracking-tight leading-none line-clamp-2 min-h-[34px]">
                        {plan.planName}
                      </p>
                      <p className="text-[11px] font-bold text-slate-500 mt-2 leading-none">Alunos ativos</p>
                      <div className="w-full border-b border-slate-300 mt-3 mb-2.5" />
                      <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest leading-none">Total</p>
                      <p className="text-[52px] font-black text-purple-700 leading-[0.9] mt-1">{plan.studentsCount}</p>
                      <div className="mt-2 rounded-lg border border-purple-100 bg-purple-50 px-1.5 py-1 text-left">
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
                          className="inline-flex items-center justify-center w-full rounded-lg border border-purple-200 bg-white px-1.5 py-1 text-[8px] font-black uppercase tracking-wide text-purple-700 hover:bg-purple-50 transition-colors cursor-pointer"
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
        <div className="lg:col-span-1 dash-panel p-6 flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="font-black text-gray-400 uppercase tracking-widest text-[10px]">Indicadores Operacionais</h3>
            <div className="space-y-3">
              <button
                onClick={() => navigate('/unit-sales')}
                className="w-full text-left p-4 bg-indigo-50 rounded-2xl border border-indigo-100 flex gap-3 items-center hover:bg-indigo-100 transition-all"
              >
                <div className="bg-indigo-600 text-white p-2 rounded-xl shadow-lg"><TrendingUp size={16} /></div>
                <div>
                  <p className="text-[9px] font-black text-indigo-900 uppercase">Movimentações do Dia</p>
                  <p className="text-base font-black text-indigo-600 leading-none mt-0.5">
                    R$ {dashboardMetrics.salesToday.toFixed(2)}
                  </p>
                </div>
              </button>
              <button
                onClick={() => navigate('/inventory')}
                className="w-full text-left p-4 bg-amber-50 rounded-2xl border border-amber-100 flex gap-3 items-center hover:bg-amber-100 transition-all"
              >
                <div className="bg-amber-500 text-white p-2 rounded-xl shadow-lg"><AlertTriangle size={16} /></div>
                <div>
                  <p className="text-[9px] font-black text-amber-900 uppercase">Itens em Alerta de Estoque</p>
                  <p className="text-base font-black text-amber-600 leading-none mt-0.5">
                    {dashboardMetrics.criticalStockCount} itens
                  </p>
                </div>
              </button>
            </div>
          </div>
          <button
            onClick={() => navigate('/reports')}
            className="w-full py-3 bg-gray-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all flex items-center justify-center gap-2 mt-6 shadow-lg"
          >
            <FileBarChart size={14} /> Gerar Fechamento
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico Principal */}
        <div className="lg:col-span-3 dash-panel p-8">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-black text-gray-400 uppercase tracking-widest text-[10px]">
              {isRestaurant ? 'Mix de Vendas por Categoria (Hoje)' : isOwner ? 'Vendas por Hora (Unidade Selecionada)' : 'Performance Operacional por Hora'}
            </h3>
            {isRestaurant && (
              <div className="flex gap-4 flex-wrap justify-end">
                {dashboardMetrics.salesByCategory.slice(0, 3).map((item) => (
                  <LegendItem key={item.name} color={item.fill} label={item.name} />
                ))}
              </div>
            )}
          </div>
          
          <div className="h-72 min-h-[288px] min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              {isRestaurant ? (
                <BarChart data={dashboardMetrics.salesByCategory} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={120} tick={{fontSize: 10, fontWeight: 'bold', fill: '#64748b'}} />
                  <Tooltip cursor={{fill: '#f8fafc'}} />
                  <Bar dataKey="value" radius={[0, 10, 10, 0]}>
                    {dashboardMetrics.salesByCategory.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              ) : (
                <LineChart data={dashboardMetrics.todayHourly}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="sales" stroke="#4f46e5" strokeWidth={4} dot={{r: 6, fill: '#4f46e5'}} />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
};

const StatCard: React.FC<any> = ({ title, value, change, isPositive, icon, isWarning, onClick, cta, renderExtra, valueBesideIcon, hideMainValue }) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full text-left bg-white p-6 rounded-[32px] border shadow-sm transition-all hover:shadow-xl group ${isWarning ? 'border-amber-200 bg-amber-50/10' : 'border-gray-100'} ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
  >
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-gray-50 rounded-2xl group-hover:bg-indigo-50 transition-colors shadow-inner">{icon}</div>
        {valueBesideIcon ? <p className="text-2xl font-black text-gray-800 leading-none">{value}</p> : null}
      </div>
      <div className={`flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-full border ${isPositive ? 'bg-green-50 text-green-600 border-green-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
        {change}
      </div>
    </div>
    <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">{title}</p>
    {!hideMainValue ? <p className="text-2xl font-black text-gray-800 mt-1">{value}</p> : null}
    {renderExtra || null}
    {cta ? (
      <div className="mt-4 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-indigo-600">
        {cta} <ChevronRight size={13} />
      </div>
    ) : null}
  </button>
);

const LegendItem = ({ color, label }: any) => (
  <div className="flex items-center gap-1.5">
    <div className="w-2 h-2 rounded-full" style={{backgroundColor: color}}></div>
    <span className="text-[9px] font-black text-gray-400 uppercase">{label}</span>
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
