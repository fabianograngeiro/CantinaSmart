import React, { useState, useEffect } from 'react';
import {
  Home, Wallet, User, LogOut, Settings,
  CreditCard, AlertCircle, CheckCircle2,
  ArrowUpRight, History, Clock, 
  ArrowDownRight, DollarSign,
  Zap, Plus, X, Copy, Check,
  Phone, Mail, Building, Calendar
} from 'lucide-react';
import { ApiService } from '../services/api';
import { Client } from '../types';
import { resolveUserAvatar } from '../utils/avatar';

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'CONSUMPTION' | 'PAYMENT' | 'ADJUSTMENT';
  paymentMethod?: 'PIX' | 'BOLETO' | 'CAIXA';
}

const CollaboratorPortalPage: React.FC = () => {
  const [collaborator, setCollaborator] = useState<Client | null>(null);
  const [activeTab, setActiveTab] = useState<'HOME' | 'HISTORY' | 'SETTINGS'>('HOME');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'PIX' | 'BOLETO' | 'CAIXA' | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // Transactions
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // Mock data for demonstration
  const mockCollaborator: Client = {
    id: 'col_1',
    registrationId: 'COL-2025-001',
    name: 'João Silva',
    email: 'joao@example.com',
    phone: '11999999999',
    type: 'COLABORADOR',
    balance: 0,
    spentToday: 0,
    amountDue: 245.50,
    monthlyConsumption: 245.50,
    servicePlans: [],
    isBlocked: false,
    restrictions: [],
    dietaryNotes: '',
    guardians: [],
    enterpriseId: 'ent_1'
  };

  const mockTransactions: Transaction[] = [
    { id: 't1', date: '2025-05-28', description: 'Almoço PF', amount: 25.00, type: 'CONSUMPTION' },
    { id: 't2', date: '2025-05-27', description: 'Almoço PF', amount: 25.00, type: 'CONSUMPTION' },
    { id: 't3', date: '2025-05-26', description: 'Café da Manhã', amount: 12.50, type: 'CONSUMPTION' },
    { id: 't4', date: '2025-05-26', description: 'Almoço PF', amount: 25.00, type: 'CONSUMPTION' },
    { id: 't5', date: '2025-05-25', description: 'Pagamento via PIX', amount: -100.00, type: 'PAYMENT', paymentMethod: 'PIX' },
    { id: 't6', date: '2025-05-23', description: 'Almoço PF', amount: 25.00, type: 'CONSUMPTION' },
    { id: 't7', date: '2025-05-22', description: 'Café da Manhã', amount: 12.50, type: 'CONSUMPTION' },
    { id: 't8', date: '2025-05-21', description: 'Almoço PF', amount: 25.00, type: 'CONSUMPTION' },
    { id: 't9', date: '2025-05-20', description: 'Ajuste de Crédito', amount: 50.00, type: 'ADJUSTMENT' },
  ];

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        // In a real scenario, fetch collaborator data from API
        // const data = await ApiService.getCollaboratorData();
        setCollaborator(mockCollaborator);
        setTransactions(mockTransactions);
        setError(null);
      } catch (err) {
        console.error('Erro ao carregar dados:', err);
        setError('Falha ao carregar dados. Tente novamente.');
        setCollaborator(mockCollaborator); // Fallback
        setTransactions(mockTransactions);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

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

      // Add transaction
      const newTransaction: Transaction = {
        id: `t_${Date.now()}`,
        date: new Date().toISOString().split('T')[0],
        description: `Pagamento via ${selectedPaymentMethod}`,
        amount: -amount,
        type: 'PAYMENT',
        paymentMethod: selectedPaymentMethod
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
    ApiService.clearToken();
    window.location.hash = '#/';
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

  const totalConsumption = collaborator.monthlyConsumption || 0;
  const totalDue = collaborator.amountDue || 0;
  const totalPaid = transactions
    .filter(t => t.type === 'PAYMENT')
    .reduce((acc, t) => acc + Math.abs(t.amount), 0);
  const collaboratorAvatar = resolveUserAvatar(collaborator.photo as string | undefined, collaborator.name);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100">
      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={collaboratorAvatar}
              alt={collaborator.name}
              className="w-10 h-10 rounded-lg object-cover border-2 border-white shadow-sm"
            />
            <div>
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Portal do</p>
              <p className="text-sm font-black text-gray-900">{collaborator.name}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Sair"
          >
            <LogOut size={20} className="text-gray-600" />
          </button>
        </div>
      </header>

      {/* CONTENT */}
      <main className="max-w-md mx-auto px-4 py-6 pb-32">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 font-medium">{error}</p>
          </div>
        )}

        {/* TABS */}
        <div className="flex gap-2 mb-6 bg-white rounded-[32px] p-1 shadow-sm border border-gray-100">
          <button
            onClick={() => setActiveTab('HOME')}
            className={`flex-1 py-3 px-4 rounded-2xl text-xs font-black transition-all ${
              activeTab === 'HOME'
                ? 'bg-indigo-600 text-white shadow-lg'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Home size={16} className="inline mr-1.5" /> INÍCIO
          </button>
          <button
            onClick={() => setActiveTab('HISTORY')}
            className={`flex-1 py-3 px-4 rounded-2xl text-xs font-black transition-all ${
              activeTab === 'HISTORY'
                ? 'bg-indigo-600 text-white shadow-lg'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <History size={16} className="inline mr-1.5" /> HISTÓRICO
          </button>
          <button
            onClick={() => setActiveTab('SETTINGS')}
            className={`flex-1 py-3 px-4 rounded-2xl text-xs font-black transition-all ${
              activeTab === 'SETTINGS'
                ? 'bg-indigo-600 text-white shadow-lg'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Settings size={16} className="inline mr-1.5" /> CONFIG
          </button>
        </div>

        {/* CONTENT BY TAB */}
        {activeTab === 'HOME' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* MAIN STATUS CARD */}
            <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-[48px] p-8 text-white shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
              <div className="relative z-10">
                {totalDue > 0 ? (
                  <div className="space-y-6">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[4px] text-indigo-100 mb-2">Sua Dívida</p>
                      <p className="text-5xl font-black tracking-tighter">R$ {totalDue.toFixed(2)}</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-indigo-100">Consumo do Mês</span>
                        <span className="text-sm font-black text-white">R$ {totalConsumption.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-indigo-100">Já Pago</span>
                        <span className="text-sm font-black text-emerald-300">-R$ {totalPaid.toFixed(2)}</span>
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

            {/* QUICK STATS */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <Wallet size={20} className="text-indigo-600" />
                  <span className="text-[9px] font-black text-gray-500 uppercase">Consumo Mês</span>
                </div>
                <p className="text-2xl font-black text-gray-900">R$ {totalConsumption.toFixed(2)}</p>
              </div>
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <CreditCard size={20} className="text-orange-600" />
                  <span className="text-[9px] font-black text-gray-500 uppercase">Transações</span>
                </div>
                <p className="text-2xl font-black text-gray-900">{currentMonthTransactions.length}</p>
              </div>
            </div>

            {/* RECENT TRANSACTIONS */}
            <div>
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[3px] mb-4 px-2">Últimas Transações</h3>
              <div className="space-y-2">
                {transactions.slice(0, 5).map(transaction => (
                  <div key={transaction.id} className="bg-white rounded-2xl p-4 flex items-center justify-between border border-gray-100">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        transaction.type === 'CONSUMPTION' ? 'bg-orange-50' :
                        transaction.type === 'PAYMENT' ? 'bg-emerald-50' : 'bg-blue-50'
                      }`}>
                        {transaction.type === 'CONSUMPTION' && <ArrowUpRight size={18} className="text-orange-600" />}
                        {transaction.type === 'PAYMENT' && <ArrowDownRight size={18} className="text-emerald-600" />}
                        {transaction.type === 'ADJUSTMENT' && <Zap size={18} className="text-blue-600" />}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-900">{transaction.description}</p>
                        <p className="text-[9px] text-gray-500 font-medium">{transaction.date}</p>
                      </div>
                    </div>
                    <p className={`text-sm font-black ${
                      transaction.type === 'CONSUMPTION' ? 'text-orange-600' :
                      transaction.type === 'PAYMENT' ? 'text-emerald-600' : 'text-blue-600'
                    }`}>
                      {transaction.type === 'CONSUMPTION' ? '+' : ''}{transaction.type === 'PAYMENT' ? '-' : ''} R$ {Math.abs(transaction.amount).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'HISTORY' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between px-2 mb-4">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[3px]">Histórico Completo</h3>
              <span className="text-xs font-bold text-gray-600">{transactions.length} registros</span>
            </div>
            
            {transactions.length === 0 ? (
              <div className="text-center py-12">
                <History size={32} className="text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">Nenhuma transação registrada</p>
              </div>
            ) : (
              <div className="space-y-2">
                {transactions.map(transaction => (
                  <div key={transaction.id} className="bg-white rounded-2xl p-4 flex items-center justify-between border border-gray-100 hover:shadow-md transition-all">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        transaction.type === 'CONSUMPTION' ? 'bg-orange-50' :
                        transaction.type === 'PAYMENT' ? 'bg-emerald-50' : 'bg-blue-50'
                      }`}>
                        {transaction.type === 'CONSUMPTION' && <ArrowUpRight size={18} className="text-orange-600" />}
                        {transaction.type === 'PAYMENT' && <ArrowDownRight size={18} className="text-emerald-600" />}
                        {transaction.type === 'ADJUSTMENT' && <Zap size={18} className="text-blue-600" />}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-900">{transaction.description}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Clock size={12} className="text-gray-400" />
                          <p className="text-[9px] text-gray-500 font-medium">{transaction.date}</p>
                        </div>
                      </div>
                    </div>
                    <p className={`text-sm font-black whitespace-nowrap ${
                      transaction.type === 'CONSUMPTION' ? 'text-orange-600' :
                      transaction.type === 'PAYMENT' ? 'text-emerald-600' : 'text-blue-600'
                    }`}>
                      {transaction.type === 'CONSUMPTION' ? '+' : ''}{transaction.type === 'PAYMENT' ? '-' : ''} R$ {Math.abs(transaction.amount).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'SETTINGS' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* PROFILE CARD */}
            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-gray-100">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[3px] mb-6">Dados Pessoais</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-2">Nome</label>
                  <input
                    type="text"
                    value={collaborator.name}
                    disabled
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-600"
                  />
                </div>

                <div>
                  <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-2">Email</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="email"
                      value={collaborator.email}
                      disabled
                      className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-600"
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
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-600"
                  />
                </div>
              </div>
            </div>

            {/* ACCOUNT INFO */}
            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-gray-100">
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
                    {new Date(collaborator.createdAt).toLocaleDateString('pt-BR')}
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

      {/* PAYMENT MODAL */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50 animate-in fade-in duration-300">
          <div className="w-full bg-white rounded-t-[40px] p-6 animate-in slide-in-from-bottom-4 duration-300">
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
                    className="w-full px-4 py-4 border border-gray-300 rounded-2xl text-lg font-bold focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 outline-none"
                  />
                  {paymentError && (
                    <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                      <AlertCircle size={14} /> {paymentError}
                    </p>
                  )}
                </div>

                {/* PAYMENT METHODS */}
                <div>
                  <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-3">Método de Pagamento</label>
                  <div className="space-y-2">
                    {(['PIX', 'BOLETO', 'CAIXA'] as const).map(method => (
                      <button
                        key={method}
                        onClick={() => {
                          setSelectedPaymentMethod(method);
                          setPaymentError(null);
                        }}
                        className={`w-full p-4 rounded-2xl border-2 transition-all text-sm font-bold uppercase flex items-center gap-3 ${
                          selectedPaymentMethod === method
                            ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-indigo-200'
                        }`}
                      >
                        {selectedPaymentMethod === method && <Check size={18} />}
                        {method === 'PIX' && '📱 Pix'}
                        {method === 'BOLETO' && '📋 Boleto'}
                        {method === 'CAIXA' && '💳 Caixa'}
                      </button>
                    ))}
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
                    onClick={handlePayment}
                    disabled={isProcessingPayment}
                    className="flex-1 px-4 py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-2xl font-bold shadow-lg transition-all active:scale-95"
                  >
                    {isProcessingPayment ? 'Processando...' : 'Confirmar Pagamento'}
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
