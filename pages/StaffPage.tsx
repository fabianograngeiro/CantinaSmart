
import React, { useState, useMemo, useEffect } from 'react';
import { 
  Users2, Search, Plus, UserX, UserCheck, ShieldCheck, Mail, 
  Building, Edit2, Trash2, X, Save, Lock, Smartphone, MoreVertical
} from 'lucide-react';
import { ApiService } from '../services/api';
import { User, Role, Enterprise } from '../types';

const StaffPage: React.FC = () => {
  const [staff, setStaff] = useState<User[]>([]);
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Carregar usuários e empresas da API
  useEffect(() => {
    const loadData = async () => {
      try {
        const [usersData, enterprisesData] = await Promise.all([
          ApiService.getUsers(),
          ApiService.getEnterprises()
        ]);
        setStaff(usersData);
        setEnterprises(enterprisesData);
      } catch (err) {
        console.error('Erro ao carregar dados:', err);
        setStaff([]);
        setEnterprises([]);
      }
    };
    loadData();
  }, []);

  const filteredStaff = useMemo(() => {
    return staff.filter(u => 
      (u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
       u.email.toLowerCase().includes(searchTerm.toLowerCase())) &&
      u.role !== Role.OWNER // Dono não aparece na lista de gestão de funcionários comum
    );
  }, [staff, searchTerm]);

  const toggleStaffStatus = async (id: string) => {
    const user = staff.find(u => u.id === id);
    if (!user) return;
    
    try {
      const updated = await ApiService.updateUser(id, { isActive: !user.isActive });
      setStaff(prev => prev.map(u => u.id === id ? updated : u));
    } catch (err) {
      console.error('Erro ao atualizar colaborador:', err);
      alert('Erro ao atualizar colaborador. Tente novamente.');
    }
  };

  const handleEdit = (user: User) => {
    setEditingStaff(user);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Deseja realmente remover este colaborador?")) return;
    
    try {
      await ApiService.deleteUser(id);
      setStaff(prev => prev.filter(u => u.id !== id));
      alert('Colaborador removido com sucesso!');
    } catch (err) {
      console.error('Erro ao deletar colaborador:', err);
      alert('Erro ao deletar colaborador. Tente novamente.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-800 tracking-tight flex items-center gap-2">
            <Users2 className="text-indigo-600" size={28} /> Equipe de Colaboradores
          </h1>
          <p className="text-gray-500 text-sm">Gerencie quem pode operar suas unidades e quais são seus acessos.</p>
        </div>
        <button 
          onClick={() => { setEditingStaff(null); setIsModalOpen(true); }}
          className="bg-indigo-600 text-white px-5 py-3 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-200 hover:bg-indigo-700 transition-all flex items-center gap-2"
        >
          <Plus size={18} /> Novo Colaborador
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b flex flex-col md:flex-row gap-4 bg-gray-50/50">
          <div className="relative flex-1">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
             <input 
               type="text" 
               placeholder="Buscar por nome, email ou cargo..." 
               className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-4 focus:ring-indigo-50 outline-none transition-all text-sm font-medium"
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
             />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b">
              <tr>
                <th className="px-6 py-4">Colaborador</th>
                <th className="px-6 py-4">Cargo / Nível</th>
                <th className="px-6 py-4">Unidades Ativas</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredStaff.map(user => (
                <tr key={user.id} className={`hover:bg-indigo-50/30 transition-colors ${!user.isActive && 'opacity-60 grayscale'}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                       <img src={user.avatar} className="w-10 h-10 rounded-xl bg-gray-100 border-2 border-white shadow-sm" alt={user.name} />
                       <div>
                          <p className="text-sm font-black text-gray-800 leading-tight">{user.name}</p>
                          <p className="text-[10px] text-gray-400 font-bold lowercase flex items-center gap-1 mt-0.5"><Mail size={10} /> {user.email}</p>
                       </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                      user.role === Role.ADMIN ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {user.role === Role.ADMIN ? <ShieldCheck size={10} /> : <UserCheck size={10} />}
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex -space-x-2">
                       {user.enterpriseIds?.map(eid => {
                         const ent = enterprises.find(e => e.id === eid);
                         return ent ? (
                           <div key={eid} title={ent.name} className="w-8 h-8 rounded-lg bg-white border-2 border-gray-50 flex items-center justify-center text-[10px] font-black text-indigo-600 shadow-sm">
                             {ent.name.charAt(0)}
                           </div>
                         ) : null;
                       })}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <button 
                      onClick={() => toggleStaffStatus(user.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                        user.isActive ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'
                      }`}
                    >
                      {user.isActive ? <UserCheck size={12} /> : <UserX size={12} />}
                      {user.isActive ? 'Ativo' : 'Desativado'}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                       <button onClick={() => handleEdit(user)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all" title="Editar"><Edit2 size={16} /></button>
                       <button onClick={() => handleDelete(user.id)} className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all" title="Excluir"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Cadastro/Edição de Colaborador */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-indigo-950/40 backdrop-blur-sm animate-in fade-in" onClick={() => setIsModalOpen(false)}></div>
          <form className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="bg-indigo-600 p-6 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                 <Lock size={20} />
                 <h2 className="text-xl font-black">{editingStaff ? 'Editar Colaborador' : 'Novo Colaborador'}</h2>
              </div>
              <button type="button" onClick={() => setIsModalOpen(false)}><X size={24} /></button>
            </div>

            <div className="p-8 space-y-8 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Nome Completo</label>
                   <input required defaultValue={editingStaff?.name} className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-2xl outline-none focus:border-indigo-500 font-bold" />
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Email de Acesso</label>
                   <input type="email" required defaultValue={editingStaff?.email} className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-2xl outline-none focus:border-indigo-500 font-bold" />
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Nível de Acesso (Cargo)</label>
                   <select defaultValue={editingStaff?.role || Role.CAIXA} className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-2xl outline-none focus:border-indigo-500 font-bold">
                      <option value={Role.ADMIN}>ADMIN (Gerente)</option>
                      <option value={Role.CAIXA}>CAIXA (Operador)</option>
                   </select>
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Celular (WhatsApp)</label>
                   <input className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-2xl outline-none focus:border-indigo-500 font-bold" placeholder="(00) 00000-0000" />
                </div>
              </div>

              {/* Unidades Vinculadas */}
              <div className="space-y-4">
                 <h3 className="font-black text-gray-800 text-xs uppercase tracking-widest flex items-center gap-2">
                    <Building size={16} className="text-indigo-600" /> Unidades que pode operar
                 </h3>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {enterprises.map(ent => (
                       <label key={ent.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border-2 border-transparent hover:border-indigo-100 cursor-pointer transition-all has-[:checked]:border-indigo-600 has-[:checked]:bg-indigo-50/50 group">
                          <div className="flex items-center gap-3">
                             <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center font-black text-indigo-600 text-xs">{ent.name.charAt(0)}</div>
                             <div>
                                <p className="text-sm font-bold text-gray-800">{ent.name}</p>
                                <p className="text-[9px] text-gray-400 font-black uppercase tracking-tighter">{ent.type}</p>
                             </div>
                          </div>
                          <input type="checkbox" defaultChecked={editingStaff?.enterpriseIds?.includes(ent.id)} className="w-5 h-5 rounded-lg border-2 border-gray-300 text-indigo-600 focus:ring-0 cursor-pointer" />
                       </label>
                    ))}
                 </div>
              </div>

              {/* Permissões Granulares (Atributos) */}
              <div className="space-y-4 pt-4 border-t">
                 <h3 className="font-black text-gray-800 text-xs uppercase tracking-widest flex items-center gap-2">
                    <ShieldCheck size={16} className="text-indigo-600" /> Permissões de Módulo
                 </h3>
                 <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <PermissionToggle label="Gestão Estoque" active={editingStaff?.permissions?.canAccessInventory} />
                    <PermissionToggle label="Relatórios" active={editingStaff?.permissions?.canAccessReports} />
                    <PermissionToggle label="Vender (PDV)" active={editingStaff?.permissions?.canAccessPOS || true} />
                    <PermissionToggle label="Gestão Clientes" active={editingStaff?.permissions?.canAccessClients} />
                    <PermissionToggle label="Gerir Equipe" active={editingStaff?.permissions?.canManageStaff} />
                 </div>
              </div>
            </div>

            <div className="p-6 bg-gray-50 border-t flex gap-3">
              <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 text-xs font-black text-gray-400 uppercase tracking-widest hover:text-gray-600">Descartar</button>
              <button type="button" onClick={() => setIsModalOpen(false)} className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-100 hover:bg-indigo-700 flex items-center justify-center gap-2">
                <Save size={18} /> {editingStaff ? 'Salvar Alterações' : 'Contratar Colaborador'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

const PermissionToggle = ({ label, active }: { label: string, active?: boolean }) => {
  const [isActive, setIsActive] = useState(active || false);
  return (
    <div onClick={() => setIsActive(!isActive)} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer transition-all">
       <span className="text-[10px] font-black text-gray-600 uppercase tracking-tight">{label}</span>
       <div className={`w-8 h-4 rounded-full relative transition-all ${isActive ? 'bg-indigo-600' : 'bg-gray-300'}`}>
          <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${isActive ? 'right-0.5' : 'left-0.5'}`}></div>
       </div>
    </div>
  );
};

export default StaffPage;
