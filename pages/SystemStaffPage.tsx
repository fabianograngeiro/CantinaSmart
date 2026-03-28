import React, { useState, useEffect, useMemo } from 'react';
import {
  Shield, Plus, Trash2, Edit, X, Save, Search,
  Mail, Lock, User as UserIcon, CheckCircle2,
  Building2, ReceiptText, DollarSign, MessageCircle,
  ClipboardList, AlertTriangle, Eye, EyeOff,
} from 'lucide-react';
import { User, Role, SystemStaffPermissions } from '../types';
import ApiService from '../services/api';

interface SystemStaffPageProps {
  currentUser: User;
}

const DEFAULT_SYSTEM_PERMISSIONS: SystemStaffPermissions = {
  canManageClients: true,
  canManageEnterprises: true,
  canManagePlans: true,
  canViewBilling: true,
  canViewFinancial: true,
  canViewAudit: true,
  canManageWhatsApp: true,
  canViewErrorTickets: true,
};

const PERM_LABELS: { key: keyof SystemStaffPermissions; label: string; icon: React.ReactNode; desc: string }[] = [
  { key: 'canManageClients', label: 'Gerenciar Clientes', icon: <CheckCircle2 size={14} />, desc: 'Ver e gerenciar contas dos donos de rede' },
  { key: 'canManageEnterprises', label: 'Gerenciar Unidades', icon: <Building2 size={14} />, desc: 'Criar, editar e desativar unidades SaaS' },
  { key: 'canManagePlans', label: 'Gerenciar Planos', icon: <CheckCircle2 size={14} />, desc: 'Ver e editar planos SaaS disponíveis' },
  { key: 'canViewBilling', label: 'Cobranças SaaS', icon: <ReceiptText size={14} />, desc: 'Visualizar relatórios de cobranças' },
  { key: 'canViewFinancial', label: 'Financeiro SaaS', icon: <DollarSign size={14} />, desc: 'Acessar relatórios financeiros da plataforma' },
  { key: 'canViewAudit', label: 'Auditoria SaaS', icon: <ClipboardList size={14} />, desc: 'Visualizar logs de auditoria' },
  { key: 'canManageWhatsApp', label: 'WhatsApp SaaS', icon: <MessageCircle size={14} />, desc: 'Gerenciar disparos e configurações WhatsApp' },
  { key: 'canViewErrorTickets', label: 'Tickets de Erro', icon: <AlertTriangle size={14} />, desc: 'Visualizar e atualizar tickets de erro' },
];

type FormData = {
  name: string;
  email: string;
  password: string;
  systemPermissions: SystemStaffPermissions;
};

const blankForm = (): FormData => ({
  name: '',
  email: '',
  password: '',
  systemPermissions: { ...DEFAULT_SYSTEM_PERMISSIONS },
});

const SystemStaffPage: React.FC<SystemStaffPageProps> = ({ currentUser }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<FormData>(blankForm());
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [confirmDelete, setConfirmDelete] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const all: User[] = await ApiService.getUsers();
      setUsers(all.filter((u) => String(u.role).toUpperCase() === Role.ADMIN_SISTEMA));
    } catch (err) {
      console.error('[SystemStaffPage] Error loading:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, []);

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }, [users, searchTerm]);

  const openCreate = () => {
    setEditingUser(null);
    setFormData(blankForm());
    setFormError('');
    setShowPassword(false);
    setIsModalOpen(true);
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      password: '',
      systemPermissions: {
        ...DEFAULT_SYSTEM_PERMISSIONS,
        ...(user.systemPermissions || {}),
      },
    });
    setFormError('');
    setShowPassword(false);
    setIsModalOpen(true);
  };

  const togglePerm = (key: keyof SystemStaffPermissions) => {
    setFormData((prev) => ({
      ...prev,
      systemPermissions: {
        ...prev.systemPermissions,
        [key]: !prev.systemPermissions[key],
      },
    }));
  };

  const handleSave = async () => {
    setFormError('');
    const name = formData.name.trim();
    const email = formData.email.trim();
    if (!name) return setFormError('Nome é obrigatório');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setFormError('E-mail inválido');
    if (!editingUser && !formData.password) return setFormError('Senha é obrigatória');

    setIsSaving(true);
    try {
      if (editingUser) {
        const payload: any = {
          name,
          email,
          systemPermissions: formData.systemPermissions,
        };
        if (formData.password) payload.password = formData.password;
        const updated = await ApiService.updateUser(editingUser.id, payload);
        setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      } else {
        const newUser = await ApiService.createUser({
          name,
          email,
          password: formData.password,
          role: Role.ADMIN_SISTEMA,
          isActive: true,
          systemPermissions: formData.systemPermissions,
        });
        setUsers((prev) => [...prev, newUser]);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Erro ao salvar usuário');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setIsDeleting(true);
    try {
      await ApiService.deleteUser(confirmDelete.id);
      setUsers((prev) => prev.filter((u) => u.id !== confirmDelete.id));
      setConfirmDelete(null);
    } catch {
      // ignore for now
    } finally {
      setIsDeleting(false);
    }
  };

  const activePerms = (user: User) =>
    PERM_LABELS.filter((p) => user.systemPermissions?.[p.key]).map((p) => p.label);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-500/20 rounded-2xl flex items-center justify-center">
              <Shield className="text-purple-600" size={22} />
            </div>
            Equipe Interna
          </h1>
          <p className="text-xs text-gray-500 dark:text-slate-400 font-medium mt-1">
            Usuários do sistema com acesso limitado ao painel SaaS
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl font-bold text-sm hover:bg-purple-700 transition-all"
        >
          <Plus size={16} />
          Novo Usuário
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar por nome ou e-mail..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/5 rounded-xl text-sm font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-20">
          <div className="animate-spin w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-400 text-sm font-medium">Carregando equipe...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Shield size={48} className="text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-bold">Nenhum usuário interno encontrado</p>
          <p className="text-slate-400 text-sm mt-1">Crie o primeiro usuário com acesso limitado</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-white/5 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/5">
                <th className="text-left px-5 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Usuário</th>
                <th className="text-left px-5 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Permissões Ativas</th>
                <th className="text-left px-5 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</th>
                <th className="text-right px-5 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {filtered.map((user) => {
                const perms = activePerms(user);
                return (
                  <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-white/2 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-purple-600 font-black text-xs">
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
                    <td className="px-5 py-4">
                      {perms.length === 0 ? (
                        <span className="text-slate-400 text-xs italic">Sem permissões</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {perms.slice(0, 3).map((p) => (
                            <span key={p} className="inline-block px-2 py-0.5 rounded-lg bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 text-[10px] font-bold">
                              {p}
                            </span>
                          ))}
                          {perms.length > 3 && (
                            <span className="text-[11px] text-slate-400 font-bold">+{perms.length - 3}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {user.isActive ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 uppercase">
                          <CheckCircle2 size={11} /> Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400 uppercase">
                          <X size={11} /> Inativo
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(user)}
                          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 hover:text-indigo-600 transition-all"
                          title="Editar"
                        >
                          <Edit size={15} />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(user)}
                          className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-400 hover:text-red-600 transition-all"
                          title="Excluir"
                        >
                          <Trash2 size={15} />
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

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-black text-gray-900 dark:text-slate-100 flex items-center gap-2">
                <Shield size={20} className="text-purple-500" />
                {editingUser ? 'Editar Usuário' : 'Novo Usuário Interno'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-all">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Name */}
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wide mb-1.5">Nome</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Nome completo"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wide mb-1.5">E-mail</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                  placeholder="email@empresa.com"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wide mb-1.5">
                  {editingUser ? 'Nova Senha (deixe em branco para manter)' : 'Senha'}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value }))}
                    placeholder={editingUser ? '••••••••' : 'Mínimo 8 caracteres'}
                    className="w-full px-4 py-2.5 pr-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Permissions */}
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wide mb-3">Permissões de Acesso</label>
                <div className="space-y-2">
                  {PERM_LABELS.map(({ key, label, icon, desc }) => (
                    <label
                      key={key}
                      className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                        formData.systemPermissions[key]
                          ? 'border-purple-400 bg-purple-50 dark:bg-purple-500/10'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={formData.systemPermissions[key]}
                        onChange={() => togglePerm(key)}
                        className="mt-0.5 accent-purple-600"
                      />
                      <div>
                        <p className="text-sm font-black text-gray-800 dark:text-slate-200 flex items-center gap-1.5">
                          <span className={formData.systemPermissions[key] ? 'text-purple-600' : 'text-slate-400'}>{icon}</span>
                          {label}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {formError && (
                <p className="text-sm text-red-500 font-bold flex items-center gap-1.5">
                  <AlertTriangle size={14} /> {formError}
                </p>
              )}
            </div>

            <div className="flex gap-3 p-6 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setIsModalOpen(false)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-sm hover:bg-slate-200 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 px-4 py-2.5 rounded-xl bg-purple-600 text-white font-bold text-sm hover:bg-purple-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save size={15} />
                )}
                {editingUser ? 'Salvar Alterações' : 'Criar Usuário'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm p-6 space-y-4">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-500/20 rounded-full flex items-center justify-center mx-auto">
              <Trash2 className="text-red-600" size={22} />
            </div>
            <div className="text-center">
              <h4 className="text-lg font-black text-gray-900 dark:text-slate-100">Confirmar Exclusão</h4>
              <p className="text-sm text-slate-500 mt-1">
                Deseja excluir <strong>{confirmDelete.name}</strong>? Esta ação não pode ser desfeita.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-sm hover:bg-slate-200 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition-all disabled:opacity-50"
              >
                {isDeleting ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemStaffPage;
