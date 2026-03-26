import React, { useState, useEffect, useMemo } from 'react';
import {
  Users, Search, Power, PowerOff, Clock, CheckCircle2,
  AlertTriangle, Building2, Mail, Calendar, PlayCircle,
  XCircle, RefreshCw, Eye, EyeOff,
} from 'lucide-react';
import { User, Role, Enterprise } from '../types';
import ApiService from '../services/api';

interface SaasClientsPageProps {
  currentUser: User;
}

const TRIAL_DAYS = 7;

const addDays = (date: Date, days: number): Date => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const diffDays = (target: string): number => {
  const now = new Date();
  const exp = new Date(target);
  return Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
};

const fmtDate = (iso?: string) => {
  if (!iso) return '-';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));
};

type ClientRow = {
  user: User;
  enterprises: Enterprise[];
};

const SaasClientsPage: React.FC<SaasClientsPageProps> = ({ currentUser }) => {
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ id: string; msg: string; ok: boolean } | null>(null);

  const showFeedback = (id: string, msg: string, ok: boolean) => {
    setFeedback({ id, msg, ok });
    setTimeout(() => setFeedback(null), 3000);
  };

  // Load OWNER users + their enterprises, auto-deactivate expired trials
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [allUsers, allEnterprises] = await Promise.all([
        ApiService.getUsers(),
        ApiService.getEnterprises(),
      ]);

      const ownerUsers: User[] = allUsers.filter(
        (u: User) => String(u.role).toUpperCase() === Role.OWNER
      );

      const updates: Promise<void>[] = [];

      // Auto-deactivate users whose trial has expired
      for (const owner of ownerUsers) {
        if (owner.trialExpiresAt && owner.isActive) {
          const remaining = diffDays(owner.trialExpiresAt);
          if (remaining <= 0) {
            updates.push(
              ApiService.updateUser(owner.id, { isActive: false }).then(() => {
                owner.isActive = false;
              })
            );
            // Also mark enterprises INADIMPLENTE
            const ownerEnts: Enterprise[] = allEnterprises.filter((e: Enterprise) =>
              owner.enterpriseIds?.includes(e.id)
            );
            for (const ent of ownerEnts) {
              if (ent.serviceStatus === 'TRIAL') {
                updates.push(
                  ApiService.updateEnterprise(ent.id, { serviceStatus: 'INADIMPLENTE' }).then(() => {
                    ent.serviceStatus = 'INADIMPLENTE';
                  })
                );
              }
            }
          }
        }
      }

      if (updates.length > 0) await Promise.all(updates);

      const clientRows: ClientRow[] = ownerUsers.map((user) => ({
        user,
        enterprises: allEnterprises.filter((e: Enterprise) =>
          user.enterpriseIds?.includes(e.id)
        ),
      }));

      setRows(clientRows);
    } catch (err) {
      console.error('[SaasClientsPage] Error loading data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredRows = useMemo(() => {
    const q = searchTerm.toLowerCase();
    if (!q) return rows;
    return rows.filter(
      ({ user, enterprises }) =>
        user.name.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q) ||
        enterprises.some((e) => e.name.toLowerCase().includes(q))
    );
  }, [rows, searchTerm]);

  const toggleActive = async (user: User) => {
    setActionLoading(user.id + '_toggle');
    try {
      const updated = await ApiService.updateUser(user.id, { isActive: !user.isActive });
      setRows((prev) =>
        prev.map((r) =>
          r.user.id === user.id ? { ...r, user: { ...r.user, isActive: updated.isActive } } : r
        )
      );
      showFeedback(user.id, updated.isActive ? 'Conta ativada' : 'Conta desativada', true);
    } catch {
      showFeedback(user.id, 'Erro ao alterar status', false);
    } finally {
      setActionLoading(null);
    }
  };

  const startTrial = async (user: User, enterprises: Enterprise[]) => {
    setActionLoading(user.id + '_trial');
    try {
      const expiresAt = addDays(new Date(), TRIAL_DAYS).toISOString();
      // Update user with trial date and ensure active
      const updatedUser = await ApiService.updateUser(user.id, {
        trialExpiresAt: expiresAt,
        isActive: true,
      });
      // Set all owner's enterprises to TRIAL
      await Promise.all(
        enterprises.map((e) =>
          ApiService.updateEnterprise(e.id, {
            serviceStatus: 'TRIAL',
            expirationDate: expiresAt,
          })
        )
      );
      setRows((prev) =>
        prev.map((r) => {
          if (r.user.id !== user.id) return r;
          return {
            user: { ...r.user, trialExpiresAt: expiresAt, isActive: true },
            enterprises: r.enterprises.map((e) => ({
              ...e,
              serviceStatus: 'TRIAL' as const,
              expirationDate: expiresAt,
            })),
          };
        })
      );
      showFeedback(user.id, `Trial de ${TRIAL_DAYS} dias iniciado`, true);
    } catch {
      showFeedback(user.id, 'Erro ao iniciar trial', false);
    } finally {
      setActionLoading(null);
    }
  };

  const cancelTrial = async (user: User, enterprises: Enterprise[]) => {
    setActionLoading(user.id + '_trial');
    try {
      await ApiService.updateUser(user.id, { trialExpiresAt: null, isActive: false });
      await Promise.all(
        enterprises.map((e) =>
          ApiService.updateEnterprise(e.id, { serviceStatus: 'CANCELADO', expirationDate: null })
        )
      );
      setRows((prev) =>
        prev.map((r) => {
          if (r.user.id !== user.id) return r;
          return {
            user: { ...r.user, trialExpiresAt: undefined, isActive: false },
            enterprises: r.enterprises.map((e) => ({ ...e, serviceStatus: 'CANCELADO' as const })),
          };
        })
      );
      showFeedback(user.id, 'Trial cancelado', true);
    } catch {
      showFeedback(user.id, 'Erro ao cancelar trial', false);
    } finally {
      setActionLoading(null);
    }
  };

  const getTrialBadge = (user: User) => {
    if (!user.trialExpiresAt) return null;
    const remaining = diffDays(user.trialExpiresAt);
    if (remaining <= 0)
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400 uppercase tracking-wide">
          <XCircle size={11} /> Trial expirado
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 uppercase tracking-wide">
        <Clock size={11} /> Trial: {remaining}d restantes
      </span>
    );
  };

  const stats = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => r.user.isActive).length;
    const onTrial = rows.filter((r) => r.user.trialExpiresAt && diffDays(r.user.trialExpiresAt) > 0).length;
    return { total, active, onTrial };
  }, [rows]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-500/20 rounded-2xl flex items-center justify-center">
              <Users className="text-indigo-600" size={22} />
            </div>
            Clientes
          </h1>
          <p className="text-xs text-gray-500 dark:text-slate-400 font-medium mt-1">
            Gerenciamento de contas dos donos de rede
          </p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
        >
          <RefreshCw size={16} />
          Atualizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total de Clientes', value: stats.total, color: 'indigo', icon: <Users size={20} /> },
          { label: 'Contas Ativas', value: stats.active, color: 'emerald', icon: <CheckCircle2 size={20} /> },
          { label: 'Em Trial', value: stats.onTrial, color: 'amber', icon: <Clock size={20} /> },
        ].map(({ label, value, color, icon }) => (
          <div key={label} className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-white/5 p-5 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center bg-${color}-100 dark:bg-${color}-500/20 text-${color}-600`}>
              {icon}
            </div>
            <div>
              <p className="text-2xl font-black text-gray-900 dark:text-slate-100">{value}</p>
              <p className="text-[11px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar por nome, e-mail ou unidade..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/5 rounded-xl text-sm font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-20">
          <div className="animate-spin w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-400 text-sm font-medium">Carregando clientes...</p>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="text-center py-20">
          <Users size={48} className="text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-bold">Nenhum cliente encontrado</p>
          <p className="text-slate-400 text-sm mt-1">Crie novos clientes em Empresas SaaS</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-white/5 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/5">
                <th className="text-left px-5 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Cliente</th>
                <th className="text-left px-5 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Unidades</th>
                <th className="text-left px-5 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Criado em</th>
                <th className="text-left px-5 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Trial</th>
                <th className="text-left px-5 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</th>
                <th className="text-right px-5 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {filteredRows.map(({ user, enterprises }) => {
                const trialBadge = getTrialBadge(user);
                const trialActive = user.trialExpiresAt && diffDays(user.trialExpiresAt) > 0;
                const fb = feedback?.id === user.id ? feedback : null;

                return (
                  <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-white/2 transition-colors">
                    {/* Name / Email */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-indigo-600 font-black text-xs">
                            {user.name?.charAt(0).toUpperCase() || '?'}
                          </span>
                        </div>
                        <div>
                          <p className="font-black text-gray-900 dark:text-slate-100 text-[13px]">{user.name}</p>
                          <p className="text-[11px] text-slate-400 flex items-center gap-1">
                            <Mail size={11} /> {user.email}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Enterprises */}
                    <td className="px-5 py-4">
                      {enterprises.length === 0 ? (
                        <span className="text-slate-400 text-xs italic">Nenhuma</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {enterprises.slice(0, 2).map((e) => (
                            <span key={e.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 text-[11px] font-bold">
                              <Building2 size={10} /> {e.name}
                            </span>
                          ))}
                          {enterprises.length > 2 && (
                            <span className="text-[11px] text-slate-400 font-bold">+{enterprises.length - 2}</span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Created At */}
                    <td className="px-5 py-4">
                      <span className="text-[12px] text-slate-500 flex items-center gap-1">
                        <Calendar size={12} /> {fmtDate(user.createdAt)}
                      </span>
                    </td>

                    {/* Trial */}
                    <td className="px-5 py-4">
                      {trialBadge ?? (
                        <span className="text-[11px] text-slate-400 italic">Sem trial</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-5 py-4">
                      {user.isActive ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 uppercase">
                          <CheckCircle2 size={11} /> Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400 uppercase">
                          <XCircle size={11} /> Inativo
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {fb && (
                          <span className={`text-[11px] font-bold ${fb.ok ? 'text-emerald-500' : 'text-red-500'}`}>
                            {fb.msg}
                          </span>
                        )}

                        {/* Trial button */}
                        {!trialActive ? (
                          <button
                            onClick={() => startTrial(user, enterprises)}
                            disabled={!!actionLoading}
                            title="Iniciar trial de 7 dias"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 text-[11px] font-black hover:bg-amber-200 dark:hover:bg-amber-500/30 transition-all disabled:opacity-50"
                          >
                            {actionLoading === user.id + '_trial' ? (
                              <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <PlayCircle size={13} />
                            )}
                            {user.trialExpiresAt && diffDays(user.trialExpiresAt) <= 0 ? 'Renovar Trial' : 'Iniciar Trial'}
                          </button>
                        ) : (
                          <button
                            onClick={() => cancelTrial(user, enterprises)}
                            disabled={!!actionLoading}
                            title="Cancelar trial"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 text-[11px] font-black hover:bg-slate-200 dark:hover:bg-white/10 transition-all disabled:opacity-50"
                          >
                            {actionLoading === user.id + '_trial' ? (
                              <div className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <XCircle size={13} />
                            )}
                            Cancelar Trial
                          </button>
                        )}

                        {/* Toggle active */}
                        <button
                          onClick={() => toggleActive(user)}
                          disabled={!!actionLoading}
                          title={user.isActive ? 'Desativar conta' : 'Ativar conta'}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black transition-all disabled:opacity-50 ${
                            user.isActive
                              ? 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-500/30'
                              : 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-500/30'
                          }`}
                        >
                          {actionLoading === user.id + '_toggle' ? (
                            <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : user.isActive ? (
                            <PowerOff size={13} />
                          ) : (
                            <Power size={13} />
                          )}
                          {user.isActive ? 'Desativar' : 'Ativar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default SaasClientsPage;
