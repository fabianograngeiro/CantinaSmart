import React, { useState, useEffect } from 'react';
import {
  Home, Wallet, User, LogOut, Settings,
  CreditCard, AlertCircle, CheckCircle2,
  ArrowUpRight, History, Clock, 
  ArrowDownRight, DollarSign,
  Zap, Plus, X, Copy, Check, Sun, Moon,
  Phone, Mail, Building, Calendar
} from 'lucide-react';
import { ApiService } from '../services/api';
import { Client, Enterprise } from '../types';
import { resolveUserAvatar } from '../utils/avatar';
import { useTheme } from '../components/ThemeProvider';

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'CONSUMPTION' | 'PAYMENT' | 'CREDIT_INSERT' | 'ADJUSTMENT';
  paymentMethod?: string;
  isVistaPayment: boolean;
}

const CONTEST_SUBJECT_OPTIONS = [
  { value: 'SALDO', label: 'Saldo' },
  { value: 'DUPLICIDADE', label: 'Duplicidade' },
  { value: 'PERIODO', label: 'Periodo' },
  { value: 'AUSENTE', label: 'Ausente' },
  { value: 'COBRANCA', label: 'Cobranca' },
] as const;

type ContestSubject = typeof CONTEST_SUBJECT_OPTIONS[number]['value'];

const toTitleCase = (str: string): string =>
  str.toLowerCase().replace(/(?:^|[\s,+x])\S/g, (c) => c.toUpperCase());

const VISTA_METHODS = ['PIX', 'DEBITO', 'DINHEIRO', 'CASH', 'CREDITO_CARTAO', 'CREDITO CARTAO', 'CARTAO_CREDITO', 'CARTAO_DEBITO'];

const getPaymentAbbr = (method: string, txType?: string): string => {
  const m = method.toUpperCase().trim();
  if (m.includes('PIX')) return 'PIX';
  if (m.includes('DEBITO') || m.includes('CARTAO_DEB') || m.includes('DEBIT')) return 'DBT';
  if (m.includes('DINHEIRO') || m.includes('CASH')) return 'DIN';
  if (m.includes('CREDITO_COLABORADOR') || m.includes('CREDITO_CANTI') || m.includes('CRED_CANT')) return 'CON';
  if (txType === 'CONSUMPTION') return 'CON';
  return '';
};

const getTransactionLabel = (tx: Transaction): string => {
  if (tx.type === 'CONSUMPTION' && tx.isVistaPayment) return 'COMPRA A VISTA';
  if (tx.type === 'CONSUMPTION') return 'CONSUMO';
  if (tx.type === 'CREDIT_INSERT') return 'CRÉDITO PARA CONSUMO';
  if (tx.type === 'PAYMENT') return 'PAGAMENTO DE CONSUMO';
  return 'AJUSTE';
};

const mapBackendTransaction = (raw: any): Transaction => {
  const method = String(raw?.paymentMethod || raw?.method || '').toUpperCase().trim();
  const rawType = String(raw?.type || '').toUpperCase().trim();
  const amount = Number(raw?.total ?? raw?.amount ?? 0);
  const desc = String(raw?.description || raw?.item || '').toUpperCase();

  const isVista = VISTA_METHODS.some(m => method.includes(m));

  let txType: 'CONSUMPTION' | 'PAYMENT' | 'CREDIT_INSERT' | 'ADJUSTMENT';
  if (
    rawType === 'DEBIT'
    || rawType === 'DEBITO'
    || method.includes('CREDITO_COLABORADOR')
    || isVista && (rawType === 'DEBIT' || rawType === 'DEBITO' || rawType === 'SALE')
  ) {
    txType = 'CONSUMPTION';
  } else if (
    (rawType === 'CREDIT' || rawType === 'CREDITO')
    && (desc.includes('PAGAMENTO') || desc.includes('QUITACAO') || desc.includes('QUITAÇÃO'))
  ) {
    txType = 'PAYMENT';
  } else if (rawType === 'AJUSTE_SALDO' && amount < 0) {
    txType = 'PAYMENT';
  } else if (
    (rawType === 'CREDIT' || rawType === 'CREDITO')
    && (desc.includes('CRÉDITO') || desc.includes('CREDITO') || desc.includes('RECARGA') || desc.includes('SALDO'))
  ) {
    txType = 'CREDIT_INSERT';
  } else {
    txType = 'ADJUSTMENT';
  }

  const dateRaw = String(raw?.date || raw?.timestamp || '').trim();
  const date = dateRaw.length >= 10 ? dateRaw.substring(0, 10) : dateRaw;

  // Preferir o campo `item` (já formatado "2x SALGADO, 1x SUCO") ou montar a partir do array `items`
  let descDisplay = String(raw?.item || '').trim();
  if (!descDisplay && Array.isArray(raw?.items) && raw.items.length > 0) {
    descDisplay = (raw.items as any[]).map((i: any) => `${i.quantity}x ${i.name}`).join(', ');
  }
  if (!descDisplay) {
    descDisplay = String(raw?.description || '').trim() || rawType || 'Operação';
  }
  descDisplay = toTitleCase(descDisplay);

  return {
    id: String(raw?.id || `${Date.now()}-${Math.random()}`),
    date,
    description: descDisplay,
    amount: Math.abs(amount),
    type: txType,
    paymentMethod: method || undefined,
    isVistaPayment: isVista,
  };
};

const CollaboratorPortalPage: React.FC<{ currentUser?: any; handleLogout?: () => void }> = ({ currentUser, handleLogout: onLogout }) => {
  const { toggleTheme, isDark } = useTheme();
  const [collaborator, setCollaborator] = useState<Client | null>(null);
  const [activeTab, setActiveTab] = useState<'HOME' | 'HISTORY' | 'SETTINGS'>('HOME');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'PIX' | null>('PIX');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // Transactions
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [enterprise, setEnterprise] = useState<Enterprise | null>(null);

  // HISTÓRICO filters
  const [filterType, setFilterType] = useState<'all' | 'date' | 'period' | 'month' | 'year'>('all');
  const [filterDate, setFilterDate] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterMinValue, setFilterMinValue] = useState('');
  const [filterMaxValue, setFilterMaxValue] = useState('');
  const [showValueFilter, setShowValueFilter] = useState(false);
  const [isContestScreenOpen, setIsContestScreenOpen] = useState(false);
  const [selectedContestTransaction, setSelectedContestTransaction] = useState<Transaction | null>(null);
  const [contestSubject, setContestSubject] = useState<ContestSubject>('SALDO');
  const [contestReason, setContestReason] = useState('');
  const [isSubmittingContest, setIsSubmittingContest] = useState(false);
  const [contestFeedbackMessage, setContestFeedbackMessage] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const linkedClientId = String((currentUser as any)?.linkedClientId || '').trim();
        const userId = String((currentUser as any)?.id || '').trim();
        const clientId = linkedClientId || userId;

        if (!clientId) {
          setError('Não foi possível identificar o cadastro do colaborador. Entre em contato com o suporte.');
          return;
        }

        const [clientData, txData] = await Promise.all([
          ApiService.getClient(clientId),
          ApiService.getTransactions({ clientId }),
        ]);

        setCollaborator(clientData);

        // Carregar enterprise para pegar configurações de vencimento
        const entId = String((clientData as any)?.enterpriseId || '').trim();
        if (entId) {
          try {
            const entData = await ApiService.getEnterprise(entId);
            if (entData) setEnterprise(entData as Enterprise);
          } catch {/* silencioso */}
        }

        const rawTxs: any[] = Array.isArray(txData) ? txData : [];
        const mapped = rawTxs
          .sort((a: any, b: any) => {
            const da = String(a?.date || a?.timestamp || '');
            const db2 = String(b?.date || b?.timestamp || '');
            return db2.localeCompare(da);
          })
          .map(mapBackendTransaction);
        setTransactions(mapped);
      } catch (err) {
        console.error('Erro ao carregar dados do colaborador:', err);
        setError('Falha ao carregar dados. Tente novamente.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [currentUser]);

  const handlePayment = async () => {
    if (!selectedPaymentMethod || !paymentAmount || !collaborator) {
      setPaymentError('Selecione um método de pagamento e um valor');
      return;
    }

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      setPaymentError('Valor inválido');
      return;
    }

    if (amount > (collaborator.amountDue || 0)) {
      setPaymentError(`Valor não pode ser maior que a dívida (R$ ${(collaborator.amountDue || 0).toFixed(2)})`);
      return;
    }

    try {
      setIsProcessingPayment(true);
      setPaymentError(null);

      // In real scenario, make API call
      // await ApiService.processCollaboratorPayment({
      //   collaboratorId: collaborator.id,
      //   amount,
      //   paymentMethod: selectedPaymentMethod
      // });

      // Simulate payment processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Update collaborator debt
      const newDue = Math.max(0, (collaborator.amountDue || 0) - amount);
      setCollaborator({
        ...collaborator,
        amountDue: newDue
      });

      // Add transaction (local state preview - pagamento registrado pelo admin)
      const newTransaction: Transaction = {
        id: `t_${Date.now()}`,
        date: new Date().toISOString().split('T')[0],
        description: `Pagamento via ${selectedPaymentMethod}`,
        amount: amount,
        type: 'PAYMENT',
        paymentMethod: selectedPaymentMethod || undefined,
        isVistaPayment: false,
      };
      setTransactions([newTransaction, ...transactions]);

      setPaymentSuccess(true);
      setTimeout(() => {
        setPaymentSuccess(false);
        setShowPaymentModal(false);
        setPaymentAmount('');
        setSelectedPaymentMethod(null);
      }, 2000);
    } catch (err) {
      console.error('Erro ao processar pagamento:', err);
      setPaymentError('Falha ao processar pagamento. Tente novamente.');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleLogout = () => {
    if (typeof onLogout === 'function') {
      onLogout();
      return;
    }
    ApiService.clearToken();
    localStorage.removeItem('canteen_auth_user');
    localStorage.removeItem('canteen_active_enterprise');
    window.location.hash = '#/';
  };

  const getSignedTransactionAmount = (tx: Transaction) => {
    const amount = Math.abs(Number(tx.amount || 0));
    if (tx.type === 'PAYMENT') return -amount;
    return amount;
  };

  const openContestationScreen = (tx: Transaction) => {
    setSelectedContestTransaction(tx);
    setContestSubject('SALDO');
    setContestReason('');
    setContestFeedbackMessage('');
    setIsContestScreenOpen(true);
  };

  const handleSubmitContestation = async () => {
    const reason = contestReason.trim();
    if (!selectedContestTransaction) return;
    if (!reason) {
      setContestFeedbackMessage('Preencha o campo Motivo para enviar a contestacao.');
      return;
    }

    try {
      setIsSubmittingContest(true);
      setContestFeedbackMessage('');

      const subjectLabel = CONTEST_SUBJECT_OPTIONS.find((option) => option.value === contestSubject)?.label || 'Outro';
      const signedAmount = getSignedTransactionAmount(selectedContestTransaction);
      const contestDescription = [
        `Motivo informado: ${reason}`,
        `Transacao: ${selectedContestTransaction.description}`,
        `Data: ${selectedContestTransaction.date}`,
        `Valor: ${signedAmount >= 0 ? '+' : '-'}R$ ${Math.abs(signedAmount).toFixed(2)}`,
        `Metodo: ${selectedContestTransaction.paymentMethod || 'Nao informado'}`,
      ].join(' | ');

      await ApiService.createContestation({
        enterpriseId: collaborator.enterpriseId,
        enterpriseName: enterprise?.name || '',
        clientId: collaborator.id,
        clientName: collaborator.name,
        subject: `Contestacao - ${subjectLabel}`,
        description: contestDescription,
        type: contestSubject,
        priority: 'MEDIA',
        amount: Math.abs(signedAmount),
        transactionId: selectedContestTransaction.id,
        transactionDate: selectedContestTransaction.date,
        paymentMethod: selectedContestTransaction.paymentMethod || '',
        portalSource: true,
      });

      setContestFeedbackMessage('Contestacao enviada com sucesso. O retorno sera enviado no WhatsApp cadastrado.');
      setContestReason('');
      window.setTimeout(() => {
        setIsContestScreenOpen(false);
        setSelectedContestTransaction(null);
      }, 900);
    } catch (error) {
      console.error('Erro ao enviar contestacao do colaborador:', error);
      setContestFeedbackMessage('Nao foi possivel enviar a contestacao agora. Tente novamente.');
    } finally {
      setIsSubmittingContest(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin inline-block w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full"></div>
          <p className="text-slate-600 font-medium">Carregando dados...</p>
        </div>
      </div>
    );
  }

  if (!collaborator) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-md">
          <AlertCircle size={48} className="text-red-500 mx-auto" />
          <h2 className="text-2xl font-black text-gray-900">Erro ao Carregar</h2>
          <p className="text-gray-600">{error || 'Não foi possível carregar suas informações.'}</p>
          <button
            onClick={handleLogout}
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-500 transition-all"
          >
            Voltar ao Login
          </button>
        </div>
      </div>
    );
  }

  const currentMonthTransactions = transactions.filter(t => {
    const transDate = new Date(t.date);
    const now = new Date();
    return transDate.getMonth() === now.getMonth() && transDate.getFullYear() === now.getFullYear();
  });

  const currentMonthConsumptions = currentMonthTransactions.filter(t => t.type === 'CONSUMPTION');
  const currentMonthConsumptionCount = currentMonthConsumptions.length;
  const currentMonthConsumptionTotal = currentMonthConsumptions.reduce((acc, t) => acc + Math.abs(Number(t.amount || 0)), 0);

  // Configurações de ciclo de cobrança da cantina
  const dueDay      = Math.min(28, Math.max(1, Number((enterprise as any)?.collaboratorPaymentDueDay || 10)));

  // Calcular período de referência e data de vencimento
  const buildBillingInfo = () => {
    const today = new Date();
    const m = today.getMonth(); // 0-based
    const y = today.getFullYear();

    // período de consumo: mês calendário atual (dia 1 até o último dia do mês)
    const refStart = new Date(y, m, 1, 0, 0, 0, 0);
    const refEnd = new Date(y, m + 1, 0, 23, 59, 59, 999);

    // vencimento: dueDay do mês atual
    const dueDate  = new Date(y, m, dueDay);
    const fmt = (dt: Date) => `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`;
    const fmtFull = (dt: Date) => `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`;
    return {
      period: `${fmt(refStart)} a ${fmt(refEnd)}/${refEnd.getFullYear()}`,
      dueLabel: fmtFull(dueDate),
    };
  };
  const billingInfo = buildBillingInfo();

  const totalConsumption = currentMonthConsumptionTotal > 0 ? currentMonthConsumptionTotal : 0;
  const totalDue = Math.max(0, Number(collaborator.amountDue || 0));
  const totalPaid = transactions
    .filter(t => t.type === 'PAYMENT')
    .reduce((acc, t) => acc + Math.abs(t.amount), 0);
  const collaboratorAvatar = resolveUserAvatar(collaborator.photo as string | undefined, collaborator.name);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 dark:from-zinc-900 dark:to-zinc-950">
      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-700 shadow-sm">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={collaboratorAvatar}
              alt={collaborator.name}
              className="w-10 h-10 rounded-lg object-cover border-2 border-white shadow-sm"
            />
            <div>
              <p className="text-xs font-black text-gray-400 dark:text-zinc-400 uppercase tracking-widest">Portal do</p>
              <p className="text-sm font-black text-gray-900 dark:text-zinc-100">{collaborator.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              title={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
              aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
            >
              {isDark ? <Moon size={20} className="text-zinc-200" /> : <Sun size={20} className="text-gray-600" />}
            </button>
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              title="Sair"
            >
              <LogOut size={20} className="text-gray-600 dark:text-zinc-200" />
            </button>
          </div>
        </div>
      </header>

      {/* CONTENT */}
      <main className="max-w-md mx-auto px-4 py-6 pb-52 md:pb-32">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 font-medium">{error}</p>
          </div>
        )}

        {/* CONTENT BY TAB */}
        {activeTab === 'HOME' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* MAIN STATUS CARD */}
            <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-[40px] p-6 text-white shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
              <div className="relative z-10">
                {totalDue > 0 ? (
                  <div className="space-y-4">
                    <div>
                      <p className="text-[8px] font-black uppercase tracking-[3px] text-indigo-100 mb-1">Sua Dívida</p>
                      <p className="text-3xl font-black tracking-tight">R$ {totalDue.toFixed(2)}</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-3 space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] font-bold text-indigo-100">Consumo do Mês</span>
                        <span className="text-xs font-black text-white">R$ {totalConsumption.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] font-bold text-indigo-100">Pendência Ativa</span>
                        <span className="text-xs font-black text-orange-300">R$ {totalDue.toFixed(2)}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowPaymentModal(true)}
                      className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-4 rounded-2xl font-black uppercase text-sm shadow-lg transition-all active:scale-95"
                    >
                      <CreditCard size={18} className="inline mr-2" /> Pagar Agora
                    </button>
                  </div>
                ) : (
                  <div className="text-center space-y-4">
                    <div className="w-16 h-16 bg-emerald-400/20 rounded-full flex items-center justify-center mx-auto">
                      <CheckCircle2 size={32} className="text-emerald-300" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[4px] text-indigo-100 mb-1">Seu Status</p>
                      <p className="text-2xl font-black">Sem Dívidas! 🎉</p>
                    </div>
                    <p className="text-indigo-100 text-sm">Você está em dia com seus pagamentos.</p>
                  </div>
                )}
              </div>
            </div>

            {/* BILLING INFO */}
            <div className="bg-white dark:bg-zinc-900/90 rounded-2xl p-3 shadow-sm border border-gray-100 dark:border-zinc-700">
              <h3 className="text-[8px] font-black text-gray-400 dark:text-zinc-400 uppercase tracking-[2.5px] mb-2">Período de Referência</h3>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-bold text-gray-600 dark:text-zinc-300">Período de Consumo</span>
                  <span className="text-[11px] font-black text-gray-900 dark:text-zinc-100">{billingInfo.period}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-bold text-gray-600 dark:text-zinc-300">Vencimento</span>
                  <span className="text-[11px] font-black text-orange-600 dark:text-orange-400">{billingInfo.dueLabel}</span>
                </div>
              </div>
            </div>

            {/* QUICK STATS */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white dark:bg-zinc-900/90 rounded-2xl p-3 shadow-sm border border-gray-100 dark:border-zinc-700">
                <div className="flex items-center justify-between mb-2">
                  <Wallet size={17} className="text-indigo-600 dark:text-indigo-400" />
                  <span className="text-[8px] font-black text-gray-500 dark:text-zinc-400 uppercase">Consumo Mês</span>
                </div>
                <p className="text-xl font-black text-gray-900 dark:text-zinc-100">R$ {totalConsumption.toFixed(2)}</p>
              </div>
              <div className="bg-white dark:bg-zinc-900/90 rounded-2xl p-3 shadow-sm border border-gray-100 dark:border-zinc-700">
                <div className="flex items-center justify-between mb-2">
                  <CreditCard size={17} className="text-orange-600 dark:text-orange-400" />
                  <span className="text-[8px] font-black text-gray-500 dark:text-zinc-400 uppercase">Transações</span>
                </div>
                <p className="text-xl font-black text-gray-900 dark:text-zinc-100">{currentMonthConsumptionCount}</p>
              </div>
            </div>

            {/* RECENT TRANSACTIONS */}
            <div>
              <h3 className="text-[10px] font-black text-gray-400 dark:text-zinc-400 uppercase tracking-[3px] mb-4 px-2">Últimas Transações</h3>
              <div className="max-h-72 overflow-y-auto pr-1 scroll-pb-28">
                <div className="space-y-2 pb-28">
                {transactions.slice(0, 10).map(transaction => {
                  const label = getTransactionLabel(transaction);
                  const abbr = getPaymentAbbr(transaction.paymentMethod || '', transaction.type);
                  const abbrColor =
                    abbr === 'PIX' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' :
                    abbr === 'DBT' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                    abbr === 'DIN' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' :
                    abbr === 'CON' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' : '';
                  return (
                    <div key={transaction.id} className="bg-white dark:bg-zinc-900/90 rounded-2xl p-3 flex items-center gap-2 border border-gray-100 dark:border-zinc-700">
                      <div className={`w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center ${
                        transaction.type === 'CONSUMPTION' ? 'bg-orange-50 dark:bg-orange-900/20' :
                        transaction.type === 'PAYMENT' ? 'bg-emerald-50 dark:bg-emerald-900/20' :
                        transaction.type === 'CREDIT_INSERT' ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-gray-50 dark:bg-zinc-800'
                      }`}>
                        {transaction.type === 'CONSUMPTION' && <ArrowUpRight size={16} className="text-orange-600 dark:text-orange-300" />}
                        {transaction.type === 'PAYMENT' && <ArrowDownRight size={16} className="text-emerald-600 dark:text-emerald-300" />}
                        {transaction.type === 'CREDIT_INSERT' && <Zap size={16} className="text-blue-600 dark:text-blue-300" />}
                        {transaction.type === 'ADJUSTMENT' && <Zap size={16} className="text-gray-500 dark:text-zinc-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black text-gray-400 dark:text-zinc-400 uppercase tracking-wide leading-none mb-0.5">{label}</p>
                        <p className="text-xs font-bold text-gray-900 dark:text-zinc-100 break-words">{transaction.description}</p>
                        <p className="text-[9px] text-gray-400 dark:text-zinc-400 font-medium mt-0.5">{transaction.date}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0 pl-1">
                        {abbr && (
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-lg uppercase ${abbrColor}`}>{abbr}</span>
                        )}
                        <p className={`text-sm font-black whitespace-nowrap ${
                          transaction.type === 'CONSUMPTION' ? 'text-orange-600 dark:text-orange-300' :
                          transaction.type === 'PAYMENT' ? 'text-emerald-600 dark:text-emerald-300' :
                          transaction.type === 'CREDIT_INSERT' ? 'text-blue-600 dark:text-blue-300' : 'text-gray-600 dark:text-zinc-300'
                        }`}>
                          {transaction.type === 'CONSUMPTION' ? '+' : transaction.type === 'PAYMENT' ? '-' : ''} R$ {Math.abs(transaction.amount).toFixed(2)}
                        </p>
                        <button
                          onClick={() => openContestationScreen(transaction)}
                          className="px-2 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-[9px] font-black uppercase tracking-widest hover:bg-rose-100 transition-all"
                        >
                          CONTESTAR
                        </button>
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'HISTORY' && (() => {
          // --- filter logic ---
          const minVal = filterMinValue !== '' ? parseFloat(filterMinValue) : null;
          const maxVal = filterMaxValue !== '' ? parseFloat(filterMaxValue) : null;
          const filteredTransactions = transactions.filter(tx => {
            const txDate = (tx.date || '').slice(0, 10); // YYYY-MM-DD
            if (filterType === 'date' && filterDate) {
              if (txDate !== filterDate) return false;
            } else if (filterType === 'period') {
              if (filterDateFrom && txDate < filterDateFrom) return false;
              if (filterDateTo && txDate > filterDateTo) return false;
            } else if (filterType === 'month' && filterMonth) {
              if (!txDate.startsWith(filterMonth)) return false;
            } else if (filterType === 'year' && filterYear) {
              if (!txDate.startsWith(filterYear)) return false;
            }
            const amt = Math.abs(tx.amount);
            if (minVal !== null && amt < minVal) return false;
            if (maxVal !== null && amt > maxVal) return false;
            return true;
          });

          const FILTER_BTNS: { key: typeof filterType; label: string }[] = [
            { key: 'all', label: 'Todos' },
            { key: 'date', label: 'Data' },
            { key: 'period', label: 'Período' },
            { key: 'month', label: 'Mês' },
            { key: 'year', label: 'Anual' },
          ];

          return (
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex items-center justify-between px-2">
              <h3 className="text-[10px] font-black text-gray-400 dark:text-zinc-400 uppercase tracking-[3px]">Histórico Completo</h3>
              <span className="text-xs font-bold text-gray-600 dark:text-zinc-300">{filteredTransactions.length}/{transactions.length} registros</span>
            </div>

            <div className="bg-slate-100 dark:bg-zinc-900/70 rounded-2xl p-3 border border-slate-200 dark:border-zinc-700 text-[10px] font-bold text-slate-600 dark:text-zinc-300 uppercase tracking-widest">
              Para abrir uma contestacao, clique em CONTESTAR na linha da transacao.
            </div>

            {/* Filter type pills */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 px-0.5 scrollbar-none">
              {FILTER_BTNS.map(btn => (
                <button
                  key={btn.key}
                  onClick={() => setFilterType(btn.key)}
                  className={`flex-shrink-0 text-[10px] font-black px-3 py-1.5 rounded-full transition-all ${
                    filterType === btn.key
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400'
                  }`}
                >{btn.label}</button>
              ))}
              <button
                onClick={() => setShowValueFilter(v => !v)}
                className={`flex-shrink-0 text-[10px] font-black px-3 py-1.5 rounded-full transition-all ${
                  showValueFilter
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400'
                }`}
              >Valor</button>
            </div>

            {/* Dynamic date inputs */}
            {filterType === 'date' && (
              <div className="bg-white dark:bg-zinc-900/90 rounded-2xl p-3 border border-gray-100 dark:border-zinc-700">
                <label className="text-[9px] font-black text-gray-400 dark:text-zinc-400 uppercase tracking-widest block mb-1">Data específica</label>
                <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
                  className="w-full text-sm font-bold text-gray-800 dark:text-zinc-100 bg-transparent border-b border-gray-200 dark:border-zinc-700 pb-1 outline-none" />
              </div>
            )}
            {filterType === 'period' && (
              <div className="bg-white dark:bg-zinc-900/90 rounded-2xl p-3 border border-gray-100 dark:border-zinc-700 flex gap-3">
                <div className="flex-1">
                  <label className="text-[9px] font-black text-gray-400 dark:text-zinc-400 uppercase tracking-widest block mb-1">De</label>
                  <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
                    className="w-full text-sm font-bold text-gray-800 dark:text-zinc-100 bg-transparent border-b border-gray-200 dark:border-zinc-700 pb-1 outline-none" />
                </div>
                <div className="flex-1">
                  <label className="text-[9px] font-black text-gray-400 dark:text-zinc-400 uppercase tracking-widest block mb-1">Até</label>
                  <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
                    className="w-full text-sm font-bold text-gray-800 dark:text-zinc-100 bg-transparent border-b border-gray-200 dark:border-zinc-700 pb-1 outline-none" />
                </div>
              </div>
            )}
            {filterType === 'month' && (
              <div className="bg-white dark:bg-zinc-900/90 rounded-2xl p-3 border border-gray-100 dark:border-zinc-700 flex gap-3">
                <div className="flex-1">
                  <label className="text-[9px] font-black text-gray-400 dark:text-zinc-400 uppercase tracking-widest block mb-1">Mês</label>
                  <select value={filterMonth.slice(5, 7)} onChange={e => setFilterMonth((filterMonth.slice(0, 4) || new Date().getFullYear().toString()) + '-' + e.target.value)}
                    className="w-full text-sm font-bold text-gray-800 dark:text-zinc-100 bg-transparent border-b border-gray-200 dark:border-zinc-700 pb-1 outline-none">
                    <option value="">--</option>
                    {['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-[9px] font-black text-gray-400 dark:text-zinc-400 uppercase tracking-widest block mb-1">Ano</label>
                  <select value={filterMonth.slice(0, 4)} onChange={e => setFilterMonth(e.target.value + '-' + (filterMonth.slice(5, 7) || '01'))}
                    className="w-full text-sm font-bold text-gray-800 dark:text-zinc-100 bg-transparent border-b border-gray-200 dark:border-zinc-700 pb-1 outline-none">
                    <option value="">--</option>
                    {Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - 2 + i)).map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {filterType === 'year' && (
              <div className="bg-white dark:bg-zinc-900/90 rounded-2xl p-3 border border-gray-100 dark:border-zinc-700">
                <label className="text-[9px] font-black text-gray-400 dark:text-zinc-400 uppercase tracking-widest block mb-1">Ano</label>
                <input type="number" min="2020" max="2099" placeholder="ex: 2026" value={filterYear} onChange={e => setFilterYear(e.target.value)}
                  className="w-full text-sm font-bold text-gray-800 dark:text-zinc-100 bg-transparent border-b border-gray-200 dark:border-zinc-700 pb-1 outline-none" />
              </div>
            )}

            {/* Value range */}
            {showValueFilter && (
              <div className="bg-white dark:bg-zinc-900/90 rounded-2xl p-3 border border-purple-100 dark:border-purple-900/40 flex gap-3">
                <div className="flex-1">
                  <label className="text-[9px] font-black text-purple-400 uppercase tracking-widest block mb-1">Valor mín. R$</label>
                  <input type="number" min="0" step="0.01" placeholder="0,00" value={filterMinValue} onChange={e => setFilterMinValue(e.target.value)}
                    className="w-full text-sm font-bold text-gray-800 dark:text-zinc-100 bg-transparent border-b border-gray-200 dark:border-zinc-700 pb-1 outline-none" />
                </div>
                <div className="flex-1">
                  <label className="text-[9px] font-black text-purple-400 uppercase tracking-widest block mb-1">Valor máx. R$</label>
                  <input type="number" min="0" step="0.01" placeholder="999,99" value={filterMaxValue} onChange={e => setFilterMaxValue(e.target.value)}
                    className="w-full text-sm font-bold text-gray-800 dark:text-zinc-100 bg-transparent border-b border-gray-200 dark:border-zinc-700 pb-1 outline-none" />
                </div>
              </div>
            )}

            {filteredTransactions.length === 0 ? (
              <div className="text-center py-12">
                <History size={32} className="text-gray-300 dark:text-zinc-500 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-zinc-300 font-medium">
                  {transactions.length === 0 ? 'Nenhuma transação registrada' : 'Nenhum resultado para este filtro'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTransactions.map(transaction => {
                  const label = getTransactionLabel(transaction);
                  const abbr = getPaymentAbbr(transaction.paymentMethod || '', transaction.type);
                  const abbrColor =
                    abbr === 'PIX' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' :
                    abbr === 'DBT' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                    abbr === 'DIN' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' :
                    abbr === 'CON' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' : '';
                  return (
                    <div key={transaction.id} className="bg-white dark:bg-zinc-900/90 rounded-2xl p-3 flex items-center gap-2 border border-gray-100 dark:border-zinc-700 hover:shadow-md transition-all">
                      <div className={`w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center ${
                        transaction.type === 'CONSUMPTION' ? 'bg-orange-50 dark:bg-orange-900/20' :
                        transaction.type === 'PAYMENT' ? 'bg-emerald-50 dark:bg-emerald-900/20' :
                        transaction.type === 'CREDIT_INSERT' ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-gray-50 dark:bg-zinc-800'
                      }`}>
                        {transaction.type === 'CONSUMPTION' && <ArrowUpRight size={16} className="text-orange-600 dark:text-orange-300" />}
                        {transaction.type === 'PAYMENT' && <ArrowDownRight size={16} className="text-emerald-600 dark:text-emerald-300" />}
                        {transaction.type === 'CREDIT_INSERT' && <Zap size={16} className="text-blue-600 dark:text-blue-300" />}
                        {transaction.type === 'ADJUSTMENT' && <Zap size={16} className="text-gray-500 dark:text-zinc-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black text-gray-400 dark:text-zinc-400 uppercase tracking-wide leading-none mb-0.5">{label}</p>
                        <p className="text-xs font-bold text-gray-900 dark:text-zinc-100 break-words">{transaction.description}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Clock size={10} className="text-gray-400 dark:text-zinc-400" />
                          <p className="text-[9px] text-gray-400 dark:text-zinc-400 font-medium">{transaction.date}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0 pl-1">
                        {abbr && (
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-lg uppercase ${abbrColor}`}>{abbr}</span>
                        )}
                        <p className={`text-sm font-black whitespace-nowrap ${
                          transaction.type === 'CONSUMPTION' ? 'text-orange-600 dark:text-orange-300' :
                          transaction.type === 'PAYMENT' ? 'text-emerald-600 dark:text-emerald-300' :
                          transaction.type === 'CREDIT_INSERT' ? 'text-blue-600 dark:text-blue-300' : 'text-gray-600 dark:text-zinc-300'
                        }`}>
                          {transaction.type === 'CONSUMPTION' ? '+' : transaction.type === 'PAYMENT' ? '-' : ''} R$ {Math.abs(transaction.amount).toFixed(2)}
                        </p>
                        <button
                          onClick={() => openContestationScreen(transaction)}
                          className="px-2 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-[9px] font-black uppercase tracking-widest hover:bg-rose-100 transition-all"
                        >
                          CONTESTAR
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          );
        })()}

        {activeTab === 'SETTINGS' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* PROFILE CARD */}
            <div className="bg-slate-50 rounded-[32px] p-6 shadow-sm border border-slate-200">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[3px] mb-6">Dados Pessoais</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-2">Nome</label>
                  <input
                    type="text"
                    value={collaborator.name}
                    disabled
                    className="w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl text-sm font-medium text-gray-600"
                  />
                </div>

                <div>
                  <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-2">Email</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="email"
                      value={collaborator.email}
                      disabled
                      className="flex-1 px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl text-sm font-medium text-gray-600"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(collaborator.email);
                      }}
                      className="p-3 hover:bg-gray-100 rounded-xl transition-colors"
                      title="Copiar email"
                    >
                      <Copy size={16} className="text-gray-600" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-2">Telefone</label>
                  <input
                    type="tel"
                    value={collaborator.phone || 'Não fornecido'}
                    disabled
                    className="w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl text-sm font-medium text-gray-600"
                  />
                </div>
              </div>
            </div>

            {/* ACCOUNT INFO */}
            <div className="bg-slate-50 rounded-[32px] p-6 shadow-sm border border-slate-200">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[3px] mb-6">Informações da Conta</h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-gray-100">
                  <span className="text-sm font-bold text-gray-600">Tipo de Usuário</span>
                  <span className="text-sm font-black text-indigo-600">COLABORADOR</span>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-gray-100">
                  <span className="text-sm font-bold text-gray-600">Status</span>
                  <span className="text-sm font-black text-emerald-600">Ativo</span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span className="text-sm font-bold text-gray-600">Membro desde</span>
                  <span className="text-sm font-medium text-gray-600">
                    {(collaborator as any).createdAt ? new Date((collaborator as any).createdAt).toLocaleDateString('pt-BR') : '-'}
                  </span>
                </div>
              </div>
            </div>

            {/* LOGOUT BUTTON */}
            <button
              onClick={handleLogout}
              className="w-full bg-red-50 hover:bg-red-100 text-red-600 py-4 rounded-2xl font-black uppercase text-sm transition-all border border-red-200"
            >
              <LogOut size={18} className="inline mr-2" /> Sair da Conta
            </button>
          </div>
        )}
      </main>

      {/* BOTTOM NAV - MOBILE STYLE */}
      <div className="fixed bottom-0 inset-x-0 z-40 pointer-events-none">
        <div className="max-w-md mx-auto px-4 pb-4">
          <div className="pointer-events-auto bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl rounded-3xl border border-gray-200 dark:border-zinc-700 shadow-2xl p-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setActiveTab('HOME')}
                className={`py-3 px-3 rounded-2xl text-[11px] font-black transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === 'HOME'
                    ? 'bg-indigo-600 text-white shadow-lg'
                    : 'text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800'
                }`}
              >
                <Home size={15} /> INÍCIO
              </button>
              <button
                onClick={() => setActiveTab('HISTORY')}
                className={`py-3 px-3 rounded-2xl text-[11px] font-black transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === 'HISTORY'
                    ? 'bg-indigo-600 text-white shadow-lg'
                    : 'text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800'
                }`}
              >
                <History size={15} /> HISTÓRICO
              </button>
              <button
                onClick={() => setActiveTab('SETTINGS')}
                className={`py-3 px-3 rounded-2xl text-[11px] font-black transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === 'SETTINGS'
                    ? 'bg-indigo-600 text-white shadow-lg'
                    : 'text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800'
                }`}
              >
                <Settings size={15} /> CONFIG
              </button>
            </div>
          </div>
        </div>
      </div>

      {isContestScreenOpen && selectedContestTransaction && (
        <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-end">
          <div className="relative w-full h-full bg-white dark:bg-zinc-900 overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-slate-100 dark:border-zinc-700 px-6 py-4 flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900 dark:text-zinc-100 uppercase tracking-widest">Contestacao de Transacao</h3>
              <button
                onClick={() => setIsContestScreenOpen(false)}
                className="p-2 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 hover:bg-slate-200 dark:hover:bg-zinc-700 transition-all"
                aria-label="Fechar contestacao"
                title="Fechar contestacao"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-6 pb-28">
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-slate-700 text-sm leading-relaxed">
                Ao enviar a contestacao, o atendente tem ate 3 dias uteis para aprovar ou reprovar com resposta. O retorno sera enviado pelo WhatsApp cadastrado.
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Transacao selecionada</p>
                <p className="text-sm font-black text-slate-900 uppercase">{selectedContestTransaction.description}</p>
                <p className="text-xs font-bold text-slate-500 mt-1">{selectedContestTransaction.date}</p>
                <p className="text-sm font-black text-slate-900 mt-2">
                  {getSignedTransactionAmount(selectedContestTransaction) >= 0 ? '+' : '-'} R$ {Math.abs(getSignedTransactionAmount(selectedContestTransaction)).toFixed(2)}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-700 uppercase tracking-widest">Tipo de assunto</label>
                <select
                  value={contestSubject}
                  onChange={(e) => setContestSubject(e.target.value as ContestSubject)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-100 text-slate-900 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200"
                  aria-label="Selecionar tipo de assunto"
                  title="Selecionar tipo de assunto"
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

      {/* PAYMENT MODAL */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50 animate-in fade-in duration-300">
          <div className="w-full bg-white dark:bg-zinc-900 rounded-t-[40px] p-6 animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black text-gray-900">Efetuar Pagamento</h2>
              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  setPaymentAmount('');
                  setSelectedPaymentMethod(null);
                  setPaymentError(null);
                  setPaymentSuccess(false);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={24} className="text-gray-600" />
              </button>
            </div>

            {paymentSuccess ? (
              <div className="text-center py-8 space-y-4">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 size={32} className="text-emerald-600" />
                </div>
                <div>
                  <p className="text-lg font-black text-gray-900">Pagamento Realizado!</p>
                  <p className="text-sm text-gray-600 mt-2">R$ {paymentAmount} via {selectedPaymentMethod}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* INFO BOX */}
                <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-[9px] font-bold text-indigo-600 uppercase">Dívida Atual</p>
                      <p className="text-2xl font-black text-indigo-900 mt-1">R$ {totalDue.toFixed(2)}</p>
                    </div>
                    <CreditCard size={32} className="text-indigo-600" />
                  </div>
                </div>

                {/* AMOUNT INPUT */}
                <div>
                  <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-3">Valor (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={totalDue}
                    value={paymentAmount}
                    onChange={(e) => {
                      setPaymentAmount(e.target.value);
                      setPaymentError(null);
                    }}
                    placeholder="0.00"
                    className="w-full px-4 py-4 border border-slate-300 bg-slate-100 rounded-2xl text-lg font-bold focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 outline-none"
                  />
                  {paymentError && (
                    <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                      <AlertCircle size={14} /> {paymentError}
                    </p>
                  )}
                </div>

                {/* PAYMENT METHOD */}
                <div>
                  <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-3">Método de Pagamento</label>
                  <div className="space-y-2">
                    <button
                      onClick={() => {
                        setSelectedPaymentMethod('PIX');
                        setPaymentError(null);
                      }}
                      className="w-full p-4 rounded-2xl border-2 border-indigo-600 bg-slate-100 text-indigo-900 transition-all text-sm font-bold uppercase flex items-center gap-3"
                    >
                      <Check size={18} /> 📱 Pix
                    </button>
                  </div>
                </div>

                {/* ACTION BUTTONS */}
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowPaymentModal(false);
                      setPaymentAmount('');
                      setSelectedPaymentMethod(null);
                      setPaymentError(null);
                    }}
                    className="flex-1 px-4 py-4 border border-gray-300 rounded-2xl font-bold text-gray-700 hover:bg-gray-50 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {}}
                    className="flex-1 px-4 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold shadow-lg transition-all active:scale-95"
                  >
                    GERA QRCODE PIX
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CollaboratorPortalPage;
