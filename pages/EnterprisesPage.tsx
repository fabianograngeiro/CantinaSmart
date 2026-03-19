
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Building2, Plus, Search, MapPin, ShieldCheck, 
  ExternalLink, Building, CheckCircle2, 
  Edit, Power, PowerOff, Map as MapIcon,
  X, Save, Hash, Phone, Smartphone, UserCircle,
  Mail, Lock, Copy, ArrowRight, Store, School,
  Utensils, Beef, ReceiptText, Calendar,
  ChevronRight, Sparkles, DollarSign, AlertCircle, Users
} from 'lucide-react';
import { Enterprise, Role, User } from '../types';
import ApiService from '../services/api';

interface EnterprisesPageProps {
  currentUser: User;
}

const EnterprisesPage: React.FC<EnterprisesPageProps> = ({ currentUser }) => {
  const navigate = useNavigate();
  const isSuperAdmin = currentUser?.role === Role.SUPERADMIN;
  const isOwner = currentUser?.role === Role.OWNER;
  
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [successData, setSuccessData] = useState<{email: string, pass: string} | null>(null);

  // Carregar empresas da API
  useEffect(() => {
    const loadEnterprises = async () => {
      try {
        const data = await ApiService.getEnterprises();
        setEnterprises(data);
      } catch (err) {
        console.error('Erro ao carregar empresas:', err);
        setEnterprises([]);
      }
    };
    loadEnterprises();
  }, []);

  const [formData, setFormData] = useState({
    type: 'CANTINA' as 'CANTINA' | 'RESTAURANTE',
    nomeFantasia: '',
    managerName: '',
    document: '', // CNPJ
    phone1: '', // Whatsapp
    phone2: '', // Telefone Contato
    attachedSchoolName: '', // Apenas Cantina
    email: '', // Para login
    cep: '',
    street: '',
    number: '',
    neighborhood: '',
    city: '',
    state: '', // UF
    planType: 'PRO' as 'BASIC' | 'PRO' | 'ENTERPRISE',
    monthlyFee: 450.00
  });

  const filteredEnterprises = useMemo(() => {
    return enterprises.filter(e => {
      // SUPERADMIN vê tudo
      // OWNER vê todas as empresas (não filtra por enterpriseIds)
      const isUserEnterprise = isSuperAdmin || isOwner || (currentUser.enterpriseIds?.includes(e.id));
      
      const matchesSearch = 
        e.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        e.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (e.document && e.document.includes(searchTerm)) ||
        (e.ownerName && e.ownerName.toLowerCase().includes(searchTerm.toLowerCase()));
        
      return isUserEnterprise && matchesSearch;
    });
  }, [enterprises, searchTerm, isSuperAdmin, isOwner, currentUser.enterpriseIds]);

  const stats = useMemo(() => {
    // Calcular stats baseado nas empresas filtradas (vis\u00edveis ao usu\u00e1rio)
    const visibleEnterprises = filteredEnterprises;
    const totalMRR = visibleEnterprises.reduce((acc, curr) => acc + (curr.monthlyFee || 0), 0);
    const active = visibleEnterprises.filter(e => e.isActive).length;
    const pending = visibleEnterprises.filter(e => e.lastPaymentStatus === 'PENDING' || e.lastPaymentStatus === 'OVERDUE').length;
    
    return { totalMRR, active, pending, total: visibleEnterprises.length };
  }, [filteredEnterprises]);

  const handleSaveEnterprise = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const fullAddress = `${formData.street}, ${formData.number} - ${formData.neighborhood}, ${formData.city} - ${formData.state} (CEP: ${formData.cep})`;

    const newEnterprise = {
      name: formData.nomeFantasia,
      document: formData.document,
      type: formData.type,
      address: fullAddress,
      attachedSchoolName: formData.type === 'CANTINA' ? formData.attachedSchoolName : undefined,
      managerName: formData.managerName,
      phone1: formData.phone1,
      phone2: formData.phone2,
      isActive: true,
      logo: `https://api.dicebear.com/7.x/initials/svg?seed=${formData.nomeFantasia}`,
      ownerName: formData.managerName,
      planType: formData.planType,
      monthlyFee: formData.monthlyFee,
      lastPaymentStatus: 'PAID'
    };

    try {
      // Criar a empresa via API
      const createdEnterprise = await ApiService.createEnterprise(newEnterprise);
      
      // Criar usuário admin para a empresa
      const adminUser = {
        name: formData.managerName,
        email: formData.email,
        password: 'Admin123',
        role: formData.type === 'RESTAURANTE' ? 'ADMIN_RESTAURANTE' : 'ADMIN',
        enterpriseIds: [createdEnterprise.id],
        isActive: true
      };
      
      await ApiService.createUser(adminUser);
      
      // Atualizar lista local
      setEnterprises(prev => [createdEnterprise, ...prev]);
      setSuccessData({ email: formData.email, pass: 'Admin123' });
    } catch (err) {
      console.error('Erro ao criar empresa:', err);
      alert('Erro ao criar empresa. Tente novamente.');
    }
  };

  const resetFormAndClose = () => {
    setFormData({
      type: 'CANTINA',
      nomeFantasia: '',
      managerName: '',
      document: '',
      phone1: '',
      phone2: '',
      attachedSchoolName: '',
      email: '',
      cep: '',
      street: '',
      number: '',
      neighborhood: '',
      city: '',
      state: '',
      planType: 'PRO',
      monthlyFee: 450.00
    });
    setSuccessData(null);
    setIsModalOpen(false);
  };

  const toggleEnterpriseStatus = async (id: string) => {
    try {
      const enterprise = enterprises.find(e => e.id === id);
      if (!enterprise) return;
      
      const updated = await ApiService.updateEnterprise(id, { 
        ...enterprise, 
        isActive: !enterprise.isActive 
      });
      
      setEnterprises(prev => prev.map(e => e.id === id ? updated : e));
    } catch (err) {
      console.error('Erro ao atualizar status da empresa:', err);
      alert('Erro ao atualizar status. Tente novamente.');
    }
  };

  return (
    <div className="dash-shell enterprise-shell">
      
      <header className="dash-header">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-xl shadow-indigo-100">
              <Building2 size={32} />
            </div>
            <div>
              <h1 className="dash-title">
                {isSuperAdmin ? 'Gestão de Clientes SaaS' : 'Minhas Unidades'}
              </h1>
              <p className="dash-subtitle">
                {isSuperAdmin ? 'Console de Administração Global do Sistema' : 'Gerenciamento de Unidades Operacionais'}
              </p>
            </div>
          </div>
        </div>

        <button onClick={() => { setSuccessData(null); setIsModalOpen(true); }} className="bg-indigo-600 text-white px-6 py-3.5 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center gap-2">
          <Plus size={18} /> {isSuperAdmin ? 'Cadastrar Novo Cliente SaaS' : 'Cadastrar Nova Unidade'}
        </button>
      </header>

      {isSuperAdmin && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
           <SaaSStatCard title="MRR Total" value={`R$ ${stats.totalMRR.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} icon={<DollarSign className="text-emerald-500" />} />
           <SaaSStatCard title="Licenças Ativas" value={stats.active.toString()} icon={<CheckCircle2 className="text-indigo-500" />} />
           <SaaSStatCard title="Inadimplência" value={stats.pending.toString()} icon={<AlertCircle className="text-red-500" />} />
           <SaaSStatCard title="Total Clientes" value={stats.total.toString()} icon={<Users className="text-blue-500" />} />
        </div>
      )}

      <div className="dash-filterbar flex flex-col md:flex-row items-center gap-4">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input type="text" placeholder="Buscar por nome, dono, endereço ou CNPJ..." className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border-transparent border-2 focus:border-indigo-500 rounded-2xl outline-none font-bold text-sm transition-all" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {filteredEnterprises.map(ent => (
          <div key={ent.id} className="bg-white rounded-[48px] shadow-sm border border-gray-100 overflow-hidden hover:shadow-2xl transition-all group border-b-8 border-b-indigo-500/10 flex flex-col">
            <div className="p-8 flex-1">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center font-black text-2xl transition-transform group-hover:rotate-3 ${ent.isActive ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}>{ent.name.charAt(0)}</div>
                  <div>
                    <h3 className="text-xl font-black text-gray-900 tracking-tighter uppercase leading-tight">{ent.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest border ${ent.type === 'CANTINA' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-orange-50 text-orange-600 border-orange-100'}`}>{ent.type}</span>
                      {!ent.isActive && <span className="text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest bg-red-50 text-red-500 border border-red-100">Inativo</span>}
                      {isSuperAdmin && (
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest border ${ent.lastPaymentStatus === 'PAID' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                          {ent.lastPaymentStatus === 'PAID' ? 'Pago' : 'Pendente'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <button onClick={() => toggleEnterpriseStatus(ent.id)} className={`p-2 rounded-xl transition-all shadow-sm bg-white border ${ent.isActive ? 'text-emerald-500 hover:bg-emerald-50' : 'text-gray-300 hover:bg-gray-100'}`} title={ent.isActive ? 'Desativar' : 'Ativar'}>{ent.isActive ? <Power size={14} /> : <PowerOff size={14} />}</button>
                  <button className="p-2 text-indigo-400 bg-white border rounded-xl shadow-sm hover:bg-indigo-50" title="Editar"><Edit size={14} /></button>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-gray-500 text-xs font-bold">
                   <MapPin size={14} className="text-indigo-400" />
                   <span className="truncate">{ent.address}</span>
                </div>
                <div className="flex items-center gap-3 text-gray-500 text-xs font-bold">
                   <Smartphone size={14} className="text-emerald-500" />
                   <span>{ent.phone1 || 'Sem WhatsApp'}</span>
                </div>
                <div className="flex items-center gap-3 text-gray-500 text-xs font-bold">
                   <UserCircle size={14} className="text-indigo-400" />
                   <span>{isSuperAdmin ? `Dono: ${ent.ownerName}` : `Gerente: ${ent.managerName || 'Não definido'}`}</span>
                </div>
                {ent.attachedSchoolName && (
                  <div className="flex items-center gap-3 text-gray-500 text-xs font-bold">
                    <School size={14} className="text-indigo-400" />
                    <span>Instituição: {ent.attachedSchoolName}</span>
                  </div>
                )}
                {isSuperAdmin && (
                  <div className="flex items-center gap-3 text-gray-500 text-xs font-bold pt-2 border-t border-gray-50 mt-2">
                    <Sparkles size={14} className="text-amber-500" />
                    <span className="uppercase tracking-widest text-[10px]">Plano {ent.planType} • R$ {ent.monthlyFee?.toFixed(2)}/mês</span>
                  </div>
                )}
              </div>

              {/* Botões de Ação Rápida - Escondidos para SuperAdmin se não for necessário */}
              {!isSuperAdmin && (
                <div className="grid grid-cols-1 gap-2 mt-8">
                  <button 
                    onClick={() => navigate('/menu-lunch')}
                    className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-2xl hover:bg-indigo-600 hover:text-white transition-all group/btn border border-gray-100"
                  >
                    <div className="flex items-center gap-3">
                        <Calendar size={18} className="text-indigo-400 group-hover/btn:text-white" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Cardápio Semanal</span>
                    </div>
                    <ChevronRight size={14} />
                  </button>
                  
                  <button 
                    onClick={() => navigate('/nutritional-info')}
                    className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-2xl hover:bg-indigo-600 hover:text-white transition-all group/btn border border-gray-100"
                  >
                    <div className="flex items-center gap-3">
                        <Beef size={18} className="text-indigo-400 group-hover/btn:text-white" />
                        <span className="text-[10px] font-black uppercase tracking-widest">ITENS COMIDA</span>
                    </div>
                    <ChevronRight size={14} />
                  </button>

                  <button 
                    onClick={() => navigate(`/plans/${ent.id}`)}
                    className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-2xl hover:bg-indigo-600 hover:text-white transition-all group/btn border border-gray-100"
                  >
                    <div className="flex items-center gap-3">
                        <Sparkles size={18} className="text-indigo-400 group-hover/btn:text-white" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Plano Alimentação</span>
                    </div>
                    <ChevronRight size={14} />
                  </button>

                  <button 
                    onClick={() => navigate('/unit-sales')}
                    className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-2xl hover:bg-indigo-600 hover:text-white transition-all group/btn border border-gray-100"
                  >
                    <div className="flex items-center gap-3">
                        <ReceiptText size={18} className="text-indigo-400 group-hover/btn:text-white" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Transação de Vendas</span>
                    </div>
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
            
            <div className="px-8 py-4 bg-indigo-50/30 flex items-center justify-center border-t border-gray-100">
               <button className="flex items-center gap-2 text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline">
                  {isSuperAdmin ? 'Gerenciar Assinatura e Faturamento' : 'Console Detalhado da Unidade'} <ExternalLink size={12} />
               </button>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-indigo-950/60 backdrop-blur-sm animate-in fade-in" onClick={resetFormAndClose}></div>
           <div className="relative w-full max-w-3xl bg-white rounded-[48px] shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[95vh]">
              
              {!successData ? (
                <form onSubmit={handleSaveEnterprise} className="flex flex-col h-full">
                  <div className="bg-indigo-600 p-8 text-white flex items-center justify-between shrink-0">
                     <div className="flex items-center gap-5">
                        <div className="w-16 h-16 bg-white/20 rounded-[24px] flex items-center justify-center backdrop-blur-md border border-white/20">
                          <Store size={32} />
                        </div>
                        <div>
                           <h2 className="text-2xl font-black uppercase tracking-tight leading-none">
                             {isSuperAdmin ? 'Novo Cliente SaaS' : 'Novo Registro de Filial'}
                           </h2>
                           <p className="text-[10px] font-bold text-indigo-100 uppercase tracking-widest mt-1">
                             {isSuperAdmin ? 'Configuração de Licença e Acesso Master' : 'Escolha única de operação e endereço'}
                           </p>
                        </div>
                     </div>
                     <button type="button" onClick={resetFormAndClose} className="p-3 hover:bg-white/10 rounded-full transition-colors"><X size={28} /></button>
                  </div>

                  <div className="p-10 space-y-8 flex-1 overflow-y-auto scrollbar-hide">
                     {/* Escolha de Tipo de Unidade */}
                     <div className="space-y-4">
                        <label className="text-[11px] font-black text-gray-400 uppercase tracking-[3px] block text-center">Tipo de Unidade Operacional *</label>
                        <div className="flex bg-gray-100 p-1.5 rounded-[32px] max-w-sm mx-auto border-2 border-gray-100">
                           <button 
                             type="button"
                             onClick={() => setFormData({...formData, type: 'CANTINA'})}
                             className={`flex-1 py-3.5 rounded-[28px] font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${formData.type === 'CANTINA' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-600'}`}
                           >
                             <Store size={16} /> Cantina
                           </button>
                           <button 
                             type="button"
                             onClick={() => setFormData({...formData, type: 'RESTAURANTE'})}
                             className={`flex-1 py-3.5 rounded-[28px] font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${formData.type === 'RESTAURANTE' ? 'bg-orange-500 text-white shadow-lg' : 'text-gray-400 hover:text-gray-600'}`}
                           >
                             <Utensils size={16} /> Restaurante
                           </button>
                        </div>
                     </div>

                     {/* Informações da Filial */}
                     <div className="space-y-6 pt-4 border-t border-gray-50">
                        <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-[4px] border-b pb-2 flex items-center gap-2">
                           <ShieldCheck size={14}/> Dados Gerais
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <InputField label="Nome Fantasia *" value={formData.nomeFantasia} onChange={(v:string) => setFormData({...formData, nomeFantasia: v})} required placeholder="Ex: Cantina Central Alpha" />
                           <InputField label={isSuperAdmin ? "Nome do Proprietário *" : "Nome do Gerente Responsável *"} value={formData.managerName} onChange={(v:string) => setFormData({...formData, managerName: v})} required placeholder="Nome completo" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <InputField label="CNPJ Filial *" value={formData.document} onChange={(v:string) => setFormData({...formData, document: v})} required placeholder="00.000.000/0001-00" />
                           <InputField label="E-mail de Acesso (Login) *" type="email" value={formData.email} onChange={(v:string) => setFormData({...formData, email: v})} required placeholder="exemplo@email.com" />
                        </div>
                        
                        {formData.type === 'CANTINA' && (
                           <div className="animate-in slide-in-from-top-2 duration-300">
                             <InputField label="Nome da Instituição Anexada *" value={formData.attachedSchoolName} onChange={(v:string) => setFormData({...formData, attachedSchoolName: v})} required placeholder="Ex: Colégio Anglo Premium" icon={<School className="text-indigo-400" size={18}/>} />
                           </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <InputField label="WhatsApp da Unidade *" value={formData.phone1} onChange={(v:string) => setFormData({...formData, phone1: v})} required placeholder="(00) 90000-0000" />
                           <InputField label="Telefone Contato" value={formData.phone2} onChange={(v:string) => setFormData({...formData, phone2: v})} placeholder="(00) 0000-0000" />
                        </div>
                     </div>

                     {isSuperAdmin && (
                        <div className="space-y-6 pt-4 border-t border-gray-50">
                           <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-[4px] border-b pb-2 flex items-center gap-2">
                              <Sparkles size={14}/> Configuração SaaS
                           </h3>
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-1.5">
                                 <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Plano de Licença *</label>
                                 <select 
                                    value={formData.planType}
                                    onChange={e => setFormData({...formData, planType: e.target.value as any})}
                                    className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none font-bold text-gray-800 transition-all shadow-inner"
                                 >
                                    <option value="BASIC">BASIC</option>
                                    <option value="PRO">PRO</option>
                                    <option value="ENTERPRISE">ENTERPRISE</option>
                                 </select>
                              </div>
                              <InputField label="Mensalidade (R$) *" type="number" value={formData.monthlyFee.toString()} onChange={(v:string) => setFormData({...formData, monthlyFee: parseFloat(v) || 0})} required placeholder="450.00" />
                           </div>
                        </div>
                     )}

                     {/* Endereço Operacional Detalhado */}
                     <div className="space-y-6 pt-4 border-t border-gray-50">
                        <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-[4px] border-b pb-2 flex items-center gap-2">
                           <MapIcon size={14}/> Endereço Operacional
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                           <div className="md:col-span-1">
                             <InputField label="CEP *" value={formData.cep} onChange={(v:string) => setFormData({...formData, cep: v})} required placeholder="00000-000" />
                           </div>
                           <div className="md:col-span-2">
                             <InputField label="Logradouro (Rua/Av) *" value={formData.street} onChange={(v:string) => setFormData({...formData, street: v})} required placeholder="Rua das Flores" />
                           </div>
                           <div className="md:col-span-1">
                             <InputField label="Número *" value={formData.number} onChange={(v:string) => setFormData({...formData, number: v})} required placeholder="123" />
                           </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                           <InputField label="Bairro *" value={formData.neighborhood} onChange={(v:string) => setFormData({...formData, neighborhood: v})} required placeholder="Centro" />
                           <InputField label="Cidade *" value={formData.city} onChange={(v:string) => setFormData({...formData, city: v})} required placeholder="São Paulo" />
                           <InputField label="Estado (UF) *" value={formData.state} onChange={(v:string) => setFormData({...formData, state: v})} required placeholder="SP" />
                        </div>
                     </div>
                  </div>

                  <div className="p-8 bg-gray-50 border-t flex items-center justify-end gap-6 shrink-0">
                     <button type="button" onClick={resetFormAndClose} className="px-10 py-5 text-xs font-black text-gray-400 uppercase tracking-widest hover:text-gray-600 transition-colors">Descartar</button>
                     <button type="submit" className="px-12 py-5 bg-indigo-600 text-white rounded-[24px] font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-3">
                        <Save size={20} /> {isSuperAdmin ? 'Ativar Licença SaaS' : 'Salvar e Gerar Licença'}
                     </button>
                  </div>
                </form>
              ) : (
                <div className="p-12 flex flex-col items-center text-center space-y-10 animate-in zoom-in-95">
                   <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shadow-inner ring-8 ring-emerald-50">
                      <CheckCircle2 size={48} />
                   </div>
                   <div className="space-y-2">
                      <h2 className="text-3xl font-black text-gray-900 uppercase tracking-tight">
                        {isSuperAdmin ? 'Cliente Ativado!' : 'Unidade Ativada!'}
                      </h2>
                      <p className="text-gray-500 font-medium max-w-md mx-auto">
                        {isSuperAdmin ? 'A licença SaaS foi gerada com sucesso. O cliente já pode acessar o console de proprietário.' : 'A filial foi registrada com sucesso. Utilize as credenciais abaixo para o primeiro acesso da unidade.'}
                      </p>
                   </div>

                   <div className="w-full max-w-md bg-indigo-50 rounded-[40px] p-8 border-2 border-indigo-100 space-y-6 relative overflow-hidden">
                      <div className="space-y-5 relative z-10 text-left">
                         <div className="space-y-1">
                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">E-mail de Login</p>
                            <div className="w-full flex items-center justify-between bg-white px-5 py-4 rounded-2xl border border-indigo-100 shadow-sm">
                               <span className="font-bold text-gray-700 text-sm">{successData.email}</span>
                               <button onClick={() => {navigator.clipboard.writeText(successData.email); alert('Copiado!')}} className="text-indigo-400 hover:text-indigo-600 p-2"><Copy size={18}/></button>
                            </div>
                         </div>
                         <div className="space-y-1">
                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">Senha Padrão</p>
                            <div className="w-full flex items-center justify-between bg-white px-5 py-4 rounded-2xl border border-indigo-100 shadow-sm">
                               <span className="font-black text-indigo-600 text-lg tracking-widest">{successData.pass}</span>
                               <button onClick={() => {navigator.clipboard.writeText(successData.pass); alert('Copiado!')}} className="text-indigo-400 hover:text-indigo-600 p-2"><Copy size={18}/></button>
                            </div>
                         </div>
                      </div>
                   </div>

                   <button onClick={resetFormAndClose} className="px-14 py-5 bg-indigo-600 text-white rounded-[24px] font-black uppercase text-xs tracking-widest shadow-xl hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-3">
                      Concluir e Voltar <ArrowRight size={20} />
                   </button>
                </div>
              )}
           </div>
        </div>
      )}
    </div>
  );
};

const SaaSStatCard = ({ title, value, icon }: any) => (
  <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm hover:shadow-xl transition-all group">
    <div className="flex items-center justify-between mb-4">
      <div className="p-4 bg-gray-50 rounded-3xl group-hover:scale-110 transition-transform">
        {React.cloneElement(icon as React.ReactElement, { size: 24, strokeWidth: 3 })}
      </div>
    </div>
    <p className="text-gray-400 text-[10px] font-black uppercase tracking-[3px] mb-1">{title}</p>
    <p className="text-3xl font-black text-gray-900 tracking-tighter leading-none">{value}</p>
  </div>
);

const InputField = ({ label, value, onChange, placeholder, type = "text", required = false, icon }: any) => (
  <div className="space-y-1.5 relative">
    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{label}</label>
    <div className="relative">
      {icon && <div className="absolute left-4 top-1/2 -translate-y-1/2">{icon}</div>}
      <input 
        type={type}
        required={required}
        value={value} 
        onChange={e => onChange(e.target.value)} 
        className={`w-full ${icon ? 'pl-12' : 'px-6'} py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none font-bold text-gray-800 transition-all shadow-inner focus:bg-white`} 
        placeholder={placeholder} 
      />
    </div>
  </div>
);

export default EnterprisesPage;
