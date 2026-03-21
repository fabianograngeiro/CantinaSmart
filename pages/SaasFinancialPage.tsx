import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, DollarSign, TrendingDown, TrendingUp, AlertTriangle } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import ApiService from '../services/api';
import { Enterprise, Role, User } from '../types';

interface SaasFinancialPageProps {
  currentUser: User;
}

type InvoiceStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELED';
type SaasInvoice = {
  id: string;
  enterpriseId: string;
  enterpriseName: string;
  ownerName: string;
  referenceMonth: string; // MM/YYYY
  dueDate: string;
  amount: number;
  status: InvoiceStatus;
  paidAt?: string;
};

const INVOICES_STORAGE_KEY = 'saas_invoices_v1';

const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

const parseReferenceMonthToSort = (value: string): number => {
  const [monthRaw, yearRaw] = String(value || '').split('/');
  const month = Number(monthRaw);
  const year = Number(yearRaw);
  if (!month || !year) return 0;
  return year * 100 + month;
};

const getCurrentReferenceMonth = (): string => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  return `${month}/${year}`;
};

const SaasFinancialPage: React.FC<SaasFinancialPageProps> = ({ currentUser }) => {
  const isSuperAdmin = String(currentUser.role || '').toUpperCase() === Role.SUPERADMIN;
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
  const [invoices, setInvoices] = useState<SaasInvoice[]>([]);
  const [selectedMonth, setSelectedMonth] = useState('ALL');

  useEffect(() => {
    const load = async () => {
      try {
        const enterpriseData = await ApiService.getEnterprises();
        setEnterprises(Array.isArray(enterpriseData) ? enterpriseData : []);
      } catch (err) {
        console.error('Erro ao carregar empresas para financeiro SaaS:', err);
        setEnterprises([]);
      }
    };
    load();
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(INVOICES_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      setInvoices(Array.isArray(parsed) ? parsed : []);
    } catch (err) {
      console.error('Erro ao carregar invoices para financeiro SaaS:', err);
      setInvoices([]);
    }
  }, []);

  const months = useMemo(() => {
    const unique = Array.from(new Set(invoices.map((inv) => inv.referenceMonth)));
    return unique.sort((a, b) => parseReferenceMonthToSort(b) - parseReferenceMonthToSort(a));
  }, [invoices]);

  const effectiveInvoices = useMemo(() => {
    if (selectedMonth === 'ALL') return invoices;
    return invoices.filter((inv) => inv.referenceMonth === selectedMonth);
  }, [invoices, selectedMonth]);

  const metrics = useMemo(() => {
    const billed = effectiveInvoices.filter((inv) => inv.status !== 'CANCELED').reduce((acc, inv) => acc + inv.amount, 0);
    const received = effectiveInvoices.filter((inv) => inv.status === 'PAID').reduce((acc, inv) => acc + inv.amount, 0);
    const pending = effectiveInvoices.filter((inv) => inv.status === 'PENDING').reduce((acc, inv) => acc + inv.amount, 0);
    const overdue = effectiveInvoices.filter((inv) => inv.status === 'OVERDUE').reduce((acc, inv) => acc + inv.amount, 0);
    const canceled = effectiveInvoices.filter((inv) => inv.status === 'CANCELED').reduce((acc, inv) => acc + inv.amount, 0);
    const defaultRate = billed > 0 ? (overdue / billed) * 100 : 0;
    const recoveryRate = billed > 0 ? (received / billed) * 100 : 0;
    return { billed, received, pending, overdue, canceled, defaultRate, recoveryRate };
  }, [effectiveInvoices]);

  const mrrAndArr = useMemo(() => {
    const currentMonth = getCurrentReferenceMonth();
    const currentMonthInvoices = invoices.filter((inv) => inv.referenceMonth === currentMonth && inv.status !== 'CANCELED');
    const mrr = currentMonthInvoices.reduce((acc, inv) => acc + inv.amount, 0);
    const arr = mrr * 12;
    return { mrr, arr, currentMonth };
  }, [invoices]);

  const churn = useMemo(() => {
    const total = enterprises.length;
    const canceled = enterprises.filter((ent) => (ent.serviceStatus || '').toUpperCase() === 'CANCELADO').length;
    const activeBase = Math.max(total, 1);
    const churnRate = (canceled / activeBase) * 100;
    return { total, canceled, churnRate };
  }, [enterprises]);

  const projection = useMemo(() => {
    const expectedNextMonth = enterprises
      .filter((ent) => (ent.serviceStatus || 'ATIVO') !== 'CANCELADO')
      .reduce((acc, ent) => acc + Number(ent.monthlyFee || 0), 0);
    const riskAdjusted = expectedNextMonth - (expectedNextMonth * (metrics.defaultRate / 100));
    return { expectedNextMonth, riskAdjusted };
  }, [enterprises, metrics.defaultRate]);

  const monthlySeries = useMemo(() => {
    const grouped = new Map<string, { month: string; faturado: number; recebido: number; inadimplente: number }>();
    invoices.forEach((inv) => {
      const existing = grouped.get(inv.referenceMonth) || { month: inv.referenceMonth, faturado: 0, recebido: 0, inadimplente: 0 };
      if (inv.status !== 'CANCELED') existing.faturado += inv.amount;
      if (inv.status === 'PAID') existing.recebido += inv.amount;
      if (inv.status === 'OVERDUE') existing.inadimplente += inv.amount;
      grouped.set(inv.referenceMonth, existing);
    });
    return Array.from(grouped.values()).sort((a, b) => parseReferenceMonthToSort(a.month) - parseReferenceMonthToSort(b.month)).slice(-8);
  }, [invoices]);

  if (!isSuperAdmin) {
    return <div className="p-6 text-sm font-bold text-red-600">Acesso restrito ao SUPERADMIN.</div>;
  }

  return (
    <div className="dash-shell space-y-4 p-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
            <BarChart3 size={16} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tight">Financeiro SaaS Executivo</h1>
            <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-[0.16em]">
              DRE mensal, recorrência, risco e projeção
            </p>
          </div>
        </div>
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="h-9 px-3 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-200 outline-none focus:border-indigo-500"
        >
          <option value="ALL">Todos os meses</option>
          {months.map((month) => (
            <option key={month} value={month}>{month}</option>
          ))}
        </select>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <MetricCard title="Faturado" value={formatCurrency(metrics.billed)} icon={<DollarSign size={14} className="text-indigo-600" />} />
        <MetricCard title="Recebido" value={formatCurrency(metrics.received)} icon={<TrendingUp size={14} className="text-emerald-600" />} />
        <MetricCard title="Pendente" value={formatCurrency(metrics.pending)} icon={<AlertTriangle size={14} className="text-amber-600" />} />
        <MetricCard title="Atrasado" value={formatCurrency(metrics.overdue)} icon={<TrendingDown size={14} className="text-red-600" />} />
        <MetricCard title="MRR Atual" value={formatCurrency(mrrAndArr.mrr)} icon={<BarChart3 size={14} className="text-blue-600" />} />
        <MetricCard title="ARR Estimado" value={formatCurrency(mrrAndArr.arr)} icon={<DollarSign size={14} className="text-purple-600" />} />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-4 space-y-2">
          <h3 className="text-sm font-black text-slate-800 dark:text-zinc-100 uppercase tracking-wider">DRE Simplificada</h3>
          <DreRow label="Receita Bruta (Faturado)" value={metrics.billed} />
          <DreRow label="Cancelamentos" value={-metrics.canceled} />
          <DreRow label="Inadimplência (Atrasado)" value={-metrics.overdue} />
          <DreRow label="Receita Líquida Realizada" value={metrics.received} isStrong />
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-4 space-y-2">
          <h3 className="text-sm font-black text-slate-800 dark:text-zinc-100 uppercase tracking-wider">Risco e Eficiência</h3>
          <DreRow label="Taxa de Inadimplência" value={`${metrics.defaultRate.toFixed(2)}%`} />
          <DreRow label="Taxa de Recuperação" value={`${metrics.recoveryRate.toFixed(2)}%`} />
          <DreRow label="Churn de Clientes" value={`${churn.churnRate.toFixed(2)}%`} />
          <DreRow label="Clientes Cancelados" value={`${churn.canceled}/${churn.total}`} />
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-4 space-y-2">
          <h3 className="text-sm font-black text-slate-800 dark:text-zinc-100 uppercase tracking-wider">Projeção Próximo Mês</h3>
          <DreRow label="Receita Esperada" value={projection.expectedNextMonth} />
          <DreRow label="Ajustada por Risco" value={projection.riskAdjusted} isStrong />
          <DreRow label="Base Recorrente Mês" value={mrrAndArr.currentMonth} />
        </div>
      </section>

      <section className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-4">
        <h3 className="text-sm font-black text-slate-800 dark:text-zinc-100 uppercase tracking-wider mb-3">Série Mensal Financeira</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlySeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#33415522" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="faturado" fill="#4f46e5" radius={[6, 6, 0, 0]} />
              <Bar dataKey="recebido" fill="#059669" radius={[6, 6, 0, 0]} />
              <Bar dataKey="inadimplente" fill="#dc2626" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
};

const MetricCard = ({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) => (
  <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-3">
    <div className="flex items-center justify-between mb-1">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400 dark:text-zinc-400">{title}</p>
      <div>{icon}</div>
    </div>
    <p className="text-lg font-black text-slate-900 dark:text-zinc-100 leading-tight">{value}</p>
  </div>
);

const DreRow = ({
  label,
  value,
  isStrong = false
}: {
  label: string;
  value: string | number;
  isStrong?: boolean;
}) => {
  const formattedValue = typeof value === 'number' ? formatCurrency(value) : value;
  return (
    <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 py-2">
      <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400">{label}</span>
      <span className={`text-[12px] ${isStrong ? 'font-black text-indigo-700 dark:text-indigo-300' : 'font-bold text-slate-800 dark:text-zinc-100'}`}>
        {formattedValue}
      </span>
    </div>
  );
};

export default SaasFinancialPage;
