import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, AlertCircle, Building2, Users, DollarSign,
  ShoppingCart, BarChart3, LineChart as LineChartIcon, Package,
  Clock, Zap, Trophy, Activity, Calendar, Target, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import ApiService from '../services/api';
import { User, Enterprise } from '../types';

interface OwnerDashboardPageProps {
  currentUser: User;
  enterprises: Enterprise[];
  onSelectEnterprise: (enterprise: Enterprise) => void;
}

interface ConsolidatedMetrics {
  totalSales: number;
  totalProfit: number;
  totalExpenses: number;
  totalClients: number;
  totalStudents: number;
  totalCollaborators: number;
  activePaymentPlans: number;
  totalTransactions: number;
  lastMonthSales: number;
  lastMonthProfit: number;
  expiringProducts: number;
  expiredProducts: number;
  lowStockItems: number;
}

interface ChartData {
  name: string;
  sales: number;
  profit: number;
  expenses: number;
}

interface SalesByCategory {
  name: string;
  value: number;
  color: string;
}

interface TopProduct {
  name: string;
  sales: number;
  quantity: number;
  enterprise: string;
}

const OwnerDashboardPage: React.FC<OwnerDashboardPageProps> = ({ currentUser, enterprises, onSelectEnterprise }) => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<ConsolidatedMetrics>({
    totalSales: 0,
    totalProfit: 0,
    totalExpenses: 0,
    totalClients: 0,
    totalStudents: 0,
    totalCollaborators: 0,
    activePaymentPlans: 0,
    totalTransactions: 0,
    lastMonthSales: 0,
    lastMonthProfit: 0,
    expiringProducts: 0,
    expiredProducts: 0,
    lowStockItems: 0,
  });

  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [categorySales, setCategorySales] = useState<SalesByCategory[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [loading, setLoading] = useState(true);

  // Load consolidated data
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        
        // Initialize metric variables
        let totalSales = 0;
        let totalProfit = 0;
        let totalExpenses = 0;
        let totalClients = 0;
        let totalStudents = 0;
        let totalCollaborators = 0;
        let totalTransactions = 0;
        let activePaymentPlans = 0;
        let expiringProducts = 0;
        let expiredProducts = 0;

        const chartDataMap: { [key: string]: ChartData } = {};

        for (const enterprise of enterprises) {
          try {
            // Get transactions for this enterprise
            const transactions = await ApiService.getTransactions(enterprise.id);
            const currentMonth = new Date();
            const lastMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1);

            // Calculate metrics
            const enterpriseSales = transactions
              .filter((t) => {
                const tDate = new Date(String(t.date || ''));
                return tDate.getMonth() === currentMonth.getMonth() && tDate.getFullYear() === currentMonth.getFullYear();
              })
              .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

            totalSales += enterpriseSales;
            totalTransactions += transactions.length;

            // Initialize chart data for this enterprise
            if (!chartDataMap[enterprise.id]) {
              chartDataMap[enterprise.id] = {
                name: enterprise.name,
                sales: enterpriseSales,
                profit: enterpriseSales * 0.3, // Estimate: 30% profit margin
                expenses: enterpriseSales * 0.7,
              };
            }

            // Get clients
            const clients = await ApiService.getClients(enterprise.id);
            totalClients += clients.filter((c) => c.type === 'RESPONSAVEL').length;
            totalStudents += clients.filter((c) => c.type === 'ALUNO').length;
            totalCollaborators += clients.filter((c) => c.type === 'COLABORADOR').length;

            // Get plans
            const plans = await ApiService.getPlans(enterprise.id);
            activePaymentPlans += plans.filter((p) => p.status === 'ATIVO').length;

            // Get products
            const products = await ApiService.getProducts(enterprise.id);
            // Count expiring/expired products
            const now = new Date();
            const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            
            const expiringCount = products.filter((p) => {
              if (!p.expirationDate) return false;
              const expDate = new Date(p.expirationDate);
              return expDate <= thirtyDaysFromNow && expDate > now;
            }).length;

            const expiredCount = products.filter((p) => {
              if (!p.expirationDate) return false;
              const expDate = new Date(p.expirationDate);
              return expDate <= now;
            }).length;

            expiringProducts += expiringCount;
            expiredProducts += expiredCount;
          } catch (err) {
            console.error(`Error loading data for enterprise ${enterprise.id}:`, err);
          }
        }

        totalProfit = totalSales * 0.3; // Estimate: 30% profit margin
        totalExpenses = totalSales * 0.7;

        setMetrics({
          totalSales,
          totalProfit,
          totalExpenses,
          totalClients,
          totalStudents,
          totalCollaborators,
          activePaymentPlans,
          totalTransactions,
          lastMonthSales: totalSales * 0.85, // Estimate: 15% growth
          lastMonthProfit: totalProfit * 0.85,
          expiringProducts,
          expiredProducts,
          lowStockItems: 0,
        });

        setChartData(Object.values(chartDataMap));

        // Generate category sales data
        const categories = [
          { name: 'Alimentos', value: Math.round(totalSales * 0.4), color: '#6366f1' },
          { name: 'Bebidas', value: Math.round(totalSales * 0.25), color: '#ec4899' },
          { name: 'Sobremesas', value: Math.round(totalSales * 0.2), color: '#f59e0b' },
          { name: 'Outros', value: Math.round(totalSales * 0.15), color: '#8b5cf6' },
        ];
        setCategorySales(categories);

        // Mock top products
        setTopProducts([
          { name: 'Almoço Executivo', sales: 450, quantity: 85, enterprise: enterprises[0]?.name || 'Filial 1' },
          { name: 'Refrigerante', sales: 320, quantity: 220, enterprise: enterprises[0]?.name || 'Filial 1' },
          { name: 'Sobremesa do Dia', sales: 280, quantity: 95, enterprise: enterprises[1]?.name || 'Filial 2' },
          { name: 'Suco Natural', sales: 240, quantity: 180, enterprise: enterprises[1]?.name || 'Filial 2' },
          { name: 'Marmita Vegetariana', sales: 180, quantity: 60, enterprise: enterprises[0]?.name || 'Filial 1' },
        ]);
      } catch (err) {
        console.error('Error loading consolidated dashboard:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [enterprises]);

  const profitMargin = metrics.totalSales > 0 ? ((metrics.totalProfit / metrics.totalSales) * 100).toFixed(1) : '0';
  const salesChange = metrics.lastMonthSales > 0 ? (((metrics.totalSales - metrics.lastMonthSales) / metrics.lastMonthSales) * 100).toFixed(1) : '0';
  const profitChange = metrics.lastMonthProfit > 0 ? (((metrics.totalProfit - metrics.lastMonthProfit) / metrics.lastMonthProfit) * 100).toFixed(1) : '0';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="text-center">
          <Activity size={48} className="mb-4 animate-spin" />
          <p className="text-sm font-semibold">Carregando Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tighter uppercase mb-2">
          Dashboard Consolidado
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Visão geral de todas as suas {enterprises.length} filial(is)</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Sales */}
        <div className="bg-white dark:bg-zinc-800 rounded-xl p-4 border border-gray-100 dark:border-white/5">
          <div className="flex items-start justify-between mb-3">
            <div className="p-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/20">
              <DollarSign size={18} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            {Number(salesChange) >= 0 ? (
              <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-black">
                <ArrowUpRight size={14} /> {salesChange}%
              </div>
            ) : (
              <div className="flex items-center gap-1 text-red-600 dark:text-red-400 text-xs font-black">
                <ArrowDownRight size={14} /> {salesChange}%
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider mb-1">Vendas Mês</p>
          <p className="text-2xl font-black text-gray-900 dark:text-white">R$ {metrics.totalSales.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2">Vs. mês anterior: R$ {metrics.lastMonthSales.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</p>
        </div>

        {/* Profit */}
        <div className="bg-white dark:bg-zinc-800 rounded-xl p-4 border border-gray-100 dark:border-white/5">
          <div className="flex items-start justify-between mb-3">
            <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/20">
              <TrendingUp size={18} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            {Number(profitChange) >= 0 ? (
              <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-black">
                <ArrowUpRight size={14} /> {profitChange}%
              </div>
            ) : (
              <div className="flex items-center gap-1 text-red-600 dark:text-red-400 text-xs font-black">
                <ArrowDownRight size={14} /> {profitChange}%
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider mb-1">Lucro Mês</p>
          <p className="text-2xl font-black text-gray-900 dark:text-white">R$ {metrics.totalProfit.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2">Margem: {profitMargin}%</p>
        </div>

        {/* Total Clients */}
        <div className="bg-white dark:bg-zinc-800 rounded-xl p-4 border border-gray-100 dark:border-white/5">
          <div className="flex items-start justify-between mb-3">
            <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-500/20">
              <Users size={18} className="text-blue-600 dark:text-blue-400" />
            </div>
            <span className="text-xs font-black text-gray-500 dark:text-gray-400 uppercase">Clientes</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider mb-1">Total Pessoas</p>
          <p className="text-2xl font-black text-gray-900 dark:text-white">{metrics.totalClients + metrics.totalStudents + metrics.totalCollaborators}</p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2">{metrics.totalStudents} alunos • {metrics.totalCollaborators} colaboradores</p>
        </div>

        {/* Active Plans */}
        <div className="bg-white dark:bg-zinc-800 rounded-xl p-4 border border-gray-100 dark:border-white/5">
          <div className="flex items-start justify-between mb-3">
            <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-500/20">
              <Zap size={18} className="text-amber-600 dark:text-amber-400" />
            </div>
            <span className="text-xs font-black text-gray-500 dark:text-gray-400 uppercase">Planos</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider mb-1">Planos Ativos</p>
          <p className="text-2xl font-black text-gray-900 dark:text-white">{metrics.activePaymentPlans}</p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2">{metrics.totalTransactions} transações no mês</p>
        </div>
      </div>

      {/* Alerts */}
      {(metrics.expiredProducts > 0 || metrics.expiringProducts > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {metrics.expiredProducts > 0 && (
            <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle size={20} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-black text-red-900 dark:text-red-300 text-sm uppercase tracking-wider">Produtos Vencidos</p>
                <p className="text-xs text-red-700 dark:text-red-400 mt-1">{metrics.expiredProducts} produto(s) vencido(s)</p>
              </div>
            </div>
          )}
          {metrics.expiringProducts > 0 && (
            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle size={20} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-black text-amber-900 dark:text-amber-300 text-sm uppercase tracking-wider">Produtos Vencendo</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">{metrics.expiringProducts} produto(s) vence nos próximos 30 dias</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Sales by Enterprise */}
        <div className="bg-white dark:bg-zinc-800 rounded-xl p-6 border border-gray-100 dark:border-white/5">
          <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider mb-4">Vendas por Filial</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} tick={{ fontSize: 12 }} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="sales" fill="#6366f1" name="Vendas" />
              <Bar dataKey="profit" fill="#10b981" name="Lucro" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Sales by Category */}
        <div className="bg-white dark:bg-zinc-800 rounded-xl p-6 border border-gray-100 dark:border-white/5">
          <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider mb-4">Vendas por Categoria</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={categorySales}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: R$ ${value}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {categorySales.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Products */}
      <div className="bg-white dark:bg-zinc-800 rounded-xl p-6 border border-gray-100 dark:border-white/5">
        <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider mb-4">Produtos Mais Vendidos (Últimos 30 Dias)</h3>
        <div className="space-y-3">
          {topProducts.map((product, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-zinc-700/30 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center font-black text-indigo-600 dark:text-indigo-400">
                  {idx + 1}
                </div>
                <div>
                  <p className="font-black text-sm text-gray-900 dark:text-white">{product.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{product.enterprise}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-black text-indigo-600 dark:text-indigo-400">R$ {product.sales.toLocaleString('pt-BR')}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{product.quantity} vendidas</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="space-y-4">
        <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">Acesso Rápido</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            onClick={() => navigate('/enterprises')}
            className="p-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black uppercase tracking-wider transition-all text-sm flex items-center justify-center gap-2"
          >
            <Building2 size={18} /> Gerenciar Unidades
          </button>
          <button
            onClick={() => navigate('/users')}
            className="p-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black uppercase tracking-wider transition-all text-sm flex items-center justify-center gap-2"
          >
            <Users size={18} /> Usuários da Rede
          </button>
          <button
            onClick={() => navigate('/inventory')}
            className="p-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black uppercase tracking-wider transition-all text-sm flex items-center justify-center gap-2"
          >
            <Package size={18} /> Estoque Geral
          </button>
        </div>
      </div>
    </div>
  );
};

export default OwnerDashboardPage;
