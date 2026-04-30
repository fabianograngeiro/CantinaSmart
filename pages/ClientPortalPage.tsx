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
  Building, Sun, Sunset, Moon
} from 'lucide-react';
import { ApiService } from '../services/api';
import { ClientPlanType, MenuItem, Plan, Enterprise, Client } from '../types';
import { resolveUserAvatar } from '../utils/avatar';

const MOCK_TODAY_HISTORY = [
  { id: 1, type: 'CONSUMPTION', item: 'Suco de Laranja', value: 8.50, time: '10:15', category: 'PREPAGO' },
  { id: 2, type: 'PLAN_USE', item: 'Kit Lanche Fixo', value: 1, time: '10:15', category: 'LANCHE_FIXO' },
  { id: 3, type: 'RECHARGE', item: 'Recarga Saldo', value: 50.00, time: '08:30', category: 'PREPAGO', payerResponsibleName: 'Responsável Principal' },
  { id: 4, type: 'PLAN_USE', item: 'Almoço PF', value: 1, time: '12:30', category: 'PF_FIXO' },
];

const MONTH_OPTIONS = [
  { value: 1, label: 'Janeiro' },
  { value: 2, label: 'Fevereiro' },
  { value: 3, label: 'Março' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Maio' },
  { value: 6, label: 'Junho' },
  { value: 7, label: 'Julho' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Setembro' },
  { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro' },
  { value: 12, label: 'Dezembro' },
];

const CONTEST_SUBJECT_OPTIONS = [
  { value: 'SALDO', label: 'Saldo' },
  { value: 'DUPLICIDADE', label: 'Duplicidade' },
  { value: 'PERIODO', label: 'Periodo' },
  { value: 'AUSENTE', label: 'Ausente' },
  { value: 'COBRANCA', label: 'Cobranca' },
] as const;

type HistoryFilterMode = 'MONTH' | 'YEAR';
type ContestSubject = typeof CONTEST_SUBJECT_OPTIONS[number]['value'];

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseTransactionDate = (tx: any) => {
  const raw = String(tx?.date || tx?.timestamp || tx?.time || '').trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const formatTransactionItem = (tx: any) => {
  const type = String(tx?.type || '').toUpperCase();
  if (String(tx?.item || '').trim()) return String(tx.item);
  if (String(tx?.description || '').trim()) return String(tx.description);
  if (type.includes('CREDIT') || type.includes('CREDITO') || type.includes('RECHARGE')) return 'Recarga de saldo';
  if (type.includes('PLAN_USE') || type.includes('PLANO')) return 'Uso de plano';
  return 'Consumo';
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
  planBalances: Record<string, number>; // Saldo específico por plano
  // Datas agora separadas por período
  lancheDates: Record<Period, string[]>;
  almocoDates: Record<Period, string[]>;
  enterpriseId: string;
}

const ClientPortalPage: React.FC<{ enterpriseId?: string; currentUser?: any } | {}> = (props) => {
  const { enterpriseId, currentUser } = props as { enterpriseId?: string; currentUser?: any };
  const [children, setChildren] = useState<Client[]>([]);

  const [activeChildIndex, setActiveChildIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'EXTRATOS' | 'ALUNOS' | 'CONFIGURACOES'>('DASHBOARD');
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
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isPlanCheckout, setIsPlanCheckout] = useState(false);
  const [rechargeValue, setRechargeValue] = useState<string>('');
  const [rechargingPlan, setRechargingPlan] = useState<string | null>(null);
  const [isLoadingChildren, setIsLoadingChildren] = useState(true);
  const [activePeriods, setActivePeriods] = useState({
    LANCHE_FIXO: ['MORNING'] as const,
    PF_FIXO: ['AFTERNOON'] as const
  });

  // API Data
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [weeklyMenu, setWeeklyMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);

  const now = new Date();
  const [historyFilterMode, setHistoryFilterMode] = useState<HistoryFilterMode>('MONTH');
  const [selectedHistoryMonth, setSelectedHistoryMonth] = useState(now.getMonth() + 1);
  const [selectedHistoryYear, setSelectedHistoryYear] = useState(now.getFullYear());

  const [isContestScreenOpen, setIsContestScreenOpen] = useState(false);
  const [selectedContestTransaction, setSelectedContestTransaction] = useState<any | null>(null);
  const [contestSubject, setContestSubject] = useState<ContestSubject>('SALDO');
  const [contestReason, setContestReason] = useState('');
  const [isSubmittingContest, setIsSubmittingContest] = useState(false);
  const [contestFeedbackMessage, setContestFeedbackMessage] = useState('');

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
        setWeeklyMenu([]);
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
      } finally {
        setLoading(false);
        setIsLoadingChildren(false);
      }
    };
    loadData();
  }, [enterpriseId, currentUser]);

  useEffect(() => {
    const loadTransactions = async () => {
      const selectedChild = children[activeChildIndex];
      if (!selectedChild?.id) {
        setTransactions([]);
        return;
      }

      try {
        setIsLoadingTransactions(true);
        const txData = await ApiService.getTransactions({
          clientId: selectedChild.id,
          enterpriseId: selectedChild.enterpriseId,
        });
        setTransactions(Array.isArray(txData) ? txData : []);
      } catch (error) {
        console.error('Erro ao carregar transacoes do portal:', error);
        setTransactions([]);
      } finally {
        setIsLoadingTransactions(false);
      }
    };

    loadTransactions();
  }, [children, activeChildIndex]);

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
    return (Object.values(activeChild.lancheDates || {}) as string[][]).reduce((acc: number, dates: string[]): number => acc + (dates?.length || 0), 0);
  }, [activeChild]);

  const almocoTotalDays: number = useMemo(() => {
    if (!activeChild) return 0;
    return (Object.values(activeChild.almocoDates || {}) as string[][]).reduce((acc: number, dates: string[]): number => acc + (dates?.length || 0), 0);
  }, [activeChild]);

  const lancheSubtotal: number = lancheTotalDays * 15.0;
  const almocoSubtotal: number = almocoTotalDays * 25.0;

  const currentPlanCosts = useMemo(() => {
    if (!activeChild) return 0;
    const lCost = (activeChild.servicePlans || []).includes('LANCHE_FIXO') ? lancheSubtotal : 0;
    const aCost = (activeChild.servicePlans || []).includes('PF_FIXO') ? almocoSubtotal : 0;
    return lCost + aCost;
  }, [activeChild, lancheSubtotal, almocoSubtotal]);

  const filteredMenu = useMemo(() => {
    return weeklyMenu;
  }, [weeklyMenu]);

  const historyYearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    for (let year = currentYear; year >= 2025; year -= 1) {
      years.push(year);
    }
    return years;
  }, []);

  const normalizedTransactions = useMemo(() => {
    const source = transactions.length > 0 ? transactions : MOCK_TODAY_HISTORY;
    return source
      .map((tx: any, index: number) => {
        const parsedDate = parseTransactionDate(tx) || new Date();
        const rawAmount = Number(tx?.total ?? tx?.amount ?? tx?.value ?? 0) || 0;
        const type = String(tx?.type || '').toUpperCase();
        const isCredit = type.includes('CREDIT') || type.includes('CREDITO') || type.includes('RECHARGE');
        return {
          id: String(tx?.id || `mock-${index}`),
          item: formatTransactionItem(tx),
          description: String(tx?.description || ''),
          method: String(tx?.paymentMethod || tx?.method || tx?.category || ''),
          payerResponsibleName: String(tx?.payerResponsibleName || ''),
          date: parsedDate,
          amount: rawAmount,
          signedAmount: isCredit ? rawAmount : -Math.abs(rawAmount),
          isCredit,
          raw: tx,
        };
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    return normalizedTransactions.filter((tx) => {
      const txYear = tx.date.getFullYear();
      if (txYear !== selectedHistoryYear) return false;
      if (historyFilterMode === 'YEAR') return true;
      return tx.date.getMonth() + 1 === selectedHistoryMonth;
    });
  }, [normalizedTransactions, historyFilterMode, selectedHistoryMonth, selectedHistoryYear]);

  const openContestationScreen = (tx: any) => {
    setSelectedContestTransaction(tx);
    setContestSubject('SALDO');
    setContestReason('');
    setContestFeedbackMessage('');
    setIsContestScreenOpen(true);
  };

  const handleSubmitContestation = async () => {
    const reason = contestReason.trim();
    if (!selectedContestTransaction) {
      return;
    }
    if (!reason) {
      setContestFeedbackMessage('Preencha o campo Motivo para enviar a contestacao.');
      return;
    }

    try {
      setIsSubmittingContest(true);
      setContestFeedbackMessage('');

      const subjectLabel = CONTEST_SUBJECT_OPTIONS.find((option) => option.value === contestSubject)?.label || 'Outro';
      const contestDescription = [
        `Motivo informado: ${reason}`,
        `Transacao: ${selectedContestTransaction.item}`,
        `Data/Hora: ${selectedContestTransaction.date.toLocaleString('pt-BR')}`,
        `Valor: ${selectedContestTransaction.signedAmount >= 0 ? '+' : '-'}R$ ${Math.abs(selectedContestTransaction.signedAmount).toFixed(2)}`,
        `Metodo: ${selectedContestTransaction.method || 'Nao informado'}`,
      ].join(' | ');

      await ApiService.createContestation({
        enterpriseId: activeChild?.enterpriseId,
        enterpriseName: enterprises.find((ent) => ent.id === activeChild?.enterpriseId)?.name,
        clientId: activeChild?.id,
        clientName: activeChild?.name,
        subject: `Contestacao - ${subjectLabel}`,
        description: contestDescription,
        type: contestSubject,
        priority: 'MEDIA',
        amount: Math.abs(selectedContestTransaction.signedAmount),
        transactionId: selectedContestTransaction.id,
        transactionDate: selectedContestTransaction.date.toISOString(),
        paymentMethod: selectedContestTransaction.method || '',
        portalSource: true,
      });

      setContestFeedbackMessage('Contestacao enviada com sucesso. O retorno sera enviado no WhatsApp do responsavel.');
      setContestReason('');
      window.setTimeout(() => {
        setIsContestScreenOpen(false);
        setSelectedContestTransaction(null);
      }, 900);
    } catch (error) {
      console.error('Erro ao enviar contestacao:', error);
      setContestFeedbackMessage('Nao foi possivel enviar a contestacao agora. Tente novamente.');
    } finally {
      setIsSubmittingContest(false);
    }
  };

  if (!activeChild) {
    return (
      <>
        <div className="flex items-center justify-center h-screen bg-gray-100">
          <div className="text-center p-8 bg-white rounded-3xl shadow-xl">
            <AlertCircle size={48} className="mx-auto text-indigo-600 mb-4" />
            <h2 className="text-xl font-black text-gray-800 uppercase">Nenhum aluno encontrado</h2>
            <p className="text-gray-500 mt-2">Você ainda não tem alunos cadastrados.</p>
            <button 
              onClick={() => setIsAddChildModalOpen(true)} 
              className="mt-6 px-8 py-3 bg-indigo-600 text-white rounded-xl font-black uppercase text-xs hover:bg-indigo-700 transition-all"
            >
              <Plus size={18} className="inline mr-2" /> Adicionar Aluno
            </button>
          </div>
        </div>

        {/* MODAL DE ADICIONAR ALUNO */}
        {isAddChildModalOpen && (
          <div className="fixed inset-0 z-[1500] flex items-end">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsAddChildModalOpen(false)}></div>
            <div className="relative w-full bg-white rounded-t-[32px] p-6 animate-in slide-in-from-bottom-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-black text-gray-900">Adicionar Aluno</h2>
                <button
                  onClick={() => setIsAddChildModalOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <X size={24} />
                </button>
              </div>
              
              <div className="space-y-4 max-w-md mx-auto">
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
                    placeholder="Ex: Diabetico, prefere comida saudável"
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
      </>
    );
  }

  const updateActiveChild = (updates: Partial<ChildProfile>) => {
    const newChildren = [...children];
    newChildren[activeChildIndex] = { ...newChildren[activeChildIndex], ...updates };
    setChildren(newChildren);
    localStorage.setItem('canteen_registered_students', JSON.stringify(newChildren));
  };

  const toggleRestriction = (res: string) => {
    const current = activeChild.restrictions || [];
    const next = current.includes(res) ? current.filter(r => r !== res) : [...current, res];
    updateActiveChild({ restrictions: next });
  };

  const toggleServicePlan = (plan: ClientPlanType) => {
    const current = activeChild.servicePlans || [];
    const next = current.includes(plan) ? current.filter(p => p !== plan) : [...current, plan];
    updateActiveChild({ servicePlans: next });
  };

  const togglePeriod = (plan: 'LANCHE_FIXO' | 'PF_FIXO', period: Period) => {
    setActivePeriods(prev => {
      const current = prev[plan] || [];
      const next = current.includes(period) ? current.filter(p => p !== period) : [...current, period];
      return { ...prev, [plan]: next };
    });
  };

  const toggleDate = (date: Date, type: 'LANCHE' | 'ALMOCO', period: Period) => {
    const dateStr = formatLocalDate(date);
    if (date.getDay() === 0 || date.getDay() === 6) return;
    const field = type === 'LANCHE' ? 'lancheDates' : 'almocoDates';
    
    const currentDates = { ...(activeChild[field] || { MORNING: [], AFTERNOON: [], NIGHT: [] }) };
    const periodDates = currentDates[period] || [];
    
    const nextPeriodDates = periodDates.includes(dateStr) 
      ? periodDates.filter(d => d !== dateStr) 
      : [...periodDates, dateStr];
    
    currentDates[period] = nextPeriodDates;
    updateActiveChild({ [field]: currentDates });
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'DASHBOARD':
        return (
          <div className="space-y-6 pb-40 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-y-auto">
            {/* CARD DE SALDO MASTER */}
            <div className="p-8 rounded-[48px] shadow-2xl relative overflow-hidden text-white bg-slate-900 border-b-8 border-indigo-600 mx-1">
              <div className="relative z-10 space-y-6">
                <div className="flex justify-between items-start">
                   <div>
                     <p className="text-[10px] font-black uppercase tracking-[4px] text-indigo-400 mb-1">Saldo Crédito Cantina</p>
                     <p className="text-5xl font-black tracking-tighter">R$ {(activeChild?.balance || 0).toFixed(2)}</p>
                   </div>
                   <div className="bg-white/10 p-4 rounded-3xl border border-white/10 backdrop-blur-md">
                      <Wallet size={28} className="text-indigo-400" />
                   </div>
                </div>
                <div className="flex items-center justify-between pt-6 border-t border-white/5">
                   <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-500/20 rounded-xl"><Zap size={14} className="text-emerald-400" /></div>
                      <div>
                         <p className="text-[9px] font-bold uppercase text-gray-500">Carteira Digital</p>
                         <p className="text-xs font-black text-emerald-400 uppercase tracking-widest">Liberada</p>
                      </div>
                   </div>
                   <button onClick={() => { setRechargingPlan('PREPAGO'); setIsPlanModalOpen(true); setIsPlanCheckout(false); }} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl text-xs font-black shadow-xl hover:bg-indigo-500 transition-all flex items-center gap-2 active:scale-95">
                      RECARREGAR <Plus size={16} />
                   </button>
                </div>
              </div>
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
            </div>

            {/* CARDS DE RESUMO */}
            <div className="grid grid-cols-3 gap-3 mx-1">
              <div className="bg-white rounded-[28px] p-4 border border-gray-100 shadow-sm">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-[3px]">Limite</p>
                <p className="text-lg font-black text-gray-900 mt-2">R$ {(activeChild?.dailyLimit || 0).toFixed(2)}</p>
              </div>
              <div className="bg-white rounded-[28px] p-4 border border-gray-100 shadow-sm">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-[3px]">Gasto Hoje</p>
                <p className="text-lg font-black text-gray-900 mt-2">R$ {(activeChild?.spentToday || 0).toFixed(2)}</p>
              </div>
              <div className="bg-white rounded-[28px] p-4 border border-gray-100 shadow-sm">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-[3px]">Planos</p>
                <p className="text-lg font-black text-gray-900 mt-2">{(activeChild.servicePlans || []).filter(p => p !== 'PREPAGO').length}</p>
              </div>
            </div>

            {/* ATALHOS RÁPIDOS */}
            <div className="grid grid-cols-2 gap-4 mx-1">
               <ShortcutCard onClick={() => setActiveTab('EXTRATOS')} icon={<History size={24} className="text-indigo-600" />} label="Extratos" desc="Ver movimentações" color="bg-white" />
               <ShortcutCard onClick={() => setActiveTab('ALUNOS')} icon={<User size={24} className="text-indigo-600" />} label="Alunos" desc="Planos e saúde" color="bg-white" />
            </div>

            {/* MEUS PLANOS ATIVOS */}
            <div className="space-y-4 mx-1">
               <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[3px] ml-4">Meus Planos Ativos</h3>
               <div className="grid grid-cols-1 gap-3">
                  {(activeChild.servicePlans || []).filter(p => p !== 'PREPAGO').map(plan => (
                    <div key={plan} className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm flex items-center justify-between group hover:shadow-md transition-all">
                       <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${plan === 'LANCHE_FIXO' ? 'bg-amber-50 text-amber-600' : 'bg-orange-50 text-orange-600'}`}>
                             {plan === 'LANCHE_FIXO' ? <UtensilsCrossed size={20} /> : <Beef size={20} />}
                          </div>
                          <div>
                             <p className="text-xs font-black text-gray-800 uppercase tracking-tight">{plan === 'LANCHE_FIXO' ? 'Kit Lanche Fixo' : 'Almoço PF (Fixo)'}</p>
                             <p className="text-[9px] font-bold text-gray-400 uppercase mt-0.5">Saldo: {(activeChild.planBalances || {})[plan] || 0} {plan === 'LANCHE_FIXO' ? 'Lanches' : 'Refeições'}</p>
                          </div>
                       </div>
                       <button 
                         onClick={() => { setIsPlanModalOpen(true); setIsPlanCheckout(false); }}
                         className={`p-3 rounded-xl text-white shadow-lg active:scale-95 transition-all ${plan === 'LANCHE_FIXO' ? 'bg-amber-600' : 'bg-orange-600'}`}
                       >
                          <Plus size={16} />
                       </button>
                    </div>
                  ))}
                  {(activeChild.servicePlans || []).filter(p => p !== 'PREPAGO').length === 0 && (
                    <div className="bg-gray-50/50 p-8 rounded-[32px] border border-dashed border-gray-200 text-center">
                       <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Nenhum plano fixo ativo</p>
                    </div>
                  )}
               </div>
            </div>

            {/* INFORMAÇÕES DA UNIDADE DO ALUNO */}
            <div className="bg-white p-6 rounded-[32px] border border-gray-100 flex items-center justify-between mx-1 shadow-sm">
               <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center"><Building size={20}/></div>
                  <div>
                     <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Matriculado em:</p>
                     <p className="text-sm font-black text-gray-800 uppercase tracking-tight">{enterprises.find(e => e.id === activeChild.enterpriseId)?.name || 'Unidade Escolar'}</p>
                  </div>
               </div>
               <Info size={18} className="text-indigo-200" />
            </div>

            {/* ATIVIDADES RECENTES */}
            <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm space-y-6 mx-1">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-gray-800 uppercase tracking-widest flex items-center gap-2">
                  <Clock size={16} className="text-indigo-600" /> Histórico de hoje
                </h3>
              </div>
              <div className="space-y-4">
                {MOCK_TODAY_HISTORY.map(item => (
                  <div key={item.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100 group hover:bg-white hover:shadow-md transition-all">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${
                        item.type === 'RECHARGE' ? 'bg-green-100 text-green-600' : 
                        item.type === 'PLAN_USE' ? (item.category === 'PF_FIXO' ? 'bg-orange-100 text-orange-600' : 'bg-amber-100 text-amber-600') : 
                        'bg-indigo-100 text-indigo-600'
                      }`}>
                        {item.type === 'RECHARGE' ? <ArrowUpRight size={16} /> : 
                         item.type === 'PLAN_USE' ? (item.category === 'PF_FIXO' ? <Beef size={16} /> : <UtensilsCrossed size={16} />) : 
                         <ShoppingCart size={16} />}
                      </div>
                      <div>
                        <p className="text-xs font-black text-gray-800 uppercase tracking-tight">{item.item}</p>
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{item.time} • {item.category}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-black ${item.type === 'RECHARGE' ? 'text-green-600' : 'text-gray-800'}`}>
                        {item.type === 'PLAN_USE' ? `-${item.value} un` : `${item.type === 'RECHARGE' ? '+' : '-'} R$ ${(item.value || 0).toFixed(2)}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'ALUNOS':
        return (
          <div className="space-y-10 pb-40 animate-in slide-in-from-right-4 duration-500 px-1 overflow-y-auto">
             
             {/* SEGURANÇA ALIMENTAR */}
             <div className="space-y-6">
                <div className="flex items-center gap-3">
                   <div className="p-3 bg-red-100 text-red-600 rounded-2xl shadow-sm"><HeartPulse size={24} /></div>
                   <div>
                      <h2 className="text-xl font-black text-gray-800 uppercase tracking-tight">Segurança Alimentar</h2>
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Restrições ativas para {activeChild.name.split(' ')[0]}</p>
                   </div>
                </div>
                <div className="bg-white p-8 rounded-[40px] border border-gray-100 space-y-6 shadow-sm">
                   <div className="flex flex-wrap gap-2">
                      {['Lactose', 'Glúten', 'Amendoim', 'Ovos', 'Açúcar'].map(res => (
                        <button 
                          key={res} 
                          onClick={() => toggleRestriction(res)}
                          className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase transition-all border-2 flex items-center gap-2 ${(activeChild.restrictions || []).includes(res) ? 'bg-red-600 border-red-600 text-white shadow-lg' : 'bg-gray-50 border-gray-100 text-gray-400'}`}
                        >
                          {(activeChild.restrictions || []).includes(res) && <Check size={14} strokeWidth={4} />}
                          {res}
                        </button>
                      ))}
                   </div>
                   <textarea 
                    value={activeChild.dietaryNotes}
                    onChange={(e) => updateActiveChild({ dietaryNotes: e.target.value })}
                    className="w-full bg-gray-50 border-none rounded-3xl p-5 text-xs font-bold outline-none focus:ring-2 focus:ring-red-100 min-h-[100px] resize-none shadow-inner"
                    placeholder="Outras observações importantes..."
                   />
                </div>
             </div>

             {/* GESTÃO DE CRÉDITOS */}
             <div className="space-y-6">
                <div className="flex items-center gap-3">
                   <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl shadow-sm"><Wallet size={24} /></div>
                   <div>
                      <h2 className="text-xl font-black text-gray-800 uppercase tracking-tight">Recarga de Créditos</h2>
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Adicione saldo à carteira digital</p>
                   </div>
                </div>
                <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm flex items-center justify-between">
                   <div>
                      <p className="text-3xl font-black text-gray-800 tracking-tighter">R$ {(activeChild?.balance || 0).toFixed(2)}</p>
                      <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mt-1">Saldo Atual em Tempo Real</p>
                   </div>
                   <button onClick={() => { setRechargingPlan('PREPAGO'); setIsPlanModalOpen(true); setIsPlanCheckout(false); }} className="p-5 bg-emerald-600 text-white rounded-3xl shadow-xl hover:bg-emerald-700 active:scale-95 transition-all">
                      <PlusCircle size={28} />
                   </button>
                </div>
             </div>

             {/* PLANOS ESCOLARES */}
             <div className="space-y-6">
                <div className="flex items-center gap-3">
                   <div className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl shadow-sm"><CalendarIcon size={24} /></div>
                   <div>
                      <h2 className="text-xl font-black text-gray-800 uppercase tracking-tight">Planos do Aluno</h2>
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Agendamento de refeições fixas</p>
                   </div>
                </div>

                <div className="space-y-4">
                   <PortalPlanCard 
                    active={activeChild.servicePlans.includes('LANCHE_FIXO')} 
                    onToggle={() => toggleServicePlan('LANCHE_FIXO')}
                    icon={<UtensilsCrossed size={22}/>} 
                    label="Kit Lanche Fixo" 
                    price={15.0} 
                    color="amber"
                    balance={(activeChild.planBalances || {})['LANCHE_FIXO']}
                    onRecharge={() => { setIsPlanModalOpen(true); setIsPlanCheckout(false); }}
                   >
                      <PlanSummaryHeader count={lancheTotalDays} subtotal={lancheSubtotal} color="amber" />
                      
                      <PeriodSelector 
                        activePeriods={activePeriods.LANCHE_FIXO} 
                        onToggle={(p) => togglePeriod('LANCHE_FIXO', p)} 
                        color="amber" 
                      />

                      <div className="space-y-4 mt-6">
                        {activePeriods.LANCHE_FIXO.map(p => (
                          <div key={p} className="animate-in slide-in-from-top-4 duration-500">
                             <div className="flex items-center gap-2 mb-3 px-2">
                                <PeriodIcon period={p} size={14} className="text-amber-600" />
                                <span className="text-[10px] font-black text-amber-900 uppercase tracking-widest">Calendário: {p === 'MORNING' ? 'Manhã' : p === 'AFTERNOON' ? 'Tarde' : 'Noite'}</span>
                             </div>
                             <CalendarWidget 
                               selectedDates={activeChild.lancheDates?.[p] || []} 
                               onToggleDate={(d:any) => toggleDate(d, 'LANCHE', p)} 
                               color="amber" 
                             />
                          </div>
                        ))}
                      </div>
                   </PortalPlanCard>

                   <PortalPlanCard 
                    active={activeChild.servicePlans.includes('PF_FIXO')} 
                    onToggle={() => toggleServicePlan('PF_FIXO')}
                    icon={<Beef size={22}/>} 
                    label="Almoço PF (Fixo)" 
                    price={25.0} 
                    color="orange"
                    balance={(activeChild.planBalances || {})['PF_FIXO']}
                    onRecharge={() => { setIsPlanModalOpen(true); setIsPlanCheckout(false); }}
                   >
                      <PlanSummaryHeader count={almocoTotalDays} subtotal={almocoSubtotal} color="orange" />
                      
                      <PeriodSelector 
                        activePeriods={activePeriods.PF_FIXO} 
                        onToggle={(p) => togglePeriod('PF_FIXO', p)} 
                        color="orange" 
                      />

                      <div className="space-y-4 mt-6">
                        {activePeriods.PF_FIXO.map(p => (
                          <div key={p} className="animate-in slide-in-from-top-4 duration-500">
                             <div className="flex items-center gap-2 mb-3 px-2">
                                <PeriodIcon period={p} size={14} className="text-orange-600" />
                                <span className="text-[10px] font-black text-orange-900 uppercase tracking-widest">Calendário: {p === 'MORNING' ? 'Manhã' : p === 'AFTERNOON' ? 'Tarde' : 'Noite'}</span>
                             </div>
                             <CalendarWidget 
                               selectedDates={activeChild.almocoDates?.[p] || []} 
                               onToggleDate={(d:any) => toggleDate(d, 'ALMOCO', p)} 
                               color="orange" 
                             />
                          </div>
                        ))}
                      </div>
                   </PortalPlanCard>
                </div>
             </div>

             {/* BOTÃO DE CHECKOUT FLUTUANTE SE HOUVER ITENS NOVOS */}
             {currentPlanCosts > 0 && (
               <div className="bg-gray-900 p-10 rounded-[56px] text-white space-y-6 shadow-2xl animate-in zoom-in-95 border-b-8 border-indigo-600 mx-1 mb-10">
                  <div className="flex justify-between items-center">
                     <div>
                        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[3px]">Total de Novos Planos</p>
                        <p className="text-5xl font-black tracking-tighter">R$ {currentPlanCosts.toFixed(2)}</p>
                     </div>
                     <div className="p-4 bg-white/10 rounded-3xl"><Sparkles size={32} className="text-indigo-400" /></div>
                  </div>
                  <button onClick={() => { setIsPlanCheckout(true); setIsPlanModalOpen(true); }} className="w-full py-6 bg-indigo-600 text-white rounded-3xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-indigo-700 active:scale-95 transition-all">
                     Ativar e Pagar Planos
                  </button>
               </div>
             )}
          </div>
        );

      case 'EXTRATOS':
        return (
          <div className="space-y-6 pb-40 animate-in fade-in duration-500 px-1 overflow-y-auto">
             <div className="bg-white p-8 rounded-[40px] border border-gray-100 flex items-center justify-between shadow-sm">
                <div>
                   <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tight leading-none">Extrato Financeiro</h2>
                   <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Movimentações do aluno por link</p>
                </div>
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl"><History size={24} /></div>
             </div>

             <div className="bg-white p-5 rounded-[28px] border border-gray-100 shadow-sm space-y-4">
               <div className="grid grid-cols-2 gap-3">
                 <button
                   onClick={() => setHistoryFilterMode('MONTH')}
                   className={`py-3 rounded-2xl text-xs font-black uppercase tracking-widest border transition-all ${
                     historyFilterMode === 'MONTH'
                       ? 'bg-indigo-600 text-white border-indigo-600'
                       : 'bg-slate-100 text-gray-700 border-slate-200'
                   }`}
                 >
                   Mês
                 </button>
                 <button
                   onClick={() => setHistoryFilterMode('YEAR')}
                   className={`py-3 rounded-2xl text-xs font-black uppercase tracking-widest border transition-all ${
                     historyFilterMode === 'YEAR'
                       ? 'bg-indigo-600 text-white border-indigo-600'
                       : 'bg-slate-100 text-gray-700 border-slate-200'
                   }`}
                 >
                   Anual
                 </button>
               </div>
               <div className={`grid gap-3 ${historyFilterMode === 'MONTH' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                 {historyFilterMode === 'MONTH' && (
                   <select
                     value={selectedHistoryMonth}
                     onChange={(e) => setSelectedHistoryMonth(Number(e.target.value))}
                    aria-label="Selecionar mes"
                    title="Selecionar mes"
                     className="w-full rounded-xl border border-slate-200 bg-slate-100 text-gray-900 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200"
                   >
                     {MONTH_OPTIONS.map((month) => (
                       <option key={month.value} value={month.value}>{month.label}</option>
                     ))}
                   </select>
                 )}
                 <select
                   value={selectedHistoryYear}
                   onChange={(e) => setSelectedHistoryYear(Number(e.target.value))}
                  aria-label="Selecionar ano"
                  title="Selecionar ano"
                   className="w-full rounded-xl border border-slate-200 bg-slate-100 text-gray-900 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200"
                 >
                   {historyYearOptions.map((year) => (
                     <option key={year} value={year}>{year}</option>
                   ))}
                 </select>
               </div>
             </div>
             
             <div className="space-y-4">
               <div className="bg-slate-100 border border-slate-200 rounded-2xl px-4 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-widest">
                 Para abrir uma contestacao, clique em CONTESTAR na linha da transacao.
               </div>
               {isLoadingTransactions && (
                 <div className="bg-white p-6 rounded-[28px] border border-slate-100 text-center text-sm font-bold text-slate-500">
                   Carregando transações...
                 </div>
               )}
               {!isLoadingTransactions && filteredTransactions.length === 0 && (
                 <div className="bg-white p-6 rounded-[28px] border border-dashed border-slate-200 text-center text-sm font-bold text-slate-500">
                   Nenhuma transação encontrada para o período selecionado.
                 </div>
               )}
               {!isLoadingTransactions && filteredTransactions.map((item) => (
                  <div key={item.id} className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm hover:shadow-md transition-all space-y-4">
                     <div className="flex justify-between items-center">
                       <div className="flex items-center gap-4">
                        <div className={`p-4 rounded-2xl ${
                          item.isCredit
                            ? 'bg-emerald-50 text-emerald-600'
                            : String(item.raw?.type || '').toUpperCase().includes('PLAN_USE')
                            ? 'bg-blue-50 text-blue-600'
                            : 'bg-orange-50 text-orange-600'
                        }`}>
                          {item.isCredit ? <Plus size={20} /> : String(item.raw?.type || '').toUpperCase().includes('PLAN_USE') ? <Check size={20} /> : <ShoppingCart size={20} />}
                        </div>
                        <div>
                           <span className="text-[11px] font-black text-gray-800 uppercase tracking-tight">{item.item}</span>
                           <p className="text-[9px] text-gray-400 font-bold uppercase mt-0.5">
                             {item.date.toLocaleDateString('pt-BR')} • {item.date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                           </p>
                          {item.payerResponsibleName && (
                            <p className="text-[9px] text-emerald-600 font-black uppercase mt-0.5">Pagante: {item.payerResponsibleName}</p>
                          )}
                        </div>
                     </div>
                     <span className={`text-lg font-black tracking-tight ${item.isCredit ? 'text-emerald-600' : 'text-gray-900'}`}>
                       {item.signedAmount >= 0 ? '+' : '-'} R$ {Math.abs(item.signedAmount).toFixed(2)}
                     </span>
                     </div>
                     <div className="flex items-center justify-between gap-3">
                       <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 truncate">
                         {item.method || 'Metodo nao informado'}
                       </p>
                       <button
                         onClick={() => openContestationScreen(item)}
                         className="px-5 py-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-black uppercase tracking-widest hover:bg-rose-100 transition-all"
                       >
                         CONTESTAR
                       </button>
                     </div>
                  </div>
                ))}
             </div>

             {filteredMenu.length > 0 && (
               <div className="bg-indigo-50 p-8 rounded-[40px] border-2 border-indigo-100 shadow-inner">
                 <div className="flex items-center justify-between mb-5">
                   <div>
                     <h3 className="text-lg font-black text-indigo-900 uppercase tracking-tight">Cardápio da Unidade</h3>
                     <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mt-1">Mantido dentro do extrato</p>
                   </div>
                   <CalendarIcon size={22} className="text-indigo-500" />
                 </div>
                 <div className="space-y-3">
                   {filteredMenu.slice(0, 1).flatMap(day => day.items).slice(0, 3).map(item => (
                     <div key={item.id} className="bg-white p-4 rounded-[24px] flex items-center justify-between border border-indigo-100">
                       <div className="flex items-center gap-3">
                         <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600"><UtensilsCrossed size={18} /></div>
                         <div>
                           <p className="text-[11px] font-black text-gray-800 uppercase tracking-tight">{item.name}</p>
                           <p className="text-[9px] text-gray-400 font-bold uppercase mt-0.5">Disponível na unidade</p>
                         </div>
                       </div>
                       <span className="text-sm font-black text-emerald-600">R$ {item.price.toFixed(2)}</span>
                     </div>
                   ))}
                 </div>
               </div>
             )}
          </div>
        );

      case 'CONFIGURACOES':
        return (
          <div className="space-y-8 pb-40 animate-in slide-in-from-right-4 duration-500 px-1 overflow-y-auto">
             <div className="bg-slate-50 p-10 rounded-[48px] border border-slate-200 shadow-sm space-y-10">
                <div className="flex items-center gap-5 border-b border-gray-50 pb-6">
                   <div className="p-4 bg-indigo-50 rounded-[28px] text-indigo-600 shadow-inner"><Lock size={28} /></div>
                   <div>
                      <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tight leading-none">Segurança</h2>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Gerencie seu acesso</p>
                   </div>
                </div>

                <div className="space-y-6">
                   <button className="w-full flex items-center justify-between p-6 bg-slate-100 rounded-3xl hover:bg-indigo-50 transition-all group shadow-inner border border-slate-200">
                      <div className="flex items-center gap-4">
                         <div className="p-3 bg-white rounded-2xl shadow-sm text-indigo-400 group-hover:text-indigo-600"><Key size={20}/></div>
                         <span className="text-sm font-black text-gray-700 uppercase tracking-tight">Alterar Senha</span>
                      </div>
                      <ChevronRight size={18} className="text-gray-300" />
                   </button>
                   
                   <button onClick={() => { ApiService.clearToken(); localStorage.clear(); window.location.hash = '#/'; }} className="w-full flex items-center justify-between p-6 bg-red-50 rounded-3xl hover:bg-red-100 transition-all group border border-red-200 shadow-inner">
                      <div className="flex items-center gap-4">
                         <div className="p-3 bg-white rounded-2xl shadow-sm text-red-400 group-hover:text-red-600"><LogOut size={20}/></div>
                         <span className="text-sm font-black text-red-600 uppercase tracking-tight">Sair da Conta</span>
                      </div>
                      <ChevronRight size={18} className="text-red-300" />
                   </button>
                </div>
             </div>
          </div>
        );

      default: return null;
    }
  };

  return (
    <div className="flex justify-center bg-gradient-to-b from-sky-100 via-slate-50 to-white min-h-screen font-['Inter'] selection:bg-indigo-100 selection:text-indigo-900">
      <div className="w-full max-w-md bg-[#F8F9FD] h-screen flex flex-col relative shadow-2xl overflow-hidden border-x border-gray-200">
        
        {/* TOP BAR - SELETOR DE PERFIL (3 ALUNOS) */}
        <div className="bg-gradient-to-r from-sky-700 to-blue-700 text-white px-5 py-4 shrink-0">
           <div className="flex items-center justify-between mb-3">
             <div className="flex items-center gap-3">
               <img
                 src={guardianAvatar}
                 alt={currentUser?.name || 'Responsável'}
                 className="w-9 h-9 rounded-full object-cover border-2 border-white/80 shadow-sm"
               />
               <div>
                 <p className="text-[9px] font-black text-sky-100 uppercase tracking-widest">Portal do Responsável</p>
                 <p className="text-xs font-black text-white">{currentUser?.name || currentUser?.email || 'Usuário'}</p>
               </div>
             </div>
           </div>
           <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide">
             {children.map((child, idx) => (
               <div key={child.id} className="relative">
                 <button 
                  onClick={() => { setActiveChildIndex(idx); setActiveTab('DASHBOARD'); }}
                  className={`flex items-center gap-2 px-4 py-3 rounded-full transition-all whitespace-nowrap border-2 ${
                    activeChildIndex === idx ? 'bg-white text-blue-700 border-white shadow-xl' : 'bg-white/10 border-white/15 text-white'
                  }`}
                 >
                   <img src={child.photo} className="w-6 h-6 rounded-full object-cover" />
                   <span className="text-[10px] font-black uppercase">{child.name.split(' ')[0]}</span>
                 </button>
                 {activeChildIndex === idx && (
                   <button
                     onClick={() => setDeleteConfirm(child.id)}
                     className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-all"
                   >
                     <Trash2 size={14} />
                   </button>
                 )}
               </div>
             ))}
             <button
               onClick={() => setIsAddChildModalOpen(true)}
               className="flex items-center justify-center w-10 h-10 rounded-full bg-indigo-50 border-2 border-indigo-200 text-indigo-600 hover:bg-indigo-100 transition-all"
             >
               <Plus size={18} />
             </button>
           </div>
        </div>

        {/* ÁREA DE CONTEÚDO SCROLLÁVEL */}
        <div className="flex-1 overflow-y-auto scrollbar-hide touch-pan-y pt-8 px-6">
          {renderContent()}
        </div>

        {/* Tab Bar Inferior Fixa */}
        <div className="h-28 bg-white/95 backdrop-blur-2xl border-t border-gray-100 flex items-center justify-around px-6 fixed bottom-0 max-w-md w-full rounded-t-[56px] shadow-[0_-20px_50px_rgba(0,0,0,0.1)] z-[100]">
          <TabItem icon={<Home size={26} />} active={activeTab === 'DASHBOARD'} onClick={() => setActiveTab('DASHBOARD')} label="Dashboard" />
          <TabItem icon={<History size={26} />} active={activeTab === 'EXTRATOS'} onClick={() => setActiveTab('EXTRATOS')} label="Extratos" />
          <TabItem icon={<User size={26} />} active={activeTab === 'ALUNOS'} onClick={() => setActiveTab('ALUNOS')} label="Alunos" />
          <TabItem icon={<Settings size={26} />} active={activeTab === 'CONFIGURACOES'} onClick={() => setActiveTab('CONFIGURACOES')} label="Config." />
        </div>

        {isContestScreenOpen && selectedContestTransaction && (
          <div className="fixed inset-0 z-[1200] bg-slate-950/70 backdrop-blur-sm flex items-end">
            <div className="relative w-full h-full bg-white overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Contestacao de Transacao</h3>
                <button
                  onClick={() => setIsContestScreenOpen(false)}
                  aria-label="Fechar contestacao"
                  title="Fechar contestacao"
                  className="p-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 space-y-6 pb-28">
                <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-slate-700 text-sm leading-relaxed">
                  Ao enviar a contestacao, o atendente tem ate 3 dias uteis para aprovar ou reprovar com resposta. O retorno sera enviado pelo WhatsApp do responsavel cadastrado.
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Transacao selecionada</p>
                  <p className="text-sm font-black text-slate-900 uppercase">{selectedContestTransaction.item}</p>
                  <p className="text-xs font-bold text-slate-500 mt-1">
                    {selectedContestTransaction.date.toLocaleDateString('pt-BR')} {selectedContestTransaction.date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <p className="text-sm font-black text-slate-900 mt-2">
                    {selectedContestTransaction.signedAmount >= 0 ? '+' : '-'} R$ {Math.abs(selectedContestTransaction.signedAmount).toFixed(2)}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-black text-slate-700 uppercase tracking-widest">Tipo de assunto</label>
                  <select
                    value={contestSubject}
                    onChange={(e) => setContestSubject(e.target.value as ContestSubject)}
                    aria-label="Selecionar tipo de assunto"
                    title="Selecionar tipo de assunto"
                    className="w-full rounded-xl border border-slate-200 bg-slate-100 text-slate-900 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    {CONTEST_SUBJECT_OPTIONS.map((subject) => (
                      <option key={subject.value} value={subject.value}>{subject.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-black text-slate-700 uppercase tracking-widest">Motivo</label>
                  <textarea
                    value={contestReason}
                    onChange={(e) => setContestReason(e.target.value)}
                    className="w-full min-h-[130px] rounded-xl border border-slate-200 bg-slate-50 text-slate-900 px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
                    placeholder="Descreva o motivo da contestacao"
                  />
                </div>

                {contestFeedbackMessage && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
                    {contestFeedbackMessage}
                  </div>
                )}

                <button
                  onClick={handleSubmitContestation}
                  disabled={isSubmittingContest}
                  className="w-full py-4 rounded-2xl bg-indigo-600 text-white text-xs font-black uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                >
                  {isSubmittingContest ? 'Enviando...' : 'Enviar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL DE PAGAMENTO UNIFICADO (RECARGA+) */}
        {isPlanModalOpen && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-indigo-950/70 backdrop-blur-md animate-in fade-in" onClick={() => setIsPlanModalOpen(false)}></div>
            <div className="relative w-full max-w-sm bg-white rounded-[56px] overflow-hidden shadow-2xl animate-in zoom-in-95 flex flex-col max-h-[85vh]">
               
               {isPlanCheckout ? (
                 <>
                   <div className="bg-indigo-600 p-10 text-white flex items-center justify-between shrink-0 shadow-lg">
                      <div className="flex items-center gap-4">
                         <div className="bg-white/20 p-3 rounded-2xl"><DollarSign size={28}/></div>
                         <h3 className="text-2xl font-black uppercase tracking-tight">Checkout</h3>
                      </div>
                      <button onClick={() => setIsPlanCheckout(false)} className="p-3 hover:bg-white/10 rounded-full transition-all"><ChevronLeft size={32}/></button>
                   </div>
                   <div className="p-10 space-y-10 flex-1 overflow-y-auto scrollbar-hide">
                      <div className="text-center space-y-2">
                         <p className="text-[10px] font-black text-gray-400 uppercase tracking-[3px]">Valor à Pagar</p>
                         <p className="text-6xl font-black text-gray-900 tracking-tighter">
                           R$ {rechargeValue ? (rechargingPlan === 'LANCHE_FIXO' ? (parseFloat(rechargeValue || '0') * 15).toFixed(2) : rechargingPlan === 'PF_FIXO' ? (parseFloat(rechargeValue || '0') * 25).toFixed(2) : parseFloat(rechargeValue).toFixed(2)) : currentPlanCosts.toFixed(2)}
                         </p>
                      </div>

                      <div className="bg-indigo-50 p-8 rounded-[48px] border-2 border-indigo-100 flex flex-col items-center shadow-inner">
                         <img src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=CANTINASMART-${activeChild.id}`} className="w-48 h-48 mb-6 rounded-3xl shadow-xl" />
                         <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-6 text-center">Escaneie para recarregar o saldo de {activeChild.name.split(' ')[0]}</p>
                         <button onClick={() => {
                            const amount = rechargeValue ? parseFloat(rechargeValue) : 0;
                            if (rechargingPlan === 'PREPAGO') {
                              const newBalance = activeChild.balance + amount;
                              updateActiveChild({ balance: newBalance });
                            } else if (rechargingPlan) {
                              const currentBalances = { ...activeChild.planBalances };
                              currentBalances[rechargingPlan] = (currentBalances[rechargingPlan] || 0) + amount;
                              updateActiveChild({ planBalances: currentBalances });
                            } else {
                              const newBalance = activeChild.balance + amount;
                              updateActiveChild({ balance: newBalance });
                            }
                            alert("Matrícula/Recarga Ativada com Sucesso!");
                            setIsPlanModalOpen(false);
                            setRechargeValue('');
                            setRechargingPlan(null);
                         }} className="w-full py-6 bg-emerald-600 text-white rounded-3xl font-black uppercase text-xs shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all">
                            <CheckCircle2 size={20}/> Confirmar Pagamento
                         </button>
                      </div>
                   </div>
                 </>
               ) : (
                 <>
                   <div className="bg-indigo-900 p-10 text-white flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-4">
                         <div className="bg-white/10 p-3 rounded-2xl border border-white/10 shadow-inner"><Sparkles size={28} className="text-indigo-400" /></div>
                         <div>
                            <h3 className="text-2xl font-black uppercase tracking-tight leading-none">
                               {rechargingPlan === 'PREPAGO' ? 'Recarregar Saldo' : rechargingPlan ? 'Adicionar Créditos' : 'Recarregar'}
                             </h3>
                            <p className="text-[9px] font-bold text-indigo-300 uppercase tracking-widest mt-1">
                               {rechargingPlan === 'LANCHE_FIXO' ? 'Kit Lanche Fixo' : rechargingPlan === 'PF_FIXO' ? 'Almoço PF (Fixo)' : `Upgrade de serviço para ${activeChild.name.split(' ')[0]}`}
                             </p>
                         </div>
                      </div>
                      <button onClick={() => { setIsPlanModalOpen(false); setRechargingPlan(null); }} className="p-3 hover:bg-white/10 rounded-full transition-all"><X size={32}/></button>
                   </div>
                   <div className="p-10 space-y-10 flex-1 overflow-y-auto scrollbar-hide">
                      
                       <div className={`p-8 rounded-[48px] border-2 shadow-inner ${rechargingPlan === 'LANCHE_FIXO' ? 'bg-amber-50 border-amber-200' : rechargingPlan === 'PF_FIXO' ? 'bg-orange-50 border-orange-200' : 'bg-indigo-50 border-indigo-200'}`}>
                         <div className="flex items-center gap-4 mb-6">
                            <div className="p-4 bg-white rounded-3xl shadow-sm">
                                {rechargingPlan === 'LANCHE_FIXO' ? <UtensilsCrossed size={24} className="text-amber-600" /> : rechargingPlan === 'PF_FIXO' ? <Beef size={24} className="text-orange-600" /> : <Wallet size={24} className="text-indigo-600" />}
                             </div>
                             <div>
                                <h4 className={`font-black uppercase text-sm leading-none ${rechargingPlan === 'LANCHE_FIXO' ? 'text-amber-900' : rechargingPlan === 'PF_FIXO' ? 'text-orange-900' : 'text-indigo-900'}`}>
                                   {rechargingPlan === 'PREPAGO' ? 'Saldo Livre' : rechargingPlan === 'LANCHE_FIXO' ? 'Créditos Lanche' : rechargingPlan === 'PF_FIXO' ? 'Créditos Almoço' : 'Saldo Livre'}
                                </h4>
                                <p className={`text-[9px] font-bold uppercase mt-1 ${rechargingPlan === 'LANCHE_FIXO' ? 'text-amber-400' : rechargingPlan === 'PF_FIXO' ? 'text-orange-400' : 'text-indigo-400'}`}>
                                   {rechargingPlan === 'PREPAGO' ? 'Créditos para Cantina' : rechargingPlan ? 'Unidades de Refeição' : 'Créditos para Cantina'}
                                </p>
                             </div>
                         </div>
                          <div className="relative">
                             <span className={`absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-black ${rechargingPlan === 'LANCHE_FIXO' ? 'text-amber-300' : rechargingPlan === 'PF_FIXO' ? 'text-orange-300' : 'text-indigo-300'}`}>
                                {rechargingPlan === 'PREPAGO' || !rechargingPlan ? 'R$' : 'QTY'}
                             </span>
                             <input 
                               type="number" 
                               value={rechargeValue}
                               onChange={e => setRechargeValue(e.target.value)}
                               placeholder={rechargingPlan === 'PREPAGO' || !rechargingPlan ? "0,00" : "0"} 
                               className={`w-full pl-16 pr-6 py-6 bg-slate-100 rounded-[32px] border border-slate-200 font-black text-3xl outline-none shadow-sm placeholder:text-gray-300 ${rechargingPlan === 'LANCHE_FIXO' ? 'text-amber-600' : rechargingPlan === 'PF_FIXO' ? 'text-orange-600' : 'text-indigo-600'}`} 
                             />
                          </div>
                          {rechargingPlan && rechargingPlan !== 'PREPAGO' && (
                            <div className="mt-4 flex justify-between items-center px-2">
                               <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Valor Total:</p>
                               <p className="text-lg font-black text-gray-800">R$ {(parseFloat(rechargeValue || '0') * (rechargingPlan === 'LANCHE_FIXO' ? 15 : 25)).toFixed(2)}</p>
                            </div>
                          )}
                      </div>

                       {!rechargingPlan && (
                         <div className="space-y-4">
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-[4px] text-center">Ou Assine Planos Escolares</p>
                            <button onClick={() => { setActiveTab('ALUNOS'); setIsPlanModalOpen(false); }} className="w-full p-6 bg-amber-50 rounded-[32px] border-2 border-amber-200 text-left group hover:shadow-xl transition-all flex items-center justify-between">
                               <div className="flex items-center gap-4">
                                  <div className="p-4 bg-white rounded-2xl text-amber-500 shadow-sm"><UtensilsCrossed size={22}/></div>
                                  <div>
                                     <h4 className="font-black text-amber-900 uppercase text-xs">Agendar Lanches</h4>
                                     <p className="text-[9px] font-bold text-amber-600 uppercase mt-1">Recarga em Planos Fixos</p>
                                  </div>
                               </div>
                               <ChevronRight size={20} className="text-amber-300" />
                            </button>

                            <button onClick={() => { setActiveTab('ALUNOS'); setIsPlanModalOpen(false); }} className="w-full p-6 bg-orange-50 rounded-[32px] border-2 border-orange-200 text-left group hover:shadow-xl transition-all flex items-center justify-between">
                               <div className="flex items-center gap-4">
                                  <div className="p-4 bg-white rounded-2xl text-orange-500 shadow-sm"><Beef size={22}/></div>
                                  <div>
                                     <h4 className="font-black text-orange-900 uppercase text-xs">Agendar Almoços</h4>
                                     <p className="text-[9px] font-bold text-orange-600 uppercase mt-1">Unidades de Prato Feito</p>
                                  </div>
                               </div>
                               <ChevronRight size={20} className="text-orange-300" />
                            </button>
                         </div>
                       )}

                      <button 
                        disabled={!rechargeValue && currentPlanCosts === 0}
                        onClick={() => setIsPlanCheckout(true)} 
                        className="w-full py-7 bg-indigo-600 text-white rounded-[28px] font-black uppercase text-xs tracking-widest shadow-xl hover:bg-indigo-700 active:scale-95 transition-all mt-4 disabled:opacity-20"
                      >
                         Prosseguir para Pagamento
                      </button>
                   </div>
                 </>
               )}
            </div>
          </div>
        )}

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
          <div className="fixed inset-0 z-[1500] flex items-end">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsAddChildModalOpen(false)}></div>
            <div className="relative w-full bg-white rounded-t-[32px] p-6 animate-in slide-in-from-bottom-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-black text-gray-900">Adicionar Aluno</h2>
                <button
                  onClick={() => setIsAddChildModalOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <X size={24} />
                </button>
              </div>
              
              <div className="space-y-4 max-w-md mx-auto">
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
                    placeholder="Ex: Diabetico, prefere comida saudável"
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

      </div>
    </div>
  );
};

// --- COMPONENTES AUXILIARES ---

const PeriodIcon = ({ period, size, className }: { period: Period, size: number, className: string }) => {
  switch (period) {
    case 'MORNING': return <Sun size={size} className={className} />;
    case 'AFTERNOON': return <Sunset size={size} className={className} />;
    case 'NIGHT': return <Moon size={size} className={className} />;
  }
};

const PeriodSelector = ({ activePeriods, onToggle, color }: any) => {
  const periods: { id: Period, label: string, icon: any }[] = [
    { id: 'MORNING', label: 'Manhã', icon: <Sun size={14}/> },
    { id: 'AFTERNOON', label: 'Tarde', icon: <Sunset size={14}/> },
    { id: 'NIGHT', label: 'Noite', icon: <Moon size={14}/> }
  ];

  const colorMap: any = {
    amber: 'bg-amber-600',
    orange: 'bg-orange-600'
  };

  return (
    <div className="space-y-4 animate-in slide-in-from-top-4 duration-500">
       <p className="text-[9px] font-black text-gray-400 uppercase tracking-[3px] ml-2">Escolha os Turnos de Entrega</p>
       <div className="flex gap-3">
          {periods.map(p => (
            <button 
              key={p.id}
              onClick={() => onToggle(p.id)}
              className={`flex-1 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 border-2 ${
                activePeriods.includes(p.id) 
                  ? `${colorMap[color]} border-transparent text-white shadow-lg scale-105` 
                  : 'bg-white border-gray-100 text-gray-400'
              }`}
            >
              {p.icon} {p.label}
            </button>
          ))}
       </div>
    </div>
  );
};

const PlanSummaryHeader = ({ count, subtotal, color }: { count: number, subtotal: number, color: string }) => {
  const themes: any = {
    amber: 'bg-amber-100/50 border-amber-200 text-amber-900',
    orange: 'bg-orange-100/50 border-orange-200 text-orange-900'
  };
  const badgeThemes: any = {
    amber: 'bg-amber-600 text-white',
    orange: 'bg-orange-600 text-white'
  };
  const labelThemes: any = {
    amber: 'text-amber-500',
    orange: 'text-orange-500'
  };

  return (
    <div className={`flex items-center justify-between mb-6 p-5 rounded-[32px] border-2 transition-all animate-in zoom-in-95 ${themes[color]}`}>
       <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shadow-md ${badgeThemes[color]}`}>
             {count}
          </div>
          <div>
             <span className="text-[10px] font-black uppercase tracking-widest block leading-none">Total de Refeições</span>
             <p className="text-[8px] font-bold opacity-50 uppercase mt-1">Consolidação de todos os turnos</p>
          </div>
       </div>
       <div className="text-right">
          <p className={`text-[9px] font-black uppercase tracking-widest leading-none mb-1 ${labelThemes[color]}`}>Total Plano</p>
          <p className="text-2xl font-black tracking-tighter leading-none">R$ {subtotal.toFixed(2)}</p>
       </div>
    </div>
  );
};

const PortalPlanCard = ({ active, onToggle, icon, label, price, color, balance, onRecharge, children }: any) => {
  const colors: any = {
    amber: active ? 'bg-amber-50 border-amber-400' : 'bg-white border-gray-100',
    orange: active ? 'bg-orange-50 border-orange-400' : 'bg-white border-gray-100',
    indigo: active ? 'bg-indigo-50 border-indigo-400' : 'bg-white border-gray-100'
  };
  const iconColors: any = { amber: 'text-amber-600', orange: 'text-orange-600', indigo: 'text-indigo-600' };
  const balanceColors: any = { amber: 'text-amber-700 bg-amber-100', orange: 'text-orange-700 bg-orange-100', indigo: 'text-indigo-700 bg-indigo-100' };

  return (
    <div className={`rounded-[48px] border-4 transition-all duration-500 overflow-hidden mx-1 ${colors[color]} ${active ? 'shadow-xl' : 'shadow-sm'}`}>
       <div className="p-8 flex items-center justify-between group">
          <div className="flex items-center gap-5 cursor-pointer" onClick={onToggle}>
             <div className={`p-5 rounded-[28px] transition-all shadow-inner ${active ? 'bg-white shadow-lg' : 'bg-gray-50'}`}>
                {React.cloneElement(icon, { className: active ? iconColors[color] : 'text-gray-300' })}
             </div>
             <div>
                <h3 className="text-base font-black text-gray-800 uppercase tracking-tight leading-none">{label}</h3>
                <p className="text-[10px] text-gray-400 font-bold uppercase mt-1.5">R$ {price.toFixed(2)} / unidade</p>
                {active && balance !== undefined && (
                  <div className={`mt-2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest inline-block ${balanceColors[color]}`}>
                    Saldo: {balance} {label.toLowerCase().includes('lanche') ? 'Lanches' : 'Refeições'}
                  </div>
                )}
             </div>
          </div>
          <div className="flex items-center gap-3">
            {active && (
              <button 
                onClick={(e) => { e.stopPropagation(); onRecharge(); }}
                className={`p-3 rounded-2xl text-white shadow-lg active:scale-95 transition-all ${iconColors[color].replace('text', 'bg')}`}
                title="Adicionar Crédito"
              >
                <Plus size={20} />
              </button>
            )}
            <div onClick={onToggle} className={`w-10 h-10 rounded-2xl border-4 flex items-center justify-center transition-all cursor-pointer ${active ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg rotate-0' : 'border-gray-100 text-transparent rotate-45'}`}>
               <Check size={22} strokeWidth={4} />
            </div>
          </div>
       </div>
       {active && (
         <div className="px-8 pb-10 animate-in slide-in-from-top-4 duration-500 border-t border-white/50 pt-6">
            {children}
         </div>
       )}
    </div>
  );
};

const CalendarWidget = ({ selectedDates, onToggleDate, color }: any) => {
  const [viewDate, setViewDate] = useState(new Date());
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  
  const days = [];
  const firstDay = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= totalDays; i++) days.push(new Date(year, month, i));

  const colors: any = {
    amber: { text: 'text-amber-600', bg: 'bg-amber-500', border: 'border-amber-100' },
    orange: { text: 'text-orange-600', bg: 'bg-orange-600', border: 'border-orange-100' }
  };

  return (
    <div className="bg-white/50 p-6 rounded-[40px] border-2 border-white shadow-inner">
       <div className="flex items-center justify-between mb-6">
          <button type="button" onClick={() => setViewDate(new Date(year, month - 1, 1))} className={`p-3 rounded-2xl bg-white shadow-sm ${colors[color].text}`}><ChevronLeft size={20}/></button>
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-800">{viewDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}</span>
          <button type="button" onClick={() => setViewDate(new Date(year, month + 1, 1))} className={`p-3 rounded-2xl bg-white shadow-sm ${colors[color].text}`}><ChevronRight size={20}/></button>
       </div>
       <div className="grid grid-cols-7 gap-2">
          {['D','S','T','Q','Q','S','S'].map(d => <div key={d} className="text-center text-[9px] font-black text-gray-300 py-1">{d}</div>)}
          {days.map((day, idx) => {
             if (!day) return <div key={idx}></div>;
             const dateStr = formatLocalDate(day);
             const isSelected = selectedDates.includes(dateStr);
             const isWeekend = day.getDay() === 0 || day.getDay() === 6;
             return (
               <button 
                key={idx} type="button" disabled={isWeekend} onClick={() => onToggleDate(day)}
                className={`aspect-square rounded-xl flex items-center justify-center text-[10px] font-black transition-all border-2 ${isSelected ? `${colors[color].bg} border-transparent text-white shadow-lg scale-110` : isWeekend ? 'bg-transparent border-transparent text-gray-200' : 'bg-white border-white text-gray-400 hover:border-indigo-300'} `}
               >
                 {day.getDate()}
               </button>
             );
          })}
       </div>
    </div>
  );
};

const TabItem = ({ icon, active, onClick, label }: any) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-2 transition-all ${active ? 'text-indigo-600 scale-110' : 'text-gray-300 hover:text-gray-400'}`}>
    <div className={`p-4 rounded-[24px] transition-all ${active ? 'bg-indigo-50 shadow-inner' : 'bg-transparent'}`}>{icon}</div>
    <span className="text-[10px] font-black uppercase tracking-[2px]">{label}</span>
  </button>
);

const ShortcutCard = ({ icon, label, desc, color, onClick }: any) => (
  <button onClick={onClick} className={`${color} p-8 rounded-[48px] border border-gray-100 flex flex-col items-center justify-center gap-3 active:scale-95 transition-all shadow-sm w-full hover:shadow-2xl group`}>
    <div className="bg-indigo-50 p-5 rounded-3xl transition-transform group-hover:scale-110">{icon}</div>
    <div className="text-center space-y-1">
       <span className="text-[11px] font-black text-gray-800 uppercase tracking-tight block">{label}</span>
       <p className="text-[8px] font-bold text-gray-400 uppercase leading-none">{desc}</p>
    </div>
  </button>
);

export default ClientPortalPage;
