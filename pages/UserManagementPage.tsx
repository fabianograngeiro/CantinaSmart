import React, { useState, useEffect } from 'react';
import {
  Users, Plus, Trash2, Edit, X, Save, ShieldCheck,
  Mail, Lock, User as UserIcon, Search, AlertTriangle,
  CheckCircle2, Shield, Building
} from 'lucide-react';
import { User, Role } from '../types';
import ApiService from '../services/api';

interface UserManagementPageProps {
  currentUser: User;
}

const UserManagementPage: React.FC<UserManagementPageProps> = ({ currentUser }) => {
  const isOwner = currentUser.role === Role.OWNER;
  const ownerEnterpriseIds = currentUser.enterpriseIds || [];
  const ownerHasScopedEnterprises = ownerEnterpriseIds.length > 0;
  const [users, setUsers] = useState<User[]>([]);
  const [enterprises, setEnterprises] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: (isOwner ? 'GERENTE' : 'ADMIN') as Role,
    enterpriseIds: [] as string[],
    isActive: true,
    permissions: {
      canAccessInventory: true,
      canAccessReports: true,
      canAccessPOS: true,
      canAccessClients: true,
      canManageStaff: false,
    }
  });

  const getDefaultPermissionsByRole = (role: Role) => {
    if (role === Role.FUNCIONARIO_BASICO || role === Role.CAIXA) {
      return {
        canAccessInventory: false,
        canAccessReports: false,
        canAccessPOS: true,
        canAccessClients: true,
        canManageStaff: false,
      };
    }
    if (role === Role.GERENTE || role === Role.ADMIN || role === Role.ADMIN_RESTAURANTE || role === Role.OWNER) {
      return {
        canAccessInventory: true,
        canAccessReports: true,
        canAccessPOS: true,
        canAccessClients: true,
        canManageStaff: true,
      };
    }
    return {
      canAccessInventory: false,
      canAccessReports: false,
      canAccessPOS: false,
      canAccessClients: false,
      canManageStaff: false,
    };
  };

  useEffect(() => {
    loadUsers();
    loadEnterprises();
  }, []);

  const loadUsers = async () => {
    try {
      const data = await ApiService.getUsers();
      const visible = data.filter((user: User) => {
        if (!isOwner) return true;
        if (user.role === Role.SUPERADMIN) return false;
        if (user.role === Role.OWNER) return false;
        if (!ownerHasScopedEnterprises) return true;
        const userEnterprises = user.enterpriseIds || [];
        return userEnterprises.some((enterpriseId) => ownerEnterpriseIds.includes(enterpriseId));
      });
      setUsers(visible);
    } catch (err) {
      console.error('Erro ao carregar usuários:', err);
    }
  };

  const loadEnterprises = async () => {
    try {
      const data = await ApiService.getEnterprises();
      const visible = isOwner && ownerHasScopedEnterprises
        ? data.filter((enterprise: any) => ownerEnterpriseIds.includes(enterprise.id))
        : data;
      setEnterprises(visible);
    } catch (err) {
      console.error('Erro ao carregar empresas:', err);
    }
  };

  const handleOpenModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        name: user.name,
        email: user.email,
        password: '', // Não mostra senha existente
        role: user.role,
        enterpriseIds: user.enterpriseIds || [],
        isActive: user.isActive,
        permissions: {
          ...getDefaultPermissionsByRole(user.role),
          ...(user.permissions || {}),
        }
      });
    } else {
      setEditingUser(null);
      setFormData({
        name: '',
        email: '',
        password: '',
        role: (isOwner ? 'GERENTE' : 'ADMIN') as Role,
        enterpriseIds: [],
        isActive: true,
        permissions: getDefaultPermissionsByRole((isOwner ? Role.GERENTE : Role.ADMIN))
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
    setFormData({
      name: '',
      email: '',
      password: '',
      role: (isOwner ? 'GERENTE' : 'ADMIN') as Role,
      enterpriseIds: [],
      isActive: true,
      permissions: getDefaultPermissionsByRole((isOwner ? Role.GERENTE : Role.ADMIN))
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (!editingUser || (editingUser && formData.password)) {
        const strongPassword = formData.password.length >= 8
          && /[A-Z]/.test(formData.password)
          && /[a-z]/.test(formData.password)
          && /[0-9]/.test(formData.password);
        if (!strongPassword) {
          alert('Senha inválida: use no mínimo 8 caracteres com letra maiúscula, minúscula e número.');
          setIsLoading(false);
          return;
        }
      }

      if ((formData.role === Role.GERENTE || formData.role === Role.FUNCIONARIO_BASICO || formData.role === Role.CAIXA) && formData.enterpriseIds.length === 0) {
        alert('Selecione ao menos uma unidade para este usuário.');
        setIsLoading(false);
        return;
      }

      if (editingUser) {
        // Atualizar usuário existente
        const updateData: any = {
          name: formData.name,
          email: formData.email,
          role: formData.role,
          enterpriseIds: formData.enterpriseIds,
          isActive: formData.isActive,
          permissions: formData.permissions
        };
        
        // Só atualiza senha se foi fornecida
        if (formData.password) {
          updateData.password = formData.password;
        }

        await ApiService.updateUser(editingUser.id, updateData);
      } else {
        // Criar novo usuário
        await ApiService.createUser({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          role: formData.role,
          enterpriseIds: formData.enterpriseIds,
          isActive: formData.isActive,
          permissions: formData.permissions
        });
      }

      await loadUsers();
      handleCloseModal();
    } catch (err) {
      console.error('Erro ao salvar usuário:', err);
      alert((err as Error)?.message || 'Erro ao salvar usuário. Verifique os dados e tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteClick = (user: User) => {
    setUserToDelete(user);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!userToDelete) return;

    setIsLoading(true);
    try {
      await ApiService.deleteUser(userToDelete.id);
      await loadUsers();
      setIsDeleteModalOpen(false);
      setUserToDelete(null);
    } catch (err) {
      console.error('Erro ao deletar usuário:', err);
      alert('Erro ao deletar usuário.');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredUsers = users.filter(user => 
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const canEdit = (user: User) => user.id !== currentUser.id;
  const canDelete = (user: User) => user.id !== currentUser.id && user.role !== 'SUPERADMIN';

  const getRoleName = (role: Role) => {
    const names: Record<Role, string> = {
      SUPERADMIN: 'Super Admin',
      ADMIN_SISTEMA: 'Admin do Sistema',
      OWNER: 'Dono de Rede',
      ADMIN: 'Administrador Cantina',
      ADMIN_RESTAURANTE: 'Administrador Restaurante',
      GERENTE: 'Gerente de Unidade',
      FUNCIONARIO_BASICO: 'Funcionário Básico',
      CAIXA: 'Caixa/Operador',
      COLABORADOR: 'Colaborador',
      RESPONSAVEL: 'Responsável',
      CLIENTE: 'Cliente'
    };
    return names[role] || role;
  };

  const getRoleColor = (role: Role) => {
    const colors: Record<Role, string> = {
      SUPERADMIN: 'bg-purple-100 text-purple-700 border-purple-200',
      ADMIN_SISTEMA: 'bg-violet-100 text-violet-700 border-violet-200',
      OWNER: 'bg-indigo-100 text-indigo-700 border-indigo-200',
      ADMIN: 'bg-blue-100 text-blue-700 border-blue-200',
      ADMIN_RESTAURANTE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      GERENTE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      FUNCIONARIO_BASICO: 'bg-amber-100 text-amber-700 border-amber-200',
      CAIXA: 'bg-slate-100 text-slate-700 border-slate-200',
      COLABORADOR: 'bg-cyan-100 text-cyan-700 border-cyan-200',
      RESPONSAVEL: 'bg-amber-100 text-amber-700 border-amber-200',
      CLIENTE: 'bg-green-100 text-green-700 border-green-200'
    };
    return colors[role] || 'bg-gray-100 text-gray-700 border-gray-200';
  };

  return (
    <div className="users-shell space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-black text-gray-800 flex items-center gap-2">
            <Users className="text-indigo-600" size={20} />
            Gerenciamento de Usuários
          </h1>
          <p className="text-xs text-gray-500 font-medium">Gerenciar todos os usuários do sistema</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="px-3 py-2 bg-indigo-600 text-white rounded-lg font-bold text-[11px] uppercase tracking-wider hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-md"
        >
          <Plus size={14} />
          Novo Usuário
        </button>
      </div>

      {/* Search */}
      <div className="bg-white p-3 rounded-xl border shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar usuários por nome, email ou cargo..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-indigo-500 transition-all font-medium text-xs"
          />
        </div>
      </div>

      {/* Users List */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-[9px] font-black text-gray-500 uppercase tracking-widest">Usuário</th>
                <th className="text-left px-4 py-3 text-[9px] font-black text-gray-500 uppercase tracking-widest">Email</th>
                <th className="text-left px-4 py-3 text-[9px] font-black text-gray-500 uppercase tracking-widest">Cargo</th>
                <th className="text-left px-4 py-3 text-[9px] font-black text-gray-500 uppercase tracking-widest">Status</th>
                <th className="text-left px-4 py-3 text-[9px] font-black text-gray-500 uppercase tracking-widest">Empresas</th>
                <th className="text-right px-4 py-3 text-[9px] font-black text-gray-500 uppercase tracking-widest">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredUsers.map(user => (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={user.avatar}
                        alt={user.name}
                        className="w-8 h-8 rounded-lg border border-white shadow"
                      />
                      <div>
                        <p className="text-sm font-bold text-gray-800">{user.name}</p>
                        {user.id === currentUser.id && (
                          <p className="text-[10px] text-indigo-600 font-black uppercase">Você</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-gray-600 font-medium">{user.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase border ${getRoleColor(user.role)}`}>
                      {user.role === 'SUPERADMIN' && <Shield size={10} />}
                      {getRoleName(user.role)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {user.isActive ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-[9px] font-black uppercase border border-green-200">
                        <CheckCircle2 size={10} />
                        Ativo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-100 text-red-700 rounded-full text-[9px] font-black uppercase border border-red-200">
                        Inativo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-gray-500 font-medium">
                      {user.enterpriseIds?.length || 0} empresa(s)
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {canEdit(user) && (
                        <button
                          onClick={() => handleOpenModal(user)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                          title="Editar"
                        >
                          <Edit size={14} />
                        </button>
                      )}
                      {canDelete(user) && (
                        <button
                          onClick={() => handleDeleteClick(user)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          title="Deletar"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredUsers.length === 0 && (
          <div className="text-center py-10">
            <Users className="mx-auto text-gray-300 mb-3" size={40} />
            <p className="text-gray-500 text-sm font-medium">Nenhum usuário encontrado</p>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <UserIcon className="text-indigo-600" size={18} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-gray-800 uppercase tracking-tight">
                    {editingUser ? 'Editar Usuário' : 'Novo Usuário'}
                  </h3>
                  <p className="text-xs text-gray-500 font-medium">
                    {editingUser ? 'Atualize as informações do usuário' : 'Preencha os dados do novo usuário'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseModal}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-all"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div className="space-y-2">
                <label className="text-xs font-black text-gray-600 uppercase tracking-widest">Nome Completo</label>
                <div className="relative">
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    required
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-indigo-500 transition-all font-medium text-sm"
                    placeholder="Nome do usuário"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-2">
                <label className="text-xs font-black text-gray-600 uppercase tracking-widest">Email</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    required
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-indigo-500 transition-all font-medium text-sm"
                    placeholder="email@exemplo.com"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <label className="text-xs font-black text-gray-600 uppercase tracking-widest">
                  Senha {editingUser && '(deixe em branco para manter a atual)'}
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    required={!editingUser}
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-indigo-500 transition-all font-medium text-sm"
                    placeholder={editingUser ? "Nova senha (opcional)" : "Senha"}
                    minLength={8}
                  />
                </div>
              </div>

              {/* Role */}
              <div className="space-y-2">
                <label className="text-xs font-black text-gray-600 uppercase tracking-widest">Cargo/Função</label>
                <select
                  value={formData.role}
                  onChange={(e) => {
                    const nextRole = e.target.value as Role;
                    setFormData({
                      ...formData,
                      role: nextRole,
                      permissions: getDefaultPermissionsByRole(nextRole),
                    });
                  }}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-indigo-500 transition-all font-bold text-sm"
                >
                  {!isOwner && <option value="OWNER">Dono de Rede</option>}
                  {!isOwner && <option value="ADMIN">Administrador Cantina</option>}
                  {!isOwner && <option value="ADMIN_RESTAURANTE">Administrador Restaurante</option>}
                  <option value="GERENTE">Gerente de Unidade</option>
                  <option value="FUNCIONARIO_BASICO">Funcionário Básico</option>
                  <option value="CAIXA">Caixa/Operador</option>
                </select>
                <p className="text-xs text-gray-500 italic">Você não pode criar usuários SUPERADMIN</p>
              </div>

              {/* Enterprise Assignment */}
              {enterprises.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-black text-gray-600 uppercase tracking-widest">Empresas Vinculadas</label>
                  <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2.5 space-y-1.5">
                    {enterprises.map(ent => (
                      <label key={ent.id} className="flex items-center gap-2 p-1.5 hover:bg-gray-50 rounded-lg cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.enterpriseIds.includes(ent.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormData({ ...formData, enterpriseIds: [...formData.enterpriseIds, ent.id] });
                            } else {
                              setFormData({ ...formData, enterpriseIds: formData.enterpriseIds.filter(id => id !== ent.id) });
                            }
                          }}
                          className="rounded border-gray-300"
                        />
                        <span className="text-xs font-medium text-gray-700">{ent.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Permissões */}
              <div className="space-y-2">
                <label className="text-xs font-black text-gray-600 uppercase tracking-widest">Privilégios</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 border border-gray-200 rounded-lg p-2.5">
                  {[
                    { key: 'canAccessPOS', label: 'Acessar PDV' },
                    { key: 'canAccessClients', label: 'Acessar Clientes' },
                    { key: 'canAccessInventory', label: 'Acessar Estoque/Produtos' },
                    { key: 'canAccessReports', label: 'Acessar Relatórios/Transações' },
                    { key: 'canManageStaff', label: 'Gerenciar Usuários' },
                  ].map((permission) => (
                    <label key={permission.key} className="flex items-center gap-2 p-1.5 hover:bg-gray-50 rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean((formData.permissions as any)[permission.key])}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            permissions: {
                              ...formData.permissions,
                              [permission.key]: e.target.checked,
                            },
                          })
                        }
                        className="rounded border-gray-300"
                      />
                      <span className="text-xs font-medium text-gray-700">{permission.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <label htmlFor="isActive" className="text-xs font-bold text-gray-700 cursor-pointer">
                  Usuário Ativo
                </label>
              </div>

              {/* Actions */}
              <div className="flex gap-2.5 pt-3 border-t">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 px-3 py-2.5 bg-gray-200 text-gray-700 rounded-lg font-bold text-[11px] uppercase tracking-wider hover:bg-gray-300 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 px-3 py-2.5 bg-indigo-600 text-white rounded-lg font-bold text-[11px] uppercase tracking-wider hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      {editingUser ? 'Atualizar' : 'Criar Usuário'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && userToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 max-w-md w-full shadow-2xl border-2 border-red-500">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                <AlertTriangle className="text-red-600" size={18} />
              </div>
              <div>
                <h3 className="text-lg font-black text-gray-800 uppercase tracking-tight">Confirmar Exclusão</h3>
                <p className="text-xs text-red-600 font-bold uppercase tracking-widest">Ação irreversível</p>
              </div>
            </div>

            <div className="space-y-3 mb-4">
              <p className="text-gray-700 text-sm font-medium">
                Tem certeza que deseja excluir o usuário <strong>{userToDelete.name}</strong>?
              </p>
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-xs font-bold text-red-900 mb-2">⚠️ Atenção:</p>
                <ul className="text-xs text-red-800 space-y-1 font-medium">
                  <li>• Este usuário será removido permanentemente</li>
                  <li>• Esta ação não pode ser desfeita</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-2.5">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="flex-1 px-3 py-2.5 bg-gray-200 text-gray-700 rounded-lg font-bold text-[11px] uppercase tracking-wider hover:bg-gray-300 transition-all"
                disabled={isLoading}
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={isLoading}
                className="flex-1 px-3 py-2.5 bg-red-600 text-white rounded-lg font-bold text-[11px] uppercase tracking-wider hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Excluindo...
                  </>
                ) : (
                  <>
                      <Trash2 size={14} />
                      Confirmar Exclusão
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

export default UserManagementPage;
