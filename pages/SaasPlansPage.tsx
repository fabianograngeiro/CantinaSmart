import React, { useEffect, useMemo, useState } from 'react';
import {
  Users, Edit, Trash2, Power, PowerOff, RotateCcw,
  X, Clock, CheckCircle2, AlertTriangle, Mail, Phone,
  Calendar, Settings2, Building2, Save, RefreshCw,
} from 'lucide-react';
import ApiService from '../services/api';
import { Enterprise, Role, User } from '../types';

interface SaasPlansPageProps {
  currentUser: User;
}

const TRIAL_DAYS_KEY = 'saas_trial_days_v1';
const DEFAULT_TRIAL_DAYS = 7;


const addDays = (date: Date, days: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const diffDays = (iso: string) =>
  Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);

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

type ClientFormData = {
  name: string;
  email: string;
  password: string;
  phone: string;
  enterpriseIds: string[];
  isTrial: boolean;
  trialDays: number;
};

const SaasPlansPage: React.FC<SaasPlansPageProps> = ({ currentUser }) => {
  const isSuperAdmin = String(currentUser.role || '').toUpperCase() === Role.SUPERADMIN;
  const [isLoading, setIsLoading] = useState(false);
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
  const [ownerUsers, setOwnerUsers] = useState<User[]>([]);
  const [clientModal, setClientModal] = useState<{ open: boolean; user: User | null }>({ open: false, user: null });
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [clientSearch, setClientSearch] = useState('');

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [enterpriseData, usersData] = await Promise.all([
        ApiService.getEnterprises(),
        ApiService.getUsers(),
      ]);
      const normalizedEnterprises = Array.isArray(enterpriseData) ? enterpriseData : [];
      const owners: User[] = Array.isArray(usersData)
        ? usersData.filter((u: User) => String(u.role).toUpperCase() === Role.OWNER)
        : [];
      setEnterprises(normalizedEnterprises);
      setOwnerUsers(owners);
    } catch (err) {
      console.error('Erro ao carregar dados de planos SaaS:', err);
      setEnterprises([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const stats = useMemo(() => ({
    totalClients: ownerUsers.length,
    trials: ownerUsers.filter(u => u.trialExpiresAt && diffDays(u.trialExpiresAt) > 0).length,
  }), [ownerUsers]);

  const handleSaveClient = async (data: ClientFormData, editingUser: User | null) => {
    try {
      const payload: Record<string, unknown> = {
        name: data.name.trim(),
        email: data.email.trim(),
        phone: data.phone.trim(),
        role: Role.OWNER,
        isActive: true,
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
      alert('Erro ao salvar cliente. Verifique os dados e tente novamente.');
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
      await ApiService.updateUser(user.id, { isActive: !user.isActive });
      await loadData();
    } catch (err) {
      console.error('Erro ao alterar status do cliente:', err);
      alert('Erro ao alterar status.');
    }
  };

  const handleRenew = async (user: User) => {
    try {
      const base = user.trialExpiresAt && diffDays(user.trialExpiresAt) > 0
        ? new Date(user.trialExpiresAt)
        : new Date();
      const newExpiry = addDays(base, 30).toISOString();
      await ApiService.updateUser(user.id, { isActive: true, trialExpiresAt: newExpiry });
      for (const eid of user.enterpriseIds || []) {
        await ApiService.updateEnterprise(eid, { serviceStatus: 'ATIVO' });
      }
      await loadData();
    } catch (err) {
      console.error('Erro ao renovar cliente:', err);
      alert('Erro ao renovar.');
    }
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

      <section className="grid grid-cols-2 gap-3">
        <MetricCard title="Total de Clientes" value={String(stats.totalClients)} />
        <MetricCard title="Clientes Testes" value={String(stats.trials)} highlight />
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
          <table className="w-full min-w-[860px] text-xs">
            <thead className="bg-slate-50 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-3 py-2 text-left">Cliente</th>
                <th className="px-3 py-2 text-left">Empresa</th>
                <th className="px-3 py-2 text-left">CNPJ / CPF</th>
                <th className="px-3 py-2 text-left">Telefone</th>
                <th className="px-3 py-2 text-left">E-mail</th>
                <th className="px-3 py-2 text-center">Status</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
              {filteredOwnerUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-xs font-bold text-slate-400 dark:text-zinc-500">
                    {clientSearch ? 'Nenhum cliente encontrado para a busca.' : 'Nenhum cliente cadastrado. Clique em "Novo Cliente" para começar.'}
                  </td>
                </tr>
              ) : (
                filteredOwnerUsers.map(user => {
                  const userEnts = enterprises.filter(e => user.enterpriseIds?.includes(e.id));
                  const firstEnt = userEnts[0];
                  const trialing = user.trialExpiresAt ? diffDays(user.trialExpiresAt) : null;
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
                        {fmtDoc(firstEnt?.document)}
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-slate-600 dark:text-zinc-300 whitespace-nowrap">
                        {fmtPhone(user.phone || firstEnt?.phone1)}
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-slate-600 dark:text-zinc-300 max-w-[180px] truncate">
                        {user.email}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {user.isActive ? (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 size={8} /> Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                            <PowerOff size={8} /> Inativo
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-0.5">
                          <button
                            title="Editar"
                            onClick={() => setClientModal({ open: true, user })}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                          >
                            <Edit size={13} />
                          </button>
                          <button
                            title={user.isActive ? 'Desativar' : 'Ativar'}
                            onClick={() => handleToggleActive(user)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              user.isActive
                                ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30'
                                : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30'
                            }`}
                          >
                            {user.isActive ? <PowerOff size={13} /> : <Power size={13} />}
                          </button>
                          <button
                            title="Renovar (+30 dias)"
                            onClick={() => handleRenew(user)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                          >
                            <RotateCcw size={13} />
                          </button>
                          <button
                            title="Excluir"
                            onClick={() => setDeleteTarget(user)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
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

      {clientModal.open && (
        <OwnerClientModal
          mode={clientModal.user ? 'edit' : 'create'}
          user={clientModal.user}
          enterprises={enterprises}
          defaultTrialDays={Number(localStorage.getItem(TRIAL_DAYS_KEY) || DEFAULT_TRIAL_DAYS)}
          onSave={(data) => handleSaveClient(data, clientModal.user)}
          onClose={() => setClientModal({ open: false, user: null })}
        />
      )}
    </div>
  );
};

const MetricCard = ({ title, value, highlight }: { title: string; value: string; highlight?: boolean }) => (
  <div className={`border rounded-xl p-3 ${highlight ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700' : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700'}`}>
    <p className={`text-[10px] font-black uppercase tracking-[0.14em] ${highlight ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-zinc-400'}`}>{title}</p>
    <p className={`text-lg font-black leading-tight ${highlight ? 'text-amber-800 dark:text-amber-200' : 'text-slate-900 dark:text-zinc-100'}`}>{value}</p>
  </div>
);

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
  const [formData, setFormData] = useState<ClientFormData>({
    name: user?.name || '',
    email: user?.email || '',
    password: '',
    phone: user?.phone || '',
    enterpriseIds: user?.enterpriseIds || [],
    isTrial: !!user?.trialExpiresAt,
    trialDays: defaultTrialDays,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) { alert('Nome é obrigatório.'); return; }
    if (!formData.email.trim()) { alert('E-mail é obrigatório.'); return; }
    if (mode === 'create' && !formData.password) { alert('Senha é obrigatória para novo cliente.'); return; }
    setSaving(true);
    await onSave(formData);
    setSaving(false);
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
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-lg my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-zinc-700">
          <h3 className="text-sm font-black text-slate-800 dark:text-zinc-100 uppercase tracking-wide">
            {mode === 'create' ? 'Novo Cliente / Teste' : 'Editar Cliente'}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <label className="text-[10px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest">Nome Completo *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                placeholder="Nome do responsável"
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
                onChange={e => setFormData(p => ({ ...p, isTrial: e.target.checked }))}
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
                  onChange={e => setFormData(p => ({ ...p, trialDays: Number(e.target.value) || 7 }))}
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
