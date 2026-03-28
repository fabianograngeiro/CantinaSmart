import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, DollarSign, TrendingDown, TrendingUp, AlertTriangle, Plus, BellRing, CheckCircle2, Trash2 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import ApiService from '../services/api';
import notificationService from '../services/notificationService';
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

type CashflowType = 'RECEITA' | 'DESPESA';
type CashflowStatus = 'ABERTO' | 'PAGO';
type AccountType = 'CONTAS_A_RECEBER' | 'CONTAS_A_PAGAR';

type CashflowEntry = {
  id: string;
  type: CashflowType;
  title: string;
  amount: number;
  dueDate: string;
  createdAt: string;
  status: CashflowStatus;
  accountType: AccountType;
  paymentType: string;
  paymentMethod: string;
  recurrenceType?: 'AVULSO' | 'FIXO';
  reminderDaysBefore: number;
  notes?: string;
  paidAt?: string;
};

const INVOICES_STORAGE_KEY = 'saas_invoices_v1';
const SAAS_FIN_ALERTS_SEEN_KEY = 'saas_financial_alerts_seen_v1';

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

const toDateOnly = (value: string) => new Date(`${String(value || '').slice(0, 10)}T00:00:00`);
const daysUntil = (value: string) => {
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const due = toDateOnly(value);
  const diffMs = due.getTime() - startToday.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};

const SaasFinancialPage: React.FC<SaasFinancialPageProps> = ({ currentUser }) => {
  const roleKey = String(currentUser.role || '').toUpperCase();
  const isAllowedRole = roleKey === Role.SUPERADMIN || roleKey === Role.ADMIN_SISTEMA;
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
  const [invoices, setInvoices] = useState<SaasInvoice[]>([]);
  const [selectedMonth, setSelectedMonth] = useState('ALL');
  const [cashflow, setCashflow] = useState<CashflowEntry[]>([]);
  const [isCashflowLoading, setIsCashflowLoading] = useState(false);
  const [entryForm, setEntryForm] = useState({
    type: 'RECEITA' as CashflowType,
    title: '',
    amount: '',
    dueDate: '',
    accountType: 'CONTAS_A_RECEBER' as AccountType,
    paymentType: 'MENSALIDADE',
    paymentMethod: 'PIX',
    recurrenceType: 'AVULSO' as 'AVULSO' | 'FIXO',
    reminderDaysBefore: '3',
    notes: '',
  });

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
    const loadCashflow = async () => {
      try {
        setIsCashflowLoading(true);
        const entries = await ApiService.getSaasCashflowEntries();
        setCashflow(Array.isArray(entries) ? entries : []);
      } catch (err) {
        console.error('Erro ao carregar lançamentos financeiros SaaS:', err);
        setCashflow([]);
      } finally {
        setIsCashflowLoading(false);
      }
    };
    loadCashflow();
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
    const unique = Array.from(new Set(invoices.map((inv) => String(inv.referenceMonth || '')))) as string[];
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

  const cashflowMetrics = useMemo(() => {
    const receitas = cashflow.filter((item) => item.type === 'RECEITA' && item.status !== 'PAGO').reduce((acc, item) => acc + item.amount, 0);
    const despesas = cashflow.filter((item) => item.type === 'DESPESA' && item.status !== 'PAGO').reduce((acc, item) => acc + item.amount, 0);
    const saldo = receitas - despesas;
    return { receitas, despesas, saldo };
  }, [cashflow]);

  const reminders = useMemo(() => {
    return cashflow
      .filter((item) => item.status === 'ABERTO')
      .map((item) => {
        const remainingDays = daysUntil(item.dueDate);
        const reminderWindow = Number(item.reminderDaysBefore || 0);
        const isOverdue = remainingDays < 0;
        const isToday = remainingDays === 0;
        const isUpcoming = remainingDays > 0 && remainingDays <= reminderWindow;
        return {
          item,
          remainingDays,
          level: isOverdue ? 'OVERDUE' : isToday ? 'TODAY' : isUpcoming ? 'UPCOMING' : 'NONE',
        };
      })
      .filter((entry) => entry.level !== 'NONE')
      .sort((a, b) => a.remainingDays - b.remainingDays);
  }, [cashflow]);

  useEffect(() => {
    if (reminders.length === 0) return;

    const todayTag = new Date().toISOString().slice(0, 10);
    let seenMap: Record<string, string> = {};
    try {
      const raw = localStorage.getItem(SAAS_FIN_ALERTS_SEEN_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      seenMap = parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      seenMap = {};
    }

    let changed = false;
    reminders.slice(0, 12).forEach(({ item, remainingDays, level }) => {
      const dedupeKey = `${todayTag}:${item.id}:${level}`;
      if (seenMap[dedupeKey]) return;

      if (level === 'OVERDUE') {
        notificationService.critico(
          'Pagamento/Recebimento atrasado',
          `${item.title} esta atrasado ha ${Math.abs(remainingDays)} dia(s).`
        );
      } else if (level === 'TODAY') {
        notificationService.urgente(
          'Vencimento hoje',
          `${item.title} vence hoje. Tome acao imediata.`
        );
      } else if (level === 'UPCOMING') {
        notificationService.alerta(
          'Lembrete de vencimento',
          `${item.title} vence em ${remainingDays} dia(s).`
        );
      }

      seenMap[dedupeKey] = todayTag;
      changed = true;
    });

    if (changed) {
      localStorage.setItem(SAAS_FIN_ALERTS_SEEN_KEY, JSON.stringify(seenMap));
    }
  }, [reminders]);

  const handleAddCashflow = async () => {
    const amount = Number(entryForm.amount);
    if (!entryForm.title.trim() || !entryForm.dueDate || !Number.isFinite(amount) || amount <= 0) {
      return;
    }

    const payload: Omit<CashflowEntry, 'id' | 'createdAt'> = {
      type: entryForm.type,
      title: entryForm.title.trim(),
      amount,
      dueDate: entryForm.dueDate,
      status: 'ABERTO',
      accountType: entryForm.type === 'RECEITA' ? 'CONTAS_A_RECEBER' : 'CONTAS_A_PAGAR',
      paymentType: entryForm.paymentType,
      paymentMethod: entryForm.paymentMethod,
      recurrenceType: entryForm.type === 'DESPESA' ? entryForm.recurrenceType : undefined,
      reminderDaysBefore: Math.max(0, Number(entryForm.reminderDaysBefore || 0)),
      notes: entryForm.notes.trim(),
    };

    try {
      const created = await ApiService.createSaasCashflowEntry(payload);
      if (created) {
        setCashflow((prev) => [created, ...prev]);
      }
      setEntryForm((prev) => ({
        ...prev,
        title: '',
        amount: '',
        dueDate: '',
        notes: '',
      }));
    } catch (err) {
      console.error('Erro ao criar lançamento financeiro SaaS:', err);
    }
  };

  const handleMarkAsPaid = async (id: string) => {
    try {
      const updated = await ApiService.updateSaasCashflowEntry(id, {
        status: 'PAGO',
        paidAt: new Date().toISOString(),
      });
      setCashflow((prev) => prev.map((item) => (item.id === id ? updated : item)));
    } catch (err) {
      console.error('Erro ao quitar lançamento financeiro SaaS:', err);
    }
  };

  const handleDeleteCashflow = async (id: string) => {
    try {
      await ApiService.deleteSaasCashflowEntry(id);
      setCashflow((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      console.error('Erro ao remover lançamento financeiro SaaS:', err);
    }
  };

  if (!isAllowedRole) {
    return <div className="p-6 text-sm font-bold text-red-600">Acesso restrito ao SUPERADMIN/USUARIO DO SISTEMA.</div>;
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
        <div className="xl:col-span-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-800 dark:text-zinc-100 uppercase tracking-wider">Receitas e Despesas</h3>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Contas a receber/pagar</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-xs font-bold text-slate-500">
              Tipo de Lancamento
              <select
                value={entryForm.type}
                onChange={(e) => setEntryForm((prev) => ({
                  ...prev,
                  type: e.target.value as CashflowType,
                  accountType: e.target.value === 'RECEITA' ? 'CONTAS_A_RECEBER' : 'CONTAS_A_PAGAR',
                  paymentType: e.target.value === 'RECEITA' ? 'MENSALIDADE' : 'FORNECEDOR',
                }))}
                className="mt-1 h-9 w-full px-2 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold"
              >
                <option value="RECEITA">Receita</option>
                <option value="DESPESA">Despesa</option>
              </select>
            </label>
            <label className="text-xs font-bold text-slate-500">
              {entryForm.type === 'RECEITA' ? 'Tipo de Receita' : 'Tipo de Pagamento'}
              <select
                value={entryForm.paymentType}
                onChange={(e) => setEntryForm((prev) => ({ ...prev, paymentType: e.target.value }))}
                className="mt-1 h-9 w-full px-2 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold"
              >
                {entryForm.type === 'RECEITA' ? (
                  <>
                    <option value="MENSALIDADE">Mensalidade</option>
                    <option value="SERVICO_EXTRA">Servico Extra</option>
                    <option value="TAXA_IMPLANTACAO">Taxa de Implantacao</option>
                    <option value="OUTROS">Outros</option>
                  </>
                ) : (
                  <>
                    <option value="FORNECEDOR">Fornecedor</option>
                    <option value="IMPOSTO">Imposto</option>
                    <option value="SALARIO">Salario</option>
                    <option value="MANUTENCAO">Manutencao</option>
                    <option value="OUTROS">Outros</option>
                  </>
                )}
              </select>
            </label>
            <label className="text-xs font-bold text-slate-500">
              Descricao
              <input
                value={entryForm.title}
                onChange={(e) => setEntryForm((prev) => ({ ...prev, title: e.target.value }))}
                className="mt-1 h-9 w-full px-2 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold"
                placeholder={entryForm.type === 'RECEITA' ? 'Ex: Recebimento plano PRO' : 'Ex: Hospedagem sistema'}
              />
            </label>
            <label className="text-xs font-bold text-slate-500">
              Valor
              <input
                type="number"
                min="0"
                step="0.01"
                value={entryForm.amount}
                onChange={(e) => setEntryForm((prev) => ({ ...prev, amount: e.target.value }))}
                className="mt-1 h-9 w-full px-2 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold"
                placeholder="0,00"
              />
            </label>
            <label className="text-xs font-bold text-slate-500">
              Tipo de Pgto
              <select
                value={entryForm.paymentMethod}
                onChange={(e) => setEntryForm((prev) => ({ ...prev, paymentMethod: e.target.value }))}
                className="mt-1 h-9 w-full px-2 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold"
              >
                <option value="PIX">PIX</option>
                <option value="BOLETO">Boleto</option>
                <option value="CARTAO">Cartao</option>
                <option value="TRANSFERENCIA">Transferencia</option>
                <option value="DINHEIRO">Dinheiro</option>
              </select>
            </label>
            <label className="text-xs font-bold text-slate-500">
              Vencimento
              <input
                type="date"
                value={entryForm.dueDate}
                onChange={(e) => setEntryForm((prev) => ({ ...prev, dueDate: e.target.value }))}
                className="mt-1 h-9 w-full px-2 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold"
              />
            </label>
            {entryForm.type === 'DESPESA' && (
              <label className="text-xs font-bold text-slate-500">
                Categoria da Despesa
                <select
                  value={entryForm.recurrenceType}
                  onChange={(e) => setEntryForm((prev) => ({ ...prev, recurrenceType: e.target.value as 'AVULSO' | 'FIXO' }))}
                  className="mt-1 h-9 w-full px-2 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold"
                >
                  <option value="AVULSO">Avulso</option>
                  <option value="FIXO">Fixo</option>
                </select>
              </label>
            )}
            <label className="text-xs font-bold text-slate-500">
              Lembrete (dias antes)
              <input
                type="number"
                min="0"
                value={entryForm.reminderDaysBefore}
                onChange={(e) => setEntryForm((prev) => ({ ...prev, reminderDaysBefore: e.target.value }))}
                className="mt-1 h-9 w-full px-2 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold"
              />
            </label>
            <label className="text-xs font-bold text-slate-500 md:col-span-2">
              Observacoes
              <input
                value={entryForm.notes}
                onChange={(e) => setEntryForm((prev) => ({ ...prev, notes: e.target.value }))}
                className="mt-1 h-9 w-full px-2 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold"
                placeholder="Informacao adicional do lancamento"
              />
            </label>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleAddCashflow}
              className="h-9 px-4 rounded-md bg-indigo-600 text-white text-xs font-black uppercase tracking-wider hover:bg-indigo-700 flex items-center gap-2"
            >
              <Plus size={14} />
              Adicionar {entryForm.type === 'RECEITA' ? 'Receita' : 'Despesa'}
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-4 space-y-2">
          <h3 className="text-sm font-black text-slate-800 dark:text-zinc-100 uppercase tracking-wider">Lembretes e Alertas</h3>
          <DreRow label="Contas a Receber" value={formatCurrency(cashflowMetrics.receitas)} />
          <DreRow label="Contas a Pagar" value={formatCurrency(cashflowMetrics.despesas)} />
          <DreRow label="Saldo Previsto" value={formatCurrency(cashflowMetrics.saldo)} isStrong />
          <div className="mt-2 space-y-2 max-h-52 overflow-auto pr-1">
            {reminders.length === 0 ? (
              <p className="text-[11px] font-bold text-slate-400">Sem alertas no momento.</p>
            ) : reminders.map(({ item, remainingDays, level }) => (
              <div key={item.id} className={`rounded-lg border px-2.5 py-2 text-[11px] font-bold ${
                level === 'OVERDUE'
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : level === 'TODAY'
                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                    : 'border-blue-200 bg-blue-50 text-blue-700'
              }`}>
                <p className="flex items-center gap-1.5"><BellRing size={12} /> {item.title}</p>
                <p>{item.type === 'RECEITA' ? 'Recebimento' : 'Pagamento'} {level === 'OVERDUE' ? 'atrasado' : level === 'TODAY' ? 'vence hoje' : `vence em ${remainingDays} dia(s)`}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-4">
        <h3 className="text-sm font-black text-slate-800 dark:text-zinc-100 uppercase tracking-wider mb-3">Lancamentos Financeiros</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-zinc-700">
                <th className="text-left py-2 font-black uppercase tracking-wider text-slate-500">Descricao</th>
                <th className="text-left py-2 font-black uppercase tracking-wider text-slate-500">Tipo</th>
                <th className="text-left py-2 font-black uppercase tracking-wider text-slate-500">Conta</th>
                <th className="text-left py-2 font-black uppercase tracking-wider text-slate-500">Vencimento</th>
                <th className="text-left py-2 font-black uppercase tracking-wider text-slate-500">Valor</th>
                <th className="text-left py-2 font-black uppercase tracking-wider text-slate-500">Status</th>
                <th className="text-right py-2 font-black uppercase tracking-wider text-slate-500">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {cashflow.map((item) => (
                <tr key={item.id} className="border-b border-slate-100 dark:border-zinc-800">
                  <td className="py-2.5 font-bold text-slate-700 dark:text-zinc-200">{item.title}</td>
                  <td className="py-2.5">
                    <span className={`inline-flex px-2 py-0.5 rounded-full font-black text-[10px] ${item.type === 'RECEITA' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                      {item.type}
                    </span>
                  </td>
                  <td className="py-2.5 font-bold text-slate-500">{item.accountType === 'CONTAS_A_RECEBER' ? 'Contas a receber' : 'Contas a pagar'}</td>
                  <td className="py-2.5 font-bold text-slate-500">{new Date(item.dueDate).toLocaleDateString('pt-BR')}</td>
                  <td className="py-2.5 font-black text-slate-800 dark:text-zinc-100">{formatCurrency(item.amount)}</td>
                  <td className="py-2.5">
                    {item.status === 'PAGO' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-black text-[10px]">
                        <CheckCircle2 size={11} /> Pago
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-black text-[10px]">Aberto</span>
                    )}
                  </td>
                  <td className="py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      {item.status === 'ABERTO' && (
                        <button
                          type="button"
                          onClick={() => handleMarkAsPaid(item.id)}
                          className="h-7 px-2 rounded-md bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider hover:bg-emerald-700"
                        >
                          Quitar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteCashflow(item.id)}
                        className="h-7 w-7 rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50 flex items-center justify-center"
                        title="Excluir"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {cashflow.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[11px] font-bold text-slate-400">
                    {isCashflowLoading ? 'Carregando lancamentos...' : 'Nenhum lancamento cadastrado ainda.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
