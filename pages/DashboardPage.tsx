import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, Users, AlertTriangle, ArrowUpRight, ArrowDownRight, 
  Sparkles, Clock, Ban, Utensils, LayoutDashboard, Calendar, 
  Percent, Tag, Save, X, ArrowRight, Info, Globe, ShieldCheck, Building, Wallet,
  // Added missing FileBarChart import
  ChefHat, Scale, Coffee, UtensilsCrossed, FileBarChart, Trash2, RefreshCw, CreditCard, Check
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Cell, PieChart, Pie } from 'recharts';
import { Role, User, Enterprise, Product, Client } from '../types';
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

const hasCollaboratorDebtExpired = (enterprise?: Enterprise | null) => {
  if (!enterprise) return false;

  const configuredDueDayRaw =
    (enterprise as any)?.collaboratorPaymentDueDay ??
    (enterprise as any)?.collaboratorClosingDate;
  const configuredDueDay = Number(configuredDueDayRaw);

  // Sem dia de vencimento configurado, mantém comportamento atual para não ocultar débitos
  if (!Number.isFinite(configuredDueDay) || configuredDueDay <= 0) return true;

  const now = new Date();
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dueDayInCurrentMonth = Math.min(Math.max(1, Math.floor(configuredDueDay)), lastDayOfMonth);
  const dueDate = new Date(now.getFullYear(), now.getMonth(), dueDayInCurrentMonth, 23, 59, 59, 999);

  return now.getTime() > dueDate.getTime();
};

const DashboardPage: React.FC<DashboardProps> = ({ currentUser, activeEnterprise }) => {
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [systemStats, setSystemStats] = useState<any>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [collaboratorsInDebt, setCollaboratorsInDebt] = useState<Client[]>([]);
  const [isLoadingCollaborators, setIsLoadingCollaborators] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [collaboratorInPayment, setCollaboratorInPayment] = useState<Client | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'BOLETO' | 'CAIXA'>('PIX');
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics>({
    salesToday: 0,
    salesYesterday: 0,
    creditsToday: 0,
    creditsYesterday: 0,
    uniqueClientsToday: 0,
    uniqueClientsYesterday: 0,
    criticalStockCount: 0,
    todayHourly: [],
    salesByCategory: [],
  });
  const [isLoadingDashboardMetrics, setIsLoadingDashboardMetrics] = useState(false);
  const shouldShowCollaboratorDebtCard = hasCollaboratorDebtExpired(activeEnterprise);

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
      if (shouldShowCollaboratorDebtCard) {
        loadCollaboratorsInDebt();
      } else {
        setCollaboratorsInDebt([]);
        setIsLoadingCollaborators(false);
      }
      loadDashboardMetrics();
    }
  }, [activeEnterprise, currentUser.role, shouldShowCollaboratorDebtCard]);

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

  const loadCollaboratorsInDebt = async () => {
    try {
      setIsLoadingCollaborators(true);
      const allClients = await ApiService.getClients(activeEnterprise.id);
      // Filtrar apenas colaboradores com débito
      const debtors = allClients.filter(
        client => client.type === 'COLABORADOR' && (client.amountDue || 0) > 0
      );
      setCollaboratorsInDebt(debtors);
    } catch (err) {
      console.error('Erro ao carregar colaboradores com débito:', err);
    } finally {
      setIsLoadingCollaborators(false);
    }
  };

  const loadDashboardMetrics = async () => {
    if (!activeEnterprise) return;

    try {
      setIsLoadingDashboardMetrics(true);
      const [transactions, products] = await Promise.all([
        ApiService.getTransactions({ enterpriseId: activeEnterprise.id }),
        ApiService.getProducts(activeEnterprise.id),
      ]);

      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const todayKey = toDateKey(today);
      const yesterdayKey = toDateKey(yesterday);

      const productById = new Map(products.map((product: Product) => [product.id, product]));
      const todayHourlyMap = new Map<string, number>();
      const categoryMap = new Map<string, number>();

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
        todayHourly,
        salesByCategory,
      });
    } catch (err) {
      console.error('Erro ao carregar métricas do dashboard:', err);
    } finally {
      setIsLoadingDashboardMetrics(false);
    }
  };

  const handlePayDebt = async () => {
    if (!collaboratorInPayment) return;

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Digite um valor válido');
      return;
    }

    if (amount > (collaboratorInPayment.amountDue || 0)) {
      alert(`Valor não pode ser maior que a dívida de R$ ${(collaboratorInPayment.amountDue || 0).toFixed(2)}`);
      return;
    }

    setIsProcessingPayment(true);
    try {
      const newAmountDue = Math.max(0, (collaboratorInPayment.amountDue || 0) - amount);
      const newBalance = (collaboratorInPayment.balance || 0) + amount;

      const updated = await ApiService.updateClient(collaboratorInPayment.id, {
        amountDue: newAmountDue,
        balance: newBalance,
        lastPaymentDate: new Date().toISOString(),
        lastPaymentMethod: paymentMethod
      });

      setCollaboratorsInDebt(prev => 
        prev.filter(c => (updated.amountDue || 0) > 0)
      );

      // Atualiza o cliente em pagamento
      setCollaboratorInPayment(updated);

      // Limpa o modal
      setIsPaymentModalOpen(false);
      setPaymentAmount('');
      setCollaboratorInPayment(null);

      alert(
        `✅ Pagamento de R$ ${amount.toFixed(2)} realizado com sucesso para ${collaboratorInPayment.name}!\n` +
        `Método: ${paymentMethod}\n` +
        `Débito restante: R$ ${newAmountDue.toFixed(2)}`
      );

      // Recarrega a lista de devedores
      await loadCollaboratorsInDebt();
    } catch (err) {
      console.error('Erro ao processar pagamento:', err);
      alert('Erro ao processar pagamento. Tente novamente.');
    } finally {
      setIsProcessingPayment(false);
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <img
            src={resolveUserAvatar(currentUser?.avatar, currentUser?.name)}
            alt={currentUser?.name || 'Usuário'}
            className="w-12 h-12 rounded-2xl object-cover border-2 border-white shadow-sm"
          />
          <div>
            <h1 className="text-2xl font-black text-gray-800 tracking-tight flex items-center gap-3 leading-none">
            {isRestaurant ? <ChefHat className="text-indigo-600" size={32} /> : isOwner ? <Building className="text-indigo-600" /> : <LayoutDashboardIcon className="text-indigo-600" />}
            Dashboard {isOwner ? 'da Rede' : isRestaurant ? 'do Restaurante' : 'da Cantina'}
            </h1>
            <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest mt-1 opacity-60">Análise de Performance: {activeEnterprise?.name}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Vendas Hoje"
          value={isLoadingDashboardMetrics ? '...' : `R$ ${dashboardMetrics.salesToday.toFixed(2)}`}
          change={toPercentDelta(dashboardMetrics.salesToday, dashboardMetrics.salesYesterday)}
          isPositive={dashboardMetrics.salesToday >= dashboardMetrics.salesYesterday}
          icon={<TrendingUp className="text-indigo-600" />}
        />
        <StatCard
          title="Recargas Hoje"
          value={isLoadingDashboardMetrics ? '...' : `R$ ${dashboardMetrics.creditsToday.toFixed(2)}`}
          change={toPercentDelta(dashboardMetrics.creditsToday, dashboardMetrics.creditsYesterday)}
          isPositive={dashboardMetrics.creditsToday >= dashboardMetrics.creditsYesterday}
          icon={<Wallet className="text-emerald-600" />}
        />
        <StatCard
          title="Fluxo Clientes"
          value={isLoadingDashboardMetrics ? '...' : `${dashboardMetrics.uniqueClientsToday}`}
          change={toCountDelta(dashboardMetrics.uniqueClientsToday, dashboardMetrics.uniqueClientsYesterday)}
          isPositive={dashboardMetrics.uniqueClientsToday >= dashboardMetrics.uniqueClientsYesterday}
          icon={<Users className="text-blue-600" />}
        />
        <StatCard
          title="Estoque Crítico"
          value={isLoadingDashboardMetrics ? '...' : `${dashboardMetrics.criticalStockCount} itens`}
          change={dashboardMetrics.criticalStockCount > 0 ? 'Urgente' : 'Normal'}
          isPositive={dashboardMetrics.criticalStockCount === 0}
          icon={<AlertTriangle className="text-amber-600" />}
          isWarning={dashboardMetrics.criticalStockCount > 0}
        />
      </div>

      {/* Card de Colaboradores com Débito (após vencimento configurado em Ajustes) */}
      {shouldShowCollaboratorDebtCard && (
        <div className="bg-white rounded-[48px] shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-black text-gray-400 uppercase tracking-widest text-[10px] flex items-center gap-2">
                <CreditCard size={16} className="text-indigo-600" />
                Colaboradores com Débito
              </h3>
              {collaboratorsInDebt.length > 0 && (
                <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-black">
                  {collaboratorsInDebt.length} devendo
                </span>
              )}
            </div>

            {isLoadingCollaborators ? (
              <div className="flex items-center justify-center h-32">
                <div className="text-center space-y-2">
                  <div className="animate-spin inline-block w-6 h-6 border-3 border-indigo-600 border-t-transparent rounded-full"></div>
                  <p className="text-xs text-gray-500 font-medium">Carregando colaboradores...</p>
                </div>
              </div>
            ) : collaboratorsInDebt.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-center space-y-2">
                <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                  <CreditCard className="text-emerald-600" size={24} />
                </div>
                <p className="text-sm font-bold text-gray-600">Nenhum colaborador com débito</p>
                <p className="text-xs text-gray-400">Todos os colaboradores estão em dia! 🎉</p>
              </div>
            ) : (
              <div className="space-y-3">
                {collaboratorsInDebt.map((collaborator) => (
                  <div key={collaborator.id} className="flex items-center justify-between p-4 bg-gradient-to-r from-red-50 to-rose-50 rounded-2xl border border-red-100 hover:border-red-200 transition-all">
                    <div className="flex-1">
                      <p className="text-sm font-black text-gray-800">{collaborator.name}</p>
                      <p className="text-xs text-red-600 font-bold mt-1">
                        Débito: R$ {((collaborator.amountDue || 0).toFixed(2)).replace('.', ',')}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setCollaboratorInPayment(collaborator);
                        setPaymentAmount('');
                        setIsPaymentModalOpen(true);
                      }}
                      className="ml-4 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-indigo-700 transition-all whitespace-nowrap"
                    >
                      Pagar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico Principal */}
        <div className="lg:col-span-2 bg-white p-8 rounded-[48px] shadow-sm border border-gray-100">
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
          
          <div className="h-72">
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

        {/* Alertas Operacionais / Seções Laterais */}
        <div className="bg-white p-8 rounded-[48px] shadow-sm border border-gray-100 flex flex-col justify-between">
          <div className="space-y-6">
            <h3 className="font-black text-gray-400 uppercase tracking-widest text-[10px]">Indicadores Operacionais</h3>
            <div className="space-y-4">
              <div className="p-5 bg-indigo-50 rounded-3xl border border-indigo-100 flex gap-4 items-center">
                <div className="bg-indigo-600 text-white p-2 rounded-2xl shadow-lg"><Scale size={18} /></div>
                <div>
                  <p className="text-[10px] font-black text-indigo-900 uppercase">Preço KG Ativo</p>
                  <p className="text-lg font-black text-indigo-600 leading-none mt-0.5">R$ {activeEnterprise.pricePerKg?.toFixed(2) || '0.00'}</p>
                </div>
              </div>
              <div className="p-5 bg-amber-50 rounded-3xl border border-amber-100 flex gap-4 items-center">
                <div className="bg-amber-500 text-white p-2 rounded-2xl shadow-lg"><Clock size={18} /></div>
                <div>
                  <p className="text-[10px] font-black text-amber-900 uppercase">Sangria Pendente</p>
                  <p className="text-lg font-black text-amber-600 leading-none mt-0.5">
                    R$ {collaboratorsInDebt.reduce((sum, collaborator) => sum + Number(collaborator.amountDue || 0), 0).toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <button className="w-full py-4 bg-gray-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all flex items-center justify-center gap-2 mt-8 shadow-xl">
             <FileBarChart size={16} /> Gerar Fechamento
          </button>
        </div>
      </div>

      {/* Modal de Pagamento de Débito */}
      {isPaymentModalOpen && collaboratorInPayment && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 animate-in fade-in">
          <div className="absolute inset-0 bg-indigo-950/60 backdrop-blur-sm" onClick={() => !isProcessingPayment && setIsPaymentModalOpen(false)}></div>
          <div className="relative w-full max-w-2xl bg-white rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="bg-indigo-600 p-8 text-white text-center shrink-0">
              <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <CreditCard size={32} />
              </div>
              <h2 className="text-xl font-black uppercase tracking-tight">Pagamento de Dívida</h2>
              <p className="text-[10px] font-bold text-indigo-100 uppercase tracking-widest mt-1">{collaboratorInPayment.name}</p>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-hide">
              
              {/* Informações da Dívida */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b pb-2">
                  <AlertTriangle size={16} className="text-red-600" />
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Informações da Dívida</h3>
                </div>
                <div className="p-6 bg-red-50 border-2 border-red-100 rounded-2xl">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-[10px] font-bold text-red-700 uppercase tracking-widest">Valor Devido</p>
                      <p className="text-2xl font-black text-red-600 mt-2">R$ {(collaboratorInPayment.amountDue || 0).toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Métodos de Pagamento */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b pb-2">
                  <Wallet size={16} className="text-indigo-600" />
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Método de Pagamento</h3>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {(['PIX', 'BOLETO', 'CAIXA'] as const).map(method => (
                    <button
                      key={method}
                      onClick={() => setPaymentMethod(method)}
                      className={`py-4 px-3 rounded-2xl font-black text-[10px] uppercase tracking-wider transition-all border-2 ${
                        paymentMethod === method 
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700' 
                          : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              {/* Valor do Pagamento */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b pb-2">
                  <TrendingUp size={16} className="text-emerald-600" />
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Valor do Pagamento</h3>
                </div>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-black">R$</span>
                  <input 
                    type="number" 
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder={`Máximo: R$ ${(collaboratorInPayment.amountDue || 0).toFixed(2)}`}
                    className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none font-black text-lg"
                    disabled={isProcessingPayment}
                  />
                </div>
                <button
                  onClick={() => setPaymentAmount((collaboratorInPayment.amountDue || 0).toString())}
                  className="w-full py-3 text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:text-indigo-700 transition-colors"
                  disabled={isProcessingPayment}
                >
                  Usar valor total da dívida
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 bg-gray-50 border-t flex gap-3 shrink-0">
              <button 
                onClick={() => {
                  setIsPaymentModalOpen(false);
                  setPaymentAmount('');
                  setCollaboratorInPayment(null);
                }}
                disabled={isProcessingPayment}
                className="flex-1 text-[10px] font-black text-gray-600 uppercase tracking-widest hover:text-gray-800 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handlePayDebt}
                disabled={isProcessingPayment || !paymentAmount}
                className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-wider hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isProcessingPayment ? (
                  <>
                    <div className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                    Processando...
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    Confirmar Pagamento
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StatCard: React.FC<any> = ({ title, value, change, isPositive, icon, isWarning }) => (
  <div className={`bg-white p-6 rounded-[32px] border shadow-sm transition-all hover:shadow-xl group ${isWarning ? 'border-amber-200 bg-amber-50/10' : 'border-gray-100'}`}>
    <div className="flex items-center justify-between mb-4">
      <div className="p-3 bg-gray-50 rounded-2xl group-hover:bg-indigo-50 transition-colors shadow-inner">{icon}</div>
      <div className={`flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-full border ${isPositive ? 'bg-green-50 text-green-600 border-green-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
        {change}
      </div>
    </div>
    <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">{title}</p>
    <p className="text-2xl font-black text-gray-800 mt-1">{value}</p>
  </div>
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
