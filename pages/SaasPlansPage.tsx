import React, { useEffect, useMemo, useState } from 'react';
import {
  Users, Edit, Trash2, Power, PowerOff, RotateCcw,
  X, Clock, CheckCircle2, AlertTriangle, Mail, Phone,
  Calendar, Settings2, Building2, Save, RefreshCw,
  Link as LinkIcon, Copy,
} from 'lucide-react';
import ApiService from '../services/api';
import { Enterprise, Role, User } from '../types';

interface SaasPlansPageProps {
  currentUser: User;
}

const TRIAL_DAYS_KEY = 'saas_trial_days_v1';
const DEFAULT_TRIAL_DAYS = 7;
const SAAS_PLAN_CATALOG_KEY = 'saas_plan_catalog_v1';
const SAAS_INVOICES_STORAGE_KEY = 'saas_invoices_v1';

type SaaSPlanKey = 'BASIC' | 'PREMIUM';

type PlanCatalogEntry = {
  key: SaaSPlanKey;
  name: string;
  monthlyPrice: number;
  graceDaysAfterDue: number;
};

type SaasInvoiceRecord = {
  id: string;
  enterpriseId: string;
  dueDate: string;
  amount: number;
  status: 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELED';
  notes?: string;
};

const DEFAULT_PLAN_CATALOG: Record<SaaSPlanKey, PlanCatalogEntry> = {
  BASIC: { key: 'BASIC', name: 'Básico', monthlyPrice: 197, graceDaysAfterDue: 0 },
  PREMIUM: { key: 'PREMIUM', name: 'Premium', monthlyPrice: 397, graceDaysAfterDue: 0 },
};

const normalizeSaasPlan = (raw?: string): SaaSPlanKey =>
  String(raw || '').trim().toUpperCase() === 'PREMIUM' ? 'PREMIUM' : 'BASIC';

const getPlanCatalog = (): Record<SaaSPlanKey, PlanCatalogEntry> => {
  try {
    const raw = localStorage.getItem(SAAS_PLAN_CATALOG_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return {
      BASIC: { ...DEFAULT_PLAN_CATALOG.BASIC, ...(parsed?.BASIC || {}) },
      PREMIUM: { ...DEFAULT_PLAN_CATALOG.PREMIUM, ...(parsed?.PREMIUM || {}) },
    };
  } catch {
    return DEFAULT_PLAN_CATALOG;
  }
};

const appendPlanAdjustmentToNextInvoice = (enterpriseId: string, amount: number, note: string) => {
  if (!amount || amount <= 0) return false;
  try {
    const raw = localStorage.getItem(SAAS_INVOICES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const invoices: SaasInvoiceRecord[] = Array.isArray(parsed) ? parsed : [];
    const todayIso = new Date().toISOString().slice(0, 10);
    const targetIndex = invoices.findIndex((invoice) =>
      invoice.enterpriseId === enterpriseId
      && invoice.status === 'PENDING'
      && String(invoice.dueDate || '') >= todayIso
    );
    if (targetIndex < 0) return false;
    const target = invoices[targetIndex];
    invoices[targetIndex] = {
      ...target,
      amount: Number(target.amount || 0) + amount,
      notes: [target.notes, note].filter(Boolean).join(' | '),
    };
    localStorage.setItem(SAAS_INVOICES_STORAGE_KEY, JSON.stringify(invoices));
    return true;
  } catch {
    return false;
  }
};


const addDays = (date: Date, days: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const addMonths = (date: Date, months: number) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
};

const addMonthsKeepingAnchorDay = (baseIsoDate: string, months: number) => {
  const rawDate = new Date(baseIsoDate);
  if (Number.isNaN(rawDate.getTime())) return addMonths(new Date(), months).toISOString().slice(0, 10);

  const year = rawDate.getUTCFullYear();
  const month = rawDate.getUTCMonth();
  const day = rawDate.getUTCDate();

  const targetFirstDay = new Date(Date.UTC(year, month + months, 1));
  const targetYear = targetFirstDay.getUTCFullYear();
  const targetMonth = targetFirstDay.getUTCMonth();
  const targetLastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, targetLastDay);

  return new Date(Date.UTC(targetYear, targetMonth, targetDay)).toISOString().slice(0, 10);
};

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

const diffDays = (iso: string) =>
  Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);

const isDateOnOrBeforeToday = (value?: string) => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  date.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date.getTime() <= today.getTime();
};

const fmtDoc = (doc?: string) => {
  const d = String(doc || '').replace(/\D/g, '');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return doc || '—';
};

const fmtPhone = (phone?: string) => {
  const p = String(phone || '').replace(/\D/g, '');
  if (p.length === 13) return `+${p.slice(0, 2)} (${p.slice(2, 4)}) ${p.slice(4, 9)}-${p.slice(9)}`;
  if (p.length === 12) return `+${p.slice(0, 2)} (${p.slice(2, 4)}) ${p.slice(4, 8)}-${p.slice(8)}`;
  if (p.length === 11) return `(${p.slice(0, 2)}) ${p.slice(2, 7)}-${p.slice(7)}`;
  if (p.length === 10) return `(${p.slice(0, 2)}) ${p.slice(2, 6)}-${p.slice(6)}`;
  return phone || '—';
};

const fmtPlanType = (planType?: Enterprise['planType']) => {
  switch (String(planType || '').toUpperCase()) {
    case 'PREMIUM': return 'Premium';
    case 'PRO': return 'Pro';
    case 'ENTERPRISE': return 'Enterprise';
    case 'BASIC': return 'Básico';
    default: return '—';
  }
};

const fmtPlanWithValue = (enterprise?: Enterprise) => {
  const label = fmtPlanType(enterprise?.planType);
  const fee = Number(enterprise?.monthlyFee || 0);
  if (!enterprise || label === '—') return '—';
  return `${label} • ${fee.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
};

const pickCurrentPlanEnterprise = (enterprises: Enterprise[]) => {
  if (!Array.isArray(enterprises) || enterprises.length === 0) return undefined;
  const withPlan = enterprises.filter((enterprise) => Boolean(String(enterprise.planType || '').trim()));
  const activeWithPlan = withPlan.filter((enterprise) => String(enterprise.serviceStatus || '').toUpperCase() !== 'CANCELADO');
  if (activeWithPlan.length > 0) return activeWithPlan[0];
  if (withPlan.length > 0) return withPlan[0];
  const withFee = enterprises.filter((enterprise) => Number(enterprise.monthlyFee || 0) > 0);
  const activeWithFee = withFee.filter((enterprise) => String(enterprise.serviceStatus || '').toUpperCase() !== 'CANCELADO');
  if (activeWithFee.length > 0) return activeWithFee[0];
  if (withFee.length > 0) return withFee[0];
  return enterprises[0];
};

const fmtServiceStatus = (status?: Enterprise['serviceStatus']) => {
  switch (String(status || '').toUpperCase()) {
    case 'ATIVO': return 'Ativo';
    case 'TRIAL': return 'Trial';
    case 'PAUSADO': return 'Pausado';
    case 'INADIMPLENTE': return 'Inadimplente';
    case 'CANCELADO': return 'Cancelado';
    default: return '—';
  }
};

const fmtDate = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR');
};

const summarizeField = <T,>(items: T[], pick: (item: T) => string) => {
  const values = Array.from(new Set(items.map(pick).filter(Boolean)));
  if (values.length === 0) return '';
  if (values.length === 1) return values[0];
  return 'Multiplos';
};

const normalizeIdentity = (value?: string) => String(value || '').trim().toLowerCase();

const sameIdentity = (a?: string, b?: string) => {
  const aa = normalizeIdentity(a);
  const bb = normalizeIdentity(b);
  if (!aa || !bb) return false;
  return aa === bb || aa.includes(bb) || bb.includes(aa);
};

const setsOverlapByIdentity = (left: Set<string>, right: Set<string>) => {
  for (const l of left) {
    for (const r of right) {
      if (sameIdentity(l, r)) return true;
    }
  }
  return false;
};

const userIdentitySet = (user: User | null | undefined) => {
  const set = new Set<string>();
  const name = normalizeIdentity(user?.name);
  const email = normalizeIdentity(user?.email);
  if (name) set.add(name);
  if (email) set.add(email);
  return set;
};

const enterpriseOwnerIdentitySet = (enterprise: Enterprise) => {
  const set = new Set<string>();
  const owner = normalizeIdentity(enterprise.ownerName);
  const manager = normalizeIdentity(enterprise.managerName);
  if (owner) set.add(owner);
  if (manager) set.add(manager);
  return set;
};

const enterpriseHasOwnerRef = (enterprise: Enterprise) => Boolean(normalizeIdentity(enterprise.ownerName));

type ClientFormData = {
  document: string;
  name: string;
  email: string;
  password: string;
  phone: string;
  expirationDate: string;
  cep: string;
  street: string;
  number: string;
  neighborhood: string;
  complement: string;
  city: string;
  state: string;
  planType: SaaSPlanKey;
  enterpriseIds: string[];
  isTrial: boolean;
  trialDays: number;
  renewalMonths: number;
};

const SaasPlansPage: React.FC<SaasPlansPageProps> = ({ currentUser }) => {
  const normalizeRole = (value?: string) => String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  const isSuperAdmin = normalizeRole(String(currentUser.role || '')) === Role.SUPERADMIN;
  const [isLoading, setIsLoading] = useState(false);
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
  const [ownerUsers, setOwnerUsers] = useState<User[]>([]);
  const [clientModal, setClientModal] = useState<{ open: boolean; user: User | null }>({ open: false, user: null });
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [resetLinkTarget, setResetLinkTarget] = useState<User | null>(null);
  const [resetLinkData, setResetLinkData] = useState<{ resetLink: string; expiresAt: string } | null>(null);
  const [isResetLinkModalOpen, setIsResetLinkModalOpen] = useState(false);
  const [isGeneratingResetLink, setIsGeneratingResetLink] = useState(false);

  const isOwnerUser = (user: Partial<User>) => {
    const role = normalizeRole(String(user?.role || ''));
    return role === Role.OWNER || role === 'DONO_DE_REDE' || role === 'DONO_REDE';
  };

  const getUserEnterprises = (user: User) => {
    const userKeys = userIdentitySet(user);
    return enterprises.filter((enterprise) => {
      const byId = user.enterpriseIds?.includes(enterprise.id);
      if (byId) return true;
      const ownerKeys = enterpriseOwnerIdentitySet(enterprise);
      return ownerKeys.size > 0 && setsOverlapByIdentity(ownerKeys, userKeys);
    });
  };

  const getUserEffectiveExpirationDate = (user: User, userEnts?: Enterprise[]) => {
    const userExpiration = String(user.expirationDate || '').trim();
    if (userExpiration) return userExpiration;
    const linked = userEnts || getUserEnterprises(user);
    const enterpriseDates = linked
      .map((enterprise) => String(enterprise.expirationDate || '').trim())
      .filter(Boolean)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    return enterpriseDates[0] || '';
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const usersData = await ApiService.getUsers();
      const owners: User[] = Array.isArray(usersData)
        ? usersData.filter((u: User) => isOwnerUser(u))
        : [];
      setOwnerUsers(owners);

      try {
        const enterpriseData = await ApiService.getEnterprises();
        const normalizedEnterprises = Array.isArray(enterpriseData) ? enterpriseData : [];
        setEnterprises(normalizedEnterprises);
      } catch (enterpriseErr) {
        console.error('Erro ao carregar empresas na tela Clientes/Planos:', enterpriseErr);
        setEnterprises([]);
      }
    } catch (err) {
      console.error('Erro ao carregar dados de planos SaaS:', err);
      setOwnerUsers([]);
      setEnterprises([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const stats = useMemo(() => {
    const now = Date.now();

    const activeAccounts = ownerUsers.filter((user) => Boolean(user.isActive)).length;
    const inactiveAccounts = ownerUsers.filter((user) => !user.isActive).length;
    const trialAccounts = ownerUsers.filter((user) => user.trialExpiresAt && diffDays(user.trialExpiresAt) > 0).length;
    const expiredAccounts = ownerUsers.filter((user) => {
      if (user.trialExpiresAt && diffDays(user.trialExpiresAt) <= 0) return true;
      return getUserEnterprises(user).some((enterprise) => {
        if (!enterprise.expirationDate) return false;
        const expirationTime = new Date(enterprise.expirationDate).getTime();
        return !Number.isNaN(expirationTime) && expirationTime < now;
      });
    }).length;
    const deactivatedAccounts = ownerUsers.filter((user) =>
      getUserEnterprises(user).some((enterprise) => String(enterprise.serviceStatus || '').toUpperCase() === 'CANCELADO')
    ).length;

    return {
      activeAccounts,
      inactiveAccounts,
      trialAccounts,
      expiredAccounts,
      deactivatedAccounts,
    };
  }, [ownerUsers, enterprises]);

  const handleSaveClient = async (data: ClientFormData, editingUser: User | null) => {
    try {
      const previousEnterpriseIds = editingUser?.enterpriseIds || [];
      const planCatalog = getPlanCatalog();
      const selectedPlan = planCatalog[data.planType] || DEFAULT_PLAN_CATALOG.BASIC;
      const baseExpirationDate = editingUser
        ? getUserEffectiveExpirationDate(editingUser)
        : '';
      const renewalBaseDate = baseExpirationDate && !Number.isNaN(new Date(baseExpirationDate).getTime())
        ? new Date(baseExpirationDate)
        : new Date(data.expirationDate || todayIsoDate());
      const selectedExpirationDate = editingUser && Number(data.renewalMonths || 0) > 0
        ? addMonthsKeepingAnchorDay(
            (baseExpirationDate || data.expirationDate || todayIsoDate()),
            Number(data.renewalMonths || 0)
          )
        : (data.expirationDate || todayIsoDate());
      const shouldBeActive = !isDateOnOrBeforeToday(selectedExpirationDate);
      const payload: Record<string, unknown> = {
        document: data.document.trim(),
        name: data.name.trim(),
        email: data.email.trim(),
        phone: data.phone.trim(),
        expirationDate: selectedExpirationDate,
        cep: data.cep.trim(),
        street: data.street.trim(),
        number: data.number.trim(),
        neighborhood: data.neighborhood.trim(),
        complement: data.complement.trim(),
        city: data.city.trim(),
        state: data.state.trim(),
        role: Role.OWNER,
        isActive: shouldBeActive,
        enterpriseIds: data.enterpriseIds,
      };
      if (data.password) payload.password = data.password;
      if (data.isTrial) {
        payload.trialExpiresAt = addDays(new Date(), data.trialDays).toISOString();
      }
      if (editingUser) {
        await ApiService.updateUser(editingUser.id, payload);
      } else {
        await ApiService.createUser(payload);
      }

      const nextIdsSet = new Set(data.enterpriseIds);
      const removedIds = previousEnterpriseIds.filter((eid) => !nextIdsSet.has(eid));
      const editingIdentity = userIdentitySet(editingUser);

      if (data.enterpriseIds.length > 0) {
        await Promise.all(
          data.enterpriseIds.map(async (eid) => {
            const enterprise = enterprises.find((item) => item.id === eid);
            const currentPlan = normalizeSaasPlan(enterprise?.planType);
            const currentFee = Number(enterprise?.monthlyFee || (planCatalog[currentPlan]?.monthlyPrice || DEFAULT_PLAN_CATALOG[currentPlan].monthlyPrice));
            const nextFee = Number(selectedPlan.monthlyPrice || 0);
            const adjustment = editingUser && currentPlan !== data.planType ? Math.max(0, nextFee - currentFee) : 0;
            const adjustmentNote = adjustment > 0
              ? `Ajuste de upgrade de plano ${currentPlan} -> ${data.planType}: +R$ ${adjustment.toFixed(2)}`
              : '';
            const invoiceAdjusted = adjustment > 0
              ? appendPlanAdjustmentToNextInvoice(eid, adjustment, adjustmentNote)
              : false;
            await ApiService.updateEnterprise(eid, {
              ownerName: data.name.trim(),
              planType: data.planType,
              monthlyFee: nextFee,
              expirationDate: selectedExpirationDate || enterprise?.expirationDate || todayIsoDate(),
              pendingPlanAdjustmentAmount: adjustment > 0 && !invoiceAdjusted
                ? Number(enterprise?.pendingPlanAdjustmentAmount || 0) + adjustment
                : 0,
              pendingPlanAdjustmentReason: adjustment > 0 && !invoiceAdjusted ? adjustmentNote : '',
            });
          })
        );
      }

      if (removedIds.length > 0) {
        await Promise.all(
          removedIds.map(async (eid) => {
            const ent = enterprises.find((enterprise) => enterprise.id === eid);
            if (!ent) return;
            const ownerKeys = enterpriseOwnerIdentitySet(ent);
            const shouldClearOwner = ownerKeys.size > 0 && setsOverlapByIdentity(ownerKeys, editingIdentity);
            if (!shouldClearOwner) return;
            await ApiService.updateEnterprise(eid, { ownerName: '' });
          })
        );
      }

      if (data.isTrial && data.enterpriseIds.length > 0) {
        await Promise.all(
          data.enterpriseIds.map(eid =>
            ApiService.updateEnterprise(eid, { serviceStatus: 'TRIAL' })
          )
        );
      }
      setClientModal({ open: false, user: null });
      await loadData();
    } catch (err) {
      console.error('Erro ao salvar cliente:', err);
      throw err instanceof Error ? err : new Error('Erro ao salvar cliente. Verifique os dados e tente novamente.');
    }
  };

  const handleDeleteClient = async (user: User) => {
    try {
      await ApiService.deleteUser(user.id);
      await loadData();
    } catch (err) {
      console.error('Erro ao excluir cliente:', err);
      alert('Erro ao excluir cliente.');
    }
  };

  const handleToggleActive = async (user: User) => {
    try {
      const nextState = !user.isActive;
      if (nextState) {
        const userEnts = getUserEnterprises(user);
        const effectiveExpirationDate = getUserEffectiveExpirationDate(user, userEnts);
        if (!effectiveExpirationDate || isDateOnOrBeforeToday(effectiveExpirationDate)) {
          alert('Conta vencida. Renove para uma data futura para reativar o cliente.');
          return;
        }
      }
      await ApiService.updateUser(user.id, { isActive: nextState });
      await loadData();
    } catch (err) {
      console.error('Erro ao alterar status do cliente:', err);
      alert('Erro ao alterar status.');
    }
  };

  const handleRenew = async (user: User) => {
    try {
      const currentExpirationDate = String(user.expirationDate || '').trim();
      const renewalBaseDate = currentExpirationDate || todayIsoDate();
      const newExpiry = addMonthsKeepingAnchorDay(renewalBaseDate, 1);
      await ApiService.updateUser(user.id, { isActive: true, expirationDate: newExpiry, trialExpiresAt: null });
      for (const eid of user.enterpriseIds || []) {
        await ApiService.updateEnterprise(eid, { serviceStatus: 'ATIVO', expirationDate: newExpiry });
      }
      await loadData();
    } catch (err) {
      console.error('Erro ao renovar cliente:', err);
      alert('Erro ao renovar.');
    }
  };

  const handleGenerateResetLink = async (user: User) => {
    setIsGeneratingResetLink(true);
    setResetLinkTarget(user);
    setIsResetLinkModalOpen(true);
    setResetLinkData(null);

    try {
      const response = await ApiService.generatePasswordResetLink(user.id);
      setResetLinkData({
        resetLink: String(response?.resetLink || ''),
        expiresAt: String(response?.expiresAt || ''),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Nao foi possivel gerar o link temporario de redefinicao.';
      setResetLinkData({
        resetLink: '',
        expiresAt: '',
      });
      alert(message);
    } finally {
      setIsGeneratingResetLink(false);
    }
  };

  const handleCopyResetLink = async () => {
    if (!resetLinkData?.resetLink) return;
    try {
      await navigator.clipboard.writeText(resetLinkData.resetLink);
      alert('Link copiado para a area de transferencia.');
    } catch {
      alert('Nao foi possivel copiar automaticamente. Copie manualmente o link exibido.');
    }
  };

  const handleCloseResetLinkModal = () => {
    setIsResetLinkModalOpen(false);
    setResetLinkTarget(null);
    setResetLinkData(null);
    setIsGeneratingResetLink(false);
  };

  const filteredOwnerUsers = useMemo(() => {
    if (!clientSearch.trim()) return ownerUsers;
    const q = clientSearch.toLowerCase();
    return ownerUsers.filter(u =>
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.phone || '').includes(q) ||
      enterprises.filter(e => u.enterpriseIds?.includes(e.id)).some(e => e.name.toLowerCase().includes(q))
    );
  }, [ownerUsers, enterprises, clientSearch]);

  if (!isSuperAdmin) {
    return (
      <div className="p-6">
        <p className="text-sm font-bold text-red-600">Acesso restrito ao SUPERADMIN.</p>
      </div>
    );
  }

  return (
    <div className="dash-shell space-y-4 p-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
            <Users size={16} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tight">Clientes / Planos</h1>
            <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-[0.16em]">
              Gestão de donos de rede, trials e contratos
            </p>
          </div>
        </div>
        <button
          onClick={loadData}
          className="px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 bg-white dark:bg-zinc-900 text-[11px] font-black uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-zinc-800 flex items-center gap-1.5"
        >
          <RefreshCw size={13} />
          Atualizar
        </button>
      </header>

      <section className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <MetricCard title="Contas Ativas" value={String(stats.activeAccounts)} tone="emerald" />
        <MetricCard title="Contas Inativas" value={String(stats.inactiveAccounts)} tone="slate" />
        <MetricCard title="Contas Teste" value={String(stats.trialAccounts)} tone="amber" />
        <MetricCard title="Contas Vencidas" value={String(stats.expiredAccounts)} tone="orange" />
        <MetricCard title="Contas Desativadas" value={String(stats.deactivatedAccounts)} tone="red" />
      </section>

      <section className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-700 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2 flex-1">
            <Users size={14} className="text-indigo-600" />
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-zinc-100">Clientes — Donos de Rede</h3>
            {isLoading && <span className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest ml-2">Carregando...</span>}
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="text"
              placeholder="Buscar cliente..."
              value={clientSearch}
              onChange={e => setClientSearch(e.target.value)}
              className="h-8 px-3 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-medium text-slate-700 dark:text-zinc-200 outline-none focus:border-indigo-500 w-44"
            />
            <button
              onClick={() => setClientModal({ open: true, user: null })}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest hover:bg-indigo-700 flex items-center gap-1.5 whitespace-nowrap"
            >
              <Users size={12} />
              Novo Cliente
            </button>
          </div>
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[1180px] text-xs">
            <thead className="bg-slate-50 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-3 py-2 text-left">Cliente</th>
                <th className="px-3 py-2 text-left">Empresa</th>
                <th className="px-3 py-2 text-left">CNPJ / CPF</th>
                <th className="px-3 py-2 text-left">Telefone</th>
                <th className="px-3 py-2 text-left">E-mail</th>
                <th className="px-3 py-2 text-center">Tipo de Plano</th>
                <th className="px-3 py-2 text-center">Vencimento</th>
                <th className="px-3 py-2 text-center">Status</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
              {filteredOwnerUsers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-xs font-bold text-slate-400 dark:text-zinc-500">
                    {clientSearch ? 'Nenhum cliente encontrado para a busca.' : 'Nenhum cliente cadastrado. Clique em "Novo Cliente" para começar.'}
                  </td>
                </tr>
              ) : (
                filteredOwnerUsers.map(user => {
                  const userKeys = userIdentitySet(user);
                  const userEnts = enterprises.filter((enterprise) => {
                    const byId = user.enterpriseIds?.includes(enterprise.id);
                    if (byId) return true;
                    const ownerKeys = enterpriseOwnerIdentitySet(enterprise);
                    return ownerKeys.size > 0 && setsOverlapByIdentity(ownerKeys, userKeys);
                  });
                  const firstEnt = userEnts[0];
                  const sortedEnts = [...userEnts].sort((a, b) => {
                    const aDate = a.expirationDate ? new Date(a.expirationDate).getTime() : Number.POSITIVE_INFINITY;
                    const bDate = b.expirationDate ? new Date(b.expirationDate).getTime() : Number.POSITIVE_INFINITY;
                    if (aDate !== bDate) return aDate - bDate;
                    return String(a.name || '').localeCompare(String(b.name || ''));
                  });
                  const primaryEnt = sortedEnts[0] || firstEnt;
                  const currentPlanEnt = pickCurrentPlanEnterprise(userEnts);
                  const trialing = user.trialExpiresAt ? diffDays(user.trialExpiresAt) : null;
                  const planLabel = trialing !== null && trialing > 0 ? 'Teste' : fmtPlanWithValue(currentPlanEnt);
                  const userExpirationLabel = fmtDate(user.expirationDate);
                  const enterpriseExpirationDates = userEnts
                    .map((enterprise) => String(enterprise.expirationDate || '').trim())
                    .filter(Boolean)
                    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
                  const enterpriseExpirationLabel = enterpriseExpirationDates.length > 0 ? fmtDate(enterpriseExpirationDates[0]) : '—';
                  const expirationLabel = userExpirationLabel !== '—' ? userExpirationLabel : enterpriseExpirationLabel;
                  const hasMultipleUnits = userEnts.length > 1;
                  const effectiveExpirationDate = getUserEffectiveExpirationDate(user, userEnts);
                  const isExpiredAccess = isDateOnOrBeforeToday(effectiveExpirationDate);
                  const effectiveIsActive = Boolean(user.isActive) && !isExpiredAccess;
                  const canActivate = !effectiveIsActive && !!effectiveExpirationDate && !isExpiredAccess;
                  return (
                    <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors">
                      <td className="px-3 py-2.5">
                        <p className="font-black text-slate-800 dark:text-zinc-100 leading-tight">{user.name}</p>
                        {trialing !== null && trialing > 0 && (
                          <span className="inline-flex items-center gap-0.5 mt-0.5 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                            <Clock size={8} /> Teste · {trialing}d
                          </span>
                        )}
                        {trialing !== null && trialing <= 0 && (
                          <span className="inline-flex items-center gap-0.5 mt-0.5 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                            <AlertTriangle size={8} /> Trial expirado
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 max-w-[160px]">
                        {userEnts.length === 0 ? (
                          <span className="text-slate-400 dark:text-zinc-500">—</span>
                        ) : (
                          <div className="space-y-0.5">
                            {userEnts.map(e => (
                              <p key={e.id} className="font-bold text-slate-700 dark:text-zinc-200 truncate">{e.name}</p>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono font-semibold text-slate-600 dark:text-zinc-300 whitespace-nowrap">
                        {fmtDoc(user.document || firstEnt?.document)}
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-slate-600 dark:text-zinc-300 whitespace-nowrap">
                        {fmtPhone(user.phone || firstEnt?.phone1)}
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-slate-600 dark:text-zinc-300 max-w-[180px] truncate">
                        {user.email}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 text-[10px] font-black rounded-full border border-indigo-200 text-indigo-700 bg-indigo-50 whitespace-nowrap">
                          {planLabel || '—'}
                        </span>
                        {hasMultipleUnits && <p className="text-[9px] font-semibold text-slate-400 mt-0.5">Dinâmico por unidade base</p>}
                      </td>
                      <td className="px-3 py-2.5 text-center font-semibold text-slate-600 dark:text-zinc-300 whitespace-nowrap">
                        {expirationLabel || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {effectiveIsActive ? (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 size={8} /> Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                            <PowerOff size={8} /> Desativado
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-0.5">
                          <button
                            title="Editar"
                            onClick={() => setClientModal({ open: true, user })}
                            className="p-1.5 rounded-lg text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                          >
                            <Edit size={13} />
                          </button>
                          <button
                            title={effectiveIsActive ? 'Desativar' : (canActivate ? 'Ativar' : 'Renove para reativar')}
                            onClick={() => handleToggleActive(user)}
                            disabled={!effectiveIsActive && !canActivate}
                            className={`p-1.5 rounded-lg transition-colors ${
                              effectiveIsActive
                                ? 'text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30'
                                : canActivate
                                  ? 'text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/30'
                                  : 'text-slate-300 cursor-not-allowed'
                            }`}
                          >
                            {effectiveIsActive ? <PowerOff size={13} /> : <Power size={13} />}
                          </button>
                          <button
                            title="Renovar (+30 dias)"
                            onClick={() => handleRenew(user)}
                            className="p-1.5 rounded-lg text-purple-500 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-colors"
                          >
                            <RotateCcw size={13} />
                          </button>
                          <button
                            title="Gerar link temporario de redefinicao de senha"
                            onClick={() => handleGenerateResetLink(user)}
                            className="p-1.5 rounded-lg text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                          >
                            <LinkIcon size={13} />
                          </button>
                          <button
                            title="Excluir"
                            onClick={() => setDeleteTarget(user)}
                            className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>



      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-base font-black text-slate-800 dark:text-zinc-100 uppercase tracking-wide">Confirmar Exclusão</h3>
            <p className="text-sm text-slate-600 dark:text-zinc-300">
              Tem certeza que deseja excluir o cliente <strong>{deleteTarget.name}</strong>? Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 text-sm font-bold text-slate-700 dark:text-zinc-200 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => { handleDeleteClient(deleteTarget); setDeleteTarget(null); }}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {isResetLinkModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-xl p-6 space-y-4 border border-slate-200 dark:border-zinc-700">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-slate-800 dark:text-zinc-100 uppercase tracking-wide">Link de Redefinicao de Senha</h3>
                <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 mt-1">
                  Cliente: {resetLinkTarget?.name || 'Cliente'} ({resetLinkTarget?.email || 'sem e-mail'})
                </p>
              </div>
              <button
                onClick={handleCloseResetLinkModal}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500"
              >
                <X size={16} />
              </button>
            </div>

            {isGeneratingResetLink ? (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 dark:bg-indigo-900/20 dark:border-indigo-800 p-4 text-sm font-bold text-indigo-700 dark:text-indigo-300">
                Gerando link temporario...
              </div>
            ) : (
              <>
                {resetLinkData?.resetLink ? (
                  <>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest">Link temporario</label>
                      <textarea
                        readOnly
                        value={resetLinkData.resetLink}
                        className="w-full min-h-[96px] rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 p-3 text-xs font-mono text-slate-700 dark:text-zinc-200 outline-none"
                      />
                    </div>
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                      Expira em: {resetLinkData.expiresAt ? new Date(resetLinkData.expiresAt).toLocaleString('pt-BR') : '1 hora'}
                    </p>
                  </>
                ) : (
                  <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-3 text-xs font-bold text-red-700 dark:text-red-300">
                    Nao foi possivel gerar o link neste momento.
                  </div>
                )}
              </>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={handleCloseResetLinkModal}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 text-sm font-bold text-slate-700 dark:text-zinc-200 hover:bg-slate-50"
              >
                Fechar
              </button>
              <button
                onClick={handleCopyResetLink}
                disabled={!resetLinkData?.resetLink || isGeneratingResetLink}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Copy size={14} /> Copiar link
              </button>
            </div>
          </div>
        </div>
      )}

      {clientModal.open && (() => {
        const editingUser = clientModal.user;
        const editingUserKeys = userIdentitySet(editingUser);
        const otherOwnerKeys = new Set<string>();
        ownerUsers
          .filter((user) => !editingUser || user.id !== editingUser.id)
          .forEach((user) => {
            userIdentitySet(user).forEach((key) => otherOwnerKeys.add(key));
          });

        const occupiedIds = new Set(
          ownerUsers
            .filter(u => !editingUser || u.id !== editingUser.id)
            .flatMap(u => u.enterpriseIds || [])
        );
        enterprises.forEach((enterprise) => {
          const ownerKeys = enterpriseOwnerIdentitySet(enterprise);
          const hasOtherOwner = ownerKeys.size > 0 && setsOverlapByIdentity(ownerKeys, otherOwnerKeys);
          if (hasOtherOwner) occupiedIds.add(enterprise.id);
        });

        const availableEnterprises = enterprises.filter((enterprise) => {
          if (editingUser?.enterpriseIds?.includes(enterprise.id)) return true;
          const ownerKeys = enterpriseOwnerIdentitySet(enterprise);
          const ownedByEditingUser = ownerKeys.size > 0 && setsOverlapByIdentity(ownerKeys, editingUserKeys);
          if (ownedByEditingUser) return true;
          if (enterpriseHasOwnerRef(enterprise)) return false;
          return !occupiedIds.has(enterprise.id);
        });
        return (
        <OwnerClientModal
          mode={editingUser ? 'edit' : 'create'}
          user={editingUser}
          enterprises={availableEnterprises}
          defaultTrialDays={Number(localStorage.getItem(TRIAL_DAYS_KEY) || DEFAULT_TRIAL_DAYS)}
          onSave={(data) => handleSaveClient(data, editingUser)}
          onClose={() => setClientModal({ open: false, user: null })}
        />
        );
      })()}
    </div>
  );
};

const METRIC_CARD_STYLES: Record<string, { wrapper: string; label: string; value: string }> = {
  slate: {
    wrapper: 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700',
    label: 'text-slate-400 dark:text-zinc-400',
    value: 'text-slate-900 dark:text-zinc-100',
  },
  emerald: {
    wrapper: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700',
    label: 'text-emerald-600 dark:text-emerald-400',
    value: 'text-emerald-800 dark:text-emerald-200',
  },
  amber: {
    wrapper: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700',
    label: 'text-amber-600 dark:text-amber-400',
    value: 'text-amber-800 dark:text-amber-200',
  },
  orange: {
    wrapper: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-700',
    label: 'text-orange-600 dark:text-orange-400',
    value: 'text-orange-800 dark:text-orange-200',
  },
  red: {
    wrapper: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700',
    label: 'text-red-600 dark:text-red-400',
    value: 'text-red-800 dark:text-red-200',
  },
};

const MetricCard = ({ title, value, tone = 'slate' }: { title: string; value: string; tone?: 'slate' | 'emerald' | 'amber' | 'orange' | 'red' }) => {
  const styles = METRIC_CARD_STYLES[tone] || METRIC_CARD_STYLES.slate;
  return (
    <div className={`border rounded-xl p-3 ${styles.wrapper}`}>
      <p className={`text-[10px] font-black uppercase tracking-[0.14em] ${styles.label}`}>{title}</p>
      <p className={`text-lg font-black leading-tight ${styles.value}`}>{value}</p>
    </div>
  );
};

const OwnerClientModal = ({
  mode,
  user,
  enterprises,
  defaultTrialDays,
  onSave,
  onClose,
}: {
  mode: 'create' | 'edit';
  user: User | null;
  enterprises: Enterprise[];
  defaultTrialDays: number;
  onSave: (data: ClientFormData) => Promise<void>;
  onClose: () => void;
}) => {
  const [saving, setSaving] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [isLoadingDocument, setIsLoadingDocument] = useState(false);
  const [isLoadingCep, setIsLoadingCep] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const planCatalog = getPlanCatalog();
  const linkedEnterprises = enterprises.filter((enterprise) => user?.enterpriseIds?.includes(enterprise.id));
  const userPlanType = normalizeSaasPlan(linkedEnterprises[0]?.planType);
  const userExpirationDate = String(linkedEnterprises[0]?.expirationDate || '').trim().slice(0, 10);
  const baseExpirationDate = String(user?.expirationDate || userExpirationDate || todayIsoDate()).slice(0, 10);
  const [formData, setFormData] = useState<ClientFormData>({
    document: user?.document || '',
    name: user?.name || '',
    email: user?.email || '',
    password: '',
    phone: user?.phone || '',
    expirationDate: baseExpirationDate,
    cep: user?.cep || '',
    street: user?.street || '',
    number: user?.number || '',
    neighborhood: user?.neighborhood || '',
    complement: user?.complement || '',
    city: user?.city || '',
    state: user?.state || '',
    planType: userPlanType,
    enterpriseIds: user?.enterpriseIds || [],
    isTrial: !!user?.trialExpiresAt,
    trialDays: defaultTrialDays,
    renewalMonths: 0,
  });

  const selectedPlanPrice = Number(planCatalog[formData.planType]?.monthlyPrice || 0);
  const renewalValue = Number(formData.renewalMonths || 0) > 0
    ? selectedPlanPrice * Number(formData.renewalMonths || 0)
    : 0;
  const renewalPreviewDate = Number(formData.renewalMonths || 0) > 0
    ? addMonthsKeepingAnchorDay(baseExpirationDate || todayIsoDate(), Number(formData.renewalMonths || 0))
    : '';

  const onlyDigits = (value: string) => String(value || '').replace(/\D/g, '');

  const formatCpfCnpj = (value: string) => {
    const digits = onlyDigits(value).slice(0, 14);
    if (digits.length <= 11) {
      return digits
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    }
    return digits
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
  };

  const formatCep = (value: string) => {
    const digits = onlyDigits(value).slice(0, 8);
    if (digits.length <= 5) return digits;
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  };

  const getTrialExpirationIso = (days: number) =>
    addDays(new Date(), Math.max(1, Number(days) || 1)).toISOString().slice(0, 10);

  const isStrongPassword = (value: string) => {
    const password = String(value || '');
    return password.length >= 8
      && /[A-Z]/.test(password)
      && /[a-z]/.test(password)
      && /[0-9]/.test(password);
  };

  const handleDocumentBlur = async () => {
    const documentDigits = onlyDigits(formData.document);
    if (documentDigits.length !== 11 && documentDigits.length !== 14) return;
    setIsLoadingDocument(true);
    try {
      const isCnpj = documentDigits.length === 14;
      const response = isCnpj
        ? await ApiService.lookupEnterpriseByCnpj(documentDigits)
        : await ApiService.lookupPersonByCpf(documentDigits);
      setFormData((prev) => ({
        ...prev,
        document: formatCpfCnpj(documentDigits),
        name: prev.name || String(response?.legalName || response?.name || ''),
        email: prev.email || String(response?.email || ''),
        phone: prev.phone || String(response?.phone || response?.phone1 || response?.phone2 || ''),
        cep: isCnpj ? (prev.cep || formatCep(String(response?.cep || ''))) : prev.cep,
        street: isCnpj ? (prev.street || String(response?.street || '')) : prev.street,
        number: isCnpj ? (prev.number || String(response?.number || '')) : prev.number,
        neighborhood: isCnpj ? (prev.neighborhood || String(response?.neighborhood || '')) : prev.neighborhood,
        complement: isCnpj ? (prev.complement || String(response?.complement || '')) : prev.complement,
        city: isCnpj ? (prev.city || String(response?.city || '')) : prev.city,
        state: isCnpj ? (prev.state || String(response?.state || '')) : prev.state,
      }));
    } catch (err) {
      console.error('Erro ao buscar documento do cliente SaaS:', err);
    } finally {
      setIsLoadingDocument(false);
    }
  };

  const handleCepBlur = async () => {
    const cepDigits = onlyDigits(formData.cep);
    if (cepDigits.length !== 8) return;
    setIsLoadingCep(true);
    try {
      const response = await ApiService.lookupAddressByCep(cepDigits);
      setFormData((prev) => ({
        ...prev,
        cep: formatCep(String(response?.cep || cepDigits)),
        street: prev.street || String(response?.street || ''),
        neighborhood: prev.neighborhood || String(response?.neighborhood || ''),
        complement: prev.complement || String(response?.complement || ''),
        city: prev.city || String(response?.city || ''),
        state: prev.state || String(response?.state || ''),
      }));
    } catch (err) {
      console.error('Erro ao buscar CEP do cliente SaaS:', err);
    } finally {
      setIsLoadingCep(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    if (!formData.document.trim()) { setSubmitError('CPF/CNPJ é obrigatório.'); return; }
    if (!formData.name.trim()) { setSubmitError('Nome é obrigatório.'); return; }
    if (!formData.email.trim()) { setSubmitError('E-mail é obrigatório.'); return; }
    if (!formData.phone.trim()) { setSubmitError('Telefone é obrigatório.'); return; }
    if (!formData.expirationDate.trim()) { setSubmitError('Vencimento da expiração do acesso é obrigatório.'); return; }
    if (!formData.cep.trim()) { setSubmitError('CEP é obrigatório.'); return; }
    if (!formData.street.trim()) { setSubmitError('Endereço é obrigatório.'); return; }
    if (!formData.number.trim()) { setSubmitError('Número é obrigatório.'); return; }
    if (!formData.neighborhood.trim()) { setSubmitError('Bairro é obrigatório.'); return; }
    if (!formData.city.trim()) { setSubmitError('Cidade é obrigatória.'); return; }
    if (!formData.state.trim()) { setSubmitError('UF é obrigatória.'); return; }
    if (mode === 'create' && !formData.password) { setSubmitError('Senha é obrigatória para novo cliente.'); return; }
    if (formData.password && !isStrongPassword(formData.password)) {
      setSubmitError('Senha deve ter pelo menos 8 caracteres, 1 maiúscula, 1 minúscula e 1 número.');
      return;
    }
    setSaving(true);
    try {
      await onSave(formData);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Erro ao salvar cliente.');
    } finally {
      setSaving(false);
    }
  };

  const toggleEnt = (eid: string) =>
    setFormData(prev => ({
      ...prev,
      enterpriseIds: prev.enterpriseIds.includes(eid)
        ? prev.enterpriseIds.filter(id => id !== eid)
        : [...prev.enterpriseIds, eid],
    }));

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-2xl my-8 max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-zinc-700">
          <h3 className="text-sm font-black text-slate-800 dark:text-zinc-100 uppercase tracking-wide">
            {mode === 'create' ? 'Novo Cliente / Teste' : 'Editar Cliente'}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {submitError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
              {submitError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <label className="text-[10px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest">CNPJ / CPF *</label>
              <input
                type="text"
                value={formData.document}
                onChange={e => setFormData(p => ({ ...p, document: formatCpfCnpj(e.target.value) }))}
                onBlur={handleDocumentBlur}
                placeholder="00.000.000/0001-00 ou 000.000.000-00"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-medium text-slate-700 dark:text-zinc-200 outline-none focus:border-indigo-500"
              />
              {isLoadingDocument && <p className="text-[10px] font-semibold text-slate-400">Consultando dados do documento...</p>}
            </div>
            <div className="sm:col-span-2 space-y-1">
              <label className="text-[10px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest">Nome Completo / Razão Social *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                placeholder="Nome do responsável ou razão social"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-medium text-slate-700 dark:text-zinc-200 outline-none focus:border-indigo-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest flex items-center gap-1">
                <Mail size={10} /> E-mail *
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                placeholder="email@dominio.com"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-medium text-slate-700 dark:text-zinc-200 outline-none focus:border-indigo-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest flex items-center gap-1">
                <Phone size={10} /> Telefone
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))}
                placeholder="+55 (11) 99999-9999"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-medium text-slate-700 dark:text-zinc-200 outline-none focus:border-indigo-500"
              />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <label className="text-[10px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest flex items-center gap-1">
                <Calendar size={10} /> Vencimento da Expiração do Acesso *
              </label>
              {mode === 'edit' ? (
                <div className="space-y-2">
                  <input
                    type="date"
                    required
                    value={formData.expirationDate}
                    readOnly
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/80 text-sm font-bold text-slate-700 dark:text-zinc-200 outline-none"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData((p) => ({ ...p, renewalMonths: 1 }))}
                      className={`px-2.5 h-8 rounded-lg text-[11px] font-black uppercase tracking-wider border ${formData.renewalMonths === 1 ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                      Renovar 1 mês
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData((p) => ({ ...p, renewalMonths: 3 }))}
                      className={`px-2.5 h-8 rounded-lg text-[11px] font-black uppercase tracking-wider border ${formData.renewalMonths === 3 ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                      Renovar 3 meses
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData((p) => ({ ...p, renewalMonths: 6 }))}
                      className={`px-2.5 h-8 rounded-lg text-[11px] font-black uppercase tracking-wider border ${formData.renewalMonths === 6 ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                      Renovar 6 meses
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData((p) => ({ ...p, renewalMonths: 12 }))}
                      className={`px-2.5 h-8 rounded-lg text-[11px] font-black uppercase tracking-wider border ${formData.renewalMonths === 12 ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                      Renovar 1 ano
                    </button>
                    {formData.renewalMonths > 0 && (
                      <button
                        type="button"
                        onClick={() => setFormData((p) => ({ ...p, renewalMonths: 0 }))}
                        className="px-2.5 h-8 rounded-lg text-[11px] font-black uppercase tracking-wider border border-slate-200 text-slate-500 hover:bg-slate-50"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  {formData.renewalMonths > 0 && (
                    <p className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
                      Valor da renovação: R$ {renewalValue.toFixed(2)} • Novo vencimento: {new Date(renewalPreviewDate).toLocaleDateString('pt-BR')}
                    </p>
                  )}
                </div>
              ) : (
                <input
                  type="date"
                  required
                  value={formData.expirationDate}
                  onChange={e => setFormData(p => ({ ...p, expirationDate: e.target.value }))}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-medium text-slate-700 dark:text-zinc-200 outline-none focus:border-indigo-500"
                />
              )}
            </div>
            <div className="sm:col-span-2 space-y-1">
              <label className="text-[10px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest">
                {mode === 'create' ? 'Senha *' : 'Nova Senha (deixe em branco para não alterar)'}
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  required={mode === 'create'}
                  value={formData.password}
                  onChange={e => setFormData(p => ({ ...p, password: e.target.value }))}
                  placeholder={mode === 'create' ? 'Senha de acesso' : 'Deixe em branco para manter'}
                  className="w-full h-9 px-3 pr-10 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-medium text-slate-700 dark:text-zinc-200 outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(p => !p)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPass ? <CheckCircle2 size={14} /> : <Settings2 size={14} />}
                </button>
              </div>
            </div>
            {mode === 'edit' && (
              <div className="sm:col-span-2 space-y-1 rounded-lg border border-indigo-200 bg-indigo-50/70 dark:bg-indigo-900/20 dark:border-indigo-800 p-3">
                <label className="text-[10px] font-black text-indigo-600 dark:text-indigo-300 uppercase tracking-widest">Tipo de Plano SaaS</label>
                <select
                  value={formData.planType}
                  onChange={(e) => setFormData((prev) => ({ ...prev, planType: e.target.value as SaaSPlanKey }))}
                  className="w-full h-9 px-3 rounded-lg border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-zinc-800 text-sm font-bold text-slate-700 dark:text-zinc-200 outline-none focus:border-indigo-500"
                >
                  <option value="BASIC">Básico - R$ {planCatalog.BASIC.monthlyPrice.toFixed(2)}</option>
                  <option value="PREMIUM">Premium - R$ {planCatalog.PREMIUM.monthlyPrice.toFixed(2)}</option>
                </select>
                <p className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
                  Vencimento atual será mantido. Valor do plano selecionado: R$ {selectedPlanPrice.toFixed(2)}.
                </p>
                <p className="text-[10px] text-indigo-600/80 dark:text-indigo-300/80">
                  Se houver upgrade, a diferenca positiva sera lancada no proximo vencimento.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-3 border border-slate-200 dark:border-zinc-700 rounded-lg p-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="lg:col-span-1 space-y-1">
                <label className="text-[10px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest">CEP *</label>
                <input
                  type="text"
                  value={formData.cep}
                  onChange={e => setFormData(p => ({ ...p, cep: formatCep(e.target.value) }))}
                  onBlur={handleCepBlur}
                  placeholder="00000-000"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-medium text-slate-700 dark:text-zinc-200 outline-none focus:border-indigo-500"
                />
                {isLoadingCep && <p className="text-[10px] font-semibold text-slate-400">Consultando CEP...</p>}
              </div>
              <div className="lg:col-span-2 space-y-1">
                <label className="text-[10px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest">Endereço *</label>
                <input
                  type="text"
                  value={formData.street}
                  onChange={e => setFormData(p => ({ ...p, street: e.target.value }))}
                  placeholder="Rua, avenida, praça"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-medium text-slate-700 dark:text-zinc-200 outline-none focus:border-indigo-500"
                />
              </div>
              <div className="lg:col-span-1 space-y-1">
                <label className="text-[10px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest">Nº *</label>
                <input
                  type="text"
                  value={formData.number}
                  onChange={e => setFormData(p => ({ ...p, number: e.target.value }))}
                  placeholder="123"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-medium text-slate-700 dark:text-zinc-200 outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="lg:col-span-1 space-y-1">
                <label className="text-[10px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest">Bairro *</label>
                <input
                  type="text"
                  value={formData.neighborhood}
                  onChange={e => setFormData(p => ({ ...p, neighborhood: e.target.value }))}
                  placeholder="Centro"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-medium text-slate-700 dark:text-zinc-200 outline-none focus:border-indigo-500"
                />
              </div>
              <div className="lg:col-span-1 space-y-1">
                <label className="text-[10px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest">Complemento</label>
                <input
                  type="text"
                  value={formData.complement}
                  onChange={e => setFormData(p => ({ ...p, complement: e.target.value }))}
                  placeholder="Sala, bloco, ap"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-medium text-slate-700 dark:text-zinc-200 outline-none focus:border-indigo-500"
                />
              </div>
              <div className="lg:col-span-1 space-y-1">
                <label className="text-[10px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest">Cidade *</label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={e => setFormData(p => ({ ...p, city: e.target.value }))}
                  placeholder="São Paulo"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-medium text-slate-700 dark:text-zinc-200 outline-none focus:border-indigo-500"
                />
              </div>
              <div className="lg:col-span-1 space-y-1">
                <label className="text-[10px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest">UF *</label>
                <input
                  type="text"
                  value={formData.state}
                  onChange={e => setFormData(p => ({ ...p, state: e.target.value.toUpperCase().slice(0, 2) }))}
                  placeholder="SP"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-medium text-slate-700 dark:text-zinc-200 outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest flex items-center gap-1">
              <Building2 size={10} /> Empresas Vinculadas
            </label>
            <div className="max-h-32 overflow-y-auto border border-slate-200 dark:border-zinc-700 rounded-lg p-2 space-y-1">
              {enterprises.length === 0 ? (
                <p className="text-[11px] text-slate-400 dark:text-zinc-500 text-center py-2">Nenhuma empresa cadastrada.</p>
              ) : enterprises.map(ent => (
                <label key={ent.id} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-slate-50 dark:hover:bg-zinc-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.enterpriseIds.includes(ent.id)}
                    onChange={() => toggleEnt(ent.id)}
                    className="rounded border-slate-300"
                  />
                  <span className="text-xs font-medium text-slate-700 dark:text-zinc-200">{ent.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2 border border-slate-200 dark:border-zinc-700 rounded-lg p-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isTrial}
                onChange={e => setFormData((p) => {
                  const checked = e.target.checked;
                  if (mode !== 'create' || !checked) return { ...p, isTrial: checked };
                  return { ...p, isTrial: checked, expirationDate: getTrialExpirationIso(p.trialDays) };
                })}
                className="rounded border-slate-300"
              />
              <span className="text-xs font-black text-slate-700 dark:text-zinc-200 uppercase tracking-wide flex items-center gap-1">
                <Clock size={11} /> Habilitar período de teste (trial)
              </span>
            </label>
            {formData.isTrial && (
              <div className="flex items-center gap-3 pt-1 pl-1">
                <label className="text-[10px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest flex items-center gap-1">
                  <Calendar size={10} /> Dias de Trial
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={formData.trialDays}
                  onChange={e => setFormData((p) => {
                    const nextTrialDays = Number(e.target.value) || 7;
                    if (mode !== 'create' || !p.isTrial) return { ...p, trialDays: nextTrialDays };
                    return {
                      ...p,
                      trialDays: nextTrialDays,
                      expirationDate: getTrialExpirationIso(nextTrialDays),
                    };
                  })}
                  className="w-20 h-8 px-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-bold text-slate-700 dark:text-zinc-200 outline-none focus:border-indigo-500"
                />
                <span className="text-[11px] text-slate-500 dark:text-zinc-400">dias a partir de hoje</span>
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end pt-1 border-t border-slate-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 text-sm font-bold text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-1.5"
            >
              <Save size={13} />
              {saving ? 'Salvando...' : mode === 'create' ? 'Criar Cliente' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SaasPlansPage;
