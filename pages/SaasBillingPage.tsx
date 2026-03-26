import React, { useEffect, useMemo, useState } from 'react';
import { BadgeDollarSign, CalendarClock, CheckCircle2, Clock3, Copy, RefreshCw, RotateCcw, XCircle } from 'lucide-react';
import ApiService from '../services/api';
import { Enterprise, Role, User } from '../types';
import { appendSaasAuditLog } from '../services/saasAuditLog';

interface SaasBillingPageProps {
  currentUser: User;
}

type InvoiceStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELED';

type SaasInvoice = {
  id: string;
  enterpriseId: string;
  enterpriseName: string;
  ownerName: string;
  referenceMonth: string; // MM/YYYY
  dueDate: string; // YYYY-MM-DD
  amount: number;
  status: InvoiceStatus;
  paidAt?: string;
  paymentMethod?: 'PIX' | 'BOLETO' | 'CARTAO' | 'TRANSFERENCIA' | 'DINHEIRO';
  notes?: string;
};

const INVOICES_STORAGE_KEY = 'saas_invoices_v1';
const DEFAULT_DUE_DAY = 10;

const toIsoDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatShortDate = (isoDate?: string): string => {
  if (!isoDate) return '-';
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '-';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
};

const formatDateTimeShort = (isoDate?: string): string => {
  if (!isoDate) return '-';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '-';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hh}:${mm}`;
};

const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

const getReferenceMonth = (date = new Date()): string => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${year}`;
};

const getDueDateByReference = (referenceMonth: string, dueDay = DEFAULT_DUE_DAY): string => {
  const [monthRaw, yearRaw] = referenceMonth.split('/');
  const month = Number(monthRaw);
  const year = Number(yearRaw);
  const dueDate = new Date(year, Math.max(0, month - 1), dueDay);
  return toIsoDate(dueDate);
};

const buildInvoiceKey = (invoice: Pick<SaasInvoice, 'enterpriseId' | 'referenceMonth'>) =>
  `${invoice.enterpriseId}::${invoice.referenceMonth}`;

const SaasBillingPage: React.FC<SaasBillingPageProps> = ({ currentUser }) => {
  const isSuperAdmin = String(currentUser.role || '').toUpperCase() === Role.SUPERADMIN;
  const [isLoading, setIsLoading] = useState(false);
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
  const [invoices, setInvoices] = useState<SaasInvoice[]>([]);
  const [statusFilter, setStatusFilter] = useState<'ALL' | InvoiceStatus>('ALL');
  const [monthFilter, setMonthFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');

  const loadEnterprises = async () => {
    setIsLoading(true);
    try {
      const data = await ApiService.getEnterprises();
      setEnterprises(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Erro ao carregar clientes SaaS:', err);
      setEnterprises([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadEnterprises();
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(INVOICES_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      setInvoices(Array.isArray(parsed) ? parsed : []);
    } catch (err) {
      console.error('Erro ao carregar faturas SaaS:', err);
      setInvoices([]);
    }
  }, []);

  useEffect(() => {
    const nowIso = toIsoDate(new Date());
    let changed = false;
    let changedCount = 0;
    const next = invoices.map((invoice) => {
      if (invoice.status === 'PENDING' && invoice.dueDate < nowIso) {
        changed = true;
        changedCount += 1;
        return { ...invoice, status: 'OVERDUE' as const };
      }
      return invoice;
    });
    if (changed) {
      setInvoices(next);
      localStorage.setItem(INVOICES_STORAGE_KEY, JSON.stringify(next));
      appendSaasAuditLog({
        actorName: 'SISTEMA',
        actorRole: 'SYSTEM',
        module: 'COBRANCAS',
        action: 'SAAS_INVOICE_AUTO_OVERDUE',
        entityType: 'INVOICE',
        summary: `${changedCount} fatura(s) atualizada(s) para atrasada automaticamente`,
        metadata: { changedCount }
      });
    }
  }, [invoices]);

  const saveInvoices = (next: SaasInvoice[]) => {
    setInvoices(next);
    localStorage.setItem(INVOICES_STORAGE_KEY, JSON.stringify(next));
  };

  const generateMonthlyInvoices = async () => {
    const referenceMonth = getReferenceMonth(new Date());
    const dueDate = getDueDateByReference(referenceMonth, DEFAULT_DUE_DAY);
    const activeClients = enterprises.filter((ent) => (ent.serviceStatus || 'ATIVO') !== 'CANCELADO');
    if (activeClients.length === 0) {
      alert('Nenhum cliente elegível para faturamento.');
      return;
    }

    const existingKeys = new Set(invoices.map((invoice) => buildInvoiceKey(invoice)));
    const generated: SaasInvoice[] = [];

    activeClients.forEach((ent) => {
      const key = `${ent.id}::${referenceMonth}`;
      if (existingKeys.has(key)) return;
      const pendingAdjustment = Number(ent.pendingPlanAdjustmentAmount || 0);
      const baseAmount = Number(ent.monthlyFee || 0);
      const finalAmount = baseAmount + pendingAdjustment;
      const noteParts = [pendingAdjustment > 0 ? `Ajuste de plano: +${formatCurrency(pendingAdjustment)}` : '', ent.pendingPlanAdjustmentReason || ''].filter(Boolean);
      generated.push({
        id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        enterpriseId: ent.id,
        enterpriseName: ent.name,
        ownerName: ent.ownerName || ent.managerName || 'Owner',
        referenceMonth,
        dueDate,
        amount: finalAmount,
        status: 'PENDING',
        notes: noteParts.join(' | ') || undefined,
      });
    });

    if (generated.length === 0) {
      alert(`Todas as faturas de ${referenceMonth} já foram geradas.`);
      return;
    }

    const next = [...generated, ...invoices];
    saveInvoices(next);
    const adjustedEnterprises = activeClients.filter((ent) => Number(ent.pendingPlanAdjustmentAmount || 0) > 0);
    if (adjustedEnterprises.length > 0) {
      try {
        const updatedEnterprises = await Promise.all(
          adjustedEnterprises.map((ent) =>
            ApiService.updateEnterprise(ent.id, {
              pendingPlanAdjustmentAmount: 0,
              pendingPlanAdjustmentReason: '',
            })
          )
        );
        setEnterprises((prev) => prev.map((ent) => updatedEnterprises.find((item) => item.id === ent.id) || ent));
      } catch (err) {
        console.error('Erro ao limpar ajustes pendentes de plano:', err);
      }
    }
    appendSaasAuditLog({
      actorName: currentUser.name,
      actorRole: String(currentUser.role || ''),
      module: 'COBRANCAS',
      action: 'SAAS_INVOICE_BATCH_GENERATED',
      entityType: 'INVOICE',
      summary: `${generated.length} fatura(s) gerada(s) para ${referenceMonth}`,
      metadata: { referenceMonth, generatedCount: generated.length }
    });
    alert(`${generated.length} fatura(s) gerada(s) para ${referenceMonth}.`);
  };

  const markAsPaid = (invoiceId: string) => {
    const target = invoices.find((invoice) => invoice.id === invoiceId);
    if (!target) return;
    const next = invoices.map((invoice) =>
      invoice.id === invoiceId
        ? { ...invoice, status: 'PAID' as const, paidAt: new Date().toISOString(), paymentMethod: 'PIX' as const }
        : invoice
    );
    saveInvoices(next);
    appendSaasAuditLog({
      actorName: currentUser.name,
      actorRole: String(currentUser.role || ''),
      module: 'COBRANCAS',
      action: 'SAAS_INVOICE_MARKED_PAID',
      entityType: 'INVOICE',
      entityId: target.id,
      enterpriseId: target.enterpriseId,
      enterpriseName: target.enterpriseName,
      summary: `Fatura ${target.referenceMonth} marcada como paga`,
      metadata: { amount: target.amount, referenceMonth: target.referenceMonth }
    });
  };

  const reopenInvoice = (invoiceId: string) => {
    const target = invoices.find((invoice) => invoice.id === invoiceId);
    if (!target) return;
    const next = invoices.map((invoice) =>
      invoice.id === invoiceId
        ? { ...invoice, status: 'PENDING' as const, paidAt: undefined, paymentMethod: undefined }
        : invoice
    );
    saveInvoices(next);
    appendSaasAuditLog({
      actorName: currentUser.name,
      actorRole: String(currentUser.role || ''),
      module: 'COBRANCAS',
      action: 'SAAS_INVOICE_REOPENED',
      entityType: 'INVOICE',
      entityId: target.id,
      enterpriseId: target.enterpriseId,
      enterpriseName: target.enterpriseName,
      summary: `Fatura ${target.referenceMonth} reaberta para pendente`,
      metadata: { amount: target.amount, referenceMonth: target.referenceMonth }
    });
  };

  const cancelInvoice = (invoiceId: string) => {
    const confirmed = window.confirm('Deseja cancelar esta fatura?');
    if (!confirmed) return;
    const target = invoices.find((invoice) => invoice.id === invoiceId);
    if (!target) return;
    const next = invoices.map((invoice) => (invoice.id === invoiceId ? { ...invoice, status: 'CANCELED' as const } : invoice));
    saveInvoices(next);
    appendSaasAuditLog({
      actorName: currentUser.name,
      actorRole: String(currentUser.role || ''),
      module: 'COBRANCAS',
      action: 'SAAS_INVOICE_CANCELED',
      entityType: 'INVOICE',
      entityId: target.id,
      enterpriseId: target.enterpriseId,
      enterpriseName: target.enterpriseName,
      summary: `Fatura ${target.referenceMonth} cancelada`,
      metadata: { amount: target.amount, referenceMonth: target.referenceMonth }
    });
  };

  const copyChargeMessage = async (invoice: SaasInvoice) => {
    const message = [
      `Olá, ${invoice.ownerName}.`,
      `Identificamos a fatura SaaS pendente da rede ${invoice.enterpriseName}.`,
      `Referência: ${invoice.referenceMonth}`,
      `Vencimento: ${formatShortDate(invoice.dueDate)}`,
      `Valor: ${formatCurrency(invoice.amount)}`,
      '',
      'Favor regularizar para manter os serviços ativos.'
    ].join('\n');
    try {
      await navigator.clipboard.writeText(message);
      appendSaasAuditLog({
        actorName: currentUser.name,
        actorRole: String(currentUser.role || ''),
        module: 'COBRANCAS',
        action: 'SAAS_INVOICE_COLLECTION_MESSAGE_COPIED',
        entityType: 'INVOICE',
        entityId: invoice.id,
        enterpriseId: invoice.enterpriseId,
        enterpriseName: invoice.enterpriseName,
        summary: `Mensagem de cobrança copiada para fatura ${invoice.referenceMonth}`,
        metadata: { amount: invoice.amount, referenceMonth: invoice.referenceMonth }
      });
      alert('Mensagem de cobrança copiada para envio no WhatsApp.');
    } catch {
      alert('Não foi possível copiar a mensagem.');
    }
  };

  const monthOptions = useMemo(() => {
    const unique = Array.from(new Set(invoices.map((inv) => String(inv.referenceMonth || '')))) as string[];
    return unique.sort((a, b) => b.localeCompare(a));
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    const term = search.trim().toLowerCase();
    return invoices
      .filter((invoice) => statusFilter === 'ALL' || invoice.status === statusFilter)
      .filter((invoice) => monthFilter === 'ALL' || invoice.referenceMonth === monthFilter)
      .filter((invoice) => {
        if (!term) return true;
        return (
          invoice.enterpriseName.toLowerCase().includes(term)
          || invoice.ownerName.toLowerCase().includes(term)
          || invoice.referenceMonth.toLowerCase().includes(term)
        );
      })
      .sort((a, b) => {
        const byDate = b.referenceMonth.localeCompare(a.referenceMonth);
        if (byDate !== 0) return byDate;
        return b.id.localeCompare(a.id);
      });
  }, [invoices, search, statusFilter, monthFilter]);

  const summary = useMemo(() => {
    const pendingValue = invoices.filter((i) => i.status === 'PENDING').reduce((acc, i) => acc + i.amount, 0);
    const overdueValue = invoices.filter((i) => i.status === 'OVERDUE').reduce((acc, i) => acc + i.amount, 0);
    const paidValue = invoices.filter((i) => i.status === 'PAID').reduce((acc, i) => acc + i.amount, 0);
    const openCount = invoices.filter((i) => i.status === 'PENDING' || i.status === 'OVERDUE').length;
    const paidCount = invoices.filter((i) => i.status === 'PAID').length;
    const billedCount = invoices.filter((i) => i.status !== 'CANCELED').length;
    const recoveryRate = billedCount > 0 ? (paidCount / billedCount) * 100 : 0;
    return { pendingValue, overdueValue, paidValue, openCount, recoveryRate };
  }, [invoices]);

  if (!isSuperAdmin) {
    return <div className="p-6 text-sm font-bold text-red-600">Acesso restrito ao SUPERADMIN.</div>;
  }

  return (
    <div className="dash-shell space-y-4 p-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
            <BadgeDollarSign size={16} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tight">Cobranças SaaS</h1>
            <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-[0.16em]">
              Faturas mensais, inadimplência e régua de cobrança
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadEnterprises}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 bg-white dark:bg-zinc-900 text-[11px] font-black uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-zinc-800 flex items-center gap-1.5"
          >
            <RefreshCw size={13} />
            Atualizar
          </button>
          <button
            onClick={generateMonthlyInvoices}
            className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest hover:bg-indigo-700 flex items-center gap-1.5"
          >
            <CalendarClock size={13} />
            Gerar Faturas do Mês
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <MetricCard title="A Receber (Pendente)" value={formatCurrency(summary.pendingValue)} icon={<Clock3 size={14} className="text-amber-600" />} />
        <MetricCard title="Inadimplência (Atraso)" value={formatCurrency(summary.overdueValue)} icon={<XCircle size={14} className="text-red-600" />} />
        <MetricCard title="Receita Recebida" value={formatCurrency(summary.paidValue)} icon={<CheckCircle2 size={14} className="text-emerald-600" />} />
        <MetricCard title="Faturas em Aberto" value={String(summary.openCount)} icon={<CalendarClock size={14} className="text-indigo-600" />} />
        <MetricCard title="Taxa Recuperação" value={`${summary.recoveryRate.toFixed(1)}%`} icon={<RotateCcw size={14} className="text-blue-600" />} />
      </section>

      <section className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente, owner ou mês..."
            className="h-9 px-3 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-200 outline-none focus:border-indigo-500"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | InvoiceStatus)}
            className="h-9 px-3 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-200 outline-none focus:border-indigo-500"
          >
            <option value="ALL">Todos os status</option>
            <option value="PENDING">Pendente</option>
            <option value="OVERDUE">Atrasado</option>
            <option value="PAID">Pago</option>
            <option value="CANCELED">Cancelado</option>
          </select>
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="h-9 px-3 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-200 outline-none focus:border-indigo-500"
          >
            <option value="ALL">Todos os meses</option>
            {monthOptions.map((month) => (
              <option key={month} value={month}>{month}</option>
            ))}
          </select>
          <div className="h-9 flex items-center justify-end text-[10px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest">
            {isLoading ? 'Carregando clientes...' : `${filteredInvoices.length} faturas`}
          </div>
        </div>
      </section>

      <section className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-700 overflow-hidden">
        <div className="overflow-auto">
          <table className="w-full min-w-[1080px] text-xs">
            <thead className="bg-slate-50 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-3 py-2 text-left">Cliente</th>
                <th className="px-3 py-2 text-left">Owner</th>
                <th className="px-3 py-2 text-center">Ref.</th>
                <th className="px-3 py-2 text-center">Venc.</th>
                <th className="px-3 py-2 text-center">Valor</th>
                <th className="px-3 py-2 text-center">Status</th>
                <th className="px-3 py-2 text-center">Pago Em</th>
                <th className="px-3 py-2 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((invoice) => (
                <tr key={invoice.id} className="border-b border-slate-100 dark:border-zinc-800">
                  <td className="px-3 py-2.5 font-black text-slate-800 dark:text-zinc-100">{invoice.enterpriseName}</td>
                  <td className="px-3 py-2.5 font-bold text-slate-600 dark:text-zinc-300">{invoice.ownerName}</td>
                  <td className="px-3 py-2.5 text-center font-bold text-slate-700 dark:text-zinc-200">{invoice.referenceMonth}</td>
                  <td className="px-3 py-2.5 text-center font-bold text-slate-700 dark:text-zinc-200">{formatShortDate(invoice.dueDate)}</td>
                  <td className="px-3 py-2.5 text-center font-black text-slate-800 dark:text-zinc-100">{formatCurrency(invoice.amount)}</td>
                  <td className="px-3 py-2.5 text-center">
                    <StatusBadge status={invoice.status} />
                  </td>
                  <td className="px-3 py-2.5 text-center font-bold text-slate-500 dark:text-zinc-400">{formatDateTimeShort(invoice.paidAt)}</td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      {(invoice.status === 'PENDING' || invoice.status === 'OVERDUE') && (
                        <button
                          onClick={() => markAsPaid(invoice.id)}
                          className="px-2 py-1 rounded-md bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider hover:bg-emerald-700"
                        >
                          Baixar
                        </button>
                      )}
                      {invoice.status === 'PAID' && (
                        <button
                          onClick={() => reopenInvoice(invoice.id)}
                          className="px-2 py-1 rounded-md bg-amber-500 text-white text-[10px] font-black uppercase tracking-wider hover:bg-amber-600"
                        >
                          Reabrir
                        </button>
                      )}
                      {invoice.status !== 'CANCELED' && (
                        <button
                          onClick={() => cancelInvoice(invoice.id)}
                          className="px-2 py-1 rounded-md bg-red-500 text-white text-[10px] font-black uppercase tracking-wider hover:bg-red-600"
                        >
                          Cancelar
                        </button>
                      )}
                      {(invoice.status === 'PENDING' || invoice.status === 'OVERDUE') && (
                        <button
                          onClick={() => copyChargeMessage(invoice)}
                          title="Copiar cobrança para WhatsApp"
                          className="px-2 py-1 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 text-[10px] font-black uppercase tracking-wider hover:bg-slate-50 dark:hover:bg-zinc-700 flex items-center gap-1"
                        >
                          <Copy size={11} />
                          Cobrar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredInvoices.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-xs font-bold text-slate-500 dark:text-zinc-400">
                    Nenhuma fatura encontrada para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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

const StatusBadge = ({ status }: { status: InvoiceStatus }) => {
  if (status === 'PAID') {
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase border border-emerald-200 bg-emerald-50 text-emerald-700">Pago</span>;
  }
  if (status === 'OVERDUE') {
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase border border-red-200 bg-red-50 text-red-700">Atrasado</span>;
  }
  if (status === 'CANCELED') {
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase border border-slate-300 bg-slate-100 text-slate-600">Cancelado</span>;
  }
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase border border-amber-200 bg-amber-50 text-amber-700">Pendente</span>;
};

export default SaasBillingPage;
