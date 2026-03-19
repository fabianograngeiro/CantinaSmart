
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Search, ShoppingCart, User, Trash2, CreditCard, X, 
  QrCode, Smartphone, PauseCircle, Clock, 
  RotateCcw, ChevronRight, ShieldAlert, UserSearch,
  UserMinus, Banknote, Wallet, CreditCard as CardIcon,
  ArrowRight, Layers, LayoutDashboard,
  Building, TrendingUp, AlertTriangle, Package, Activity,
  ArrowUpRight, ArrowDownRight, Users, Flame, Percent, RefreshCw, Scale,
  ArrowLeft, ChevronDown
} from 'lucide-react';
import { ApiService } from '../services/api';
import { Client, Product, SaleItem, PaymentMethod, PaymentEntry, SuspendedSale, Role, User as UserType, Enterprise, TransactionRecord, Plan } from '../types';
import { resolveUserAvatar } from '../utils/avatar';

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace(/\/api\/?$/, '');
const toAbsoluteProductImageUrl = (imageUrl?: string, productName?: string) => {
  if (imageUrl && /^https?:\/\//i.test(imageUrl)) return imageUrl;
  if (imageUrl && imageUrl.startsWith('/products_photos/')) return `${API_BASE_URL}${imageUrl}`;
  if (imageUrl) return imageUrl;
  return `https://picsum.photos/seed/${encodeURIComponent(productName || 'produto')}/200`;
};

const normalizeSearchText = (value?: string) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const WEEK_DAY_OPTIONS = [
  { key: 'SEGUNDA', label: 'Seg' },
  { key: 'TERCA', label: 'Ter' },
  { key: 'QUARTA', label: 'Qua' },
  { key: 'QUINTA', label: 'Qui' },
  { key: 'SEXTA', label: 'Sex' },
  { key: 'SABADO', label: 'Sab' },
  { key: 'DOMINGO', label: 'Dom' },
];

const MONTH_WEEK_HEADERS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];

const weekDayToJsDay: Record<string, number> = {
  SEGUNDA: 1,
  TERCA: 2,
  QUARTA: 3,
  QUINTA: 4,
  SEXTA: 5,
  SABADO: 6,
  DOMINGO: 0,
};

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const createPOSSaleReference = () => {
  const now = new Date();
  const dateKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const randomKey = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `VEN-${dateKey}-${randomKey}`;
};

const receiptZigZagEdgeStyle: React.CSSProperties = {
  background:
    'linear-gradient(-45deg, #fef3c7 8px, transparent 0) 0 0/16px 12px repeat-x, linear-gradient(45deg, #fef3c7 8px, transparent 0) 8px 0/16px 12px repeat-x',
  backgroundColor: '#ffffff',
};

interface POSPageProps {
  currentUser: UserType;
  activeEnterprise: Enterprise;
  onRegisterTransaction?: (transaction: TransactionRecord) => void;
}

const POSPage: React.FC<POSPageProps> = ({ currentUser, activeEnterprise, onRegisterTransaction }) => {
  // Guard clause: se não houver enterprise ativa, retornar carregamento
  if (!activeEnterprise) {
    return (
      <div className="pos-shell min-h-[24rem] flex items-center justify-center rounded-2xl">
        <div className="text-center space-y-4">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full"></div>
          <p className="text-gray-600 dark:text-zinc-300 font-medium">Carregando PDV...</p>
        </div>
      </div>
    );
  }

  const isOwner = currentUser.role === Role.OWNER;
  
  if (isOwner) {
    return <OwnerPOSMonitor activeEnterprise={activeEnterprise} />;
  }

  return <StandardPOSInterface activeEnterprise={activeEnterprise} onRegisterTransaction={onRegisterTransaction} />;
};

/* --- MONITOR DE MOVIMENTAÇÃO (VUE OWNER) --- */
const OwnerPOSMonitor: React.FC<{ activeEnterprise: Enterprise }> = ({ activeEnterprise }) => {
  // Guard clause: se não houver enterprise ativa, retornar carregamento
  if (!activeEnterprise) {
    return (
      <div className="pos-shell min-h-[24rem] flex items-center justify-center rounded-2xl">
        <div className="text-center space-y-4">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full"></div>
          <p className="text-gray-600 dark:text-zinc-300 font-medium">Carregando monitor...</p>
        </div>
      </div>
    );
  }

  const [selectedUnitId, setSelectedUnitId] = useState<string>('ALL');
  const [activeAlertDetail, setActiveAlertDetail] = useState<'CRITICO' | 'MINIMO' | 'SALDO' | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [productsData, clientsData, enterprisesData] = await Promise.all([
          ApiService.getProducts(activeEnterprise.id),
          ApiService.getClients(activeEnterprise.id),
          ApiService.getEnterprises()
        ]);
        setProducts(productsData);
        setClients(clientsData);
        setEnterprises(enterprisesData);
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [activeEnterprise.id]);
  
  // Simulação de alteração de dados conforme unidade
  const unitStats = useMemo(() => {
    const isGlobal = selectedUnitId === 'ALL';
    const multiplier = isGlobal ? 1 : 0.45; // Simula dados menores para unidades individuais

    return {
      vendasHoje: 4520.80 * multiplier,
      vendasMes: 128400.00 * multiplier,
      recargasHoje: 1250.00 * multiplier,
      recargasMes: 45900.00 * multiplier,
      clientesAtivos: Math.round(1240 * multiplier),
      estoqueCritico: isGlobal ? 4 : 1,
      estoqueBaixo: isGlobal ? 12 : 5,
      sangriaNecessaria: isGlobal ? 2 : 0,
      saldoMinimoAlertas: isGlobal ? 8 : 3
    };
  }, [selectedUnitId]);

  // Dados para os detalhes dos alertas
  const alertLists = useMemo(() => {
    return {
      CRITICO: products.filter(p => p.stock <= 0).slice(0, 5),
      MINIMO: products.filter(p => p.stock < p.minStock && p.stock > 0).slice(0, 5),
      SALDO: clients.filter(c => c.balance < 20).slice(0, 5)
    };
  }, [products, clients]);

  const top5Vendidos = [
    { name: 'Coxinha de Frango', qty: 154, trend: '+12%' },
    { name: 'Suco Laranja 300ml', qty: 128, trend: '+5%' },
    { name: 'Pão de Queijo', qty: 98, trend: '+8%' },
    { name: 'Brownie Caseiro', qty: 85, trend: '+15%' },
    { name: 'Água Mineral', qty: 72, trend: '-2%' }
  ];

  return (
    <div className="pos-shell space-y-6 animate-in fade-in duration-500 pb-10">
      {/* Header do Monitor com Seletor Dinâmico */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-gray-900 p-6 rounded-[32px] text-white shadow-2xl">
         <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
               <Activity size={32} />
            </div>
            <div>
               <h1 className="text-xl font-black leading-tight">Painel de Controle da Rede</h1>
               <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mt-1">
                  {selectedUnitId === 'ALL' ? 'Visão Consolidada (Todas as Unidades)' : `Monitorando Unidade: ${enterprises.find(e => e.id === selectedUnitId)?.name}`}
               </p>
            </div>
         </div>

         <div className="flex items-center gap-3 bg-white/5 p-2 rounded-2xl border border-white/10">
            <Building size={16} className="text-gray-400 ml-2" />
            <select 
              value={selectedUnitId}
              onChange={(e) => {
                setSelectedUnitId(e.target.value);
                setActiveAlertDetail(null); // Reseta detalhe ao trocar unidade
              }}
              className="bg-transparent text-sm font-black outline-none appearance-none cursor-pointer pr-8 focus:text-indigo-400 transition-colors"
            >
               <option value="ALL" className="text-gray-900">Visão Geral da Rede</option>
               {enterprises.map(e => <option key={e.id} value={e.id} className="text-gray-900">{e.name}</option>)}
            </select>
            {/* Fixed typo: changed RefreshCcw to RefreshCw */}
            <RefreshCw size={14} className="text-indigo-400 animate-spin-slow mr-2" />
         </div>
      </div>

      {/* Grid Principal de KPIs Dinâmicos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
         <MonitorStatCard title="Vendas Hoje" value={`R$ ${unitStats.vendasHoje.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`} sub={`Mês: R$ ${unitStats.vendasMes.toLocaleString('pt-BR')}`} icon={<TrendingUp />} color="bg-emerald-50 text-emerald-600" />
         <MonitorStatCard title="Recargas Hoje" value={`R$ ${unitStats.recargasHoje.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`} sub={`Mês: R$ ${unitStats.recargasMes.toLocaleString('pt-BR')}`} icon={<Wallet />} color="bg-indigo-50 text-indigo-600" />
         <MonitorStatCard title="Clientes Ativos" value={unitStats.clientesAtivos.toString()} sub="Total da Unidade" icon={<Users />} color="bg-blue-50 text-blue-600" />
         <MonitorStatCard title="Sangria Pendente" value={unitStats.sangriaNecessaria.toString()} sub="Caixas acima do limite" icon={<Banknote />} color="bg-amber-50 text-amber-600" isAlert={unitStats.sangriaNecessaria > 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         {/* Painel de Alertas com Drill-down Local */}
         <div className="lg:col-span-1 space-y-4">
            <div className="bg-white rounded-[32px] border shadow-sm overflow-hidden flex flex-col min-h-[420px]">
               <div className="p-6 border-b bg-gray-50 flex items-center justify-between">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                     <AlertTriangle size={16} className="text-amber-500" /> 
                     {activeAlertDetail ? 'Detalhamento de Alerta' : 'Alertas Críticos'}
                  </h3>
                  {activeAlertDetail && (
                    <button 
                      onClick={() => setActiveAlertDetail(null)}
                      className="text-[9px] font-black text-indigo-600 uppercase flex items-center gap-1 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-all"
                    >
                      <ArrowLeft size={12} /> Voltar
                    </button>
                  )}
               </div>

               <div className="p-6 flex-1">
                  {!activeAlertDetail ? (
                    /* VISÃO DE RESUMO DOS ALERTAS */
                    <div className="space-y-3 animate-in fade-in zoom-in-95">
                       <AlertItem 
                         label="Estoque Crítico (Zerar)" 
                         value={unitStats.estoqueCritico} 
                         color="red" 
                         onClick={() => setActiveAlertDetail('CRITICO')}
                       />
                       <AlertItem 
                         label="Abaixo do Mínimo" 
                         value={unitStats.estoqueBaixo} 
                         color="amber" 
                         onClick={() => setActiveAlertDetail('MINIMO')}
                       />
                       <AlertItem 
                         label="Alunos com Saldo Mínimo" 
                         value={unitStats.saldoMinimoAlertas} 
                         color="indigo" 
                         onClick={() => setActiveAlertDetail('SALDO')}
                       />
                       
                       <div className="pt-6 mt-6 border-t">
                          <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-center justify-between">
                             <div>
                                <p className="text-[10px] font-black text-indigo-400 uppercase">Status Operacional</p>
                                <p className="text-sm font-black text-indigo-700 mt-0.5">{selectedUnitId === 'ALL' ? '3 Caixas Abertos' : '1 Caixa Aberto'}</p>
                             </div>
                             <Activity size={24} className="text-indigo-300 animate-pulse" />
                          </div>
                       </div>
                    </div>
                  ) : (
                    /* VISÃO DETALHADA DO ALERTA SELECIONADO */
                    <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                       <div className="mb-4">
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Listagem de Ocorrências</p>
                          <div className="h-1 w-10 bg-indigo-500 rounded-full"></div>
                       </div>

                       <div className="space-y-2 overflow-y-auto max-h-[300px] scrollbar-hide">
                          {activeAlertDetail === 'SALDO' ? (
                            alertLists.SALDO.map(client => (
                              <div key={client.id} className="p-3 bg-gray-50 rounded-2xl flex items-center justify-between hover:bg-indigo-50 transition-colors group">
                                 <div className="flex items-center gap-3">
                                    <img
                                      src={resolveUserAvatar(client.photo, client.name)}
                                      onError={(e) => {
                                        e.currentTarget.onerror = null;
                                        e.currentTarget.src = resolveUserAvatar(undefined, client.name);
                                      }}
                                      className="w-8 h-8 rounded-lg object-cover border"
                                    />
                                    <div>
                                       <p className="text-xs font-black text-gray-800 leading-none">{client.name}</p>
                                       <p className="text-[9px] text-gray-400 font-bold uppercase mt-1">Mat: {client.registrationId}</p>
                                    </div>
                                 </div>
                                 <span className="text-xs font-black text-red-500 group-hover:scale-110 transition-transform">R$ {(client.balance || 0).toFixed(2)}</span>
                              </div>
                            ))
                          ) : (
                            alertLists[activeAlertDetail].map(product => (
                              <div key={product.id} className="p-3 bg-gray-50 rounded-2xl flex items-center justify-between hover:bg-indigo-50 transition-colors group">
                                 <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center border text-gray-300">
                                       <Package size={16} />
                                    </div>
                                    <div>
                                       <p className="text-xs font-black text-gray-800 leading-none">{product.name}</p>
                                       <p className="text-[9px] text-gray-400 font-bold uppercase mt-1">Saldo: {product.stock} un</p>
                                    </div>
                                 </div>
                                 <span className="text-[9px] font-black bg-white px-2 py-1 rounded-lg border uppercase group-hover:border-indigo-200">Mín: {product.minStock}</span>
                              </div>
                            ))
                          )}
                       </div>
                       <button className="w-full py-3 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2">
                          <ChevronRight size={14} /> Tratar Pendências
                       </button>
                    </div>
                  )}
               </div>
            </div>

            <div className="bg-white p-6 rounded-[32px] border shadow-sm">
               <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Performance do Dia</h3>
               <div className="flex items-center justify-between">
                  <div className="text-center flex-1">
                     <p className="text-2xl font-black text-gray-800">{selectedUnitId === 'ALL' ? '84%' : '92%'}</p>
                     <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">Capacidade de Escala</p>
                  </div>
                  <div className="w-px h-10 bg-gray-100"></div>
                  <div className="text-center flex-1">
                     <p className="text-2xl font-black text-indigo-600">R$ {selectedUnitId === 'ALL' ? '24,50' : '28,10'}</p>
                     <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">Ticket Médio</p>
                  </div>
               </div>
            </div>
         </div>

         {/* Rankings de Produtos - Comportamento Fixo de Top 5 */}
         <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-[32px] border shadow-sm flex flex-col">
               <h3 className="text-xs font-black text-emerald-600 uppercase tracking-widest mb-6 flex items-center gap-2">
                  <ArrowUpRight size={16} /> Top 5 Mais Vendidos
               </h3>
               <div className="space-y-4 flex-1">
                  {top5Vendidos.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between group">
                       <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-lg bg-gray-50 flex items-center justify-center text-[10px] font-black text-gray-400">{idx+1}</span>
                          <div>
                             <p className="text-xs font-black text-gray-800 group-hover:text-indigo-600 transition-colors">{item.name}</p>
                             <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-tighter">{item.trend} vs ontem</p>
                          </div>
                       </div>
                       <span className="text-sm font-black text-gray-700">{Math.round(item.qty * (selectedUnitId === 'ALL' ? 1 : 0.4))} un</span>
                    </div>
                  ))}
               </div>
               <button className="mt-6 w-full py-3 bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest rounded-xl hover:bg-gray-100 transition-all">Ver Relatório Completo</button>
            </div>

            <div className="bg-white p-6 rounded-[32px] border shadow-sm flex flex-col border-b-4 border-b-red-100">
               <h3 className="text-xs font-black text-red-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                  <ArrowDownRight size={16} /> Bottom 5 (Menos Saída)
               </h3>
               <div className="space-y-4 flex-1">
                  {top5Vendidos.slice().reverse().map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between group opacity-80 hover:opacity-100">
                       <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-red-400">
                             <Package size={14} />
                          </div>
                          <p className="text-xs font-black text-gray-800">{item.name}</p>
                       </div>
                       <div className="text-right">
                          <p className="text-sm font-black text-red-500">{Math.round((item.qty/5) * (selectedUnitId === 'ALL' ? 1 : 0.5))} un</p>
                          <p className="text-[8px] font-bold text-gray-400 uppercase">ESTAGNADO</p>
                       </div>
                    </div>
                  ))}
               </div>
               <div className="mt-6 p-3 bg-red-50 rounded-xl flex items-center gap-2">
                  <ShieldAlert size={14} className="text-red-500" />
                  <p className="text-[9px] font-black text-red-800 uppercase leading-tight">Sugestão: Descontinuar ou fazer promoção</p>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
};

const MonitorStatCard = ({ title, value, sub, icon, color, isAlert }: any) => (
  <div className={`bg-white p-6 rounded-[32px] border shadow-sm transition-all hover:shadow-xl group relative overflow-hidden ${isAlert ? 'border-amber-200' : 'border-gray-100'}`}>
     <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-2xl ${color} shadow-inner group-hover:scale-110 transition-transform`}>{icon}</div>
        {isAlert && <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-ping"></span>}
     </div>
     <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">{title}</p>
     <p className="text-2xl font-black text-gray-800 mt-1">{value}</p>
     <p className="text-[10px] font-bold text-indigo-400 mt-1 uppercase tracking-tighter opacity-70 group-hover:opacity-100 transition-opacity">{sub}</p>
  </div>
);

const AlertItem = ({ label, value, color, onClick }: any) => {
  const colorMap: any = {
    red: 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-100',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-indigo-100'
  };
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all active:scale-95 group ${colorMap[color]}`}
    >
       <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
       <div className="flex items-center gap-2">
          <span className="text-lg font-black">{value}</span>
          <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
       </div>
    </button>
  );
};


/* --- INTERFACE PADRÃO (VUE OPERADOR) --- */
const StandardPOSInterface: React.FC<{ activeEnterprise: Enterprise; onRegisterTransaction?: (transaction: TransactionRecord) => void }> = ({ activeEnterprise, onRegisterTransaction }) => {
  const activeEnterpriseId = activeEnterprise.id;
  const formatCurrencyBRL = (value: number) => {
    const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
    return safe.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const [clientSearch, setClientSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isFinalConsumer, setIsFinalConsumer] = useState(false);
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [saleReference, setSaleReference] = useState<string>(() => createPOSSaleReference());
  const [activeCategory, setActiveCategory] = useState<string>('TODOS');
  const [lastScanSuccess, setLastScanSuccess] = useState(false);
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [suspendedSales, setSuspendedSales] = useState<SuspendedSale[]>([]);
  const [showSuspendedPanel, setShowSuspendedPanel] = useState(false);
  const [showClientSuggestions, setShowClientSuggestions] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [posTransactions, setPosTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Estado de pagamento split inline (sem modal)
  const [isServiceActionModalOpen, setIsServiceActionModalOpen] = useState(false);
  const [serviceActionType, setServiceActionType] = useState<'CREDIT_STUDENT' | 'PAY_COLLAB' | null>(null);
  const [serviceActionAmount, setServiceActionAmount] = useState<string>('');
  const [activeSplitMethod, setActiveSplitMethod] = useState<PaymentMethod | null>(null);
  
  const [cashReceived, setCashReceived] = useState<string>('');
  const [partialAmount, setPartialAmount] = useState<string>('');
  const [isKgModalOpen, setIsKgModalOpen] = useState(false);
  const [kgProduct, setKgProduct] = useState<Product | null>(null);
  const [kgWeightInput, setKgWeightInput] = useState<string>('0,000');
  const [isNegativeBalanceWarningOpen, setIsNegativeBalanceWarningOpen] = useState(false);
  const [pendingNegativeBalanceAction, setPendingNegativeBalanceAction] = useState<(() => void) | null>(null);
  const [negativeBalanceWarningClientName, setNegativeBalanceWarningClientName] = useState<string>('');
  const [studentCreditPlanIds, setStudentCreditPlanIds] = useState<string[]>([]);
  const [studentCreditPlanDays, setStudentCreditPlanDays] = useState<Record<string, string[]>>({});
  const [studentCreditPlanDates, setStudentCreditPlanDates] = useState<Record<string, string[]>>({});
  const [studentCreditOpenCalendarId, setStudentCreditOpenCalendarId] = useState<string | null>(null);
  const [studentCreditCalendarMonth, setStudentCreditCalendarMonth] = useState<Date>(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  
  const clientInputRef = useRef<HTMLInputElement>(null);
  const kgInputRef = useRef<HTMLInputElement>(null);
  const serviceActionInputRef = useRef<HTMLInputElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!activeEnterpriseId) {
      setLoading(false);
      return;
    }

    const loadData = async () => {
      setLoading(true);
      try {
        const [clientsData, productsData, plansData, transactionsData] = await Promise.all([
          ApiService.getClients(activeEnterpriseId),
          ApiService.getProducts(activeEnterpriseId),
          ApiService.getPlans(activeEnterpriseId),
          ApiService.getTransactions({ enterpriseId: activeEnterpriseId })
        ]);
        setClients(clientsData);
        setProducts(productsData);
        setPlans(plansData);
        setPosTransactions(Array.isArray(transactionsData) ? transactionsData : []);
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [activeEnterpriseId]);

  const availablePlans = useMemo(() => {
    return plans.filter(p => p.enterpriseId === activeEnterpriseId && p.isActive !== false);
  }, [plans, activeEnterpriseId]);

  const studentCreditCalendarMonthLabel = useMemo(() => {
    return studentCreditCalendarMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }, [studentCreditCalendarMonth]);

  const studentCreditCalendarGrid = useMemo(() => {
    const year = studentCreditCalendarMonth.getFullYear();
    const month = studentCreditCalendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const totalDays = new Date(year, month + 1, 0).getDate();
    const startOffset = (firstDay.getDay() + 6) % 7;
    const cells: Array<Date | null> = [];

    for (let i = 0; i < startOffset; i += 1) cells.push(null);
    for (let day = 1; day <= totalDays; day += 1) cells.push(new Date(year, month, day));

    return cells;
  }, [studentCreditCalendarMonth]);

  const categories = useMemo(() => {
    const uniqueCategories = ['TODOS', 'PLANOS'];
    const seen = new Set<string>(['TODOS', 'PLANOS']);
    const cats = products
      .map(p => String(p.category || '').trim())
      .filter(Boolean)
      .filter((cat) => {
        const key = cat.toUpperCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    return [...uniqueCategories, ...cats];
  }, [products]);

  const initAudio = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    } else if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  };

  const playSuccessBeep = () => {
    initAudio();
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  };

  const selectClient = (client: Client) => {
    setSelectedClient(client);
    setIsFinalConsumer(false);
    setClientSearch('');
    setShowClientSuggestions(false);
    playSuccessBeep();
    setLastScanSuccess(true);
    setTimeout(() => setLastScanSuccess(false), 2000);
  };

  const handleToggleFinalConsumer = () => {
    const newState = !isFinalConsumer;
    setIsFinalConsumer(newState);
    if (newState) {
      setSelectedClient(null);
      setPayments(prev => prev.filter(p => p.method !== 'SALDO'));
    }
  };

  const clientSuggestions = useMemo(() => {
    const normalizedClientSearch = normalizeSearchText(clientSearch);
    if (!normalizedClientSearch) return [];
    return clients.filter(c => 
      normalizeSearchText(c.name).includes(normalizedClientSearch) ||
      normalizeSearchText(c.registrationId).includes(normalizedClientSearch)
    ).slice(0, 5);
  }, [clientSearch, clients]);

  useEffect(() => {
    const handleGlobalClick = () => {
      if (!selectedClient && !isFinalConsumer && !showSuspendedPanel && document.activeElement?.tagName !== 'INPUT') {
        clientInputRef.current?.focus();
      }
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [selectedClient, isFinalConsumer, showSuspendedPanel]);

  const filteredProducts = useMemo(() => {
    const normalizedActiveCategory = String(activeCategory || '').trim().toUpperCase();
    if (normalizedActiveCategory === 'PLANOS') return [];
    const normalizedSearch = normalizeSearchText(productSearch);

    const salesCountByProductName = new Map<string, number>();
    posTransactions.forEach((tx: any) => {
      const rawItems = Array.isArray(tx?.items) ? tx.items : [];
      if (rawItems.length > 0) {
        rawItems.forEach((item: any) => {
          const itemName = String(item?.name || item?.productName || '').trim().toUpperCase();
          if (!itemName) return;
          const qty = Number(item?.quantity || 1);
          salesCountByProductName.set(itemName, (salesCountByProductName.get(itemName) || 0) + (Number.isFinite(qty) ? qty : 1));
        });
        return;
      }

      const legacyItemName = String(tx?.item || '').trim().toUpperCase();
      if (!legacyItemName) return;
      salesCountByProductName.set(legacyItemName, (salesCountByProductName.get(legacyItemName) || 0) + 1);
    });

    const base = products.filter((p) => {
      const productCategory = String(p.category || '').trim();
      const normalizedProductCategory = productCategory.toUpperCase();
      const isGeneralCategory = normalizedProductCategory === 'GERAL';

      const matchesCategory = normalizedActiveCategory === 'TODOS'
        ? true
        : normalizedActiveCategory === 'GERAL'
          ? isGeneralCategory
          : (normalizedProductCategory === normalizedActiveCategory || isGeneralCategory);

      const matchesSearch = !normalizedSearch || normalizeSearchText(p.name).includes(normalizedSearch);

      return matchesCategory && matchesSearch;
    });

    return base.sort((a, b) => {
      const aCategory = String(a.category || '').trim().toUpperCase();
      const bCategory = String(b.category || '').trim().toUpperCase();

      if (!['TODOS', 'GERAL'].includes(normalizedActiveCategory)) {
        const aPriority = aCategory === normalizedActiveCategory ? 0 : 1;
        const bPriority = bCategory === normalizedActiveCategory ? 0 : 1;
        if (aPriority !== bPriority) return aPriority - bPriority;
      }

      const aSales = salesCountByProductName.get(String(a.name || '').trim().toUpperCase()) || 0;
      const bSales = salesCountByProductName.get(String(b.name || '').trim().toUpperCase()) || 0;
      if (aSales !== bSales) return bSales - aSales;

      return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR', { sensitivity: 'base' });
    });
  }, [activeCategory, productSearch, products, posTransactions]);

  const productsById = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((product) => {
      map.set(String(product.id), product);
    });
    return map;
  }, [products]);

  const filteredPlans = useMemo(() => {
    const normalizedActiveCategory = String(activeCategory || '').trim().toUpperCase();
    if (normalizedActiveCategory !== 'PLANOS') return [];
    const normalizedSearch = normalizeSearchText(productSearch);
    return availablePlans.filter((plan) =>
      !normalizedSearch || normalizeSearchText(plan.name).includes(normalizedSearch)
    );
  }, [activeCategory, availablePlans, productSearch]);

  const getPlanUnitRemaining = (client: Client | null, plan: Plan) => {
    if (!client) return 0;
    const selectedConfigs = Array.isArray((client as any).selectedPlansConfig)
      ? ((client as any).selectedPlansConfig as Array<any>)
      : [];

    const config = selectedConfigs.find((cfg: any) =>
      String(cfg?.planId || '') === plan.id
      || String(cfg?.planName || '').trim().toUpperCase() === String(plan.name || '').trim().toUpperCase()
    );

    const totalConfigured = config
      ? (
          Array.isArray(config.selectedDates) && config.selectedDates.length > 0
            ? config.selectedDates.length
            : (Array.isArray(config.daysOfWeek) ? config.daysOfWeek.length : 0)
        )
      : 0;

    const usedInTransactions = posTransactions.filter((tx: any) => {
      if (String(tx?.clientId || '') !== String(client.id || '')) return false;
      const rawType = String(tx?.type || '').toUpperCase();
      if (rawType !== 'CONSUMO') return false;
      const txPlan = String(tx?.plan || '').trim().toUpperCase();
      const txDesc = String(tx?.description || tx?.item || '').toUpperCase();
      const planNameUpper = String(plan.name || '').trim().toUpperCase();
      return txPlan === planNameUpper || txDesc.includes(planNameUpper);
    }).length;

    const pendingInCart = cart.filter((item) =>
      item.serviceAction === 'PLAN_CONSUMPTION'
      && String(item.planId || '') === String(plan.id)
    ).length;

    return Math.max(0, totalConfigured - usedInTransactions - pendingInCart);
  };

  const getPlanUnitPriceForClient = (client: Client | null, plan: Plan | null, fallbackPlanId?: string, fallbackPlanName?: string) => {
    if (!client) return Number(plan?.price || 0);

    const selectedConfigs = Array.isArray((client as any).selectedPlansConfig)
      ? ((client as any).selectedPlansConfig as Array<any>)
      : [];

    const normalizedPlanId = String(plan?.id || fallbackPlanId || '');
    const normalizedPlanName = String(plan?.name || fallbackPlanName || '').trim().toUpperCase();

    const config = selectedConfigs.find((cfg: any) =>
      String(cfg?.planId || '') === normalizedPlanId
      || String(cfg?.planName || '').trim().toUpperCase() === normalizedPlanName
    );

    const configPrice = Number(config?.planPrice || 0);
    if (Number.isFinite(configPrice) && configPrice > 0) return configPrice;

    const planPrice = Number(plan?.price || 0);
    if (Number.isFinite(planPrice) && planPrice > 0) return planPrice;

    return 0;
  };

  const clientNegativeSalesAllowed = Boolean(activeEnterprise.allowNegativeSalesForClients);
  const clientNegativeLimit = Math.max(0, Number(activeEnterprise.negativeLimitClients || 0));
  const collaboratorNegativeSalesAllowed = Boolean(activeEnterprise.allowNegativeSalesForCollaborators);
  const collaboratorNegativeLimit = Math.max(0, Number(activeEnterprise.negativeLimitCollaborators || 0));

  const canClientUseNegativeBalance = (client: Client, amount: number) => {
    const numericAmount = Number(amount || 0);
    if (numericAmount <= 0) return true;
    const currentBalance = Number(client.balance || 0);
    if (currentBalance >= numericAmount) return true;
    if (!clientNegativeSalesAllowed) return false;
    if (clientNegativeLimit <= 0) return true;
    const resultingBalance = currentBalance - numericAmount;
    return resultingBalance >= (-clientNegativeLimit - 0.0001);
  };

  const canCollaboratorIncreaseDebt = (client: Client, amount: number) => {
    const numericAmount = Number(amount || 0);
    if (numericAmount <= 0) return true;
    const currentDue = Number(client.amountDue || 0);
    if (currentDue + numericAmount <= 0.0001) return true;
    if (!collaboratorNegativeSalesAllowed) return false;
    if (collaboratorNegativeLimit <= 0) return true;
    const resultingDue = currentDue + numericAmount;
    return resultingDue <= collaboratorNegativeLimit + 0.0001;
  };

  const clientHasPlanAndCantinaCredit = (client: Client) => {
    const plans = Array.isArray(client.servicePlans) ? client.servicePlans : [];
    const hasCantina = plans.includes('PREPAGO');
    const hasAnyPlanFromService = plans.some((planName) => planName !== 'PREPAGO');
    const selectedConfigs = Array.isArray((client as any).selectedPlansConfig)
      ? ((client as any).selectedPlansConfig as Array<any>)
      : [];
    const hasAnyConfiguredPlan = selectedConfigs.some((cfg: any) => {
      const hasDates = Array.isArray(cfg?.selectedDates) && cfg.selectedDates.length > 0;
      const hasDays = Array.isArray(cfg?.daysOfWeek) && cfg.daysOfWeek.length > 0;
      return hasDates || hasDays;
    });
    return hasCantina && (hasAnyPlanFromService || hasAnyConfiguredPlan);
  };

  const maybeConfirmNegativeBalanceLaunch = (onConfirm: () => void) => {
    if (!selectedClient || isFinalConsumer) {
      onConfirm();
      return;
    }
    if (selectedClient.type === 'COLABORADOR') {
      onConfirm();
      return;
    }
    if (!clientNegativeSalesAllowed || Number(selectedClient.balance || 0) >= 0 || !clientHasPlanAndCantinaCredit(selectedClient)) {
      onConfirm();
      return;
    }
    setNegativeBalanceWarningClientName(selectedClient.name);
    setPendingNegativeBalanceAction(() => onConfirm);
    setIsNegativeBalanceWarningOpen(true);
  };

  const addPlanConsumptionToCart = (plan: Plan) => {
    if (selectedClient?.isBlocked) return alert("CLIENTE BLOQUEADO.");
    if (!selectedClient || isFinalConsumer) return alert("Identifique o aluno para consumir plano.");
    if (selectedClient.type === 'COLABORADOR') return alert("Consumo de plano é exclusivo para aluno.");

    const remainingUnits = getPlanUnitRemaining(selectedClient, plan);
    if (remainingUnits <= 0) {
      return alert(`Sem saldo de unidades para o plano ${plan.name}.`);
    }

    maybeConfirmNegativeBalanceLaunch(() => {
      const serviceId = `SERVICE_PLAN_CONSUMPTION_${plan.id}_${Date.now()}`;
      setCart(prev => [
        ...prev,
        {
          productId: serviceId,
          name: `Consumo plano ${plan.name}`,
          quantity: 1,
          price: 0,
          mode: 'UN',
          serviceAction: 'PLAN_CONSUMPTION',
          planId: plan.id,
          planName: plan.name
        }
      ]);
    });
  };

  const addToCart = (product: Product) => {
    if (selectedClient?.isBlocked) return alert("CLIENTE BLOQUEADO.");

    maybeConfirmNegativeBalanceLaunch(() => {
      if ((product.unit || 'UN') === 'KG') {
        setKgProduct(product);
        setKgWeightInput('0,000');
        setIsKgModalOpen(true);
        return;
      }

      setCart(prev => {
        const existing = prev.find(item => item.productId === product.id);
        if (existing) {
          return prev.map(item => item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item);
        }
        return [...prev, { productId: product.id, name: product.name, quantity: 1, price: product.price }];
      });
    });
  };

  const formatKgWeightInput = (rawValue: string) => {
    const digitsOnly = rawValue.replace(/\D/g, '').slice(0, 6);
    if (!digitsOnly) return '0,000';

    const integerPartRaw = digitsOnly.slice(0, -3);
    const integerPart = integerPartRaw ? String(parseInt(integerPartRaw, 10)) : '0';
    const decimalPart = digitsOnly.slice(-3).padStart(3, '0');
    return `${integerPart},${decimalPart}`;
  };

  const parseKgWeight = (maskedValue: string) => {
    const normalized = maskedValue.replace(/\./g, '').replace(',', '.');
    const weight = Number(normalized);
    return Number.isFinite(weight) ? weight : 0;
  };

  const confirmKgProduct = () => {
    if (!kgProduct) return;
    if (selectedClient?.isBlocked) return alert("CLIENTE BLOQUEADO.");

    const weight = parseKgWeight(kgWeightInput);
    if (!Number.isFinite(weight) || weight <= 0) {
      return alert('Informe um peso válido em KG.');
    }

    const pricePerKg = Number(kgProduct.price || 0);
    const total = Number((weight * pricePerKg).toFixed(2));
    const lineId = `${kgProduct.id}__KG__${Date.now()}`;

    maybeConfirmNegativeBalanceLaunch(() => {
      setCart(prev => [
        ...prev,
        {
          productId: lineId,
          name: `${kgProduct.name} (${weight.toFixed(3)} KG)`,
          quantity: 1,
          price: total,
          mode: 'KG',
          weight
        }
      ]);

      setIsKgModalOpen(false);
      setKgProduct(null);
      setKgWeightInput('0,000');
    });
  };

  const handleCreditStudent = () => {
    if (!selectedClient) return;
    if (selectedClient.type === 'COLABORADOR') {
      alert('Use a opção de pagamento de consumo para colaborador.');
      return;
    }
    setServiceActionType('CREDIT_STUDENT');
    setServiceActionAmount('');
    setStudentCreditPlanIds([]);
    setStudentCreditPlanDays({});
    setStudentCreditPlanDates({});
    setStudentCreditOpenCalendarId(null);
    setStudentCreditCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    setIsServiceActionModalOpen(true);
  };

  const handlePayNegativeBalance = () => {
    if (!selectedClient || selectedClient.type === 'COLABORADOR') return;

    const currentDebt = Math.max(0, Number(-(selectedClient.balance || 0)));
    if (currentDebt <= 0) return;

    const pendingDebtInCart = cart
      .filter((item) => item.serviceAction === 'CREDIT_STUDENT_FREE' && item.productId.startsWith('SERVICE_NEGATIVE_BALANCE_'))
      .reduce((sum, item) => sum + Number((item.price || 0) * (item.quantity || 0)), 0);

    const amountToAdd = Number((currentDebt - pendingDebtInCart).toFixed(2));
    if (amountToAdd <= 0) return;

    addServiceItemToCart(
      `SERVICE_NEGATIVE_BALANCE_${Date.now()}`,
      `Pagamento saldo devedor: ${selectedClient.name}`,
      amountToAdd,
      { serviceAction: 'CREDIT_STUDENT_FREE' }
    );
  };

  const handlePayCollaboratorConsumption = () => {
    if (!selectedClient) return;
    if (selectedClient.type !== 'COLABORADOR') {
      alert('Essa função é exclusiva para colaborador.');
      return;
    }

    const currentDue = Number(selectedClient.amountDue || 0);
    if (currentDue <= 0) {
      alert('Este colaborador não possui consumo pendente.');
      return;
    }
    setServiceActionType('PAY_COLLAB');
    setServiceActionAmount(currentDue.toFixed(2));
    setIsServiceActionModalOpen(true);
  };

  const getDateKeysForWeekdayInStudentCreditMonth = (weekDayKey: string) => {
    const targetJsDay = weekDayToJsDay[weekDayKey];
    if (targetJsDay === undefined) return [];

    const result: string[] = [];
    const year = studentCreditCalendarMonth.getFullYear();
    const month = studentCreditCalendarMonth.getMonth();
    const totalDays = new Date(year, month + 1, 0).getDate();

    for (let day = 1; day <= totalDays; day += 1) {
      const date = new Date(year, month, day);
      if (date.getDay() === targetJsDay) result.push(toDateKey(date));
    }
    return result;
  };

  const toggleStudentCreditPlan = (planId: string) => {
    setStudentCreditPlanIds((prev) => {
      const isSelected = prev.includes(planId);
      if (isSelected) {
        if (studentCreditOpenCalendarId === planId) setStudentCreditOpenCalendarId(null);
        return prev.filter((id) => id !== planId);
      }
      setStudentCreditOpenCalendarId(planId);
      return [...prev, planId];
    });
  };

  const toggleStudentCreditPlanDay = (planId: string, dayKey: string) => {
    setStudentCreditPlanDays(prev => {
      const currentDays = prev[planId] || [];
      const hasDay = currentDays.includes(dayKey);
      const nextDays = hasDay ? currentDays.filter(day => day !== dayKey) : [...currentDays, dayKey];

      setStudentCreditPlanDates(prevDates => {
        const currentDates = new Set(prevDates[planId] || []);
        const weekdayDates = getDateKeysForWeekdayInStudentCreditMonth(dayKey);

        if (hasDay) {
          weekdayDates.forEach(dateKey => currentDates.delete(dateKey));
        } else {
          weekdayDates.forEach(dateKey => currentDates.add(dateKey));
        }

        return {
          ...prevDates,
          [planId]: Array.from(currentDates).sort(),
        };
      });

      return {
        ...prev,
        [planId]: nextDays,
      };
    });
  };

  const toggleStudentCreditPlanDate = (planId: string, date: Date) => {
    const dateKey = toDateKey(date);
    setStudentCreditPlanDates(prev => {
      const current = prev[planId] || [];
      const exists = current.includes(dateKey);
      return {
        ...prev,
        [planId]: exists ? current.filter(d => d !== dateKey) : [...current, dateKey].sort(),
      };
    });
  };

  const addServiceItemToCart = (
    serviceId: string,
    serviceName: string,
    amount: number,
    meta?: Partial<SaleItem>
  ) => {
    setCart(prev => [
      ...prev,
      {
        productId: serviceId,
        name: serviceName,
        quantity: 1,
        price: amount,
        mode: 'UN',
        ...meta
      }
    ]);
  };

  const closeServiceActionModal = () => {
    setIsServiceActionModalOpen(false);
    setServiceActionType(null);
    setServiceActionAmount('');
    setStudentCreditPlanIds([]);
    setStudentCreditPlanDays({});
    setStudentCreditPlanDates({});
    setStudentCreditOpenCalendarId(null);
    setStudentCreditCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  };

  const confirmServiceActionToCart = () => {
    if (!selectedClient || !serviceActionType) return;
    const freeAmount = Number(serviceActionAmount.replace(',', '.'));

    if (serviceActionType === 'CREDIT_STUDENT') {
      const validFreeAmount = Number.isFinite(freeAmount) && freeAmount > 0 ? freeAmount : 0;
      const selectedPlanCredits = studentCreditPlanIds
        .map((planId) => {
          const selectedPlan = availablePlans.find(plan => plan.id === planId);
          if (!selectedPlan) return null;
          const selectedDays = studentCreditPlanDays[planId] || [];
          const selectedDates = studentCreditPlanDates[planId] || [];
          const selectedCount = selectedDates.length > 0 ? selectedDates.length : selectedDays.length;
          const planSubtotal = Number((selectedPlan.price * selectedCount).toFixed(2));
          if (selectedCount <= 0 || planSubtotal <= 0) return null;
          return { selectedPlan, selectedDays, selectedDates, selectedCount, planSubtotal };
        })
        .filter(Boolean) as Array<{
          selectedPlan: Plan;
          selectedDays: string[];
          selectedDates: string[];
          selectedCount: number;
          planSubtotal: number;
        }>;

      if (validFreeAmount <= 0 && selectedPlanCredits.length === 0) {
        alert('Informe crédito livre e/ou selecione dias de um plano.');
        return;
      }

      if (validFreeAmount > 0) {
        addServiceItemToCart(
          `SERVICE_CREDIT_STUDENT_${Date.now()}`,
          `Crédito livre cantina: ${selectedClient.name}`,
          validFreeAmount,
          { serviceAction: 'CREDIT_STUDENT_FREE' }
        );
      }

      selectedPlanCredits.forEach(({ selectedPlan, selectedDays, selectedDates, selectedCount, planSubtotal }) => {
        addServiceItemToCart(
          `SERVICE_CREDIT_STUDENT_PLAN_${selectedPlan.id}_${Date.now()}`,
          `Crédito plano ${selectedPlan.name} (${selectedCount} dia(s)): ${selectedClient.name}`,
          planSubtotal,
          {
            serviceAction: 'CREDIT_STUDENT_PLAN',
            planId: selectedPlan.id,
            planName: selectedPlan.name,
            selectedDays: [...selectedDays],
            selectedDates: [...selectedDates]
          }
        );
      });
      closeServiceActionModal();
      return;
    }

    if (!Number.isFinite(freeAmount) || freeAmount <= 0) {
      alert('Informe um valor válido.');
      return;
    }

    const serviceId = `SERVICE_${serviceActionType}_${Date.now()}`;
    const serviceName = `Pagamento consumo mês: ${selectedClient.name}`;

    addServiceItemToCart(serviceId, serviceName, freeAmount, {
      serviceAction: 'PAY_COLLAB'
    });
    closeServiceActionModal();
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.productId !== productId));
  };

  const changeCartItemQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev.flatMap((item) => {
        if (item.productId !== productId) return [item];
        const nextQuantity = Number(item.quantity || 0) + delta;
        if (nextQuantity <= 0) return [];
        return [{ ...item, quantity: nextQuantity }];
      })
    );
  };

  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + (item.price * item.quantity), 0), [cart]);
  const totalPaid = useMemo(() => payments.reduce((sum, p) => sum + p.amount, 0), [payments]);
  const remainingToPay = Math.max(0, cartTotal - totalPaid);

  const cashReceivedNumeric = useMemo(() => {
    const normalized = String(cashReceived || '').replace(',', '.');
    const value = Number(normalized);
    return Number.isFinite(value) ? value : 0;
  }, [cashReceived]);

  const changeAmount = useMemo(() => {
    return Math.max(0, cashReceivedNumeric - remainingToPay);
  }, [cashReceivedNumeric, remainingToPay]);

  const printReceiptInBrowser = (params: {
    now: Date;
    items: SaleItem[];
    paymentsList: PaymentEntry[];
    totalValue: number;
    changeValue?: number;
    clientBalanceAfter?: number | null;
  }) => {
    const paperWidth = activeEnterprise.receiptPaperWidth || '80mm';
    const marginVertical = Math.max(0, Math.min(20, Number(activeEnterprise.receiptMarginVertical ?? 2)));
    const marginHorizontal = Math.max(0, Math.min(20, Number(activeEnterprise.receiptMarginHorizontal ?? 2)));
    const itemGapTop = Math.max(0, Math.min(20, Number(activeEnterprise.receiptItemGapTop ?? 4)));
    const itemGapBottom = Math.max(0, Math.min(20, Number(activeEnterprise.receiptItemGapBottom ?? 4)));
    const fontFamilyMap: Record<string, string> = {
      ARIAL_BLACK: '"Arial Black", Arial, sans-serif',
      ARIAL: 'Arial, sans-serif',
      COURIER_NEW: '"Courier New", Courier, monospace',
      MONOSPACE: 'monospace'
    };
    const fontSizeMap: Record<string, { base: string; small: string; total: string }> = {
      SMALL: { base: '10px', small: '9px', total: '12px' },
      NORMAL: { base: '12px', small: '11px', total: '14px' },
      LARGE: { base: '14px', small: '12px', total: '16px' }
    };
    const fontFamily = fontFamilyMap[activeEnterprise.receiptFontFamily || 'ARIAL_BLACK'] || fontFamilyMap.ARIAL_BLACK;
    const fontScale = fontSizeMap[activeEnterprise.receiptFontSize || 'NORMAL'] || fontSizeMap.NORMAL;

    const { now, items, paymentsList, totalValue, changeValue = 0, clientBalanceAfter = null } = params;
    const itemsHtml = items.map((item) => {
      const lineTotal = Number((item.quantity * item.price).toFixed(2));
      return `
        <div class="receipt-entry">
          <div class="entry-line entry-label" style="padding-top:${itemGapTop}px;">${item.quantity}x ${item.name}:</div>
          <div class="entry-line entry-price-left" style="padding-bottom:${itemGapBottom}px;">R$ ${lineTotal.toFixed(2)}</div>
          <div class="entry-divider" style="margin-bottom:${Math.max(2, Math.round(itemGapBottom / 2))}px;"></div>
        </div>
      `;
    }).join('');

    const paymentsHtml = paymentsList.map((payment) => {
      const paidValue = payment.method === 'DINHEIRO'
        ? Number(payment.receivedAmount ?? payment.amount)
        : Number(payment.amount);
      return `
        <div class="receipt-entry">
          <div class="entry-line" style="padding-top:${itemGapTop}px; padding-bottom:${itemGapBottom}px;">
            <span class="entry-label">${payment.method === 'SALDO' ? 'SALDO CANTINA' : payment.method}:</span>
            <span class="entry-price-inline">R$ ${paidValue.toFixed(2)}</span>
          </div>
          <div class="entry-divider" style="margin-bottom:${Math.max(2, Math.round(itemGapBottom / 2))}px;"></div>
        </div>
      `;
    }).join('');

    const html = `
      <html>
        <head>
          <title>Cupom PDV</title>
          <style>
            @page { size: ${paperWidth} auto; margin: ${marginVertical}mm ${marginHorizontal}mm; }
            body { font-family: ${fontFamily}; font-weight: 900; width: 100%; margin: 0; padding: 0; color: #111; }
            h1, h2, h3, p { margin: 0; }
            .center { text-align: center; }
            .line { border-top: 1px dashed #999; margin: 8px 0; }
            .entries { width: 100%; font-size: ${fontScale.base}; font-weight: 900; line-height: 1.35; }
            .entry-line { text-align: left; overflow-wrap: anywhere; }
            .entry-label { white-space: normal; }
            .entry-price-left { white-space: nowrap; text-align: left; }
            .entry-price-inline { white-space: nowrap; float: right; }
            .entry-divider { border-top: 1px dashed #bdbdbd; }
            .small { font-size: ${fontScale.small}; color: #444; font-weight: 900; }
            .total { font-weight: 900; font-size: ${fontScale.total}; }
            .total-row { text-align: left; font-weight: 900; font-size: ${fontScale.total}; margin-top: 2px; }
          </style>
        </head>
        <body>
          <div class="center">
            <h3>${activeEnterprise.name}</h3>
            <p class="small">Cupom não fiscal</p>
            <p class="small">${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR')}</p>
          </div>
          <div class="line"></div>
          <p class="small">Cliente: ${selectedClient?.name || 'Consumidor Final'}</p>
          <p class="small">Operador: PDV</p>
          <p class="small">Impressora: ${activeEnterprise.receiptPrinterName || 'Padrão do sistema'}</p>
          <div class="line"></div>
          <div class="entries">
            ${itemsHtml}
          </div>
          <div class="line"></div>
          <div class="entries">
            ${paymentsHtml}
          </div>
          ${changeValue > 0 ? `
            <div class="line"></div>
            <div class="entry-line">Troco: R$ ${changeValue.toFixed(2)}</div>
          ` : ''}
          ${clientBalanceAfter !== null && Number.isFinite(Number(clientBalanceAfter)) && Number(clientBalanceAfter) > 0 ? `
            <div class="line"></div>
            <div class="entry-line">Saldo Cliente: R$ ${Number(clientBalanceAfter).toFixed(2)}</div>
          ` : ''}
          <div class="line"></div>
          <div class="total-row">Total: R$ ${totalValue.toFixed(2)}</div>
        </body>
      </html>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      throw new Error('Não foi possível iniciar impressão no navegador.');
    }
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 1000);
    }, 150);
  };

  const printReceiptWithLocalAgent = async (params: {
    now: Date;
    items: SaleItem[];
    paymentsList: PaymentEntry[];
    totalValue: number;
    changeValue?: number;
    clientBalanceAfter?: number | null;
  }) => {
    const { now, items, paymentsList, totalValue, changeValue = 0, clientBalanceAfter = null } = params;
    const baseUrl = String(activeEnterprise.localPrintAgentUrl || 'http://127.0.0.1:18181').trim().replace(/\/$/, '');
    const body = {
      enterpriseName: activeEnterprise.name,
      clientName: selectedClient?.name || 'Consumidor Final',
      printerName: activeEnterprise.receiptPrinterName || '',
      date: now.toLocaleDateString('pt-BR'),
      time: now.toLocaleTimeString('pt-BR'),
      items: items.map((item) => ({
        quantity: item.quantity,
        name: item.name,
        total: Number((item.quantity * item.price).toFixed(2))
      })),
      payments: paymentsList.map((payment) => ({
        method: payment.method === 'SALDO' ? 'SALDO CANTINA' : payment.method,
        amount: payment.amount,
        receivedAmount: payment.receivedAmount
      })),
      total: totalValue,
      paperWidth: activeEnterprise.receiptPaperWidth || '80mm',
      fontFamily: activeEnterprise.receiptFontFamily || 'ARIAL_BLACK',
      fontSize: activeEnterprise.receiptFontSize || 'NORMAL',
      marginVertical: Math.max(0, Math.min(20, Number(activeEnterprise.receiptMarginVertical ?? 2))),
      marginHorizontal: Math.max(0, Math.min(20, Number(activeEnterprise.receiptMarginHorizontal ?? 2))),
      itemGapTop: Math.max(0, Math.min(20, Number(activeEnterprise.receiptItemGapTop ?? 4))),
      itemGapBottom: Math.max(0, Math.min(20, Number(activeEnterprise.receiptItemGapBottom ?? 4))),
      change: Number(changeValue || 0),
      clientBalanceAfter: clientBalanceAfter === null ? null : Number(clientBalanceAfter)
    };

    const response = await fetch(`${baseUrl}/print-receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const raw = await response.text();
      throw new Error(raw || 'Falha ao imprimir via agente local.');
    }
  };

  const finalizeSale = async () => {
    try {
      playSuccessBeep();
      const now = new Date();
      let updatedSelectedClient = selectedClient;
      const createdTransactions: any[] = [];

      const saldoPaid = payments
        .filter(p => p.method === 'SALDO')
        .reduce((sum, payment) => sum + payment.amount, 0);

      const creditoColaboradorPaid = payments
        .filter(p => p.method === 'CREDITO_COLABORADOR')
        .reduce((sum, payment) => sum + payment.amount, 0);

      if (selectedClient && (saldoPaid > 0 || creditoColaboradorPaid > 0)) {
        // Se o cliente é um COLABORADOR, registra como dívida/consumo
        if (selectedClient.type === 'COLABORADOR') {
          const nextAmountDue = Number((Number(selectedClient.amountDue || 0) + saldoPaid + creditoColaboradorPaid).toFixed(2));
          const nextMonthlyConsumption = Number((Number(selectedClient.monthlyConsumption || 0) + saldoPaid + creditoColaboradorPaid).toFixed(2));
          const updatedClient = await ApiService.updateClient(selectedClient.id, {
            amountDue: nextAmountDue,
            monthlyConsumption: nextMonthlyConsumption
          });
          updatedSelectedClient = updatedClient;

          setClients(prev => prev.map(client => (
            client.id === selectedClient.id ? updatedClient : client
          )));
        } else {
          // Para ALUNO e outros tipos, descontar do saldo normalmente
          const nextBalance = Number((Number(selectedClient.balance || 0) - saldoPaid).toFixed(2));
          const updatedClient = await ApiService.updateClient(selectedClient.id, {
            balance: nextBalance,
            spentToday: (selectedClient.spentToday || 0) + saldoPaid
          });
          updatedSelectedClient = updatedClient;

          setClients(prev => prev.map(client => (
            client.id === selectedClient.id ? updatedClient : client
          )));
        }
      }

      const freeCreditItems = cart.filter(item =>
        item.serviceAction === 'CREDIT_STUDENT_FREE'
        || (
          item.productId.startsWith('SERVICE_CREDIT_STUDENT_')
          && !item.productId.startsWith('SERVICE_CREDIT_STUDENT_PLAN_')
        )
      );
      const freeCantinaCreditTotal = freeCreditItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const planCreditItems = cart.filter(item =>
        item.serviceAction === 'CREDIT_STUDENT_PLAN'
        || item.productId.startsWith('SERVICE_CREDIT_STUDENT_PLAN_')
      );
      const planCredits = planCreditItems.map(item => {
        const parsedPlanId = item.planId
          || (item.productId.match(/^SERVICE_CREDIT_STUDENT_PLAN_(.+?)_\d+$/)?.[1] || '');
        const planFromId = availablePlans.find(plan => plan.id === parsedPlanId);
        const parsedPlanName = item.planName
          || planFromId?.name
          || (item.name.match(/Crédito plano (.+?) \(/i)?.[1] || 'PLANO');
        const amount = Number((item.price * item.quantity) || 0);
        return {
          planId: parsedPlanId || `plan_virtual_${String(parsedPlanName).trim().toLowerCase().replace(/\s+/g, '_')}`,
          planName: String(parsedPlanName).trim() || 'PLANO',
          amount: Number.isFinite(amount) ? amount : 0,
          selectedDays: Array.from(new Set(item.selectedDays || [])),
          selectedDates: Array.from(new Set(item.selectedDates || [])),
          planPrice: planFromId?.price || 0
        };
      });
      const totalPlanCredit = planCredits.reduce((sum, credit) => sum + credit.amount, 0);

      const collaboratorPayTotal = cart
        .filter(item => item.serviceAction === 'PAY_COLLAB' || item.productId.startsWith('SERVICE_PAY_COLLAB_'))
        .reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const planConsumptionItems = cart.filter(item => item.serviceAction === 'PLAN_CONSUMPTION');

      if (selectedClient && (freeCantinaCreditTotal > 0 || totalPlanCredit > 0) && selectedClient.type !== 'COLABORADOR') {
        const clientData = (updatedSelectedClient || selectedClient) as any;
        const existingSelectedPlans = Array.isArray(clientData.selectedPlansConfig) ? [...clientData.selectedPlansConfig] : [];
        const existingServicePlans = Array.isArray(clientData.servicePlans) ? [...clientData.servicePlans] : [];
        const existingPlanCreditBalances = { ...(clientData.planCreditBalances || {}) };

        const upsertPlanConfig = (planCredit: {
          planId: string;
          planName: string;
          amount: number;
          selectedDays: string[];
          selectedDates: string[];
          planPrice: number;
        }) => {
          if (!planCredit.planName) return;

          const configIndex = existingSelectedPlans.findIndex((cfg: any) =>
            String(cfg?.planId || '') === planCredit.planId
            || String(cfg?.planName || '').trim().toUpperCase() === planCredit.planName.toUpperCase()
          );

          const mergedDates = (currentDates: string[] = []) =>
            Array.from(new Set([...(currentDates || []), ...planCredit.selectedDates])).sort();
          const mergedDays = (currentDays: string[] = []) =>
            Array.from(new Set([...(currentDays || []), ...planCredit.selectedDays]));

          if (configIndex >= 0) {
            const current = existingSelectedPlans[configIndex] || {};
            const nextSubtotal = Number(current.subtotal || 0) + planCredit.amount;
            existingSelectedPlans[configIndex] = {
              ...current,
              planId: current.planId || planCredit.planId,
              planName: current.planName || planCredit.planName,
              planPrice: Number(current.planPrice || planCredit.planPrice || 0),
              daysOfWeek: mergedDays(current.daysOfWeek || []),
              selectedDates: mergedDates(current.selectedDates || []),
              subtotal: Number.isFinite(nextSubtotal) ? nextSubtotal : Number(current.subtotal || 0)
            };
          } else {
            existingSelectedPlans.push({
              planId: planCredit.planId,
              planName: planCredit.planName,
              planPrice: Number(planCredit.planPrice || (planCredit.selectedDates.length > 0 ? planCredit.amount / planCredit.selectedDates.length : planCredit.amount) || 0),
              daysOfWeek: [...planCredit.selectedDays],
              selectedDates: [...planCredit.selectedDates],
              deliveryShifts: [],
              subtotal: planCredit.amount
            });
          }

          if (!existingServicePlans.includes(planCredit.planName as any)) {
            existingServicePlans.push(planCredit.planName as any);
          }

          const currentBalanceEntry = existingPlanCreditBalances[planCredit.planId] || {};
          const nextPlanBalance = Number(currentBalanceEntry.balance || 0) + planCredit.amount;
          existingPlanCreditBalances[planCredit.planId] = {
            ...currentBalanceEntry,
            planId: planCredit.planId,
            planName: planCredit.planName,
            balance: Number.isFinite(nextPlanBalance) ? Number(nextPlanBalance.toFixed(2)) : Number(currentBalanceEntry.balance || 0),
            updatedAt: now.toISOString()
          };
        };

        planCredits.forEach(upsertPlanConfig);

        const creditedClient = await ApiService.updateClient(selectedClient.id, {
          balance: Number(((updatedSelectedClient?.balance || 0) + freeCantinaCreditTotal).toFixed(2)),
          selectedPlansConfig: existingSelectedPlans,
          servicePlans: existingServicePlans,
          planCreditBalances: existingPlanCreditBalances
        });
        updatedSelectedClient = creditedClient;
        setClients(prev => prev.map(client => (
          client.id === selectedClient.id ? creditedClient : client
        )));
        setSelectedClient(creditedClient);

        const creditMethod = payments.map(p => p.method).join(' + ');

        if (freeCantinaCreditTotal > 0) {
          const createdTx = await ApiService.createTransaction({
            clientId: selectedClient.id,
            clientName: selectedClient.name,
            enterpriseId: activeEnterpriseId,
            type: 'CREDIT',
            amount: Number(freeCantinaCreditTotal.toFixed(2)),
            description: 'Crédito livre cantina via PDV',
            item: 'Crédito livre cantina',
            plan: 'PREPAGO',
            paymentMethod: creditMethod,
            method: creditMethod,
            timestamp: now.toISOString(),
            date: toDateKey(now),
            time: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            status: 'CONCLUIDA'
          });
          createdTransactions.push(createdTx);
        }

        if (planCredits.length > 0) {
          const createdPlanTx = await Promise.all(planCredits.map((planCredit) => ApiService.createTransaction({
            clientId: selectedClient.id,
            clientName: selectedClient.name,
            enterpriseId: activeEnterpriseId,
            type: 'CREDIT',
            amount: Number(planCredit.amount.toFixed(2)),
            description: `Recarga de plano ${planCredit.planName} via PDV`,
            item: `Crédito plano ${planCredit.planName}`,
            plan: planCredit.planName,
            paymentMethod: creditMethod,
            method: creditMethod,
            timestamp: now.toISOString(),
            date: toDateKey(now),
            time: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            status: 'CONCLUIDA',
            planId: planCredit.planId,
            selectedDates: planCredit.selectedDates,
            selectedDays: planCredit.selectedDays
          })));
          createdTransactions.push(...createdPlanTx);
        }
      }

      if (selectedClient && collaboratorPayTotal > 0 && selectedClient.type === 'COLABORADOR') {
        const paidClient = await ApiService.updateClient(selectedClient.id, {
          amountDue: Math.max(0, (updatedSelectedClient?.amountDue || 0) - collaboratorPayTotal),
          monthlyConsumption: Math.max(0, (updatedSelectedClient?.monthlyConsumption || 0) - collaboratorPayTotal)
        });
        updatedSelectedClient = paidClient;
        setClients(prev => prev.map(client => (
          client.id === selectedClient.id ? paidClient : client
        )));

        const createdTx = await ApiService.createTransaction({
          clientId: selectedClient.id,
          clientName: selectedClient.name,
          enterpriseId: activeEnterpriseId,
          type: 'CREDIT',
          amount: collaboratorPayTotal,
          description: 'Pagamento de consumo do colaborador via venda PDV',
          paymentMethod: payments.map(p => p.method).join(' + '),
          method: payments.map(p => p.method).join(' + '),
          timestamp: now.toISOString(),
          date: toDateKey(now),
          time: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          status: 'CONCLUIDA'
        });
        createdTransactions.push(createdTx);
      }

      if (selectedClient && selectedClient.type !== 'COLABORADOR' && planConsumptionItems.length > 0) {
        const workingClient = ((updatedSelectedClient || selectedClient) as any);
        const existingPlanCreditBalances = { ...(workingClient.planCreditBalances || {}) };
        const planConsumptionByPlan = new Map<string, { planId: string; planName: string; units: number; deductedValue: number }>();

        planConsumptionItems.forEach((item) => {
          const parsedPlanId = String(item.planId || '');
          const planFromId = parsedPlanId ? availablePlans.find((plan) => plan.id === parsedPlanId) : null;
          const parsedPlanName = String(item.planName || planFromId?.name || 'PLANO').trim();
          const planKey = parsedPlanId || parsedPlanName.toUpperCase();
          const quantity = Number(item.quantity || 1);
          const unitPrice = getPlanUnitPriceForClient(workingClient, planFromId || null, parsedPlanId, parsedPlanName);
          const lineValue = Number((unitPrice * quantity).toFixed(2));

          const previous = planConsumptionByPlan.get(planKey) || {
            planId: parsedPlanId || `plan_virtual_${parsedPlanName.toLowerCase().replace(/\s+/g, '_')}`,
            planName: parsedPlanName,
            units: 0,
            deductedValue: 0
          };
          previous.units += quantity;
          previous.deductedValue = Number((previous.deductedValue + lineValue).toFixed(2));
          planConsumptionByPlan.set(planKey, previous);
        });

        for (const [, entry] of planConsumptionByPlan) {
          const currentById = existingPlanCreditBalances[entry.planId];
          const currentByNameKey = Object.keys(existingPlanCreditBalances).find((key) =>
            String(existingPlanCreditBalances[key]?.planName || '').trim().toUpperCase() === entry.planName.toUpperCase()
          );
          const currentEntry = currentById || (currentByNameKey ? existingPlanCreditBalances[currentByNameKey] : undefined) || {};
          const currentBalance = Number(currentEntry.balance || 0);
          const nextBalance = Math.max(0, Number((currentBalance - entry.deductedValue).toFixed(2)));
          const targetKey = entry.planId || currentByNameKey || entry.planName.toUpperCase();

          existingPlanCreditBalances[targetKey] = {
            ...currentEntry,
            planId: entry.planId || currentEntry.planId,
            planName: entry.planName || currentEntry.planName,
            balance: nextBalance,
            updatedAt: now.toISOString()
          };
        }

        const clientAfterPlanConsumption = await ApiService.updateClient(selectedClient.id, {
          planCreditBalances: existingPlanCreditBalances
        });
        updatedSelectedClient = clientAfterPlanConsumption;
        setClients(prev => prev.map(client => (
          client.id === selectedClient.id ? clientAfterPlanConsumption : client
        )));
        setSelectedClient(clientAfterPlanConsumption);

        const createdPlanConsumptionTx = await Promise.all(
          planConsumptionItems.map((item) => ApiService.createTransaction({
            clientId: selectedClient.id,
            clientName: selectedClient.name,
            enterpriseId: activeEnterpriseId,
            type: 'CONSUMO',
            amount: Number((getPlanUnitPriceForClient((updatedSelectedClient || selectedClient), availablePlans.find(plan => plan.id === String(item.planId || '')) || null, String(item.planId || ''), item.planName) * Number(item.quantity || 1)).toFixed(2)),
            total: 0,
            description: `Consumo de 1 unidade do plano ${item.planName || 'PLANO'}`,
            item: item.name,
            plan: item.planName || 'PLANO',
            planId: item.planId,
            paymentMethod: 'PLANO',
            method: 'PLANO',
            timestamp: now.toISOString(),
            date: toDateKey(now),
            time: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            status: 'CONCLUIDA'
          }))
        );
        createdTransactions.push(...createdPlanConsumptionTx);
      }

      const expenseItems = cart.filter(item => !item.serviceAction && !item.productId.startsWith('SERVICE_'));
      const expenseTotal = expenseItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

      // Registrar despesa apenas para produtos reais (não crédito, não consumo de plano).
      if (expenseTotal > 0) {
        const createdDebitTx = await ApiService.createTransaction({
          clientId: selectedClient?.id || null,
          clientName: selectedClient?.name || 'Consumidor Final',
          enterpriseId: activeEnterpriseId,
          type: 'DEBIT',
          amount: Number(expenseTotal.toFixed(2)),
          description: `Compra PDV (${expenseItems.length} item(ns))`,
          item: expenseItems.map(i => `${i.quantity}x ${i.name}`).join(', '),
          paymentMethod: payments.map(p => p.method).join(' + '),
          method: payments.map(p => p.method).join(' + '),
          timestamp: now.toISOString(),
          date: toDateKey(now),
          time: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          status: 'CONCLUIDA',
          items: expenseItems.map(i => ({
            productId: i.productId,
            name: i.name,
            quantity: i.quantity,
            price: i.price,
            mode: i.mode
          }))
        });
        createdTransactions.push(createdDebitTx);
      }

      if (createdTransactions.length > 0) {
        setPosTransactions(prev => [...createdTransactions, ...prev]);
      }
      
      // Registrar transação
      if (onRegisterTransaction) {
        const transactionId = `V-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
        
        const isOnlyCredits = cart.every(item => item.serviceAction === 'CREDIT_STUDENT_FREE' || item.serviceAction === 'CREDIT_STUDENT_PLAN' || item.serviceAction === 'PAY_COLLAB' || item.productId.startsWith('SERVICE_'));
        const hasPlanConsumption = cart.some(item => item.serviceAction === 'PLAN_CONSUMPTION');
        const hasExpenseItems = cart.some(item => !item.serviceAction && !item.productId.startsWith('SERVICE_'));

        onRegisterTransaction({
          id: transactionId,
          time: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          date: toDateKey(now),
          client: selectedClient?.name || 'Consumidor Final',
          plan: hasPlanConsumption ? 'PLANO' : (isOnlyCredits ? 'CREDITO' : 'AVULSO'),
          item: cart.map(i => `${i.quantity}x ${i.name}`).join(', '),
          type: hasPlanConsumption ? 'CONSUMO' : (hasExpenseItems ? 'VENDA_BALCAO' : 'CREDITO'),
          method: payments.map(p => p.method).join(' + '),
          total: hasExpenseItems ? expenseTotal : 0,
          status: 'CONCLUÍDA'
        });
      }

      if (activeEnterprise.autoPrintPDVReceipt) {
        try {
          const changeFromCash = payments
            .filter((payment) => payment.method === 'DINHEIRO')
            .reduce((sum, payment) => sum + Math.max(0, Number((payment.receivedAmount ?? payment.amount) - payment.amount)), 0);
          const balanceAfter =
            updatedSelectedClient && updatedSelectedClient.type !== 'COLABORADOR'
              ? Number((updatedSelectedClient as any).balance ?? 0)
              : null;
          const printParams = {
            now,
            items: cart,
            paymentsList: payments,
            totalValue: cartTotal,
            changeValue: Number(changeFromCash.toFixed(2)),
            clientBalanceAfter: balanceAfter
          };
          if (activeEnterprise.receiptPrintMode === 'LOCAL_AGENT') {
            await printReceiptWithLocalAgent(printParams);
          } else {
            printReceiptInBrowser(printParams);
          }
        } catch (printErr) {
          console.error('Erro ao imprimir cupom automático:', printErr);
          if (activeEnterprise.receiptPrintMode === 'LOCAL_AGENT') {
            alert('Impressão local indisponível. Inicie o agente no computador do caixa com: npm run print-agent');
          }
        }
      }

      setCart([]); 
      setPayments([]); 
      setSelectedClient(null); 
      setProductSearch(''); 
      setIsFinalConsumer(false);
      setActiveSplitMethod(null);
      setCashReceived('');
      setPartialAmount('');
      setIsServiceActionModalOpen(false);
      setServiceActionType(null);
      setServiceActionAmount('');
      setSaleReference(createPOSSaleReference());
    } catch (error) {
      console.error('Erro ao finalizar venda:', error);
      alert('Não foi possível finalizar a venda. Tente novamente.');
    }
  };

  const addPayment = (method: PaymentMethod, amount: number) => {
    const numericAmount = Number(amount);
    if (numericAmount <= 0) return;
    
    if (numericAmount > remainingToPay + 0.01) {
       return alert(`Valor excede o saldo devedor de R$ ${remainingToPay.toFixed(2)}`);
    }

    if (method === 'SALDO') {
      if (isFinalConsumer) return alert("Venda anônima não aceita pagamento via saldo.");
      if (!selectedClient) return alert("Identifique o aluno para usar o saldo.");
      if (isSaldoCantinaPaymentDisabled) {
        return alert("Pagamento via Saldo Cantina desativado enquanto a quitação do saldo negativo estiver no carrinho.");
      }
      if (!canClientUseNegativeBalance(selectedClient, numericAmount)) {
        if (!clientNegativeSalesAllowed) {
          return alert("Saldo insuficiente na carteira do aluno.");
        }
        return alert(`Limite negativo do aluno excedido. Limite permitido: -R$ ${clientNegativeLimit.toFixed(2)}.`);
      }
    }

    if (method === 'CREDITO_COLABORADOR') {
      if (isFinalConsumer) return alert("Venda anônima não aceita crédito de colaborador.");
      if (!selectedClient) return alert("Identifique o colaborador para usar crédito.");
      if (selectedClient.type !== 'COLABORADOR') return alert("Apenas colaboradores podem usar esta opção de pagamento.");
      if (!canCollaboratorIncreaseDebt(selectedClient, numericAmount)) {
        if (!collaboratorNegativeSalesAllowed) {
          return alert("Consumo para colaborador sem saldo está desativado em Ajustes.");
        }
        return alert(`Limite devedor do colaborador excedido. Limite permitido: R$ ${collaboratorNegativeLimit.toFixed(2)}.`);
      }
    }
    
    setPayments(prev => [...prev, { method, amount: numericAmount, status: 'CONFIRMADO' }]);
    setCashReceived('');
    setPartialAmount('');
  };

  const removePayment = (index: number) => {
    setPayments(prev => prev.filter((_, i) => i !== index));
  };

  const handleCheckout = async () => {
    if (Math.abs(cartTotal - totalPaid) > 0.01) return alert('Pagamento incompleto!');
    if (!selectedClient && !isFinalConsumer) return alert('Identifique o cliente!');
    await finalizeSale();
  };

  const handleSuspend = () => {
    if (cart.length === 0) return;
    setSuspendedSales(prev => [{
      id: Math.random().toString(36).substr(2, 5).toUpperCase(),
      clientId: selectedClient?.id || null,
      items: [...cart],
      operatorId: 'u2',
      timestamp: new Date(),
      status: 'EM ESPERA'
    }, ...prev]);
    setCart([]); setSelectedClient(null); setPayments([]); setIsFinalConsumer(false);
    setSaleReference(createPOSSaleReference());
  };

  const handleResume = (id: string) => {
    const sale = suspendedSales.find(s => s.id === id);
    if (!sale) return;
    if (sale.clientId) {
      const client = clients.find(c => c.id === sale.clientId);
      if (client) {
        setSelectedClient(client);
        setIsFinalConsumer(false);
      }
    } else {
      setIsFinalConsumer(true);
    }
    setCart(sale.items);
    setSuspendedSales(prev => prev.filter(s => s.id !== id));
    setShowSuspendedPanel(false);
    setSaleReference(`VENDA-${sale.id}`);
  };

  const selectInlineSplitMethod = (method: PaymentMethod) => {
    if (method === 'SALDO' && isSaldoCantinaPaymentDisabled) {
      alert("Pagamento via Saldo Cantina desativado enquanto a quitação do saldo negativo estiver no carrinho.");
      return;
    }
    setActiveSplitMethod(method);
    if (method === 'DINHEIRO') {
      setCashReceived(remainingToPay > 0 ? remainingToPay.toFixed(2) : '');
      setPartialAmount('');
      return;
    }
    setPartialAmount(remainingToPay > 0 ? remainingToPay.toFixed(2) : '');
    setCashReceived('');
  };

  const applyInlineSplitPayment = () => {
    if (!activeSplitMethod) return;

    if (activeSplitMethod === 'DINHEIRO') {
      const received = cashReceivedNumeric;
      if (received <= 0) return;
      const paymentAmount = Math.min(received, remainingToPay);
      setPayments(prev => [...prev, { method: 'DINHEIRO', amount: paymentAmount, receivedAmount: received, status: 'CONFIRMADO' }]);
      setCashReceived('');
      return;
    }

    const amount = Number(partialAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    addPayment(activeSplitMethod, amount);
  };

  useEffect(() => {
    if (remainingToPay <= 0.01) {
      setActiveSplitMethod(null);
      setCashReceived('');
      setPartialAmount('');
    }
  }, [remainingToPay]);

  const isFinalizeDisabled = useMemo(() => {
    const isCartEmpty = cart.length === 0;
    const isPaymentIncomplete = remainingToPay > 0.01;
    const noClientIdentified = !selectedClient && !isFinalConsumer;
    const clientIsBlocked = selectedClient?.isBlocked || false;
    return isCartEmpty || isPaymentIncomplete || noClientIdentified || clientIsBlocked;
  }, [cart, remainingToPay, selectedClient, isFinalConsumer]);

  const serviceActionAmountNumeric = useMemo(() => {
    const parsed = Number(String(serviceActionAmount || '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }, [serviceActionAmount]);

  const selectedPlanCreditSubtotal = useMemo(() => {
    return studentCreditPlanIds.reduce((sum, planId) => {
      const plan = availablePlans.find((p) => p.id === planId);
      if (!plan) return sum;
      const selectedDays = studentCreditPlanDays[planId] || [];
      const selectedDates = studentCreditPlanDates[planId] || [];
      const selectedCount = selectedDates.length > 0 ? selectedDates.length : selectedDays.length;
      if (selectedCount <= 0) return sum;
      return sum + Number((plan.price * selectedCount).toFixed(2));
    }, 0);
  }, [studentCreditPlanIds, availablePlans, studentCreditPlanDays, studentCreditPlanDates]);

  const canConfirmServiceAction = useMemo(() => {
    if (serviceActionType === 'CREDIT_STUDENT') {
      return serviceActionAmountNumeric > 0 || selectedPlanCreditSubtotal > 0;
    }
    return serviceActionAmountNumeric > 0;
  }, [serviceActionType, serviceActionAmountNumeric, selectedPlanCreditSubtotal]);

  const pendingCantinaDiscount = useMemo(() => {
    if (!selectedClient || selectedClient.type === 'COLABORADOR') return 0;
    return Number(cart
      .filter(item => !item.serviceAction && !item.productId.startsWith('SERVICE_'))
      .reduce((sum, item) => sum + (item.price * item.quantity), 0)
      .toFixed(2));
  }, [selectedClient, cart]);

  const effectiveCantinaBalance = useMemo(() => {
    if (!selectedClient || selectedClient.type === 'COLABORADOR') return 0;
    return Number(((selectedClient.balance || 0) - pendingCantinaDiscount).toFixed(2));
  }, [selectedClient, pendingCantinaDiscount]);

  const pendingNegativeBalancePayment = useMemo(() => {
    if (!selectedClient || selectedClient.type === 'COLABORADOR') return 0;
    return Number(cart
      .filter((item) => item.serviceAction === 'CREDIT_STUDENT_FREE' && item.productId.startsWith('SERVICE_NEGATIVE_BALANCE_'))
      .reduce((sum, item) => sum + Number((item.price || 0) * (item.quantity || 0)), 0)
      .toFixed(2));
  }, [selectedClient, cart]);

  const negativeBalanceAmountToPay = useMemo(() => {
    if (!selectedClient || selectedClient.type === 'COLABORADOR') return 0;
    const currentDebt = Math.max(0, Number(-(selectedClient.balance || 0)));
    return Number(Math.max(0, currentDebt - pendingNegativeBalancePayment).toFixed(2));
  }, [selectedClient, pendingNegativeBalancePayment]);

  const isSaldoCantinaPaymentDisabled = useMemo(() => {
    if (!selectedClient || selectedClient.type === 'COLABORADOR') return false;
    return pendingNegativeBalancePayment > 0;
  }, [selectedClient, pendingNegativeBalancePayment]);

  const sessionPlanMiniCards = useMemo(() => {
    if (!selectedClient) return [];

    const selectedConfigs = Array.isArray((selectedClient as any).selectedPlansConfig)
      ? ((selectedClient as any).selectedPlansConfig as Array<any>)
      : [];
    const planCreditBalances = (((selectedClient as any).planCreditBalances || {}) as Record<string, { planId?: string; planName?: string; balance?: number }>);
    const findPlanByName = (name?: string) => {
      const normalizedName = String(name || '').trim().toUpperCase();
      if (!normalizedName) return null;
      return availablePlans.find((plan) => String(plan.name || '').trim().toUpperCase() === normalizedName) || null;
    };
    const getCreditValueFor = (planId?: string, planName?: string) => {
      if (planId && planCreditBalances[planId]) {
        return Number(planCreditBalances[planId]?.balance || 0);
      }
      const byName = Object.values(planCreditBalances).find((entry) =>
        String(entry?.planName || '').trim().toUpperCase() === String(planName || '').trim().toUpperCase()
      );
      return Number(byName?.balance || 0);
    };
    const pendingPlanCreditsMap = new Map<string, number>();
    const pendingPlanConsumptionsMap = new Map<string, number>();

    cart.forEach((item) => {
      if (item.serviceAction === 'CREDIT_STUDENT_PLAN') {
        const keyById = String(item.planId || '');
        const keyByName = String(item.planName || '').trim().toUpperCase();
        const amount = Number((item.price || 0) * (item.quantity || 0));
        if (keyById) pendingPlanCreditsMap.set(keyById, Number((pendingPlanCreditsMap.get(keyById) || 0) + amount));
        if (keyByName) pendingPlanCreditsMap.set(keyByName, Number((pendingPlanCreditsMap.get(keyByName) || 0) + amount));
      }
      if (item.serviceAction === 'PLAN_CONSUMPTION') {
        const keyById = String(item.planId || '');
        const keyByName = String(item.planName || '').trim().toUpperCase();
        const plan = keyById ? availablePlans.find((p) => p.id === keyById) : findPlanByName(item.planName);
        const unitPrice = getPlanUnitPriceForClient(selectedClient, plan || null, keyById, item.planName);
        const amount = Number(unitPrice.toFixed(2)) * Number(item.quantity || 1);
        if (keyById) pendingPlanConsumptionsMap.set(keyById, Number((pendingPlanConsumptionsMap.get(keyById) || 0) + amount));
        if (keyByName) pendingPlanConsumptionsMap.set(keyByName, Number((pendingPlanConsumptionsMap.get(keyByName) || 0) + amount));
      }
    });

    const map = new Map<string, {
      key: string;
      planName: string;
      unitsRemaining: number | null;
      unitPrice: number;
      remainingValue: number;
      creditValue: number;
      pendingDiscount: number;
      isActive: boolean;
    }>();

    const upsert = (rawPlanName?: string, rawPlanId?: string) => {
      const planById = rawPlanId ? availablePlans.find((plan) => plan.id === rawPlanId) : null;
      const planByName = findPlanByName(rawPlanName);
      const plan = planById || planByName;
      const planName = String(plan?.name || rawPlanName || '').trim();
      if (!planName || String(planName).trim().toUpperCase() === 'PREPAGO') return;

      const key = String(plan?.id || rawPlanId || planName.toUpperCase());
      if (map.has(key)) return;

      const creditValue = getCreditValueFor(plan?.id || rawPlanId, planName);
      const unitsRemaining = plan ? getPlanUnitRemaining(selectedClient, plan) : null;
      const planKeyById = String(plan?.id || rawPlanId || '');
      const planKeyByName = planName.toUpperCase();
      const pendingCredit = Number(
        (planKeyById && pendingPlanCreditsMap.has(planKeyById))
          ? (pendingPlanCreditsMap.get(planKeyById) || 0)
          : (pendingPlanCreditsMap.get(planKeyByName) || 0)
      );
      const pendingDiscount = Number(
        (planKeyById && pendingPlanConsumptionsMap.has(planKeyById))
          ? (pendingPlanConsumptionsMap.get(planKeyById) || 0)
          : (pendingPlanConsumptionsMap.get(planKeyByName) || 0)
      );
      const projectedCredit = Math.max(0, Number((creditValue + pendingCredit - pendingDiscount).toFixed(2)));
      const unitPrice = getPlanUnitPriceForClient(selectedClient, plan, rawPlanId, rawPlanName);
      const remainingValue = Math.max(0, Number(((unitsRemaining || 0) * unitPrice).toFixed(2)));

      map.set(key, {
        key,
        planName,
        unitsRemaining,
        unitPrice,
        remainingValue,
        creditValue: Number.isFinite(projectedCredit) ? projectedCredit : 0,
        pendingDiscount: Number.isFinite(pendingDiscount) ? Number(pendingDiscount.toFixed(2)) : 0,
        isActive: Boolean(plan && plan.isActive !== false),
      });
    };

    selectedConfigs.forEach((config: any) => upsert(config?.planName, config?.planId));
    (selectedClient.servicePlans || []).forEach((planName: any) => upsert(String(planName), undefined));
    Object.values(planCreditBalances).forEach((entry) => upsert(entry?.planName, entry?.planId));

    return Array.from(map.values())
      .sort((a, b) => a.planName.localeCompare(b.planName, 'pt-BR'));
  }, [selectedClient, availablePlans, posTransactions, cart]);

  return (
    <div className="pos-shell flex flex-col lg:flex-row h-full lg:h-[calc(100vh-112px)] gap-6 relative" onClick={initAudio}>
      <div className="w-full lg:basis-[52%] lg:max-w-[52%] flex flex-col space-y-4 min-w-0">
        {/* Top Header POS */}
        <div className="bg-white p-4 rounded-xl shadow-sm border space-y-4 relative z-20">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="relative flex-1 w-full">
              <UserSearch className={`absolute left-3 top-1/2 -translate-y-1/2 transition-colors ${lastScanSuccess ? 'text-green-500' : 'text-indigo-400'}`} size={20} />
              <input 
                ref={clientInputRef}
                type="text" 
                disabled={isFinalConsumer}
                placeholder={isFinalConsumer ? "Modo Consumidor Final Ativado" : "IDENTIFICAR ALUNO: Nome, Matrícula ou QR Code..."} 
                className={`w-full pl-10 pr-12 py-3 bg-indigo-50/50 border-2 rounded-xl focus:ring-4 outline-none transition-all font-bold ${
                  isFinalConsumer ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed' :
                  lastScanSuccess ? 'border-green-500 ring-green-100' : 'border-indigo-100 focus:border-indigo-500 focus:ring-indigo-100'
                }`}
                value={clientSearch}
                onChange={(e) => {
                    setClientSearch(e.target.value);
                    setShowClientSuggestions(true);
                }}
                onFocus={() => setShowClientSuggestions(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && clientSuggestions.length > 0) {
                    e.preventDefault();
                    selectClient(clientSuggestions[0]);
                  }
                }}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                 <QrCode size={20} className={lastScanSuccess ? 'text-green-500' : 'text-gray-300'} />
              </div>

              {showClientSuggestions && clientSuggestions.length > 0 && (
                <div className="absolute top-full left-0 w-full bg-white mt-1 border rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                   {clientSuggestions.map(client => (
                     <button 
                        key={client.id}
                        onClick={() => selectClient(client)}
                        className="w-full flex items-center gap-3 p-3 hover:bg-indigo-50 text-left border-b last:border-0 transition-colors"
                     >
                        <img
                          src={resolveUserAvatar(client.photo, client.name)}
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = resolveUserAvatar(undefined, client.name);
                          }}
                          className="w-10 h-10 rounded-lg object-cover border"
                        />
                        <div>
                           <p className="text-sm font-black text-gray-800">{client.name}</p>
                           <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{client.registrationId} • {client.class || 'Docente'}</p>
                        </div>
                        <ChevronRight className="ml-auto text-gray-300" size={16} />
                     </button>
                   ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 h-full">
               <label className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-xl cursor-pointer hover:bg-gray-100 transition-all select-none group">
                  <input 
                    type="checkbox" 
                    className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    checked={isFinalConsumer}
                    onChange={handleToggleFinalConsumer}
                  />
                  <div className="flex flex-col leading-none">
                     <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest group-hover:text-indigo-600">Venda Rápida</span>
                     <span className="text-xs font-black text-gray-700">Consumidor Final</span>
                  </div>
               </label>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 pt-2">
             <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input 
                  type="text"
                  placeholder="Filtrar produtos no catálogo..."
                  className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border rounded-lg text-sm focus:border-indigo-300 outline-none"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
             </div>
             <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
               {categories.map(cat => (
                 <button key={cat} onClick={() => setActiveCategory(cat)} className={`px-4 py-2 rounded-lg text-[10px] font-black tracking-widest uppercase transition-all ${activeCategory === cat ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                   {cat}
                 </button>
               ))}
             </div>
          </div>
        </div>

        {/* Catalog Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-1.5 overflow-y-auto pr-2 flex-1 max-h-[calc(100vh-380px)] lg:max-h-full pb-10 product-grid-scrollbar">
          {String(activeCategory || '').trim().toUpperCase() === 'PLANOS' ? (
            filteredPlans.length === 0 ? (
              <div className="col-span-full bg-white border rounded-xl p-8 text-center">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Nenhum plano ativo encontrado</p>
              </div>
            ) : filteredPlans.map(plan => {
              const remainingUnits = getPlanUnitRemaining(selectedClient, plan);
              const unitPrice = getPlanUnitPriceForClient(selectedClient, plan, plan.id, plan.name);
              const remainingValue = Math.max(0, Number((remainingUnits * unitPrice).toFixed(2)));
              return (
                <button
                  key={plan.id}
                  onClick={() => addPlanConsumptionToCart(plan)}
                  className="bg-white p-1.5 rounded-xl border hover:border-indigo-400 hover:shadow-md transition-all text-left group"
                >
                  <div className="relative aspect-[17/10] mb-1 overflow-hidden rounded-lg bg-indigo-50 flex items-center justify-center">
                    <Layers size={22} className="text-indigo-300 group-hover:text-indigo-500 transition-colors" />
                  </div>
                  <p className="text-[10px] font-semibold text-gray-800 line-clamp-2 h-7">{plan.name}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[9px] text-indigo-600 font-black uppercase">Consumo un.</span>
                    <span className={`text-[9px] font-black ${remainingUnits > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      Saldo: {remainingUnits} un • R$ {formatCurrencyBRL(remainingValue)}
                    </span>
                  </div>
                </button>
              );
            })
          ) : filteredProducts.length === 0 ? (
            <div className="col-span-full bg-white border rounded-xl p-8 text-center">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Nenhum produto encontrado no catálogo</p>
            </div>
          ) : filteredProducts.map(product => (
            <button key={product.id} onClick={() => addToCart(product)} className="bg-white p-1.5 rounded-xl border hover:border-indigo-400 hover:shadow-md transition-all text-left group">
              <div className="relative aspect-[17/10] mb-1 overflow-hidden rounded-lg bg-gray-100">
                <img src={toAbsoluteProductImageUrl(product.image, product.name)} alt={product.name} className="object-cover w-full h-full group-hover:scale-110 transition-transform" />
              </div>
              <p className="text-[10px] font-semibold text-gray-800 line-clamp-2 h-7">{product.name}</p>
              <div className="flex items-center justify-between mt-1 font-bold">
                <span className="text-indigo-600 text-[12px]">
                  {(product.unit || 'UN') === 'KG'
                    ? `R$ ${product.price.toFixed(2)}`
                    : `R$ ${product.price.toFixed(2)}`}
                </span>
                <span className="text-[9px] text-gray-400 font-black">
                  {(product.unit || 'UN') === 'KG' ? `R$ ${product.price.toFixed(2)}/KG` : `${product.stock} ${product.unit || 'UN'}`}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Sidebar Checkout Panel */}
      <div className="w-full lg:basis-[48%] lg:max-w-[48%] grid grid-cols-1 lg:grid-cols-[0.7fr_1.3fr] gap-2 z-10 min-w-0 items-stretch lg:h-full">
        {/* Identification Card */}
        <div className={`bg-white p-3 rounded-2xl shadow-sm border-2 transition-all h-full min-h-0 flex flex-col ${selectedClient?.isBlocked ? 'border-red-500 animate-pulse' : 'border-indigo-50'}`}>
          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Sessão de Atendimento</h3>
          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          
          {isFinalConsumer ? (
            <div className="space-y-2.5 animate-in zoom-in-95 duration-200">
               <div className="flex items-center gap-3">
                  <div className="w-20 h-20 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-300 border-2 border-dashed border-gray-200">
                     <UserMinus size={32} />
                  </div>
                  <div className="flex-1 min-w-0">
                     <p className="text-[10px] text-gray-400 font-black uppercase mb-0.5 tracking-widest">Sem Cadastro</p>
                     <p className="font-black text-gray-800 text-lg leading-tight uppercase">Consumidor Final</p>
                     <p className="text-xs text-indigo-600 font-bold">VENDA AVULSA</p>
                  </div>
                  <button onClick={() => setIsFinalConsumer(false)} className="p-2 text-gray-300 hover:text-red-500 rounded-lg"><X size={20} /></button>
               </div>
            </div>
          ) : !selectedClient ? (
            <div className="py-8 flex flex-col items-center justify-center border-2 border-dashed border-indigo-50 rounded-xl bg-indigo-50/30 text-indigo-300">
               <User size={32} strokeWidth={1} className="mb-2" />
               <p className="text-xs font-black uppercase tracking-widest text-center px-4">Identifique o Aluno</p>
            </div>
          ) : (
            <div className="space-y-4 animate-in zoom-in-95 duration-200">
               <div className="flex items-center gap-4">
                  <div className="relative">
                     <img
                       src={resolveUserAvatar(selectedClient.photo, selectedClient.name)}
                       onError={(e) => {
                         e.currentTarget.onerror = null;
                         e.currentTarget.src = resolveUserAvatar(undefined, selectedClient.name);
                       }}
                       className="w-20 h-20 rounded-2xl object-cover border-2 border-white shadow-lg"
                     />
                     {selectedClient.isBlocked && <div className="absolute -top-2 -right-2 bg-red-600 text-white p-1.5 rounded-full shadow-lg"><ShieldAlert size={16} /></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                     <p className="text-[10px] text-indigo-600 font-black uppercase mb-0.5">{selectedClient.registrationId}</p>
                     <p className="font-black text-gray-800 text-lg leading-tight truncate">{selectedClient.name}</p>
                  </div>
               </div>
               <div className="grid grid-cols-1 gap-1.5">
                 <div className={`p-3 rounded-xl border-b-4 ${
                   selectedClient.type === 'COLABORADOR' 
                     ? 'bg-amber-50 border-amber-200 text-amber-700' 
                     : Number(selectedClient.balance || 0) < 0
                       ? 'bg-red-50 border-red-200 text-red-700'
                       : 'bg-green-50 border-green-200 text-green-700'
                 }`}>
                   <p className="text-[10px] font-black opacity-60 uppercase">
                     {selectedClient.type === 'COLABORADOR' ? 'Consumo do Mês' : 'Saldo Cantina'}
                   </p>
                   <p className="text-xl font-black">
                     R$ {selectedClient.type === 'COLABORADOR' 
                       ? (selectedClient.monthlyConsumption || 0).toFixed(2) 
                       : selectedClient.balance.toFixed(2)}
                   </p>
                 </div>
                 <div className="p-2 rounded-xl border bg-gray-50 border-gray-100 flex flex-col gap-1.5">
                   <button
                     onClick={handleCreditStudent}
                     disabled={selectedClient.type === 'COLABORADOR'}
                     className="w-full px-2 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest bg-emerald-600 text-white disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
                   >
                     Creditar Aluno
                   </button>
                   <button
                     onClick={handlePayCollaboratorConsumption}
                     disabled={selectedClient.type !== 'COLABORADOR'}
                     className="w-full px-2 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest bg-amber-600 text-white disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
                   >
                     Pagar Consumo Mês
                   </button>
                 </div>
               </div>
               {selectedClient.type !== 'COLABORADOR' && (
                 <div className="space-y-1.5">
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Saldos do Cliente</p>
                   <div className="grid grid-cols-1 gap-1.5">
                     <div className={`p-3 rounded-xl border ${effectiveCantinaBalance < 0 ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100'}`}>
                       <p className={`text-[9px] font-black uppercase tracking-widest ${effectiveCantinaBalance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>Cantina</p>
                       <div className="mt-1 flex items-center justify-between gap-2">
                         <p className={`text-sm font-black ${effectiveCantinaBalance < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                           R$ {effectiveCantinaBalance.toFixed(2)}
                         </p>
                         {effectiveCantinaBalance < 0 && (
                           <button
                             type="button"
                             onClick={handlePayNegativeBalance}
                             disabled={negativeBalanceAmountToPay <= 0}
                             className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-all"
                           >
                             {negativeBalanceAmountToPay <= 0 ? 'No carrinho' : 'Pagar'}
                           </button>
                         )}
                       </div>
                       {pendingCantinaDiscount > 0 && (
                         <p className="text-[9px] font-black text-red-500 mt-1">- R$ {pendingCantinaDiscount.toFixed(2)} pendente no carrinho</p>
                       )}
                       {pendingNegativeBalancePayment > 0 && (
                         <p className="text-[9px] font-black text-emerald-700 mt-1">
                           + R$ {pendingNegativeBalancePayment.toFixed(2)} para quitar saldo no carrinho
                         </p>
                       )}
                     </div>
                     {sessionPlanMiniCards.length > 0 ? sessionPlanMiniCards.map((planCard) => (
                       <div key={planCard.key} className={`p-3 rounded-xl border ${planCard.isActive ? 'bg-indigo-50 border-indigo-100' : 'bg-gray-50 border-gray-100'}`}>
                         <p className={`text-[9px] font-black uppercase tracking-widest truncate ${planCard.isActive ? 'text-indigo-600' : 'text-gray-400'}`}>
                           {planCard.planName.replace(/_/g, ' ')}
                         </p>
                         <p className="text-[10px] font-black text-indigo-700 mt-1">
                           {planCard.unitsRemaining !== null
                             ? `Saldo: ${planCard.unitsRemaining} un • R$ ${formatCurrencyBRL(planCard.remainingValue || 0)}`
                             : 'Saldo: --'}
                         </p>
                         {(planCard.creditValue || 0) > 0 && (
                           <p className="text-[10px] font-black text-emerald-600">
                             Crédito extra: R$ {formatCurrencyBRL(planCard.creditValue || 0)}
                           </p>
                         )}
                        {planCard.pendingDiscount > 0 && (
                          <p className="text-[9px] font-black text-red-500 mt-1">- R$ {formatCurrencyBRL(planCard.pendingDiscount)} pendente no carrinho</p>
                        )}
                       </div>
                     )) : (
                       <div className="p-3 rounded-xl border bg-gray-50 border-gray-100">
                         <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Planos</p>
                         <p className="text-[10px] font-black text-gray-400 mt-1">Sem planos</p>
                       </div>
                     )}
                   </div>
                 </div>
               )}
               {selectedClient.type === 'COLABORADOR' && (
                 <div className="p-3 bg-amber-50 border-l-4 border-amber-500 rounded-lg">
                   <p className="text-[10px] font-black text-amber-900 uppercase tracking-widest mb-1">
                     💼 Modo Colaborador
                   </p>
                   <p className="text-xs text-amber-800 leading-tight">
                     Consumo será registrado como dívida a vencer conforme data de pagamento configurada.
                   </p>
               </div>
              )}
            </div>
          )}
          </div>
        </div>

        {/* Cart Panel */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col overflow-hidden h-full min-h-0">
          <div className="p-3 border-b flex items-center justify-between bg-gray-50">
            <h3 className="font-bold text-gray-700 flex items-center gap-2 text-sm"><ShoppingCart size={16} /> Carrinho</h3>
            <span className="bg-indigo-600 text-white px-2 py-0.5 rounded-full text-[10px] font-black">{cart.length}</span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3">
            <div className="rounded-2xl border border-amber-200 bg-white overflow-hidden shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <div className="h-3" style={receiptZigZagEdgeStyle} />

              <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-700">Cupom de Venda</p>
                  <p className="text-sm font-black text-amber-900 mt-0.5">{saleReference}</p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-700 bg-amber-100/70 px-2.5 py-1 rounded-full border border-amber-200">
                  {cart.length} item(ns)
                </span>
              </div>

              <div className="px-3 pb-2.5 space-y-0">
                {cart.map((item, index) => {
                  const cartProduct = productsById.get(String(item.productId));
                  const thumbnailUrl = cartProduct
                    ? toAbsoluteProductImageUrl(cartProduct.image, cartProduct.name)
                    : '';
                  const isServiceItem = Boolean(item.serviceAction) || String(item.productId || '').startsWith('SERVICE_');

                  return (
                    <div
                      key={item.productId}
                      className={`group animate-in slide-in-from-right-2 py-2.5 ${index < cart.length - 1 ? 'border-b border-dashed border-gray-300' : ''}`}
                    >
                      <div className="h-px w-full bg-gray-100 mb-2" />
                      <div className="flex items-center justify-between">
                        <div className="flex items-start gap-3 flex-1">
                          <div className="w-10 h-10 rounded-lg overflow-hidden border border-gray-200 bg-gray-50 shrink-0 mt-0.5">
                            {thumbnailUrl ? (
                              <img src={thumbnailUrl} alt={item.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-gray-400 uppercase">
                                {String(item.name || '?').slice(0, 2)}
                              </div>
                            )}
                          </div>

                          <div className="flex-1">
                            <p className="text-[13px] font-black text-gray-800 leading-tight">{item.name}</p>
                            {item.serviceAction && (
                              <p className="text-[9px] font-black uppercase tracking-widest text-indigo-500 mt-0.5">
                                {item.serviceAction === 'CREDIT_STUDENT_FREE' && 'Crédito Livre Cantina'}
                                {item.serviceAction === 'CREDIT_STUDENT_PLAN' && `Crédito Plano${item.planName ? ` • ${item.planName}` : ''}`}
                                {item.serviceAction === 'PLAN_CONSUMPTION' && `Consumo Plano${item.planName ? ` • ${item.planName}` : ''}`}
                                {item.serviceAction === 'PAY_COLLAB' && 'Pagamento Consumo Colaborador'}
                              </p>
                            )}
                            {item.serviceAction === 'CREDIT_STUDENT_PLAN' && (
                              <p className="text-[9px] text-gray-400 font-bold">
                                {(item.selectedDates?.length || 0)} data(s) • {(item.selectedDays?.length || 0)} dia(s) da semana
                              </p>
                            )}

                            {!isServiceItem ? (
                              <div className="flex items-center gap-2 mt-1.5">
                                <button
                                  onClick={() => changeCartItemQuantity(item.productId, -1)}
                                  className="w-6 h-6 rounded-md border border-indigo-200 text-indigo-600 font-black text-sm flex items-center justify-center hover:bg-indigo-50"
                                  aria-label={`Diminuir quantidade de ${item.name}`}
                                >
                                  -
                                </button>
                                <span className="min-w-[24px] text-center text-sm font-black text-indigo-700">{item.quantity}</span>
                                <button
                                  onClick={() => changeCartItemQuantity(item.productId, 1)}
                                  className="w-6 h-6 rounded-md border border-indigo-200 text-indigo-600 font-black text-sm flex items-center justify-center hover:bg-indigo-50"
                                  aria-label={`Aumentar quantidade de ${item.name}`}
                                >
                                  +
                                </button>
                                <span className="text-xs font-black text-emerald-600 ml-1">R$ {item.price.toFixed(2)}</span>
                              </div>
                            ) : (
                              <p className="text-xs font-black mt-1">
                                <span className="text-indigo-600">{item.quantity}x</span>
                                <span className="text-gray-400 mx-1">•</span>
                                <span className="text-emerald-600">R$ {item.price.toFixed(2)}</span>
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <span className="text-base font-black text-blue-700">R$ {(item.quantity * item.price).toFixed(2)}</span>
                          <button onClick={() => removeFromCart(item.productId)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                
                {/* Split Payments List */}
                {payments.length > 0 && (
                  <div className="pt-3.5 mt-2 border-t-2 border-gray-300 space-y-2">
                    <p className="text-[11px] font-black text-gray-600 uppercase tracking-widest flex items-center gap-2">
                      <Layers size={14} /> Pagamentos Parciais
                    </p>
                    {payments.map((p, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-gray-50 p-2.5 rounded-xl border border-gray-200">
                        <div className="flex items-center gap-2.5">
                          <span className={`p-1.5 rounded text-white ${p.method === 'SALDO' ? 'bg-indigo-600' : p.method === 'PIX' ? 'bg-emerald-500' : p.method === 'DINHEIRO' ? 'bg-amber-500' : 'bg-blue-600'}`}>
                            {p.method === 'SALDO' ? <Wallet size={12} /> : p.method === 'PIX' ? <Smartphone size={12} /> : p.method === 'DINHEIRO' ? <Banknote size={12} /> : <CardIcon size={12} />}
                          </span>
                          <span className="text-[11px] font-black text-gray-700 tracking-wide">{p.method === 'SALDO' ? 'SALDO CANTINA' : p.method}</span>
                        </div>
                        <div className="flex items-center gap-3.5">
                          <span className="text-base font-black text-indigo-700">R$ {p.amount.toFixed(2)}</span>
                          <button onClick={() => removePayment(idx)} className="text-gray-300 hover:text-red-500"><X size={13} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="h-3 rotate-180" style={receiptZigZagEdgeStyle} />
            </div>
          </div>

          {/* Payment Selection with Split Capability */}
          <div className="p-3 border-t bg-gray-50 space-y-2.5">
             {remainingToPay > 0.01 && cart.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                     <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Selecionar Pagamento</p>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <PaymentButton 
                      onClick={() => selectInlineSplitMethod('SALDO')} 
                      icon={<Wallet size={16} />} 
                      label={selectedClient?.type === 'COLABORADOR' ? 'Créd. Colabrador' : 'Saldo Cantina'}
                      color="indigo" 
                      isSelected={activeSplitMethod === 'SALDO'}
                      disabled={isFinalConsumer || !selectedClient || selectedClient?.type === 'COLABORADOR' || isSaldoCantinaPaymentDisabled} 
                    />
                    <PaymentButton 
                      onClick={() => selectInlineSplitMethod('PIX')} 
                      icon={<Smartphone size={16} />} 
                      label="Pix" 
                      color="emerald" 
                      isSelected={activeSplitMethod === 'PIX'}
                    />
                    <PaymentButton 
                      onClick={() => selectInlineSplitMethod('DINHEIRO')} 
                      icon={<Banknote size={16} />} 
                      label="Dinheiro" 
                      color="amber" 
                      isSelected={activeSplitMethod === 'DINHEIRO'}
                    />
                    <PaymentButton 
                      onClick={() => selectInlineSplitMethod('DEBITO')} 
                      icon={<CardIcon size={16} />} 
                      label="Débito" 
                      color="blue" 
                      isSelected={activeSplitMethod === 'DEBITO'}
                    />
                    <PaymentButton 
                      onClick={() => selectInlineSplitMethod('CREDITO')} 
                      icon={<CreditCard size={16} />} 
                      label="Crédito" 
                      color="purple" 
                      isSelected={activeSplitMethod === 'CREDITO'}
                    />
                    <PaymentButton 
                      onClick={() => selectInlineSplitMethod('CREDITO_COLABORADOR')} 
                      icon={<Wallet size={16} />} 
                      label="Créd. Colaborador" 
                      color="amber" 
                      isSelected={activeSplitMethod === 'CREDITO_COLABORADOR'}
                      disabled={isFinalConsumer || !selectedClient || selectedClient?.type !== 'COLABORADOR'} 
                    />
                  </div>

                  {activeSplitMethod && (
                    <div className="mt-2 p-3 rounded-xl border border-indigo-100 bg-indigo-50/60 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">
                          Split: {activeSplitMethod === 'SALDO' ? 'Saldo Cantina' : activeSplitMethod}
                        </p>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                          Restante: R$ {remainingToPay.toFixed(2)}
                        </p>
                      </div>

                      {activeSplitMethod === 'DINHEIRO' ? (
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Valor recebido</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-amber-500">R$</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={cashReceived}
                              onChange={(e) => setCashReceived(e.target.value)}
                              className="w-full pl-10 pr-3 py-2 bg-white border-2 border-amber-200 rounded-lg outline-none focus:border-amber-400 text-sm font-bold text-gray-700"
                              placeholder="0,00"
                            />
                          </div>
                          {cashReceivedNumeric >= remainingToPay && remainingToPay > 0 && (
                            <p className="text-[11px] font-black text-emerald-600">
                              Troco: R$ {changeAmount.toFixed(2)}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                            Valor com {activeSplitMethod}
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-indigo-500">R$</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={partialAmount}
                              onChange={(e) => setPartialAmount(e.target.value)}
                              className="w-full pl-10 pr-3 py-2 bg-white border-2 border-indigo-200 rounded-lg outline-none focus:border-indigo-400 text-sm font-bold text-gray-700"
                              placeholder="0,00"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => setPartialAmount((remainingToPay / 2).toFixed(2))}
                              className="py-2 bg-white hover:bg-indigo-100 border border-indigo-100 rounded-lg font-black text-[10px] text-indigo-700 uppercase tracking-widest transition-all"
                            >
                              Metade
                            </button>
                            <button
                              onClick={() => setPartialAmount(remainingToPay.toFixed(2))}
                              className="py-2 bg-white hover:bg-indigo-100 border border-indigo-100 rounded-lg font-black text-[10px] text-indigo-700 uppercase tracking-widest transition-all"
                            >
                              Total Restante
                            </button>
                          </div>
                        </div>
                      )}

                      <button
                        onClick={applyInlineSplitPayment}
                        disabled={
                          activeSplitMethod === 'DINHEIRO'
                            ? !cashReceived || cashReceivedNumeric <= 0
                            : (
                                !partialAmount
                                || parseFloat(partialAmount) <= 0
                                || (
                                  activeSplitMethod === 'SALDO'
                                  && selectedClient
                                  && !canClientUseNegativeBalance(selectedClient, parseFloat(partialAmount))
                                )
                              )
                        }
                        className={`w-full py-2.5 rounded-lg font-black uppercase tracking-widest text-[11px] transition-all ${
                          (activeSplitMethod === 'DINHEIRO'
                            ? !cashReceived || cashReceivedNumeric <= 0
                            : (
                                !partialAmount
                                || parseFloat(partialAmount) <= 0
                                || (
                                  activeSplitMethod === 'SALDO'
                                  && selectedClient
                                  && !canClientUseNegativeBalance(selectedClient, parseFloat(partialAmount))
                                )
                              ))
                            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.99]'
                        }`}
                      >
                        Adicionar pagamento
                      </button>
                    </div>
                  )}
                </div>
             )}
          </div>

          {/* Totals & Checkout Button */}
          <div className="p-4 bg-gray-900 text-white">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-black uppercase tracking-widest text-gray-500">Total Venda</span>
              <span className="text-3xl font-black text-indigo-300">R$ {cartTotal.toFixed(2)}</span>
            </div>
            {totalPaid > 0 && (
              <div className="flex justify-between items-center text-sm text-gray-300 mb-2 font-bold">
                 <span>Pago: R$ {totalPaid.toFixed(2)}</span>
                 <span className={remainingToPay > 0.01 ? 'text-amber-400' : 'text-green-400'}>
                    {remainingToPay > 0.01 ? `Falta: R$ ${remainingToPay.toFixed(2)}` : 'TOTALMENTE PAGO'}
                 </span>
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-2 mt-4">
              <button onClick={handleSuspend} disabled={cart.length === 0} className="py-3 rounded-xl font-black border border-gray-700 text-gray-400 hover:bg-gray-800 disabled:opacity-30 text-xs uppercase transition-all">Pausar</button>
              <button 
                onClick={handleCheckout} 
                disabled={isFinalizeDisabled}
                className={`py-3 rounded-xl font-black transition-all text-xs uppercase ${
                  isFinalizeDisabled ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40 hover:bg-indigo-700 active:scale-95'
                }`}
              >Finalizar</button>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL DE PAGAMENTO EM DINHEIRO (TROCO) */}
      {isKgModalOpen && kgProduct && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-indigo-950/60 backdrop-blur-sm animate-in fade-in" onClick={() => setIsKgModalOpen(false)}></div>
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95">
             <div className="bg-indigo-600 p-6 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                   <div className="bg-white/20 p-2 rounded-xl">
                      <Scale size={24} />
                   </div>
                   <div>
                     <h2 className="text-xl font-black">Produto por KG</h2>
                     <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200">{kgProduct.name}</p>
                   </div>
                </div>
                <button onClick={() => setIsKgModalOpen(false)}><X size={24} /></button>
             </div>

             <div className="p-8 space-y-6">
                <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100 flex items-center justify-between">
                  <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Valor por KG</span>
                  <span className="text-lg font-black text-indigo-700">R$ {kgProduct.price.toFixed(2)}</span>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black text-gray-500 uppercase tracking-widest block text-center">Peso (KG)</label>
                  <div className="relative">
                    <input
                      ref={kgInputRef}
                      autoFocus
                      type="text"
                      inputMode="numeric"
                      value={kgWeightInput}
                      onChange={(e) => setKgWeightInput(formatKgWeightInput(e.target.value))}
                      className="w-full px-6 py-6 bg-indigo-50 border-4 border-indigo-100 rounded-2xl outline-none focus:border-indigo-500 text-4xl font-black text-indigo-600 transition-all text-center"
                    />
                  </div>
                </div>

                <div className="bg-emerald-50 p-6 rounded-2xl border-2 border-emerald-100 text-center">
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Total Calculado</p>
                  <p className="text-4xl font-black text-emerald-700 mt-1">
                    R$ {(parseKgWeight(kgWeightInput) * Number(kgProduct.price || 0)).toFixed(2)}
                  </p>
                </div>
             </div>

             <div className="p-6 bg-gray-50 border-t flex gap-4">
                <button onClick={() => setIsKgModalOpen(false)} className="flex-1 py-4 text-xs font-black text-gray-400 uppercase tracking-widest">Cancelar</button>
                <button
                  onClick={confirmKgProduct}
                  className="flex-[2] py-4 rounded-2xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-2 bg-indigo-600 text-white shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all"
                >
                  Adicionar ao Carrinho <ArrowRight size={20} />
                </button>
             </div>
          </div>
        </div>
      )}

      {/* MODAL DE PAGAMENTO EM DINHEIRO (TROCO) */}
      {isServiceActionModalOpen && selectedClient && serviceActionType && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-indigo-950/60 backdrop-blur-sm animate-in fade-in" onClick={closeServiceActionModal}></div>
          <div className={`relative w-full ${serviceActionType === 'CREDIT_STUDENT' ? 'max-w-5xl' : 'max-w-md'} bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95`}>
             <div className="bg-indigo-600 p-6 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                   <div className="bg-white/20 p-2 rounded-xl">
                      <Wallet size={24} />
                   </div>
                   <div>
                     <h2 className="text-xl font-black">
                       {serviceActionType === 'CREDIT_STUDENT' ? 'Creditar Aluno' : 'Pagar Consumo Mês'}
                     </h2>
                     <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200">{selectedClient.name}</p>
                   </div>
                </div>
                <button onClick={closeServiceActionModal}><X size={24} /></button>
             </div>

             <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
                {serviceActionType === 'CREDIT_STUDENT' ? (
                  <>
                    <div className="space-y-4">
                      <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Crédito Livre Cantina</h3>
                      <div className="space-y-2">
                        <label className="text-xs font-black text-gray-500 uppercase tracking-widest block text-center">Valor (R$)</label>
                        <div className="relative">
                          <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-black text-indigo-500">R$</span>
                          <input
                            ref={serviceActionInputRef}
                            autoFocus
                            type="number"
                            step="0.01"
                            min="0"
                            value={serviceActionAmount}
                            onChange={(e) => setServiceActionAmount(e.target.value)}
                            className="w-full pl-16 pr-6 py-6 bg-indigo-50 border-4 border-indigo-100 rounded-2xl outline-none focus:border-indigo-500 text-4xl font-black text-indigo-600 transition-all text-center"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 border-t pt-6">
                      <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Crédito Planos (Planos Cadastrados para Matrícula)</h3>
                      {availablePlans.length === 0 ? (
                        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                          <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">
                            Nenhum plano ativo cadastrado para esta unidade.
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {availablePlans.map(plan => {
                            const isSelected = studentCreditPlanIds.includes(plan.id);
                            const isCalendarOpen = studentCreditOpenCalendarId === plan.id;
                            const selectedDaysCount = studentCreditPlanDays[plan.id]?.length || 0;
                            const selectedDatesCount = studentCreditPlanDates[plan.id]?.length || 0;
                            const selectedCount = selectedDatesCount > 0 ? selectedDatesCount : selectedDaysCount;
                            const subtotal = plan.price * selectedCount;

                            return (
                              <div
                                key={plan.id}
                                className={`p-5 rounded-[24px] border-2 text-left transition-all ${isSelected ? 'bg-indigo-50 border-indigo-400 shadow-lg shadow-indigo-100' : 'bg-white border-gray-100 hover:border-indigo-200'}`}
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div>
                                    <p className="text-xs font-black text-gray-800 uppercase">{plan.name}</p>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{plan.description || 'Plano de consumo'}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-lg font-black text-indigo-600">R$ {plan.price.toFixed(2)}</p>
                                    <p className="text-[9px] font-black text-gray-400 uppercase">por dia</p>
                                  </div>
                                </div>

                                <div className="mt-4 pt-4 border-t border-indigo-100 flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => toggleStudentCreditPlan(plan.id)}
                                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300'}`}
                                  >
                                    {isSelected ? 'Plano Selecionado' : 'Selecionar Plano'}
                                  </button>
                                  {isSelected && (
                                    <button
                                      type="button"
                                      onClick={() => setStudentCreditOpenCalendarId(isCalendarOpen ? null : plan.id)}
                                      className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 bg-white border-indigo-200 text-indigo-600 hover:border-indigo-400 transition-all"
                                    >
                                      {isCalendarOpen ? 'Fechar Calendário' : 'Escolher Dias'}
                                    </button>
                                  )}
                                </div>

                                {isSelected && (
                                  <div className="mt-3">
                                    <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">
                                      {selectedDatesCount} dia(s) do mês selecionado(s) • Subtotal: R$ {subtotal.toFixed(2)}
                                    </p>
                                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                                      {selectedDaysCount} dia(s) da semana marcado(s)
                                    </p>
                                  </div>
                                )}

                                {isSelected && isCalendarOpen && (
                                  <div className="mt-4 bg-white border border-indigo-200 rounded-2xl p-4">
                                    <p className="text-[10px] font-black text-indigo-700 uppercase tracking-widest mb-3">
                                      Calendário de Entregas - Dias da Semana e do Mês
                                    </p>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-4">
                                      {WEEK_DAY_OPTIONS.map(day => {
                                        const active = studentCreditPlanDays[plan.id]?.includes(day.key);
                                        return (
                                          <button
                                            type="button"
                                            key={`${plan.id}-pdv-${day.key}`}
                                            onClick={() => toggleStudentCreditPlanDay(plan.id, day.key)}
                                            className={`w-full h-11 rounded-xl text-[10px] font-black uppercase tracking-wider border-2 transition-all flex items-center justify-center text-center ${active ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-indigo-100 text-indigo-500 hover:border-indigo-300'}`}
                                          >
                                            {day.label}
                                          </button>
                                        );
                                      })}
                                    </div>

                                    <div className="bg-indigo-50/60 rounded-2xl p-4 border border-indigo-100 space-y-3">
                                      <div className="flex items-center justify-between">
                                        <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                                          {studentCreditCalendarMonthLabel}
                                        </p>
                                        <div className="flex items-center gap-2">
                                          <button
                                            type="button"
                                            onClick={() => setStudentCreditCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                                            className="w-8 h-8 rounded-lg border border-indigo-200 bg-white text-indigo-600 text-xs font-black"
                                            title="Mês anterior"
                                          >
                                            {'<'}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setStudentCreditCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
                                            className="px-2 h-8 rounded-lg border border-indigo-200 bg-white text-indigo-600 text-[9px] font-black uppercase tracking-widest"
                                          >
                                            Hoje
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setStudentCreditCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                                            className="w-8 h-8 rounded-lg border border-indigo-200 bg-white text-indigo-600 text-xs font-black"
                                            title="Próximo mês"
                                          >
                                            {'>'}
                                          </button>
                                        </div>
                                      </div>

                                      <div className="grid grid-cols-7 gap-2">
                                        {MONTH_WEEK_HEADERS.map(header => (
                                          <div
                                            key={`${plan.id}-pdv-header-${header}`}
                                            className="w-full h-9 rounded-lg bg-white border border-indigo-100 text-[10px] font-black uppercase text-indigo-500 flex items-center justify-center text-center"
                                          >
                                            {header}
                                          </div>
                                        ))}
                                      </div>

                                      <div className="grid grid-cols-7 gap-2">
                                        {studentCreditCalendarGrid.map((dateCell, index) => {
                                          if (!dateCell) {
                                            return <div key={`${plan.id}-pdv-empty-${index}`} className="w-full h-9 rounded-lg bg-transparent" />;
                                          }
                                          const dateKey = toDateKey(dateCell);
                                          const isSelectedDate = (studentCreditPlanDates[plan.id] || []).includes(dateKey);
                                          return (
                                            <button
                                              type="button"
                                              key={`${plan.id}-pdv-${dateKey}`}
                                              onClick={() => toggleStudentCreditPlanDate(plan.id, dateCell)}
                                              className={`w-full h-9 rounded-lg border text-[10px] font-black transition-all flex items-center justify-center text-center ${isSelectedDate ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-indigo-100 text-indigo-600 hover:border-indigo-300'}`}
                                            >
                                              {dateCell.getDate()}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </div>
                                )}

                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-gray-500 uppercase tracking-widest block text-center">Valor (R$)</label>
                      <div className="relative">
                        <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-black text-indigo-500">R$</span>
                        <input
                          ref={serviceActionInputRef}
                          autoFocus
                          type="number"
                          step="0.01"
                          min="0"
                          value={serviceActionAmount}
                          onChange={(e) => setServiceActionAmount(e.target.value)}
                          className="w-full pl-16 pr-6 py-6 bg-indigo-50 border-4 border-indigo-100 rounded-2xl outline-none focus:border-indigo-500 text-4xl font-black text-indigo-600 transition-all text-center"
                        />
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        Ao confirmar, este valor será adicionado no carrinho como item de venda.
                      </p>
                    </div>
                  </>
                )}
             </div>

             <div className="p-6 bg-gray-50 border-t flex gap-4">
                <button onClick={closeServiceActionModal} className="flex-1 py-4 text-xs font-black text-gray-400 uppercase tracking-widest">Cancelar</button>
                <button
                  onClick={confirmServiceActionToCart}
                  disabled={!canConfirmServiceAction}
                  className={`py-4 rounded-2xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-2 transition-all ${
                    !canConfirmServiceAction
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-indigo-600 text-white shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-95'
                  } ${serviceActionType === 'CREDIT_STUDENT' ? 'flex-1' : 'flex-[2]'}`}
                >
                  {serviceActionType === 'CREDIT_STUDENT' ? 'Confirmar Créditos' : 'Inserir no Carrinho'} <ArrowRight size={20} />
                </button>
             </div>
          </div>
        </div>
      )}

      {isNegativeBalanceWarningOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setIsNegativeBalanceWarningOpen(false);
              setPendingNegativeBalanceAction(null);
              setNegativeBalanceWarningClientName('');
            }}
          />
          <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="bg-amber-600 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-xl">
                  <AlertTriangle size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-black">Cliente em saldo negativo</h3>
                  <p className="text-[10px] uppercase tracking-widest font-black text-amber-100">
                    Confirmação obrigatória para continuar
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsNegativeBalanceWarningOpen(false);
                  setPendingNegativeBalanceAction(null);
                  setNegativeBalanceWarningClientName('');
                }}
                className="p-1"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-700 leading-relaxed">
                O cliente <span className="font-black text-gray-900">{negativeBalanceWarningClientName}</span> já está com saldo negativo.
                Deseja continuar e somar mais valor no negativo?
              </p>
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                <p className="text-xs font-black uppercase tracking-widest text-amber-700">Saldo atual</p>
                <p className="text-2xl font-black text-amber-700">
                  R$ {Number(selectedClient?.balance || 0).toFixed(2)}
                </p>
              </div>
            </div>

            <div className="p-6 bg-gray-50 border-t flex gap-3">
              <button
                onClick={() => {
                  setIsNegativeBalanceWarningOpen(false);
                  setPendingNegativeBalanceAction(null);
                  setNegativeBalanceWarningClientName('');
                }}
                className="flex-1 py-3 rounded-2xl border-2 border-gray-200 text-gray-600 font-black uppercase tracking-widest text-xs"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const action = pendingNegativeBalanceAction;
                  setIsNegativeBalanceWarningOpen(false);
                  setPendingNegativeBalanceAction(null);
                  setNegativeBalanceWarningClientName('');
                  action?.();
                }}
                className="flex-1 py-3 rounded-2xl bg-amber-600 text-white font-black uppercase tracking-widest text-xs hover:bg-amber-700 transition-colors"
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {showSuspendedPanel && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowSuspendedPanel(false)}></div>
          <div className="relative w-full max-w-sm bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right">
            <div className="p-6 border-b flex items-center justify-between bg-gray-50">
              <h3 className="text-xl font-black text-gray-800 flex items-center gap-2"><Clock className="text-indigo-600" /> Em Espera</h3>
              <button onClick={() => setShowSuspendedPanel(false)} className="p-2 hover:bg-gray-100 rounded-full"><X size={24} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {suspendedSales.map((sale) => (
                <div key={sale.id} className="p-4 rounded-xl border-2 border-indigo-50 hover:border-indigo-500 bg-white shadow-sm transition-all cursor-pointer group" onClick={() => handleResume(sale.id)}>
                   <div className="flex justify-between mb-2">
                     <span className="text-[10px] font-black bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded tracking-widest">#{sale.id}</span>
                     <span className="text-[10px] font-bold text-gray-400">{new Date(sale.timestamp).toLocaleTimeString()}</span>
                   </div>
                   <p className="text-sm font-bold text-gray-800 mb-1">{sale.items.length} itens no total</p>
                   <div className="flex items-center justify-between">
                      <span className="text-sm font-black text-indigo-600">R$ {sale.items.reduce((s, i) => s + (i.price * i.quantity), 0).toFixed(2)}</span>
                   </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const PaymentButton = ({ onClick, icon, label, color, disabled, isSelected }: any) => {
  const colorMap: any = {
    indigo: 'border-indigo-200 text-indigo-700 hover:bg-indigo-50',
    emerald: 'border-emerald-200 text-emerald-700 hover:bg-emerald-50',
    amber: 'border-amber-200 text-amber-700 hover:bg-amber-50',
    blue: 'border-blue-200 text-blue-700 hover:bg-blue-50',
    purple: 'border-purple-200 text-purple-700 hover:bg-purple-50',
  };

  return (
    <button 
      disabled={disabled}
      onClick={onClick} 
      className={`w-full min-h-[50px] px-2 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wide flex items-center justify-center gap-1.5 border-2 transition-all active:scale-95 ${
        disabled
          ? 'bg-gray-100 text-gray-300 border-gray-100 cursor-not-allowed opacity-50'
          : isSelected
            ? `bg-white ${colorMap[color]} ring-2 ring-offset-1 ring-indigo-300`
            : `bg-white ${colorMap[color]}`
      }`}
    >
      <div className="shrink-0 flex items-center justify-center scale-90">{icon}</div>
      <span className="leading-tight text-center font-black">{label}</span>
    </button>
  );
};

export default POSPage;
