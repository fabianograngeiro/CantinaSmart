import React, { useEffect, useState } from 'react';
import {
  BadgeDollarSign, History, Save, ArrowUpDown, Building2,
} from 'lucide-react';
import { Role, User } from '../types';
import { appendSaasAuditLog } from '../services/saasAuditLog';

interface SaasPlanosPageProps {
  currentUser: User;
}

type SaaSPlanKey = 'BASIC' | 'PREMIUM';

type SaaSPlanConfig = {
  key: SaaSPlanKey;
  name: string;
  monthlyPrice: number;
  maxUnits: number;
  maxStaffUsers: number;
  hasWhatsappBroadcast: boolean;
  hasBillingAutomation: boolean;
  hasAdvancedBI: boolean;
  hasPrioritySupport: boolean;
};

type PlanChangeHistory = {
  id: string;
  changedAt: string;
  enterpriseId: string;
  enterpriseName: string;
  fromPlan: SaaSPlanKey;
  toPlan: SaaSPlanKey;
  fromFee: number;
  toFee: number;
  changedBy: string;
};

const SAAS_PLAN_CATALOG_KEY = 'saas_plan_catalog_v1';
const SAAS_PLAN_HISTORY_KEY = 'saas_plan_history_v1';

const DEFAULT_CATALOG: Record<SaaSPlanKey, SaaSPlanConfig> = {
  BASIC: {
    key: 'BASIC',
    name: 'Básico',
    monthlyPrice: 197,
    maxUnits: 1,
    maxStaffUsers: 5,
    hasWhatsappBroadcast: false,
    hasBillingAutomation: false,
    hasAdvancedBI: false,
    hasPrioritySupport: false,
  },
  PREMIUM: {
    key: 'PREMIUM',
    name: 'Premium',
    monthlyPrice: 397,
    maxUnits: 10,
    maxStaffUsers: 50,
    hasWhatsappBroadcast: true,
    hasBillingAutomation: true,
    hasAdvancedBI: true,
    hasPrioritySupport: true,
  },
};

const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

const SaasPlanosPage: React.FC<SaasPlanosPageProps> = ({ currentUser }) => {
  const isSuperAdmin = String(currentUser.role || '').toUpperCase() === Role.SUPERADMIN;
  const [catalog, setCatalog] = useState<Record<SaaSPlanKey, SaaSPlanConfig>>(DEFAULT_CATALOG);
  const [history, setHistory] = useState<PlanChangeHistory[]>([]);

  useEffect(() => {
    try {
      const rawCatalog = localStorage.getItem(SAAS_PLAN_CATALOG_KEY);
      if (rawCatalog) {
        const parsed = JSON.parse(rawCatalog);
        setCatalog({
          BASIC: { ...DEFAULT_CATALOG.BASIC, ...(parsed?.BASIC || {}) },
          PREMIUM: { ...DEFAULT_CATALOG.PREMIUM, ...(parsed?.PREMIUM || {}) },
        });
      }
    } catch {
      setCatalog(DEFAULT_CATALOG);
    }
  }, []);

  useEffect(() => {
    try {
      const rawHistory = localStorage.getItem(SAAS_PLAN_HISTORY_KEY);
      if (rawHistory) {
        const parsed = JSON.parse(rawHistory);
        if (Array.isArray(parsed)) setHistory(parsed);
      }
    } catch {
      setHistory([]);
    }
  }, []);

  const handleCatalogField = (plan: SaaSPlanKey, field: keyof SaaSPlanConfig, value: string | number | boolean) => {
    setCatalog((prev) => ({ ...prev, [plan]: { ...prev[plan], [field]: value } }));
  };

  const handleSaveCatalog = () => {
    localStorage.setItem(SAAS_PLAN_CATALOG_KEY, JSON.stringify(catalog));
    appendSaasAuditLog({
      actorName: currentUser.name,
      actorRole: String(currentUser.role || ''),
      module: 'PLANOS',
      action: 'SAAS_PLAN_CATALOG_UPDATED',
      entityType: 'SAAS_PLAN_CATALOG',
      summary: 'Catálogo de planos SaaS atualizado',
      metadata: {
        basicPrice: catalog.BASIC.monthlyPrice,
        premiumPrice: catalog.PREMIUM.monthlyPrice,
        basicUsers: catalog.BASIC.maxStaffUsers,
        premiumUsers: catalog.PREMIUM.maxStaffUsers,
      },
    });
    alert('Catálogo de planos salvo com sucesso.');
  };

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
            <BadgeDollarSign size={16} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tight">Planos & Assinaturas SaaS</h1>
            <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-[0.16em]">
              Catálogo de planos, upgrade/downgrade e gestão de MRR
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSaveCatalog}
            className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest hover:bg-indigo-700 flex items-center gap-1.5"
          >
            <Save size={13} />
            Salvar Catálogo
          </button>
        </div>
      </header>

      {/* Catalog editor */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {(['BASIC', 'PREMIUM'] as SaaSPlanKey[]).map((planKey) => {
          const plan = catalog[planKey];
          return (
            <div key={planKey} className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-700 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-800 dark:text-zinc-100 uppercase tracking-wider">{plan.name}</h3>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full border border-indigo-200 text-indigo-700 bg-indigo-50">
                  {plan.key}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FieldNumber label="Mensalidade (R$)" value={plan.monthlyPrice} onChange={(v) => handleCatalogField(planKey, 'monthlyPrice', v)} />
                <FieldNumber label="Máx. Unidades" value={plan.maxUnits} onChange={(v) => handleCatalogField(planKey, 'maxUnits', v)} />
                <FieldNumber label="Máx. Usuários Staff" value={plan.maxStaffUsers} onChange={(v) => handleCatalogField(planKey, 'maxStaffUsers', v)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FieldCheck label="Disparo WhatsApp" checked={plan.hasWhatsappBroadcast} onToggle={(v) => handleCatalogField(planKey, 'hasWhatsappBroadcast', v)} />
                <FieldCheck label="Automação Cobrança" checked={plan.hasBillingAutomation} onToggle={(v) => handleCatalogField(planKey, 'hasBillingAutomation', v)} />
                <FieldCheck label="BI Avançado" checked={plan.hasAdvancedBI} onToggle={(v) => handleCatalogField(planKey, 'hasAdvancedBI', v)} />
                <FieldCheck label="Suporte Prioritário" checked={plan.hasPrioritySupport} onToggle={(v) => handleCatalogField(planKey, 'hasPrioritySupport', v)} />
              </div>
            </div>
          );
        })}
      </section>

      {/* History */}
      <section className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-700 flex items-center gap-2">
          <History size={14} className="text-indigo-600" />
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-zinc-100">Histórico de Alterações</h3>
        </div>
        <div className="max-h-72 overflow-auto">
          {history.length === 0 ? (
            <p className="px-4 py-6 text-xs font-bold text-slate-500 dark:text-zinc-400">Nenhuma alteração registrada ainda.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-zinc-800">
              {history.map((entry) => (
                <li key={entry.id} className="px-4 py-2.5 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold text-slate-700 dark:text-zinc-200">
                      <Building2 size={12} className="inline mr-1 text-indigo-600" />
                      {entry.enterpriseName}
                    </p>
                    <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-400">
                      {new Date(entry.changedAt).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <p className="text-[11px] font-bold text-slate-600 dark:text-zinc-300">
                    {entry.fromPlan} ({formatCurrency(entry.fromFee)}) <ArrowUpDown size={11} className="inline mx-1" />
                    {entry.toPlan} ({formatCurrency(entry.toFee)}) por {entry.changedBy}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
};

const FieldNumber = ({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) => (
  <label className="block space-y-1">
    <span className="text-[10px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-wider">{label}</span>
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      className="w-full h-8 px-2 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-200 outline-none focus:border-indigo-500"
    />
  </label>
);

const FieldCheck = ({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: (v: boolean) => void }) => (
  <label className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[11px] font-bold text-slate-700 dark:text-zinc-200">
    <input type="checkbox" checked={checked} onChange={(e) => onToggle(e.target.checked)} />
    {label}
  </label>
);

export default SaasPlanosPage;
