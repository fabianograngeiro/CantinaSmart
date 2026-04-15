import React, { useState, useEffect, useMemo } from 'react';
import {
  Home, Wallet, Apple, User,
  ArrowUpRight, History, Bell,
  CreditCard, Sparkles,
  ArrowRight, ChevronRight,
  Smartphone, UtensilsCrossed,
  Plus, X, CheckCircle2,
  AlertCircle, DollarSign,
  Calendar, ShoppingCart,
  ArrowDownRight, Clock,
  Copy, ListFilter, Search,
  Settings, Lock, Key, ShieldCheck, LogOut,
  HeartPulse, Beef, ChevronLeft, Calendar as CalendarIcon,
  PlusCircle, Trash2, Star, Check, Zap, Info,
  Building, Sun, Sunset, Moon, Menu
} from 'lucide-react';
import { ApiService } from '../services/api';
import { ClientPlanType, MenuItem, Plan, Enterprise, Client } from '../types';
import { resolveUserAvatar } from '../utils/avatar';
import { getResponsibleCpf, isStudentClient } from '../utils/clientDocument';

const MOCK_TODAY_HISTORY = [
  { id: 1, type: 'CONSUMPTION', item: 'Suco de Laranja', value: 8.50, time: '10:15', category: 'PREPAGO' },
  { id: 2, type: 'PLAN_USE', item: 'Kit Lanche Fixo', value: 1, time: '10:15', category: 'LANCHE_FIXO' },
  { id: 3, type: 'RECHARGE', item: 'Recarga Saldo', value: 50.00, time: '08:30', category: 'PREPAGO' },
  { id: 4, type: 'PLAN_USE', item: 'Almoço PF', value: 1, time: '12:30', category: 'PF_FIXO' },
];

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

type Period = 'MORNING' | 'AFTERNOON' | 'NIGHT';

interface ChildProfile {
  id: string;
  name: string;
  registration: string;
  class: string;
  balance: number;
  dailyLimit: number;
  restrictions: string[];
  dietaryNotes: string;
  photo: string;
  servicePlans: ClientPlanType[];
  planBalances: Record<string, number>;
  lancheDates: Record<Period, string[]>;
  almocoDates: Record<Period, string[]>;
  enterpriseId: string;
}

const ClientPortalPageDesktop: React.FC<{ enterpriseId?: string; currentUser?: any } | {}> = (props) => {
  const { enterpriseId, currentUser } = props as { enterpriseId?: string; currentUser?: any };
  const [children, setChildren] = useState<Client[]>([]);

  const [activeChildIndex, setActiveChildIndex] = useState(0);
  const [activeSection, setActiveSection] = useState<'DASHBOARD' | 'EXTRATOS' | 'ALUNOS' | 'CONFIGURACOES'>('DASHBOARD');
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [rechargeValue, setRechargeValue] = useState<string>('');
  const [rechargingPlan, setRechargingPlan] = useState<string | null>(null);
  const [isAddChildModalOpen, setIsAddChildModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [newChildForm, setNewChildForm] = useState({
    name: '',
    registrationId: '',
    class: '',
    dailyLimit: '30.00',
    restrictions: '',
    dietaryNotes: ''
  });

  // Modais
  const [isLoadingChildren, setIsLoadingChildren] = useState(true);

  // API Data
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  // Carregar clientes do backend
  useEffect(() => {
    if (!enterpriseId) {
      setChildren([]);
      setPlans([]);
      setLoading(false);
      setIsLoadingChildren(false);
      return;
    }

    const loadData = async () => {
      try {
        setIsLoadingChildren(true);
        const clientsData = await ApiService.getClients(enterpriseId);
        
        
        // Filtrar apenas ALUNOS que pertencem ao responsável logado
        const filteredClients = currentUser ? 
          (clientsData || []).filter(client => {
            const isStudent = client.type === 'ALUNO';
            const belongsToUser = 
              client.guardians?.includes(currentUser.id) || 
              client.guardianEmail === currentUser.email ||
              client.parentEmail === currentUser.email;
            
            return isStudent && belongsToUser;
          }) : [];
        
        setChildren(filteredClients);
        
        const [enterprisesData, plansData] = await Promise.all([
          ApiService.getEnterprises(),
          ApiService.getPlans(enterpriseId)
        ]);
        setEnterprises(enterprisesData);
        setPlans(plansData);
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
      } finally {
        setLoading(false);
        setIsLoadingChildren(false);
      }
    };
    loadData();
  }, [enterpriseId, currentUser]);

  const handleAddChild = async () => {
    
    if (!newChildForm.name || !newChildForm.registrationId) {
      alert('Preencha ao menos Nome e Matrícula');
      return;
    }

    if (!enterpriseId) {
      alert('Unidade não vinculada ao usuário. Contate o administrador.');
      return;
    }
    
    
    try {
      const newClient = await ApiService.createClient({
        ...newChildForm,
        type: 'ALUNO',
        servicePlans: [],
        balance: 0,
        spentToday: 0,
        isBlocked: false,
        restrictions: newChildForm.restrictions.split(',').map(r => r.trim()).filter(r => r),
        guardians: currentUser ? [currentUser.id] : [],
        guardianEmail: currentUser?.email,
        parentEmail: currentUser?.email,
        enterpriseId
      });
      
      setChildren([...children, newClient]);
      setNewChildForm({
        name: '',
        registrationId: '',
        class: '',
        dailyLimit: '30.00',
        restrictions: '',
        dietaryNotes: ''
      });
      setIsAddChildModalOpen(false);
      alert('Aluno adicionado com sucesso!');
    } catch (error: any) {
      console.error('Erro ao adicionar aluno:', error);
      console.error('Detalhes do erro:', error.message, error.stack);
      alert(`Erro ao adicionar aluno: ${error.message || 'Tente novamente.'}`);
    }
  };

  const handleDeleteChild = async (childId: string) => {
    try {
      await ApiService.deleteClient(childId);
      setChildren(children.filter(c => c.id !== childId));
      setDeleteConfirm(null);
      if (activeChildIndex >= children.filter(c => c.id !== childId).length) {
        setActiveChildIndex(Math.max(0, children.filter(c => c.id !== childId).length - 1));
      }
    } catch (error) {
      console.error('Erro ao deletar aluno:', error);
      alert('Erro ao deletar aluno. Tente novamente.');
    }
  };

  const activeChild = children[activeChildIndex];
  const guardianAvatar = resolveUserAvatar(currentUser?.avatar, currentUser?.name || currentUser?.email || 'Responsável');

  // Cálculos Consolidados - MUST be called before any conditional returns
  const lancheTotalDays: number = useMemo(() => {
    if (!activeChild) return 0;
    return (Object.values(activeChild.lancheDates || {}) as string[][]).reduce(
      (acc: number, dates: string[]): number => acc + (dates?.length || 0),
      0
    );
  }, [activeChild]);

  const almocoTotalDays: number = useMemo(() => {
    if (!activeChild) return 0;
    return (Object.values(activeChild.almocoDates || {}) as string[][]).reduce(
      (acc: number, dates: string[]): number => acc + (dates?.length || 0),
      0
    );
  }, [activeChild]);

  const lancheSubtotal: number = lancheTotalDays * 15.0;
  const almocoSubtotal: number = almocoTotalDays * 25.0;

  const currentPlanCosts = useMemo(() => {
    if (!activeChild) return 0;
    const lCost = (activeChild.servicePlans || []).includes('LANCHE_FIXO') ? lancheSubtotal : 0;
    const aCost = (activeChild.servicePlans || []).includes('PF_FIXO') ? almocoSubtotal : 0;
    return lCost + aCost;
  }, [activeChild, lancheSubtotal, almocoSubtotal]);

  const handleLogout = () => {
    ApiService.clearToken();
    window.location.hash = '#/';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin inline-block w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full"></div>
          <p className="text-slate-600 font-medium">Carregando dados...</p>
        </div>
      </div>
    );
  }

  if (!activeChild) {
    return (
      <>
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="text-center p-8 bg-white rounded-3xl shadow-xl max-w-md">
            <AlertCircle size={48} className="mx-auto text-indigo-600 mb-4" />
            <h2 className="text-xl font-black text-gray-800 uppercase">Nenhum aluno encontrado</h2>
            <p className="text-gray-500 mt-2">Você ainda não tem alunos cadastrados.</p>
            <button 
              onClick={() => setIsAddChildModalOpen(true)} 
              className="mt-6 px-8 py-3 bg-indigo-600 text-white rounded-xl font-black uppercase text-xs hover:bg-indigo-700 transition-all flex items-center gap-2 mx-auto"
            >
              <Plus size={18} /> Adicionar Aluno
            </button>
          </div>
        </div>

        {/* MODAL DE ADICIONAR ALUNO */}
        {isAddChildModalOpen && (
          <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsAddChildModalOpen(false)}></div>
            <div className="relative w-full max-w-md bg-white rounded-[32px] p-8 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-black text-gray-900">Adicionar Aluno</h2>
                <button
                  onClick={() => setIsAddChildModalOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase">Nome Completo</label>
                  <input
                    type="text"
                    value={newChildForm.name}
                    onChange={(e) => setNewChildForm({...newChildForm, name: e.target.value})}
                    placeholder="Ex: João Silva"
                    className="w-full mt-1 px-4 py-3 border border-gray-300 rounded-xl focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase">Matrícula</label>
                  <input
                    type="text"
                    value={newChildForm.registrationId}
                    onChange={(e) => setNewChildForm({...newChildForm, registrationId: e.target.value})}
                    placeholder="Ex: 2024.1234"
                    className="w-full mt-1 px-4 py-3 border border-gray-300 rounded-xl focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase">Série/Turma</label>
                  <input
                    type="text"
                    value={newChildForm.class}
                    onChange={(e) => setNewChildForm({...newChildForm, class: e.target.value})}
                    placeholder="Ex: 5º Ano A"
                    className="w-full mt-1 px-4 py-3 border border-gray-300 rounded-xl focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase">Limite Diário (R$)</label>
                  <input
                    type="number"
                    value={newChildForm.dailyLimit}
                    onChange={(e) => setNewChildForm({...newChildForm, dailyLimit: e.target.value})}
                    placeholder="30.00"
                    className="w-full mt-1 px-4 py-3 border border-gray-300 rounded-xl focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase">Restrições (separadas por vírgula)</label>
                  <input
                    type="text"
                    value={newChildForm.restrictions}
                    onChange={(e) => setNewChildForm({...newChildForm, restrictions: e.target.value})}
                    placeholder="Ex: Lactose, Glúten"
                    className="w-full mt-1 px-4 py-3 border border-gray-300 rounded-xl focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase">Notas Alimentares</label>
                  <textarea
                    value={newChildForm.dietaryNotes}
                    onChange={(e) => setNewChildForm({...newChildForm, dietaryNotes: e.target.value})}
                    placeholder="Ex: Diabético, prefere comida saudável"
                    className="w-full mt-1 px-4 py-3 border border-gray-300 rounded-xl focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 outline-none"
                    rows={3}
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setIsAddChildModalOpen(false)}
                    className="flex-1 px-4 py-3 bg-gray-100 text-gray-900 rounded-xl font-bold hover:bg-gray-200 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleAddChild}
                    className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-500 transition-all flex items-center justify-center gap-2"
                  >
                    <Plus size={18} /> Adicionar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-blue-50">
      <header className="sticky top-0 z-40 bg-gradient-to-r from-sky-700 to-blue-700 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
              <Building size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-black">Dashboard do Responsável</h1>
              <p className="text-xs font-bold text-sky-100 uppercase tracking-widest">Portal CantinaSmart</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-3 bg-white/15 px-3 py-2 rounded-xl">
              <img
                src={guardianAvatar}
                alt={currentUser?.name || 'Responsável'}
                className="w-9 h-9 rounded-lg object-cover border border-white/40"
              />
              <div>
                <p className="text-sm font-bold leading-tight">{currentUser?.name || 'Responsável'}</p>
                <p className="text-[11px] text-sky-100">Acesso por link seguro</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 bg-white/15 hover:bg-white/25 rounded-lg font-bold transition-all"
            >
              <LogOut size={18} /> Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-12 gap-8">
          <div className="col-span-12 lg:col-span-3 space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-blue-100 p-4 sticky top-24">
              <h2 className="text-xs font-black text-gray-500 uppercase tracking-[3px] mb-3">Menu</h2>
              <div className="space-y-2">
                <button
                  onClick={() => setActiveSection('DASHBOARD')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-black transition-all ${
                    activeSection === 'DASHBOARD' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Home size={16} /> Dashboard
                </button>
                <button
                  onClick={() => setActiveSection('EXTRATOS')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-black transition-all ${
                    activeSection === 'EXTRATOS' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <History size={16} /> Extratos
                </button>
                <button
                  onClick={() => setActiveSection('ALUNOS')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-black transition-all ${
                    activeSection === 'ALUNOS' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <User size={16} /> Alunos
                </button>
                <button
                  onClick={() => setActiveSection('CONFIGURACOES')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-black transition-all ${
                    activeSection === 'CONFIGURACOES' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Settings size={16} /> Configurações
                </button>
              </div>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-9 space-y-8">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-black text-gray-500 uppercase tracking-[3px]">Meus Alunos</h2>
                <button
                  onClick={() => setIsAddChildModalOpen(true)}
                  className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-all"
                  title="Adicionar aluno"
                >
                  <Plus size={18} />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {children.map((child, idx) => (
                  <div key={child.id} className="relative">
                    <button
                      onClick={() => setActiveChildIndex(idx)}
                      className={`w-full text-left p-4 rounded-xl transition-all border-2 ${
                        activeChildIndex === idx ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <img src={child.photo} alt={child.name} className="w-12 h-12 rounded-lg object-cover" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-gray-900 truncate">{child.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{child.class}</p>
                          <p className="text-xs text-gray-700 mt-2 font-semibold">Saldo: R$ {(child.balance || 0).toFixed(2)}</p>
                        </div>
                      </div>
                    </button>
                    {activeChildIndex === idx && (
                      <button
                        onClick={() => setDeleteConfirm(child.id)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-2 hover:bg-red-600 transition-all shadow-lg"
                        title="Deletar aluno"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* DASHBOARD SECTION */}
            {activeSection === 'DASHBOARD' && (
              <div className="space-y-6 animate-in fade-in">
                <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.95fr] gap-6">
                  <div className="bg-gradient-to-br from-sky-700 via-blue-700 to-indigo-700 rounded-[28px] p-8 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full -mr-40 -mt-40 blur-3xl"></div>
                    <div className="relative z-10 space-y-6">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sky-100 text-xs font-black uppercase tracking-[3px] mb-2">Dashboard Financeiro</p>
                          <h3 className="text-3xl font-black leading-tight">{activeChild?.name}</h3>
                          <p className="text-sm text-sky-100 mt-2">
                            {enterprises.find(enterprise => enterprise.id === activeChild.enterpriseId)?.name || 'Unidade Escolar'}
                          </p>
                        </div>
                        <div className="bg-white/15 rounded-2xl px-4 py-3 backdrop-blur-sm text-right">
                          <p className="text-[11px] uppercase font-black tracking-[2px] text-sky-100">Situação</p>
                          <p className="text-lg font-black">Ativo</p>
                        </div>
                      </div>

                      <div>
                        <p className="text-sky-100 text-sm font-bold uppercase tracking-wider mb-2">Saldo Disponível</p>
                        <p className="text-6xl font-black tracking-tight">R$ {(activeChild?.balance || 0).toFixed(2)}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <button
                          onClick={() => {
                            setRechargingPlan('PREPAGO');
                            setIsPlanModalOpen(true);
                          }}
                          className="bg-white/15 hover:bg-white/25 text-white py-3 px-4 rounded-xl font-bold uppercase text-xs transition-all backdrop-blur-sm"
                        >
                          <Plus size={16} className="inline mr-2" /> Recarregar
                        </button>
                        <button className="bg-white text-blue-700 py-3 px-4 rounded-xl font-bold uppercase text-xs hover:bg-slate-100 transition-all">
                          <Copy size={16} className="inline mr-2" /> Copiar dados
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-[28px] border border-blue-100 p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-5">
                      <h3 className="text-sm font-black text-gray-900 uppercase tracking-[2px]">Resumo do Aluno</h3>
                      <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                        <User size={18} />
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50">
                        <div>
                          <p className="text-[11px] font-black uppercase tracking-[2px] text-gray-400">Matrícula</p>
                          <p className="text-sm font-black text-gray-900 mt-1">{activeChild.registrationId || '-'}</p>
                        </div>
                        <ChevronRight size={18} className="text-gray-300" />
                      </div>
                      <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50">
                        <div>
                          <p className="text-[11px] font-black uppercase tracking-[2px] text-gray-400">Turma</p>
                          <p className="text-sm font-black text-gray-900 mt-1">{activeChild.class || 'Nao informada'}</p>
                        </div>
                        <ChevronRight size={18} className="text-gray-300" />
                      </div>
                      <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50">
                        <div>
                          <p className="text-[11px] font-black uppercase tracking-[2px] text-gray-400">Planos ativos</p>
                          <p className="text-sm font-black text-gray-900 mt-1">{(activeChild.servicePlans || []).filter(plan => plan !== 'PREPAGO').length || 0}</p>
                        </div>
                        <Star size={18} className="text-amber-500" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <div className="text-blue-600 mb-3">
                      <Wallet size={24} />
                    </div>
                    <p className="text-xs font-bold text-gray-500 uppercase mb-1">Limite Diário</p>
                    <p className="text-2xl font-black text-gray-900">R$ {(activeChild?.dailyLimit || 0).toFixed(2)}</p>
                  </div>

                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <div className="text-orange-600 mb-3">
                      <ShoppingCart size={24} />
                    </div>
                    <p className="text-xs font-bold text-gray-500 uppercase mb-1">Gasto Hoje</p>
                    <p className="text-2xl font-black text-gray-900">R$ {(activeChild?.spentToday || 0).toFixed(2)}</p>
                  </div>

                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <div className="text-emerald-600 mb-3">
                      <CheckCircle2 size={24} />
                    </div>
                    <p className="text-xs font-bold text-gray-500 uppercase mb-1">Status</p>
                    <p className="text-2xl font-black text-emerald-600">Ativo</p>
                  </div>

                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <div className="text-amber-600 mb-3">
                      <Star size={24} />
                    </div>
                    <p className="text-xs font-bold text-gray-500 uppercase mb-1">Valor de Planos</p>
                    <p className="text-2xl font-black text-gray-900">R$ {currentPlanCosts.toFixed(2)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.95fr] gap-6">
                  <div className="bg-white rounded-[28px] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                      <h3 className="text-sm font-black text-gray-900 uppercase tracking-[2px] flex items-center gap-2">
                        <History size={18} className="text-blue-600" /> Ultimos Lancamentos
                      </h3>
                      <button
                        onClick={() => setActiveSection('EXTRATOS')}
                        className="text-xs font-black uppercase tracking-[2px] text-blue-600 hover:text-blue-700"
                      >
                        Ver extrato
                      </button>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {MOCK_TODAY_HISTORY.slice(0, 6).map(item => (
                        <div key={item.id} className="px-6 py-4 grid grid-cols-[auto_1fr_auto] gap-4 items-center hover:bg-slate-50 transition-all">
                          <div
                            className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
                              item.type === 'CONSUMPTION'
                                ? 'bg-orange-100 text-orange-600'
                                : item.type === 'RECHARGE'
                                ? 'bg-emerald-100 text-emerald-600'
                                : 'bg-blue-100 text-blue-600'
                            }`}
                          >
                            {item.type === 'CONSUMPTION' && <ArrowUpRight size={16} />}
                            {item.type === 'RECHARGE' && <Plus size={16} />}
                            {item.type === 'PLAN_USE' && <Check size={16} />}
                          </div>
                          <div>
                            <p className="text-sm font-black text-gray-900">{item.item}</p>
                            <p className="text-xs text-gray-500 uppercase tracking-[1px]">{item.time} • {item.category}</p>
                          </div>
                          <p className={`text-sm font-black ${item.type === 'RECHARGE' ? 'text-emerald-600' : 'text-orange-600'}`}>
                            {item.type === 'PLAN_USE'
                              ? `-${item.value} un`
                              : `${item.type === 'RECHARGE' ? '+' : '-'}R$ ${(item.value || 0).toFixed(2)}`}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-white rounded-[28px] p-6 shadow-sm border border-gray-100">
                      <h3 className="text-sm font-black text-gray-900 mb-4 flex items-center gap-2 uppercase tracking-[2px]">
                        <Star size={18} className="text-amber-600" /> Planos Ativos
                      </h3>
                      <div className="space-y-3">
                        {(activeChild.servicePlans || []).filter(plan => plan !== 'PREPAGO').length > 0 ? (
                          (activeChild.servicePlans || [])
                            .filter(plan => plan !== 'PREPAGO')
                            .map(plan => (
                              <div key={plan} className="rounded-2xl border border-gray-100 p-4 bg-slate-50">
                                <div className="flex items-center justify-between mb-3">
                                  <div>
                                    <p className="text-sm font-black text-gray-900 uppercase">
                                      {plan === 'LANCHE_FIXO' ? 'Kit Lanche' : 'Almoco PF'}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1">Saldo disponivel</p>
                                  </div>
                                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${plan === 'LANCHE_FIXO' ? 'bg-amber-100 text-amber-600' : 'bg-orange-100 text-orange-600'}`}>
                                    {plan === 'LANCHE_FIXO' ? <UtensilsCrossed size={18} /> : <Beef size={18} />}
                                  </div>
                                </div>
                                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
                                  <div
                                    className={`h-full ${plan === 'LANCHE_FIXO' ? 'bg-amber-500' : 'bg-orange-500'}`}
                                    style={{ width: `${Math.min(100, ((activeChild.planBalances || {})[plan] || 0) * 10)}%` }}
                                  ></div>
                                </div>
                                <p className="text-sm font-black text-gray-900">
                                  {(activeChild.planBalances || {})[plan] || 0} {plan === 'LANCHE_FIXO' ? 'lanches' : 'refeicoes'}
                                </p>
                              </div>
                            ))
                        ) : (
                          <div className="rounded-2xl border border-dashed border-gray-200 p-5 text-center text-sm font-bold text-gray-400">
                            Nenhum plano fixo ativo.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-[28px] p-6 text-white shadow-sm">
                      <p className="text-[11px] font-black uppercase tracking-[2px] text-slate-300 mb-2">Informacoes de Saude</p>
                      <p className="text-lg font-black mb-3">{activeChild.restrictions.length > 0 ? activeChild.restrictions.join(', ') : 'Sem restricoes cadastradas'}</p>
                      <p className="text-sm text-slate-300">{activeChild.dietaryNotes || 'Nenhuma observacao alimentar registrada para este aluno.'}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ALUNOS SECTION */}
            {activeSection === 'ALUNOS' && (
              <div className="space-y-6 animate-in fade-in">
                <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
                  <h3 className="text-lg font-black text-gray-900 mb-6">Alunos e Planos</h3>
                  <div className="space-y-6">
                    {(activeChild.servicePlans || []).map(plan => (
                      <div key={plan} className="border-l-4 border-indigo-600 pl-6 py-4">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h4 className="text-lg font-bold text-gray-900">
                              {plan === 'LANCHE_FIXO'
                                ? 'Kit Lanche Fixo'
                                : plan === 'PF_FIXO'
                                ? 'Almoço PF (Fixo)'
                                : 'Pré-pago'}
                            </h4>
                            <p className="text-sm text-gray-600 mt-1">Plano ativo desde janeiro de 2025</p>
                          </div>
                          <button className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold text-sm hover:bg-indigo-500 transition-all">
                            Gerenciar
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-4 mt-4">
                          <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-xs text-gray-600 uppercase font-bold mb-1">Saldo Atual</p>
                            <p className="text-xl font-black text-gray-900">{(activeChild.planBalances || {})[plan] || 0}</p>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-xs text-gray-600 uppercase font-bold mb-1">Custo Mensal</p>
                            <p className="text-xl font-black text-gray-900">R$ {(currentPlanCosts / 2).toFixed(2)}</p>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-xs text-gray-600 uppercase font-bold mb-1">Próx. Cobrança</p>
                            <p className="text-xl font-black text-gray-900">05/04</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* EXTRATOS SECTION */}
            {activeSection === 'EXTRATOS' && (
              <div className="space-y-6 animate-in fade-in">
                <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
                  <h3 className="text-lg font-black text-gray-900 mb-6">Extrato de Transações</h3>
                  <div className="space-y-2">
                    {[...MOCK_TODAY_HISTORY, ...MOCK_TODAY_HISTORY].map((item, idx) => (
                      <div key={idx} className="p-4 bg-gray-50 rounded-lg flex items-center justify-between hover:bg-gray-100 transition-all">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                              item.type === 'CONSUMPTION'
                                ? 'bg-orange-100 text-orange-600'
                                : 'bg-emerald-100 text-emerald-600'
                            }`}
                          >
                            {item.type === 'CONSUMPTION' ? (
                              <ShoppingCart size={20} />
                            ) : (
                              <Plus size={20} />
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-gray-900">{item.item}</p>
                            <p className="text-sm text-gray-500">
                              {new Date().toLocaleDateString('pt-BR')} às {item.time}
                            </p>
                          </div>
                        </div>
                        <p className="text-lg font-black text-orange-600">-R$ {(item.value || 0).toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* CONFIGURACOES SECTION */}
            {activeSection === 'CONFIGURACOES' && (
              <div className="space-y-6 animate-in fade-in">
                <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
                  <h3 className="text-lg font-black text-gray-900 mb-6">Configurações</h3>

                  {/* PROFILE INFO */}
                  <div className="mb-8 pb-8 border-b border-gray-200">
                    <h4 className="text-sm font-black text-gray-900 uppercase mb-4">Dados do Responsável</h4>
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="text-xs font-bold text-gray-600 uppercase">Nome Completo</label>
                        <input
                          type="text"
                          value={currentUser?.name || ''}
                          disabled
                          className="mt-2 w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 font-medium"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-600 uppercase">Email</label>
                        <input
                          type="email"
                          value={currentUser?.email || ''}
                          disabled
                          className="mt-2 w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 font-medium"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-600 uppercase">Telefone</label>
                        <input
                          type="tel"
                          value={currentUser?.phone || currentUser?.whatsapp || ''}
                          disabled
                          className="mt-2 w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 font-medium"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-600 uppercase">{isStudentClient(currentUser) ? 'CPF do Responsável' : 'CPF'}</label>
                        <input
                          type="text"
                          value={getResponsibleCpf(currentUser)}
                          disabled
                          className="mt-2 w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 font-medium"
                        />
                      </div>
                    </div>
                  </div>

                  {/* RESTRICTIONS */}
                  <div className="mb-8 pb-8 border-b border-gray-200">
                    <h4 className="text-sm font-black text-gray-900 uppercase mb-4">Informações de Saúde</h4>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-bold text-gray-600 uppercase">Restrições Alimentares</label>
                        <div className="mt-2 space-y-2">
                          {activeChild.restrictions.length > 0 ? (
                            activeChild.restrictions.map(res => (
                              <span key={res} className="inline-block bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold">
                                {res}
                              </span>
                            ))
                          ) : (
                            <p className="text-gray-600">Nenhuma restrição cadastrada</p>
                          )}
                        </div>
                      </div>
                      {activeChild.dietaryNotes && (
                        <div>
                          <label className="text-xs font-bold text-gray-600 uppercase">Notas Alimentares</label>
                          <p className="mt-2 text-gray-700 bg-yellow-50 p-3 rounded-lg">{activeChild.dietaryNotes}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* SECURITY */}
                  <div>
                    <h4 className="text-sm font-black text-gray-900 uppercase mb-4">Segurança</h4>
                    <button className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-bold hover:bg-blue-500 transition-all">
                      <Lock size={16} className="inline mr-2" /> Alterar Senha
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* MODAL DE DELETE */}
        {deleteConfirm && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)}></div>
            <div className="relative bg-white rounded-[32px] p-6 max-w-sm shadow-2xl animate-in zoom-in-95">
              <h3 className="text-lg font-black text-gray-900 mb-4">Deletar Aluno?</h3>
              <p className="text-gray-600 mb-6">Tem certeza que deseja remover este aluno? Esta ação não pode ser desfeita.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 px-4 py-3 bg-gray-100 text-gray-900 rounded-xl font-bold hover:bg-gray-200 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleDeleteChild(deleteConfirm)}
                  className="flex-1 px-4 py-3 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-all"
                >
                  Deletar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL DE ADICIONAR ALUNO */}
        {isAddChildModalOpen && (
          <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsAddChildModalOpen(false)}></div>
            <div className="relative w-full max-w-md bg-white rounded-[32px] p-8 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-black text-gray-900">Adicionar Aluno</h2>
                <button
                  onClick={() => setIsAddChildModalOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase">Nome Completo</label>
                  <input
                    type="text"
                    value={newChildForm.name}
                    onChange={(e) => setNewChildForm({...newChildForm, name: e.target.value})}
                    placeholder="Ex: João Silva"
                    className="w-full mt-1 px-4 py-3 border border-gray-300 rounded-xl focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase">Matrícula</label>
                  <input
                    type="text"
                    value={newChildForm.registrationId}
                    onChange={(e) => setNewChildForm({...newChildForm, registrationId: e.target.value})}
                    placeholder="Ex: 2024.1234"
                    className="w-full mt-1 px-4 py-3 border border-gray-300 rounded-xl focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase">Série/Turma</label>
                  <input
                    type="text"
                    value={newChildForm.class}
                    onChange={(e) => setNewChildForm({...newChildForm, class: e.target.value})}
                    placeholder="Ex: 5º Ano A"
                    className="w-full mt-1 px-4 py-3 border border-gray-300 rounded-xl focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase">Limite Diário (R$)</label>
                  <input
                    type="number"
                    value={newChildForm.dailyLimit}
                    onChange={(e) => setNewChildForm({...newChildForm, dailyLimit: e.target.value})}
                    placeholder="30.00"
                    className="w-full mt-1 px-4 py-3 border border-gray-300 rounded-xl focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase">Restrições (separadas por vírgula)</label>
                  <input
                    type="text"
                    value={newChildForm.restrictions}
                    onChange={(e) => setNewChildForm({...newChildForm, restrictions: e.target.value})}
                    placeholder="Ex: Lactose, Glúten"
                    className="w-full mt-1 px-4 py-3 border border-gray-300 rounded-xl focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase">Notas Alimentares</label>
                  <textarea
                    value={newChildForm.dietaryNotes}
                    onChange={(e) => setNewChildForm({...newChildForm, dietaryNotes: e.target.value})}
                    placeholder="Ex: Diabético, prefere comida saudável"
                    className="w-full mt-1 px-4 py-3 border border-gray-300 rounded-xl focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 outline-none"
                    rows={3}
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setIsAddChildModalOpen(false)}
                    className="flex-1 px-4 py-3 bg-gray-100 text-gray-900 rounded-xl font-bold hover:bg-gray-200 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      handleAddChild();
                    }}
                    className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-500 transition-all flex items-center justify-center gap-2"
                  >
                    <Plus size={18} /> Adicionar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default ClientPortalPageDesktop;
